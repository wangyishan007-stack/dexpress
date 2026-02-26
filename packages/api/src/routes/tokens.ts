import type { FastifyInstance } from 'fastify'
import { query } from '@dex/database'

export async function tokensRoutes(app: FastifyInstance) {
  app.get<{ Params: { address: string } }>('/tokens/:address', async (req, reply) => {
    const addr = req.params.address.toLowerCase()

    const [token] = await query(
      `SELECT t.*,
              COALESCE(th.holder_count, 0) AS holder_count,
              (SELECT COUNT(*) FROM pools WHERE token0 = $1 OR token1 = $1) AS pool_count
       FROM tokens t
       LEFT JOIN token_holders th ON th.token_address = t.address
       WHERE t.address = $1`,
      [addr]
    )

    if (!token) return reply.status(404).send({ error: 'Token not found' })

    // All pools for this token
    const pools = await query(
      `SELECT p.address, p.dex, p.price_usd::float, p.liquidity_usd::float,
              p.volume_24h::float, p.change_24h::float,
              t.symbol AS paired_symbol, t.address AS paired_address
       FROM pools p
       JOIN tokens t ON (
         CASE WHEN p.token0 = $1 THEN t.address = p.token1
              ELSE t.address = p.token0
         END
       )
       WHERE p.token0 = $1 OR p.token1 = $1
       ORDER BY p.liquidity_usd DESC
       LIMIT 20`,
      [addr]
    )

    return { ...token, pools }
  })
}
