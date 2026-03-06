"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisKeys = exports.redisSub = exports.redisPub = exports.redis = exports.db = void 0;
exports.query = query;
exports.queryOne = queryOne;
exports.upsertToken = upsertToken;
exports.upsertPool = upsertPool;
exports.insertSwap = insertSwap;
const pg_1 = require("pg");
const ioredis_1 = __importDefault(require("ioredis"));
// ─── PostgreSQL ────────────────────────────────────────────────────────────
// 懒加载：TypeScript import 会被提升到 dotenv.config() 之前，
// 用工厂函数延迟 Pool 创建，确保 DATABASE_URL 已加载。
let _db = null;
function getDbPool() {
    if (!_db) {
        const pgConfig = {
            connectionString: process.env.DATABASE_URL,
            min: parseInt(process.env.DATABASE_POOL_MIN ?? '2'),
            max: parseInt(process.env.DATABASE_POOL_MAX ?? '10'),
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 5_000,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        };
        _db = new pg_1.Pool(pgConfig);
        _db.on('error', (err) => console.error('[DB] Pool error', err));
    }
    return _db;
}
// Proxy 让外部仍可直接用 db.query(), db.end() 等
exports.db = new Proxy({}, {
    get: (_target, prop) => {
        const pool = getDbPool();
        const val = pool[prop];
        return typeof val === 'function' ? val.bind(pool) : val;
    },
});
// Helper: run a query and return rows
async function query(sql, params) {
    const result = await exports.db.query(sql, params);
    return result.rows;
}
// Helper: run a query and return first row or null
async function queryOne(sql, params) {
    const rows = await query(sql, params);
    return rows[0] ?? null;
}
// Helper: upsert token
async function upsertToken(token) {
    await exports.db.query(`INSERT INTO tokens (address, symbol, name, decimals, total_supply, logo_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (address) DO UPDATE SET
       symbol       = EXCLUDED.symbol,
       name         = EXCLUDED.name,
       decimals     = EXCLUDED.decimals,
       total_supply = COALESCE(EXCLUDED.total_supply, tokens.total_supply),
       logo_url     = COALESCE(EXCLUDED.logo_url, tokens.logo_url),
       updated_at   = NOW()`, [
        token.address.toLowerCase(),
        token.symbol,
        token.name,
        token.decimals,
        token.total_supply?.toString() ?? '0',
        token.logo_url ?? null,
    ]);
}
// Helper: upsert pool
async function upsertPool(pool) {
    await exports.db.query(`INSERT INTO pools (address, token0, token1, dex, fee_tier, tick_spacing)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (address) DO NOTHING`, [
        pool.address.toLowerCase(),
        pool.token0.toLowerCase(),
        pool.token1.toLowerCase(),
        pool.dex,
        pool.fee_tier ?? null,
        pool.tick_spacing ?? null,
    ]);
}
// Helper: insert swap
async function insertSwap(swap) {
    try {
        await exports.db.query(`INSERT INTO swaps
         (pool_address, block_number, tx_hash, log_index, timestamp,
          sender, recipient, amount0, amount1, amount_usd, price_usd, is_buy)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [
            swap.pool_address.toLowerCase(),
            swap.block_number.toString(),
            swap.tx_hash.toLowerCase(),
            swap.log_index,
            swap.timestamp,
            swap.sender?.toLowerCase() ?? null,
            swap.recipient?.toLowerCase() ?? null,
            swap.amount0,
            swap.amount1,
            swap.amount_usd,
            swap.price_usd,
            swap.is_buy,
        ]);
    }
    catch (err) {
        // 23505 = unique_violation — ignore duplicate swaps (e.g. re-orgs)
        if (err?.code !== '23505')
            throw err;
    }
}
// ─── Redis ─────────────────────────────────────────────────────────────────
// 同样懒加载：REDIS_URL 需要在 dotenv.config() 后才可用
function makeRedis() {
    const r = new ioredis_1.default(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        retryStrategy: (times) => Math.min(times * 200, 3000),
    });
    r.on('error', (err) => console.error('[Redis] Error', err.message));
    return r;
}
let _redis = null;
let _redisPub = null;
let _redisSub = null;
exports.redis = new Proxy({}, {
    get: (_t, prop) => {
        if (!_redis)
            _redis = makeRedis();
        const val = _redis[prop];
        return typeof val === 'function' ? val.bind(_redis) : val;
    },
});
exports.redisPub = new Proxy({}, {
    get: (_t, prop) => {
        if (!_redisPub)
            _redisPub = makeRedis();
        const val = _redisPub[prop];
        return typeof val === 'function' ? val.bind(_redisPub) : val;
    },
});
exports.redisSub = new Proxy({}, {
    get: (_t, prop) => {
        if (!_redisSub)
            _redisSub = makeRedis();
        const val = _redisSub[prop];
        return typeof val === 'function' ? val.bind(_redisSub) : val;
    },
});
// Redis key 命名规范
exports.RedisKeys = {
    pairsRanking: (window) => `ranking:${window}`, // ZSET
    pairData: (address) => `pair:${address}`, // HASH
    tokenPrice: (address) => `price:${address}`, // STRING (USD)
    ethUsdPrice: 'eth_usd_price', // STRING
    aggregated: (address, w) => `agg:${address}:${w}`, // HASH
    searchIndex: 'search:tokens', // HASH
};
