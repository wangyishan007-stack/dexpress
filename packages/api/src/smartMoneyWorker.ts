/**
 * SmartMoneyWorker
 *
 * 职责：
 *  1. 每小时从 swaps 表聚合钱包买卖数据
 *  2. 计算 realized PnL（sold - bought）
 *  3. 写入 wallet_pnl 表（1d / 7d / 30d 三个周期）
 *  4. 为 /api/smart-money 接口提供本地数据
 *  5. 支持多链：Base + BSC（通过 pools.chain 区分）
 */

import { query } from '@dex/database'

const CALC_INTERVAL_MS = 60 * 60 * 1000 // 每小时计算一次
const MIN_VOLUME_USD   = 100             // 过滤交易量太低的钱包
const MIN_TRADES       = 2              // 至少 2 笔交易
const MAX_WALLETS      = 200            // 每个周期保留 Top 200

// 各链的 Quote Tokens（用来识别"买入/卖出"方向）
const CHAIN_QUOTE_TOKENS: Record<string, string[]> = {
  base: [
    '0x4200000000000000000000000000000000000006', // WETH
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', // USDbC
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI
  ],
  bsc: [
    '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WBNB
    '0x55d398326f99059ff775485246999027b3197955', // USDT
    '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC
    '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD
  ],
  solana: [
    'So11111111111111111111111111111111111111112',     // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  // USDT
  ],
}

const SUPPORTED_CHAINS = ['base', 'bsc', 'solana']

type Period = '1d' | '7d' | '30d'
const PERIOD_HOURS: Record<Period, number> = { '1d': 24, '7d': 168, '30d': 720 }

export class SmartMoneyWorker {
  private timer?: NodeJS.Timeout
  private isRunning = false

  async start() {
    console.log('[SmartMoney] Worker started')
    await this.calculate()
    this.timer = setInterval(() => this.calculate(), CALC_INTERVAL_MS)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    console.log('[SmartMoney] Worker stopped')
  }

  async calculateNow() {
    await this.calculate()
  }

  private async calculate() {
    if (this.isRunning) { console.log('[SmartMoney] Already running, skipping'); return }
    this.isRunning = true
    const t0 = Date.now()
    try {
      for (const chain of SUPPORTED_CHAINS) {
        for (const period of ['1d', '7d', '30d'] as Period[]) {
          await this.calcPeriod(chain, period)
        }
      }
      console.log(`[SmartMoney] Done in ${Date.now() - t0}ms`)
    } catch (e) {
      console.error('[SmartMoney] Error:', e)
    } finally {
      this.isRunning = false
    }
  }

  private async calcPeriod(chain: string, period: Period) {
    const hours = PERIOD_HOURS[period]
    const since = new Date(Date.now() - hours * 3_600_000).toISOString()
    const quoteTokens = CHAIN_QUOTE_TOKENS[chain] ?? CHAIN_QUOTE_TOKENS.base

    // 聚合：钱包 × token 的买卖金额（只看该链的 pool）
    const rows = await query<{
      wallet:       string
      token_addr:   string
      token_symbol: string
      bought_usd:   string
      sold_usd:     string
      buy_count:    string
      sell_count:   string
    }>(`
      SELECT
        COALESCE(s.sender, s.recipient)        AS wallet,
        CASE
          WHEN LOWER(p.token0) = ANY($2::text[]) THEN p.token1
          WHEN LOWER(p.token1) = ANY($2::text[]) THEN p.token0
          ELSE p.token0
        END                                    AS token_addr,
        COALESCE(tk.symbol, '?')               AS token_symbol,
        SUM(CASE WHEN s.is_buy     THEN s.amount_usd ELSE 0 END)::text AS bought_usd,
        SUM(CASE WHEN NOT s.is_buy THEN s.amount_usd ELSE 0 END)::text AS sold_usd,
        COUNT(CASE WHEN s.is_buy     THEN 1 END)::text                 AS buy_count,
        COUNT(CASE WHEN NOT s.is_buy THEN 1 END)::text                 AS sell_count
      FROM swaps s
      JOIN pools p ON p.address = s.pool_address
      LEFT JOIN tokens tk ON LOWER(tk.address) = LOWER(CASE
          WHEN LOWER(p.token0) = ANY($2::text[]) THEN p.token1
          WHEN LOWER(p.token1) = ANY($2::text[]) THEN p.token0
          ELSE p.token0
        END)
      WHERE s.timestamp >= $1
        AND p.chain = $3
        AND s.amount_usd > 0
        AND s.sender IS NOT NULL
        AND length(COALESCE(s.sender,'')) >= 32
      GROUP BY 1, 2, 3
    `, [since, quoteTokens, chain])

    if (!rows.length) {
      console.log(`[SmartMoney] ${chain}/${period}: no swaps data yet`)
      return
    }

    // 按钱包聚合 PnL
    type WalletAgg = {
      totalBought: number; totalSold: number; realizedPnl: number
      realizedBought: number  // 只算已实现 token 的买入量（用于 PnL%）
      winTrades: number; lossTrades: number; totalTrades: number
      totalBuys: number; totalSells: number  // actual buy/sell transaction counts
      bestToken: string; bestSymbol: string; bestPnl: number
    }
    const walletMap = new Map<string, WalletAgg>()

    for (const row of rows) {
      const wallet = chain === 'solana' ? (row.wallet as string) : (row.wallet as string).toLowerCase()
      const bought = Number(row.bought_usd)
      const sold   = Number(row.sold_usd)
      const buys   = Number(row.buy_count)
      const sells  = Number(row.sell_count)

      // realized PnL: 只有既买又卖才算（单边持仓不算已实现）
      const isRealized = buys > 0 && sells > 0
      const tokenPnl = isRealized ? sold - bought : 0

      const w: WalletAgg = walletMap.get(wallet) ?? {
        totalBought: 0, totalSold: 0, realizedPnl: 0, realizedBought: 0,
        winTrades: 0, lossTrades: 0, totalTrades: 0,
        totalBuys: 0, totalSells: 0,
        bestToken: row.token_addr, bestSymbol: row.token_symbol, bestPnl: 0,
      }

      w.totalBought += bought
      w.totalSold   += sold
      w.totalTrades += buys + sells
      w.totalBuys   += buys
      w.totalSells  += sells
      w.realizedPnl += tokenPnl
      if (isRealized) w.realizedBought += bought
      if (tokenPnl > 0) w.winTrades++
      else if (tokenPnl < 0) w.lossTrades++
      if (tokenPnl > w.bestPnl) {
        w.bestPnl    = tokenPnl
        w.bestToken  = row.token_addr
        w.bestSymbol = row.token_symbol
      }

      walletMap.set(wallet, w)
    }

    // 过滤 + 排序（过滤做市商/机器人：交易次数 > 5000，只保留盈利钱包）
    const MAX_TRADES = 5_000
    const ranked = Array.from(walletMap.entries())
      .filter(([, w]) =>
        w.totalTrades >= MIN_TRADES &&
        w.totalTrades <= MAX_TRADES &&
        (w.totalBought + w.totalSold) >= MIN_VOLUME_USD &&
        w.realizedPnl > 0
      )
      .sort((a, b) => b[1].realizedPnl - a[1].realizedPnl)
      .slice(0, MAX_WALLETS)

    if (!ranked.length) {
      console.log(`[SmartMoney] ${chain}/${period}: no qualifying wallets found`)
      return
    }

    // Upsert wallet_pnl
    const now = new Date()
    for (const [wallet, w] of ranked) {
      // PnL%: 只用已实现 token 的买入量做分母，避免未实现仓位摊薄
      const pnlPct = w.realizedBought > 0 ? (w.realizedPnl / w.realizedBought) * 100 : 0
      await query(`
        INSERT INTO wallet_pnl (
          wallet_address, chain, period,
          realized_pnl_usd, unrealized_pnl_usd,
          total_bought_usd, total_sold_usd,
          win_trades, loss_trades, total_trades,
          best_token_address, best_token_symbol, best_token_pnl_usd,
          pnl_percentage, calculated_at
        ) VALUES ($1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (wallet_address, chain, period) DO UPDATE SET
          realized_pnl_usd   = EXCLUDED.realized_pnl_usd,
          total_bought_usd   = EXCLUDED.total_bought_usd,
          total_sold_usd     = EXCLUDED.total_sold_usd,
          win_trades         = EXCLUDED.win_trades,
          loss_trades        = EXCLUDED.loss_trades,
          total_trades       = EXCLUDED.total_trades,
          best_token_address = EXCLUDED.best_token_address,
          best_token_symbol  = EXCLUDED.best_token_symbol,
          best_token_pnl_usd = EXCLUDED.best_token_pnl_usd,
          pnl_percentage     = EXCLUDED.pnl_percentage,
          calculated_at      = EXCLUDED.calculated_at
      `, [
        wallet, chain, period,
        w.realizedPnl, w.totalBought, w.totalSold,
        w.winTrades, w.lossTrades, w.totalTrades,
        w.bestToken, w.bestSymbol, w.bestPnl, pnlPct, now,
      ])
    }

    console.log(`[SmartMoney] ${chain}/${period}: saved top ${ranked.length} wallets (best PnL: $${ranked[0][1].realizedPnl.toFixed(0)})`)
  }
}
