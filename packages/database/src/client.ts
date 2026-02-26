import { Pool, type PoolConfig } from 'pg'
import Redis from 'ioredis'

// ─── PostgreSQL ────────────────────────────────────────────────────────────
// 懒加载：TypeScript import 会被提升到 dotenv.config() 之前，
// 用工厂函数延迟 Pool 创建，确保 DATABASE_URL 已加载。

let _db: Pool | null = null

function getDbPool(): Pool {
  if (!_db) {
    const pgConfig: PoolConfig = {
      connectionString: process.env.DATABASE_URL,
      min: parseInt(process.env.DATABASE_POOL_MIN ?? '2'),
      max: parseInt(process.env.DATABASE_POOL_MAX ?? '10'),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }
    _db = new Pool(pgConfig)
    _db.on('error', (err) => console.error('[DB] Pool error', err))
  }
  return _db
}

// Proxy 让外部仍可直接用 db.query(), db.end() 等
export const db = new Proxy({} as Pool, {
  get: (_target, prop) => {
    const pool = getDbPool()
    const val  = (pool as any)[prop]
    return typeof val === 'function' ? val.bind(pool) : val
  },
})

// Helper: run a query and return rows
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await db.query(sql, params)
  return result.rows as T[]
}

// Helper: run a query and return first row or null
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

// Helper: upsert token
export async function upsertToken(token: {
  address: string
  symbol: string
  name: string
  decimals: number
  total_supply?: bigint | string
  logo_url?: string
}) {
  await db.query(
    `INSERT INTO tokens (address, symbol, name, decimals, total_supply, logo_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (address) DO UPDATE SET
       symbol       = EXCLUDED.symbol,
       name         = EXCLUDED.name,
       decimals     = EXCLUDED.decimals,
       total_supply = COALESCE(EXCLUDED.total_supply, tokens.total_supply),
       logo_url     = COALESCE(EXCLUDED.logo_url, tokens.logo_url),
       updated_at   = NOW()`,
    [
      token.address.toLowerCase(),
      token.symbol,
      token.name,
      token.decimals,
      token.total_supply?.toString() ?? '0',
      token.logo_url ?? null,
    ]
  )
}

// Helper: upsert pool
export async function upsertPool(pool: {
  address: string
  token0: string
  token1: string
  dex: string
  fee_tier?: number
  tick_spacing?: number
}) {
  await db.query(
    `INSERT INTO pools (address, token0, token1, dex, fee_tier, tick_spacing)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (address) DO NOTHING`,
    [
      pool.address.toLowerCase(),
      pool.token0.toLowerCase(),
      pool.token1.toLowerCase(),
      pool.dex,
      pool.fee_tier ?? null,
      pool.tick_spacing ?? null,
    ]
  )
}

// Helper: insert swap
export async function insertSwap(swap: {
  pool_address: string
  block_number: bigint | number
  tx_hash: string
  log_index: number
  timestamp: Date
  sender?: string
  recipient?: string
  amount0: number
  amount1: number
  amount_usd: number
  price_usd: number
  is_buy: boolean
}) {
  try {
    await db.query(
      `INSERT INTO swaps
         (pool_address, block_number, tx_hash, log_index, timestamp,
          sender, recipient, amount0, amount1, amount_usd, price_usd, is_buy)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        swap.pool_address.toLowerCase(),
        swap.block_number.toString(),
        swap.tx_hash.toLowerCase(),
        swap.log_index,
        swap.timestamp,
        swap.sender?.toLowerCase()    ?? null,
        swap.recipient?.toLowerCase() ?? null,
        swap.amount0,
        swap.amount1,
        swap.amount_usd,
        swap.price_usd,
        swap.is_buy,
      ]
    )
  } catch (err: any) {
    // 23505 = unique_violation — ignore duplicate swaps (e.g. re-orgs)
    if (err?.code !== '23505') throw err
  }
}

// ─── Redis ─────────────────────────────────────────────────────────────────
// 同样懒加载：REDIS_URL 需要在 dotenv.config() 后才可用

function makeRedis() {
  const r = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy: (times) => Math.min(times * 200, 3000),
  })
  r.on('error', (err) => console.error('[Redis] Error', err.message))
  return r
}

let _redis: Redis | null = null
let _redisPub: Redis | null = null
let _redisSub: Redis | null = null

export const redis = new Proxy({} as Redis, {
  get: (_t, prop) => {
    if (!_redis) _redis = makeRedis()
    const val = (_redis as any)[prop]
    return typeof val === 'function' ? val.bind(_redis) : val
  },
})

export const redisPub = new Proxy({} as Redis, {
  get: (_t, prop) => {
    if (!_redisPub) _redisPub = makeRedis()
    const val = (_redisPub as any)[prop]
    return typeof val === 'function' ? val.bind(_redisPub) : val
  },
})

export const redisSub = new Proxy({} as Redis, {
  get: (_t, prop) => {
    if (!_redisSub) _redisSub = makeRedis()
    const val = (_redisSub as any)[prop]
    return typeof val === 'function' ? val.bind(_redisSub) : val
  },
})

// Redis key 命名规范
export const RedisKeys = {
  pairsRanking:  (window: string) => `ranking:${window}`,               // ZSET
  pairData:      (address: string) => `pair:${address}`,                 // HASH
  tokenPrice:    (address: string) => `price:${address}`,                // STRING (USD)
  ethUsdPrice:   'eth_usd_price',                                        // STRING
  aggregated:    (address: string, w: string) => `agg:${address}:${w}`,  // HASH
  searchIndex:   'search:tokens',                                        // HASH
}
