import type { FastifyInstance } from 'fastify'
import { query } from '@dex/database'

export async function searchRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q: string } }>('/search', async (req, reply) => {
    const q = (req.query.q ?? '').trim()
    if (q.length < 2) return reply.status(400).send({ error: 'Query too short' })

    // 精确地址匹配
    if (q.startsWith('0x') && q.length === 42) {
      // Pool address
      const pools = await query(
        `SELECT p.address, p.dex, t0.symbol AS symbol0, t1.symbol AS symbol1
         FROM pools p
         JOIN tokens t0 ON t0.address = p.token0
         JOIN tokens t1 ON t1.address = p.token1
         WHERE p.address = $1`,
        [q.toLowerCase()]
      )
      // Token address
      const tokens = await query(
        `SELECT address, symbol, name, logo_url FROM tokens WHERE address = $1`,
        [q.toLowerCase()]
      )
      return { pools, tokens }
    }

    // 模糊搜索 token symbol/name
    const tokens = await query(
      `SELECT t.address, t.symbol, t.name, t.logo_url,
              COUNT(p.address) AS pool_count
       FROM tokens t
       LEFT JOIN pools p ON p.token0 = t.address OR p.token1 = t.address
       WHERE t.symbol ILIKE $1 OR t.name ILIKE $1
       GROUP BY t.address
       ORDER BY pool_count DESC, t.symbol
       LIMIT 20`,
      [`${q}%`]
    )

    const pools = await query(
      `SELECT p.address, p.dex, t0.symbol AS symbol0, t1.symbol AS symbol1,
              p.price_usd::float, p.liquidity_usd::float
       FROM pools p
       JOIN tokens t0 ON t0.address = p.token0
       JOIN tokens t1 ON t1.address = p.token1
       WHERE t0.symbol ILIKE $1 OR t1.symbol ILIKE $1
         OR t0.name ILIKE $1 OR t1.name ILIKE $1
       ORDER BY p.liquidity_usd DESC
       LIMIT 20`,
      [`%${q}%`]
    )

    return { pools, tokens }
  })
}
