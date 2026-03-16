import dotenv from 'dotenv'
import path   from 'path'
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') })

import Fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyWebsocket from '@fastify/websocket'
import { redis, redisSub } from '@dex/database'

import { pairsRoutes }  from './routes/pairs'
import { tokensRoutes } from './routes/tokens'
import { searchRoutes } from './routes/search'
import { candlesRoutes } from './routes/candles'
import { statsRoutes }  from './routes/stats'
import { smartMoneyRoutes } from './routes/smartmoney'
import { setupPairsWs }  from './ws/pairsWs'
import { startTokenEnrichment } from './tokenEnrichment'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
  },
})

async function build() {
  // ── Plugins ────────────────────────────────────────────────
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(s => s.trim())
    : ['*']
  await app.register(fastifyCors, {
    origin: allowedOrigins.length === 1 && allowedOrigins[0] === '*' ? '*' : allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
  })

  await app.register(fastifyWebsocket)

  // ── Health check ───────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', ts: Date.now() }))

  // ── REST routes ────────────────────────────────────────────
  await app.register(pairsRoutes,  { prefix: '/api' })
  await app.register(tokensRoutes, { prefix: '/api' })
  await app.register(searchRoutes, { prefix: '/api' })
  await app.register(candlesRoutes, { prefix: '/api' })
  await app.register(statsRoutes,  { prefix: '/api' })
  await app.register(smartMoneyRoutes)

  // ── WebSocket ──────────────────────────────────────────────
  await setupPairsWs(app, redisSub)

  return app
}

async function runMigration() {
  try {
    const { db } = await import('@dex/database')
    await db.query(`
      CREATE TABLE IF NOT EXISTS wallet_pnl (
        wallet_address     VARCHAR(42)    NOT NULL,
        chain              VARCHAR(20)    NOT NULL DEFAULT 'base',
        period             VARCHAR(5)     NOT NULL,
        realized_pnl_usd   NUMERIC(30,6)  NOT NULL DEFAULT 0,
        unrealized_pnl_usd NUMERIC(30,6)  NOT NULL DEFAULT 0,
        total_bought_usd   NUMERIC(30,6)  NOT NULL DEFAULT 0,
        total_sold_usd     NUMERIC(30,6)  NOT NULL DEFAULT 0,
        win_trades         INTEGER        NOT NULL DEFAULT 0,
        loss_trades        INTEGER        NOT NULL DEFAULT 0,
        total_trades       INTEGER        NOT NULL DEFAULT 0,
        best_token_address VARCHAR(42),
        best_token_symbol  VARCHAR(50),
        best_token_pnl_usd NUMERIC(30,6)  NOT NULL DEFAULT 0,
        pnl_percentage     NUMERIC(15,4)  NOT NULL DEFAULT 0,
        calculated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        PRIMARY KEY (wallet_address, chain, period)
      );
      CREATE INDEX IF NOT EXISTS idx_wallet_pnl_chain_period
        ON wallet_pnl(chain, period, realized_pnl_usd DESC);
      CREATE INDEX IF NOT EXISTS idx_wallet_pnl_calculated
        ON wallet_pnl(calculated_at DESC);
    `)
    console.log('[API] wallet_pnl migration OK')

    // Insert BSC seed tokens + pools if not exist
    await db.query(`
      INSERT INTO tokens (address, symbol, name, decimals) VALUES
        ('0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','WBNB','Wrapped BNB',18),
        ('0x55d398326f99059ff775485246999027b3197955','USDT','Tether USD',18),
        ('0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d','USDC','USD Coin',18),
        ('0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82','CAKE','PancakeSwap Token',18),
        ('0x2170ed0880ac9a755fd29b2688956bd959f933f8','ETH','Ethereum Token',18),
        ('0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c','BTCB','Binance-Peg BTCB',18)
      ON CONFLICT DO NOTHING
    `)
    await db.query(`
      INSERT INTO pools (address, token0, token1, dex, fee_tier) VALUES
        ('0x172fcd41e0913e95784454622d1c3724f546f849','0x55d398326f99059ff775485246999027b3197955','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v3',500),
        ('0x36696169c63e42cd08ce11f5deebbcebae652050','0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v3',500),
        ('0x7f51c8aaa6b0599abd16674e2b17fec7a9f674a1','0x2170ed0880ac9a755fd29b2688956bd959f933f8','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v3',500),
        ('0x85fcd7dd0a1e1a9fcd5fd886ed522de8221c3ee5','0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v3',500),
        ('0x678d8a424bebe1b5ee13dc4c4fef13ef83d8e31b','0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v3',2500)
      ON CONFLICT DO NOTHING
    `)
    console.log('[API] BSC seed data OK')
  } catch (e: unknown) {
    console.warn('[API] Migration warning:', e instanceof Error ? e.message : e)
  }
}

async function startSmartMoneyWorker() {
  try {
    // Lazy import to avoid circular deps
    const { SmartMoneyWorker } = await import('./smartMoneyWorker')
    const worker = new SmartMoneyWorker()
    await worker.start()
    console.log('[API] SmartMoneyWorker started')
  } catch (e) {
    console.warn('[API] SmartMoneyWorker failed to start:', e)
  }
}

async function start() {
  // Run DB migrations on startup
  await runMigration()

  // Load token metadata before accepting requests
  await startTokenEnrichment()

  const server = await build()
  const port   = parseInt(process.env.PORT ?? '3001')

  await server.listen({ port, host: '0.0.0.0' })
  console.log(`[API] Listening on port ${port}`)

  // Start background workers after server is up
  startSmartMoneyWorker()
}

start().catch((err) => {
  console.error('[API] Fatal:', err)
  process.exit(1)
})
