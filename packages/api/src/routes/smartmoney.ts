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
      worker.calculateNow().catch(console.error) // 后台运行
      return reply.send({ ok: true, message: 'Recalculation started' })
    } catch (e) {
      return reply.status(500).send({ error: String(e) })
    }
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

  // GET /api/smart-money?chain=base&period=7d&limit=100
  app.get('/api/smart-money', async (req, reply) => {
    const { chain = 'base', period = '7d', limit = '100' } = req.query as Record<string, string>
    const limitN = Math.min(Number(limit) || 100, 200)

    const cacheKey = `${chain}:${period}:${limitN}`
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return reply.header('X-Cache', 'HIT').send(cached.data)
    }

    try {
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
          calculated_at
        FROM wallet_pnl
        WHERE chain = $1
          AND period = $2
          AND realized_pnl_usd > 0
        ORDER BY realized_pnl_usd DESC
        LIMIT $3
      `, [chain, period, limitN])

      // Map to SmartWallet shape (compatible with frontend)
      const wallets = rows.map(r => ({
        address:                    r.wallet_address,
        realized_profit_usd:        Number(r.realized_pnl_usd),
        realized_profit_percentage: Number(r.pnl_percentage),
        count_of_trades:            r.total_trades,
        count_of_buys:              r.win_trades,
        count_of_sells:             r.loss_trades,
        total_usd_invested:         r.total_bought_usd,
        total_sold_usd:             r.total_sold_usd,
        token_address:              r.best_token_address ?? '',
        token_symbol:               r.best_token_symbol  ?? '',
        native_balance_wei:         '0',
      }))

      const resp = { wallets, chain, source: 'indexer' }
      if (wallets.length > 0) cache.set(cacheKey, { data: resp, ts: Date.now() })
      return reply.header('X-Cache', 'MISS').send(resp)
    } catch (e) {
      app.log.error(e, '[smart-money] query failed')
      return reply.status(500).send({ error: 'Failed to fetch smart money data' })
    }
  })
}
