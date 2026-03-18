/**
 * SmartMoneyWorker v2
 *
 * 参考 GMGN 方法论优化：
 *  1. 综合评分（smart_score）替代纯 PnL 金额排序
 *  2. 更严格的机器人过滤（MAX_TRADES=300，参考 GMGN <300 交易）
 *  3. 包含亏损钱包（不再仅保留盈利钱包）
 *  4. 评分公式：Win Rate(40%) + PnL%(40%) + Token 多样性(20%)
 *  5. 支持多链：Base + BSC + Solana
 */

import { query } from '@dex/database'

const CALC_INTERVAL_MS = 60 * 60 * 1000 // 每小时计算一次
const MIN_VOLUME_USD   = 100             // 过滤交易量太低的钱包
const MIN_TRADES       = 3              // 至少 3 笔交易（平衡质量与数量）
const MAX_TRADES       = 300            // 过滤机器人/做市商（GMGN: <300）
const MAX_WALLETS      = 500            // 每个周期保留 Top 500

// 各链的 Quote Tokens（用来识别"买入/卖出"方向）
const CHAIN_QUOTE_TOKENS: Record<string, string[]> = {
  base: [
    '0x4200000000000000000000000000000000000006', // WETH
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', // USDbC
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI
    '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', // USDT
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

/**
 * Smart Score 计算（0-100 分）
 * 参考 GMGN: Win Rate ≥40%, PnL% ≥60%, 交易数 <300
 *
 * - Win Rate (40%权重): 盈利 token 占比
 * - PnL% (40%权重): 已实现收益率，封顶 500%
 * - Token 多样性 (20%权重): 交易过的 token 数量，封顶 20
 */
function computeSmartScore(
  winRate: number,    // 0-100
  pnlPct: number,     // can be negative
  tokenCount: number,  // realized token count
): number {
  // Win rate component (0-40 points)
  const wrScore = Math.min(Math.max(winRate, 0), 100) * 0.4

  // PnL% component (0-40 points), cap at 500% positive, 0 for negative
  const pnlNorm = Math.min(Math.max(pnlPct, 0), 500) / 500
  const pnlScore = pnlNorm * 40

  // Token diversity (0-20 points)
  const divNorm = Math.min(Math.max(tokenCount, 0), 20) / 20
  const divScore = divNorm * 20

  return Math.round(wrScore + pnlScore + divScore)
}

export class SmartMoneyWorker {
  private timer?: NodeJS.Timeout
  private isRunning = false

  async start() {
    console.log('[SmartMoney] Worker started (v2: smart_score)')
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

    // 先清掉该链+周期的旧数据（避免已过滤钱包残留）
    await query(`DELETE FROM wallet_pnl WHERE chain = $1 AND period = $2`, [chain, period])

    // 聚合：钱包 × token 的买卖金额（只看该链的 pool）
    // 跳过两个 token 都是 quote token 的 pool（如 WETH/USDC、USDT/USDC）
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
        AND NOT (LOWER(p.token0) = ANY($2::text[]) AND LOWER(p.token1) = ANY($2::text[]))
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
      totalBuys: number; totalSells: number
      tokenCount: number      // 已实现交易的 token 数量
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
        totalBuys: 0, totalSells: 0, tokenCount: 0,
        bestToken: row.token_addr, bestSymbol: row.token_symbol, bestPnl: -Infinity,
      }

      w.totalBought += bought
      w.totalSold   += sold
      w.totalTrades += buys + sells
      w.totalBuys   += buys
      w.totalSells  += sells
      w.realizedPnl += tokenPnl
      if (isRealized) {
        w.realizedBought += bought
        w.tokenCount++
        if (tokenPnl > 0) w.winTrades++
        else if (tokenPnl < 0) w.lossTrades++
      }
      if (tokenPnl > w.bestPnl) {
        w.bestPnl    = tokenPnl
        w.bestToken  = row.token_addr
        w.bestSymbol = row.token_symbol
      }

      walletMap.set(wallet, w)
    }

    // 过滤 + 评分 + 排序
    // v2: 不再要求 realizedPnl > 0，改为要求至少 1 个已实现 token
    const scored = Array.from(walletMap.entries())
      .filter(([, w]) =>
        w.totalTrades >= MIN_TRADES &&
        w.totalTrades <= MAX_TRADES &&
        (w.totalBought + w.totalSold) >= MIN_VOLUME_USD &&
        w.tokenCount >= 1  // 至少 1 个已实现 token（买+卖过）
      )
      .map(([addr, w]) => {
        const winRate = w.tokenCount > 0 ? (w.winTrades / w.tokenCount) * 100 : 0
        const pnlPct = w.realizedBought > 0 ? (w.realizedPnl / w.realizedBought) * 100 : 0
        const score = computeSmartScore(winRate, pnlPct, w.tokenCount)
        return { addr, w, winRate, pnlPct, score }
      })
      .sort((a, b) => b.score - a.score)  // 按 smart_score 排序
      .slice(0, MAX_WALLETS)

    if (!scored.length) {
      console.log(`[SmartMoney] ${chain}/${period}: no qualifying wallets found`)
      return
    }

    // Upsert wallet_pnl
    const now = new Date()
    for (const { addr, w, pnlPct, score } of scored) {
      await query(`
        INSERT INTO wallet_pnl (
          wallet_address, chain, period,
          realized_pnl_usd, unrealized_pnl_usd,
          total_bought_usd, total_sold_usd,
          win_trades, loss_trades, total_trades,
          best_token_address, best_token_symbol, best_token_pnl_usd,
          pnl_percentage, token_count, smart_score, calculated_at
        ) VALUES ($1,$2,$3,$4,0,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
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
          token_count        = EXCLUDED.token_count,
          smart_score        = EXCLUDED.smart_score,
          calculated_at      = EXCLUDED.calculated_at
      `, [
        addr, chain, period,
        w.realizedPnl, w.totalBought, w.totalSold,
        w.winTrades, w.lossTrades, w.totalTrades,
        w.bestToken, w.bestSymbol, w.bestPnl, pnlPct,
        w.tokenCount, score, now,
      ])
    }

    const topScore = scored[0]
    console.log(`[SmartMoney] ${chain}/${period}: saved ${scored.length} wallets (top score: ${topScore.score}, PnL: $${topScore.w.realizedPnl.toFixed(0)})`)
  }
}
