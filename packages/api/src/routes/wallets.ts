import type { FastifyInstance } from 'fastify'
import { query, redis } from '@dex/database'
import { getSolanaIndexer } from '../solanaIndexer'

// 各链的 Quote Tokens（复用 smartMoneyWorker 同一套）
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

const PERIOD_INTERVAL: Record<string, string> = {
  '1d': '1 day',
  '7d': '7 days',
  '30d': '30 days',
}

// Fire-and-forget: queue Solana wallet for indexing
function triggerSolanaIndex(addr: string) {
  const indexer = getSolanaIndexer()
  if (indexer) {
    console.log(`[wallet] Triggering on-demand Solana index for ${addr.slice(0, 8)}...`)
    indexer.indexOnDemand(addr).then(ok => {
      console.log(`[wallet] On-demand index result for ${addr.slice(0, 8)}...: ${ok ? 'success' : 'no new data'}`)
    }).catch(e => {
      console.warn(`[wallet] On-demand index error for ${addr.slice(0, 8)}...:`, e?.message || e)
    })
  } else {
    console.log('[wallet] No SolanaIndexer instance available')
  }
  // Also add to Redis queue for periodic scan
  redis.sadd('solana:wallets_to_index', addr).catch(() => {})
}

export async function walletsRoutes(app: FastifyInstance) {

  // ── GET /api/wallet/:address/stats ────────────────────────
  app.get('/wallet/:address/stats', async (req, reply) => {
    const { address } = req.params as { address: string }
    const { chain = 'base' } = req.query as Record<string, string>
    const addr = chain === 'solana' ? address : address.toLowerCase()

    try {
      const rows = await query<{
        realized_pnl_usd: string
        total_bought_usd: string
        total_sold_usd:   string
        win_trades:       number
        loss_trades:      number
        total_trades:     number
        pnl_percentage:   string
      }>(`
        SELECT realized_pnl_usd, total_bought_usd, total_sold_usd,
               win_trades, loss_trades, total_trades, pnl_percentage
        FROM wallet_pnl
        WHERE wallet_address = $1 AND chain = $2 AND period = '30d'
      `, [addr, chain])

      if (!rows.length) {
        // 没有 wallet_pnl 数据，从 swaps 表实时聚合
        const swapStats = await query<{
          total_trades: string
          total_bought: string
          total_sold:   string
          buy_count:    string
          sell_count:   string
        }>(`
          SELECT
            COUNT(*)::text AS total_trades,
            SUM(CASE WHEN s.is_buy THEN s.amount_usd ELSE 0 END)::text AS total_bought,
            SUM(CASE WHEN NOT s.is_buy THEN s.amount_usd ELSE 0 END)::text AS total_sold,
            COUNT(CASE WHEN s.is_buy THEN 1 END)::text AS buy_count,
            COUNT(CASE WHEN NOT s.is_buy THEN 1 END)::text AS sell_count
          FROM swaps s
          JOIN pools p ON p.address = s.pool_address
          WHERE (s.sender = $1 OR s.recipient = $1)
            AND p.chain = $2
            AND s.amount_usd > 0
        `, [addr, chain])

        const s = swapStats[0]
        if (!s || Number(s.total_trades) === 0) {
          // No data — trigger on-demand Solana indexing (fire-and-forget)
          if (chain === 'solana') triggerSolanaIndex(addr)
          return reply.send(null)
        }

        const bought = Number(s.total_bought)
        const sold = Number(s.total_sold)
        const pnl = sold - bought

        return reply.send({
          total_count_of_trades: Number(s.total_trades),
          total_realized_profit_usd: pnl.toFixed(6),
          total_trade_volume: (bought + sold).toFixed(6),
          total_tokens_bought: Number(s.buy_count),
          total_tokens_sold: Number(s.sell_count),
        })
      }

      const r = rows[0]
      const bought = Number(r.total_bought_usd)
      const sold = Number(r.total_sold_usd)

      return reply.send({
        total_count_of_trades: r.total_trades,
        total_realized_profit_usd: r.realized_pnl_usd,
        total_trade_volume: (bought + sold).toFixed(6),
        total_tokens_bought: r.win_trades,
        total_tokens_sold: r.loss_trades,
      })
    } catch (e) {
      app.log.error(e, '[wallet/stats] query failed')
      return reply.status(500).send({ error: 'Failed to fetch wallet stats' })
    }
  })

  // ── GET /api/wallet/:address/profitability ────────────────
  app.get('/wallet/:address/profitability', async (req, reply) => {
    const { address } = req.params as { address: string }
    const { chain = 'base', period = '30d', limit = '50' } = req.query as Record<string, string>
    const addr = chain === 'solana' ? address : address.toLowerCase()
    const interval = PERIOD_INTERVAL[period] ?? '30 days'
    const limitN = Math.min(Number(limit) || 50, 200)
    const quoteTokens = CHAIN_QUOTE_TOKENS[chain] ?? CHAIN_QUOTE_TOKENS.base

    try {
      const rows = await query<{
        token_address: string
        symbol:        string
        name:          string
        bought_usd:    string
        sold_usd:      string
        buy_count:     string
        sell_count:    string
        bought_tokens: string
        sold_tokens:   string
      }>(`
        SELECT
          CASE
            WHEN LOWER(p.token0) = ANY($2::text[]) THEN p.token1
            WHEN LOWER(p.token1) = ANY($2::text[]) THEN p.token0
            ELSE p.token0
          END AS token_address,
          COALESCE(tk.symbol, '?') AS symbol,
          COALESCE(tk.name, '') AS name,
          SUM(CASE WHEN s.is_buy THEN s.amount_usd ELSE 0 END)::text AS bought_usd,
          SUM(CASE WHEN NOT s.is_buy THEN s.amount_usd ELSE 0 END)::text AS sold_usd,
          COUNT(CASE WHEN s.is_buy THEN 1 END)::text AS buy_count,
          COUNT(CASE WHEN NOT s.is_buy THEN 1 END)::text AS sell_count,
          SUM(CASE WHEN s.is_buy THEN ABS(
            CASE WHEN LOWER(p.token0) = ANY($2::text[]) THEN s.amount1 ELSE s.amount0 END
          ) ELSE 0 END)::text AS bought_tokens,
          SUM(CASE WHEN NOT s.is_buy THEN ABS(
            CASE WHEN LOWER(p.token0) = ANY($2::text[]) THEN s.amount1 ELSE s.amount0 END
          ) ELSE 0 END)::text AS sold_tokens
        FROM swaps s
        JOIN pools p ON p.address = s.pool_address
        LEFT JOIN tokens tk ON LOWER(tk.address) = LOWER(CASE
            WHEN LOWER(p.token0) = ANY($2::text[]) THEN p.token1
            WHEN LOWER(p.token1) = ANY($2::text[]) THEN p.token0
            ELSE p.token0
          END)
        WHERE (s.sender = $1 OR s.recipient = $1)
          AND p.chain = $3
          AND s.timestamp >= NOW() - $4::interval
          AND s.amount_usd > 0
          AND NOT (LOWER(p.token0) = ANY($2::text[]) AND LOWER(p.token1) = ANY($2::text[]))
        GROUP BY token_address, symbol, name
        ORDER BY (SUM(CASE WHEN NOT s.is_buy THEN s.amount_usd ELSE 0 END) -
                  SUM(CASE WHEN s.is_buy THEN s.amount_usd ELSE 0 END)) DESC
        LIMIT $5
      `, [addr, quoteTokens, chain, interval, limitN])

      if (!rows.length && chain === 'solana') triggerSolanaIndex(addr)

      const tokens = rows.map(r => {
        const bought = Number(r.bought_usd)
        const sold = Number(r.sold_usd)
        const pnl = sold - bought
        const boughtTokens = Number(r.bought_tokens)
        const soldTokens = Number(r.sold_tokens)
        return {
          token_address: r.token_address,
          symbol: r.symbol,
          name: r.name,
          logo: null,
          realized_profit_usd: pnl.toFixed(6),
          total_usd_invested: r.bought_usd,
          total_sold_usd: r.sold_usd,
          avg_buy_price_usd: boughtTokens > 0 ? (bought / boughtTokens).toFixed(12) : '0',
          avg_sell_price_usd: soldTokens > 0 ? (sold / soldTokens).toFixed(12) : '0',
          count_of_trades: Number(r.buy_count) + Number(r.sell_count),
        }
      })

      return reply.send(tokens)
    } catch (e) {
      app.log.error(e, '[wallet/profitability] query failed')
      return reply.status(500).send({ error: 'Failed to fetch wallet profitability' })
    }
  })

  // ── GET /api/wallet/:address/swaps ────────────────────────
  app.get('/wallet/:address/swaps', async (req, reply) => {
    const { address } = req.params as { address: string }
    const { chain = 'base', limit = '30' } = req.query as Record<string, string>
    const addr = chain === 'solana' ? address : address.toLowerCase()
    const limitN = Math.min(Number(limit) || 30, 200)
    const quoteTokens = CHAIN_QUOTE_TOKENS[chain] ?? CHAIN_QUOTE_TOKENS.base

    try {
      const rows = await query<{
        tx_hash:      string
        timestamp:    string
        block_number: string
        sender:       string | null
        recipient:    string | null
        amount0:      string
        amount1:      string
        amount_usd:   string
        price_usd:    string
        is_buy:       boolean
        pool_address: string
        token0:       string
        token1:       string
        dex:          string
        t0_symbol:    string
        t0_name:      string
        t1_symbol:    string
        t1_name:      string
      }>(`
        SELECT
          s.tx_hash, s.timestamp::text, s.block_number::text,
          s.sender, s.recipient,
          s.amount0::text, s.amount1::text,
          s.amount_usd::text, s.price_usd::text, s.is_buy,
          s.pool_address,
          p.token0, p.token1, p.dex,
          COALESCE(t0.symbol, '?') AS t0_symbol,
          COALESCE(t0.name, '') AS t0_name,
          COALESCE(t1.symbol, '?') AS t1_symbol,
          COALESCE(t1.name, '') AS t1_name
        FROM swaps s
        JOIN pools p ON p.address = s.pool_address
        LEFT JOIN tokens t0 ON t0.address = p.token0
        LEFT JOIN tokens t1 ON t1.address = p.token1
        WHERE (s.sender = $1 OR s.recipient = $1)
          AND p.chain = $2
          AND s.amount_usd > 0
        ORDER BY s.timestamp DESC
        LIMIT $3
      `, [addr, chain, limitN])

      if (!rows.length && chain === 'solana') triggerSolanaIndex(addr)

      const swaps = rows.map(r => {
        const isQuoteToken0 = quoteTokens.includes(r.token0)
        const baseToken = isQuoteToken0
          ? { address: r.token1, symbol: r.t1_symbol, name: r.t1_name }
          : { address: r.token0, symbol: r.t0_symbol, name: r.t0_name }
        const quoteToken = isQuoteToken0
          ? { address: r.token0, symbol: r.t0_symbol, name: r.t0_name }
          : { address: r.token1, symbol: r.t1_symbol, name: r.t1_name }

        const amountUsd = Number(r.amount_usd)

        // is_buy = true → wallet 买入 base token（卖出 quote）
        const tokenBought = r.is_buy ? baseToken : quoteToken
        const tokenSold = r.is_buy ? quoteToken : baseToken

        return {
          txHash: r.tx_hash,
          walletAddress: addr,
          timestamp: r.timestamp,
          blockNumber: r.block_number,
          transactionType: r.is_buy ? 'buy' : 'sell',
          tokenSold: {
            address: tokenSold.address,
            symbol: tokenSold.symbol,
            name: tokenSold.name,
            amount: '0',
            usdAmount: r.is_buy ? amountUsd : amountUsd,
            logo: null,
          },
          tokenBought: {
            address: tokenBought.address,
            symbol: tokenBought.symbol,
            name: tokenBought.name,
            amount: '0',
            usdAmount: r.is_buy ? amountUsd : amountUsd,
            logo: null,
          },
          totalValueUsd: amountUsd,
          pairLabel: `${baseToken.symbol}/${quoteToken.symbol}`,
          exchangeLogo: null,
          chain,
        }
      })

      return reply.send(swaps)
    } catch (e) {
      app.log.error(e, '[wallet/swaps] query failed')
      return reply.status(500).send({ error: 'Failed to fetch wallet swaps' })
    }
  })
}
