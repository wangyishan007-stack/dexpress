import type { FastifyInstance } from 'fastify'
import { query } from '@dex/database'
import type { CandlesQuery } from '@dex/shared'

// date_trunc does NOT accept '5 minutes' — build explicit bucket expression per resolution
// bucket_expr: the GROUP BY / SELECT expression for the time bucket
// bucket_secs: bucket size in seconds (for LIMIT calculation)
const RESOLUTION_MAP: Record<string, { bucketExpr: string; bucketSecs: number }> = {
  '1m':  { bucketExpr: `date_trunc('minute', timestamp)`, bucketSecs: 60 },
  '5m':  { bucketExpr: `date_trunc('minute', timestamp) - (EXTRACT(MINUTE FROM timestamp)::int % 5)  * INTERVAL '1 minute'`, bucketSecs: 300 },
  '15m': { bucketExpr: `date_trunc('minute', timestamp) - (EXTRACT(MINUTE FROM timestamp)::int % 15) * INTERVAL '1 minute'`, bucketSecs: 900 },
  '1h':  { bucketExpr: `date_trunc('hour', timestamp)`, bucketSecs: 3600 },
  '4h':  { bucketExpr: `date_trunc('hour',  timestamp) - (EXTRACT(HOUR   FROM timestamp)::int % 4)  * INTERVAL '1 hour'`,   bucketSecs: 14400 },
  '1d':  { bucketExpr: `date_trunc('day',  timestamp)`, bucketSecs: 86400 },
}

export async function candlesRoutes(app: FastifyInstance) {
  app.get<{
    Params:      { address: string }
    Querystring: CandlesQuery
  }>('/pairs/:address/candles', async (req, reply) => {
    const { address }    = req.params
    const { resolution = '5m', from, to } = req.query

    const resConf = RESOLUTION_MAP[resolution]
    if (!resConf) {
      return reply.status(400).send({ error: 'Invalid resolution' })
    }

    const { bucketExpr } = resConf
    const fromDate = new Date(Number(from) * 1000)
    const toDate   = new Date(Number(to)   * 1000)

    // Inline bucket expression (safe: not user-supplied, comes from whitelist above)
    const rows = await query<{
      time:       string
      open:       number
      high:       number
      low:        number
      close:      number
      volume:     number
      tx_count:   number
    }>(
      `SELECT
        ${bucketExpr}                  AS time,
        (array_agg(open_usd  ORDER BY timestamp ASC))[1]   AS open,
        MAX(high_usd)                  AS high,
        MIN(low_usd)                   AS low,
        (array_agg(close_usd ORDER BY timestamp DESC))[1]  AS close,
        SUM(volume_usd)                AS volume,
        SUM(tx_count)                  AS tx_count
       FROM price_snapshots
       WHERE pool_address = $1
         AND timestamp BETWEEN $2 AND $3
       GROUP BY ${bucketExpr}
       ORDER BY time ASC`,
      [address.toLowerCase(), fromDate, toDate]
    )

    // TradingView Lightweight Charts 格式
    return rows.map((r) => ({
      time:   Math.floor(new Date(r.time).getTime() / 1000),
      open:   Number(r.open),
      high:   Number(r.high),
      low:    Number(r.low),
      close:  Number(r.close),
      volume: Number(r.volume),
    }))
  })
}
