import type { FastifyInstance } from 'fastify'
import { query, redis } from '@dex/database'

export async function statsRoutes(app: FastifyInstance) {
  app.get('/stats', async () => {
    const cached = await redis.get('api:stats')
    if (cached) return JSON.parse(cached)

    const [agg] = await query<{ volume_24h: number; txns_24h: number }>(
      `SELECT SUM(volume_24h)::float AS volume_24h, SUM(txns_24h) AS txns_24h FROM pools`
    )
    const [blockRow] = await query<{ block_number: number; timestamp: string }>(
      `SELECT block_number, timestamp FROM swaps ORDER BY block_number DESC LIMIT 1`
    )

    const result = {
      volume_24h:   agg?.volume_24h   ?? 0,
      txns_24h:     agg?.txns_24h     ?? 0,
      latest_block: blockRow?.block_number ?? 0,
      block_ts:     blockRow?.timestamp    ?? null,
    }

    await redis.set('api:stats', JSON.stringify(result), 'EX', 10)
    return result
  })
}
