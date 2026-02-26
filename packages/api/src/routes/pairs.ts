import type { FastifyInstance } from 'fastify'
import { db, redis, query } from '@dex/database'
import type { PairsQuery, PairsResponse, Pool, SortField } from '@dex/shared'
import { enrichPairTokens } from '../tokenEnrichment'

// 稳定币 + WETH 地址（全小写），用于排除 stable-to-stable pairs
const COMMON_ADDRS = [
  '0x4200000000000000000000000000000000000006', // WETH
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', // USDT
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI
] as const
const COMMON_ADDR_SQL = COMMON_ADDRS.map(a => `'${a}'`).join(',')

// 允许的排序字段白名单（防 SQL 注入）
// 基于 CTE 聚合列名，agg.* 为聚合值，main_p.* 为流动性最大池的值
const ALLOWED_SORT: Record<string, string> = {
  trending_score: 'agg.max_trending_score',
  volume_5m:      'agg.total_volume_5m',
  volume_1h:      'agg.total_volume_1h',
  volume_6h:      'agg.total_volume_6h',
  volume_24h:     'agg.total_volume_24h',
  change_5m:      'main_p.change_5m',
  change_1h:      'main_p.change_1h',
  change_6h:      'main_p.change_6h',
  change_24h:     'main_p.change_24h',
  liquidity_usd:  'agg.total_liquidity',
  mcap_usd:       'mcap_usd',
  created_at:     'agg.first_created',
  txns_1h:        'agg.total_txns_1h',
}

export async function pairsRoutes(app: FastifyInstance) {
  // ── GET /api/pairs ───────────────────────────────────────────
  app.get<{ Querystring: PairsQuery }>('/pairs', async (req, reply) => {
    const {
      sort   = 'trending_score',
      order  = 'desc',
      filter = 'trending',
      window = '1h',
      limit  = 50,
      offset = 0,
      search,
    } = req.query

    const limitN  = Math.min(Number(limit),  200)
    const offsetN = Math.max(Number(offset), 0)
    const sortCol = ALLOWED_SORT[sort] ?? 'agg.max_trending_score'
    const sortDir = order === 'asc' ? 'ASC' : 'DESC'

    // ── Cache key ──────────────────────────────────────────────
    // 使用 pairs2 前缀避免与旧格式缓存冲突
    const cacheKey = `pairs2:${filter}:${window}:${sort}:${sortDir}:${limitN}:${offsetN}:${search ?? ''}`
    const cached = await redis.get(cacheKey)
    if (cached) {
      reply.header('X-Cache', 'HIT')
      const parsed = JSON.parse(cached) as PairsResponse
      // Enrich on cache hit too — logos may have loaded after this entry was cached
      return { ...parsed, pairs: parsed.pairs.map(enrichPairTokens) }
    }

    // ── Build WHERE conditions (applied AFTER CTE join) ────────
    const conditions: string[] = []
    const params: unknown[] = []
    let paramIdx = 1

    if (search) {
      conditions.push(
        `(t0.symbol ILIKE $${paramIdx} OR t0.name ILIKE $${paramIdx}
          OR t1.symbol ILIKE $${paramIdx} OR t1.name ILIKE $${paramIdx}
          OR agg.main_address ILIKE $${paramIdx})`
      )
      params.push(`%${search}%`)
      paramIdx++
    }

    switch (filter) {
      case 'new':
        conditions.push(`agg.first_created > NOW() - INTERVAL '24 hours'`)
        break
      case 'gainers':
      case 'losers':
        // Sort-only — no strict >0/<0 filter while change_24h is still warming up
        break
      case 'top':
        conditions.push(`agg.total_liquidity > 10000`)
        break
      case 'trending':
        // 排除两个 token 都是稳定币/WETH 的 pairs（如 WETH/USDC, USDC/USDT）
        conditions.push(
          `NOT (agg.token0 IN (${COMMON_ADDR_SQL}) AND agg.token1 IN (${COMMON_ADDR_SQL}))`
        )
        break
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // ── Main query: CTE 按 (token0, token1) 聚合多个费率池 ──────
    // agg CTE: 对同一 pair 的所有池求和，取流动性最大的池作为代表
    const sql = `
      WITH agg AS (
        SELECT
          p.token0,
          p.token1,
          (ARRAY_AGG(p.address   ORDER BY p.liquidity_usd DESC NULLS LAST))[1] AS main_address,
          SUM(p.volume_5m)::float      AS total_volume_5m,
          SUM(p.volume_1h)::float      AS total_volume_1h,
          SUM(p.volume_6h)::float      AS total_volume_6h,
          SUM(p.volume_24h)::float     AS total_volume_24h,
          SUM(p.txns_5m)::int          AS total_txns_5m,
          SUM(p.txns_1h)::int          AS total_txns_1h,
          SUM(p.txns_6h)::int          AS total_txns_6h,
          SUM(p.txns_24h)::int         AS total_txns_24h,
          SUM(p.liquidity_usd)::float  AS total_liquidity,
          MAX(p.trending_score)::float AS max_trending_score,
          MIN(p.created_at)            AS first_created,
          ARRAY_AGG(p.fee_tier  ORDER BY p.liquidity_usd DESC NULLS LAST) AS all_fee_tiers,
          ARRAY_AGG(p.address   ORDER BY p.liquidity_usd DESC NULLS LAST) AS all_addresses,
          ARRAY_AGG(p.dex::text ORDER BY p.liquidity_usd DESC NULLS LAST) AS all_dexes,
          (ARRAY_AGG(p.holder_count ORDER BY p.liquidity_usd DESC NULLS LAST))[1] AS holder_count
        FROM pools p
        WHERE p.price_usd > 0
        GROUP BY p.token0, p.token1
      )
      SELECT
        agg.main_address                    AS address,
        (agg.all_dexes)[1]                  AS dex,
        (agg.all_fee_tiers)[1]              AS fee_tier,
        main_p.price_usd::float,
        agg.total_liquidity                 AS liquidity_usd,
        agg.total_volume_5m                 AS volume_5m,
        agg.total_volume_1h                 AS volume_1h,
        agg.total_volume_6h                 AS volume_6h,
        agg.total_volume_24h                AS volume_24h,
        agg.total_txns_5m                   AS txns_5m,
        agg.total_txns_1h                   AS txns_1h,
        agg.total_txns_6h                   AS txns_6h,
        agg.total_txns_24h                  AS txns_24h,
        main_p.change_5m::float,
        main_p.change_1h::float,
        main_p.change_6h::float,
        main_p.change_24h::float,
        agg.max_trending_score              AS trending_score,
        agg.holder_count,
        agg.first_created                   AS created_at,
        main_p.updated_at,
        json_build_object(
          'address',      t0.address,
          'symbol',       t0.symbol,
          'name',         t0.name,
          'decimals',     t0.decimals,
          'logo_url',     t0.logo_url,
          'total_supply', t0.total_supply::text
        ) AS token0,
        json_build_object(
          'address',      t1.address,
          'symbol',       t1.symbol,
          'name',         t1.name,
          'decimals',     t1.decimals,
          'logo_url',     t1.logo_url,
          'total_supply', t1.total_supply::text
        ) AS token1,
        CASE WHEN t0.total_supply > 0
          THEN (main_p.price_usd * t0.total_supply / POWER(10, t0.decimals))::float
          ELSE 0
        END AS mcap_usd,
        agg.all_fee_tiers,
        agg.all_addresses,
        agg.all_dexes,
        COUNT(*) OVER() AS total_count
      FROM agg
      JOIN pools  main_p ON main_p.address = agg.main_address
      JOIN tokens t0     ON t0.address     = agg.token0
      JOIN tokens t1     ON t1.address     = agg.token1
      ${whereClause}
      ORDER BY ${sortCol} ${sortDir} NULLS LAST
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `
    params.push(limitN, offsetN)

    const rows = await query<Pool & { total_count: number }>(sql, params)
    const total = rows[0]?.total_count ?? 0

    const response: PairsResponse = {
      pairs:  rows.map(({ total_count, ...rest }) => rest as Pool),
      total:  Number(total),
      limit:  limitN,
      offset: offsetN,
    }

    // 缓存原始 DB 数据（15秒），返回时再 enrich（logos 不进缓存，避免 stale）
    await redis.set(cacheKey, JSON.stringify(response), 'EX', 15)
    reply.header('X-Cache', 'MISS')
    return { ...response, pairs: response.pairs.map(enrichPairTokens) }
  })

  // ── GET /api/pairs/:address ──────────────────────────────────
  app.get<{ Params: { address: string } }>('/pairs/:address', async (req, reply) => {
    const { address } = req.params
    const addr = address.toLowerCase()

    const cacheKey = `pair_detail:${addr}`
    const cached   = await redis.get(cacheKey)
    if (cached) {
      const parsed = JSON.parse(cached)
      return enrichPairTokens(parsed)
    }

    const [pair] = await query<Pool>(
      `SELECT
        p.*,
        p.price_usd::float     AS price_usd,
        p.liquidity_usd::float AS liquidity_usd,
        p.volume_24h::float    AS volume_24h,
        p.trending_score::float AS trending_score,
        json_build_object(
          'address', t0.address, 'symbol', t0.symbol, 'name', t0.name,
          'decimals', t0.decimals, 'logo_url', t0.logo_url,
          'total_supply', t0.total_supply::text
        ) AS token0,
        json_build_object(
          'address', t1.address, 'symbol', t1.symbol, 'name', t1.name,
          'decimals', t1.decimals, 'logo_url', t1.logo_url,
          'total_supply', t1.total_supply::text
        ) AS token1,
        CASE WHEN t0.total_supply > 0
          THEN (p.price_usd * t0.total_supply / POWER(10, t0.decimals))::float
          ELSE 0
        END AS mcap_usd
       FROM pools p
       JOIN tokens t0 ON t0.address = p.token0
       JOIN tokens t1 ON t1.address = p.token1
       WHERE p.address = $1`,
      [addr]
    )

    if (!pair) {
      return reply.status(404).send({ error: 'Pair not found' })
    }

    // 最近 50 笔 swaps
    const recentSwaps = await query(
      `SELECT id::text, pool_address, tx_hash, timestamp, sender, recipient,
              amount0::float, amount1::float, amount_usd::float, price_usd::float, is_buy
       FROM swaps
       WHERE pool_address = $1
       ORDER BY timestamp DESC
       LIMIT 50`,
      [addr]
    )

    const result = { ...pair, recent_swaps: recentSwaps }
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 10)
    return enrichPairTokens(result)
  })

  // ── GET /api/pairs/:address/swaps ────────────────────────────
  app.get<{
    Params: { address: string }
    Querystring: { limit?: number; before?: string }
  }>('/pairs/:address/swaps', async (req) => {
    const { address }    = req.params
    const limit          = Math.min(Number(req.query.limit ?? 50), 200)
    const before         = req.query.before   // ISO timestamp cursor

    const conditions = ['pool_address = $1']
    const params: unknown[] = [address.toLowerCase()]
    let idx = 2

    if (before) {
      conditions.push(`timestamp < $${idx}`)
      params.push(new Date(before))
      idx++
    }

    params.push(limit)

    return query(
      `SELECT id::text, tx_hash, timestamp, sender, recipient,
              amount0::float, amount1::float, amount_usd::float, price_usd::float, is_buy
       FROM swaps
       WHERE ${conditions.join(' AND ')}
       ORDER BY timestamp DESC
       LIMIT $${idx}`,
      params
    )
  })
}
