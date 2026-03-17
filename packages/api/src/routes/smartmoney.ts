import type { FastifyInstance } from 'fastify'
import { query } from '@dex/database'

const CACHE_TTL_MS = 3_600_000 // 1 hour
const cache = new Map<string, { data: unknown; ts: number }>()

export async function smartMoneyRoutes(app: FastifyInstance) {
  // POST /api/admin/recalc — 手动触发 SmartMoneyWorker 计算（管理员用）
  app.post('/api/admin/recalc', async (_req, reply) => {
    try {
      const { SmartMoneyWorker } = await import('../smartMoneyWorker')
      const worker = new SmartMoneyWorker()
      // 后台运行，完成后清缓存
      worker.calculateNow()
        .then(() => { cache.clear(); console.log('[smart-money] Recalc done, cache cleared') })
        .catch(console.error)
      return reply.send({ ok: true, message: 'Recalculation started' })
    } catch (e) {
      return reply.status(500).send({ error: String(e) })
    }
  })

  // GET /api/admin/clear-cache — 手动清缓存
  app.get('/api/admin/clear-cache', async (_req, reply) => {
    cache.clear()
    return reply.send({ ok: true, message: 'Cache cleared' })
  })

  // GET /api/admin/pool-debug — 查 pool token 分布
  app.get('/api/admin/pool-debug', async (_req, reply) => {
    const r1 = await query("SELECT COUNT(*) n FROM pools WHERE token0 = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'")
    const r2 = await query("SELECT COUNT(*) n FROM pools WHERE token1 = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'")
    const r3 = await query("SELECT token_symbol, COUNT(*) n FROM wallet_pnl GROUP BY token_symbol ORDER BY n DESC LIMIT 10")
    return reply.send({ usdc_as_token0: r1[0].n, usdc_as_token1: r2[0].n, top_tokens: r3 })
  })

  // GET /api/admin/stats — 查数据库状态
  app.get('/api/admin/stats', async (_req, reply) => {
    const r1 = await query('SELECT COUNT(*) as n FROM swaps')
    const r2 = await query('SELECT COUNT(*) as n FROM pools')
    const r3 = await query('SELECT COUNT(*) as n FROM wallet_pnl')
    const r4 = await query("SELECT COUNT(*) as n FROM swaps WHERE timestamp > NOW() - INTERVAL '2 hours'")
    const r5 = await query("SELECT COUNT(*) as n FROM swaps WHERE timestamp > NOW() - INTERVAL '24 hours'")
    return reply.send({
      total_swaps:   r1[0].n,
      pools:         r2[0].n,
      wallet_pnl:    r3[0].n,
      swaps_2h:      r4[0].n,
      swaps_24h:     r5[0].n,
    })
  })

  // GET /api/smart-money?chain=base&period=7d&limit=100&sort=score
  app.get('/api/smart-money', async (req, reply) => {
    const { chain = 'base', period = '7d', limit = '100', sort = 'score' } = req.query as Record<string, string>
    const limitN = Math.min(Number(limit) || 100, 500)

    const cacheKey = `${chain}:${period}:${limitN}:${sort}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return reply.header('X-Cache', 'HIT').send(cached.data)
    }

    try {
      // Build ORDER BY based on sort param
      let orderClause: string
      switch (sort) {
        case 'pnl':     orderClause = 'realized_pnl_usd DESC'; break
        case 'winRate':  orderClause = 'CASE WHEN (win_trades + loss_trades) > 0 THEN win_trades::float / (win_trades + loss_trades) ELSE 0 END DESC'; break
        case 'volume':   orderClause = '(total_bought_usd + total_sold_usd) DESC'; break
        default:         orderClause = 'smart_score DESC, realized_pnl_usd DESC'; break // 'score'
      }

      const rows = await query<{
        wallet_address:     string
        realized_pnl_usd:   string
        pnl_percentage:     string
        total_bought_usd:   string
        total_sold_usd:     string
        win_trades:         number
        loss_trades:        number
        total_trades:       number
        best_token_address: string
        best_token_symbol:  string
        best_token_pnl_usd: string
        token_count:        number
        smart_score:        number
        calculated_at:      string
      }>(`
        SELECT
          wallet_address,
          realized_pnl_usd,
          pnl_percentage,
          total_bought_usd,
          total_sold_usd,
          win_trades,
          loss_trades,
          total_trades,
          best_token_address,
          best_token_symbol,
          best_token_pnl_usd,
          COALESCE(token_count, 0) as token_count,
          COALESCE(smart_score, 0) as smart_score,
          calculated_at
        FROM wallet_pnl
        WHERE chain = $1
          AND period = $2
        ORDER BY ${orderClause}
        LIMIT $3
      `, [chain, period, limitN])

      // Map to SmartWallet shape (compatible with frontend)
      const wallets = rows.map(r => {
        const wins = r.win_trades ?? 0
        const losses = r.loss_trades ?? 0
        const totalTokens = wins + losses
        return {
          address:                    r.wallet_address,
          realized_profit_usd:        Number(r.realized_pnl_usd),
          realized_profit_percentage: Number(r.pnl_percentage),
          count_of_trades:            r.total_trades,
          count_of_buys:              wins,
          count_of_sells:             losses,
          win_rate:                   totalTokens > 0 ? Math.round((wins / totalTokens) * 100) : 0,
          total_usd_invested:         r.total_bought_usd,
          total_sold_usd:             r.total_sold_usd,
          token_address:              r.best_token_address ?? '',
          token_symbol:               r.best_token_symbol  ?? '',
          token_count:                r.token_count ?? 0,
          smart_score:                r.smart_score ?? 0,
          native_balance_wei:         '0',
        }
      })

      const resp = { wallets, chain, source: 'indexer' }
      if (wallets.length > 0) cache.set(cacheKey, { data: resp, ts: Date.now() })
      return reply.header('X-Cache', 'MISS').send(resp)
    } catch (e) {
      app.log.error(e, '[smart-money] query failed')
      return reply.status(500).send({ error: 'Failed to fetch smart money data' })
    }
  })
}
