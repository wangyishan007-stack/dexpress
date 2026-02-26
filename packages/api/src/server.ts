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
  await app.register(fastifyCors, {
    origin: process.env.FRONTEND_URL ?? '*',
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

async function start() {
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
