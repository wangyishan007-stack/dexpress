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
  } catch (e: unknown) {
    console.warn('[API] Migration warning:', e instanceof Error ? e.message : e)
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
}

start().catch((err) => {
  console.error('[API] Fatal:', err)
  process.exit(1)
})
