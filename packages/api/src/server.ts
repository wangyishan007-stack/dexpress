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
import { walletsRoutes }    from './routes/wallets'
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
  // Always allow localhost for local development
  if (!allowedOrigins.includes('*')) {
    for (const port of ['3000', '3001']) {
      const lo = `http://localhost:${port}`
      if (!allowedOrigins.includes(lo)) allowedOrigins.push(lo)
    }
  }
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
  await app.register(walletsRoutes, { prefix: '/api' })

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

    // Add chain column to pools if not exists
    await db.query(`
      ALTER TABLE pools ADD COLUMN IF NOT EXISTS chain VARCHAR(20) NOT NULL DEFAULT 'base';
      CREATE INDEX IF NOT EXISTS idx_pools_chain ON pools(chain);
    `)

    // Set chain for existing BSC pools (by dex name)
    await db.query(`
      UPDATE pools SET chain = 'bsc' WHERE dex LIKE 'pancakeswap%' AND chain = 'base'
    `)
    console.log('[API] pools.chain migration OK')

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
      INSERT INTO pools (address, token0, token1, dex, fee_tier, chain) VALUES
        ('0x172fcd41e0913e95784454622d1c3724f546f849','0x55d398326f99059ff775485246999027b3197955','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v3',500,'bsc'),
        ('0x36696169c63e42cd08ce11f5deebbcebae652050','0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v3',500,'bsc'),
        ('0x7f51c8aaa6b0599abd16674e2b17fec7a9f674a1','0x2170ed0880ac9a755fd29b2688956bd959f933f8','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v3',500,'bsc'),
        ('0x85fcd7dd0a1e1a9fcd5fd886ed522de8221c3ee5','0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v3',500,'bsc'),
        ('0x678d8a424bebe1b5ee13dc4c4fef13ef83d8e31b','0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v3',2500,'bsc'),
        -- PancakeSwap V2 top pools
        ('0x16b9a82891338f9ba80e2d6970fdda79d1eb0dae','0x55d398326f99059ff775485246999027b3197955','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v2',0,'bsc'),
        ('0xd99c7f6c65857ac913a8f880a4cb84032ab2fc5b','0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v2',0,'bsc'),
        ('0xbcd62661a6b1ded703585d3af7d7649ef4dcdb5c','0x2170ed0880ac9a755fd29b2688956bd959f933f8','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v2',0,'bsc'),
        ('0x0ed7e52944161450477ee417de9cd3a859b14fd0','0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82','0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c','pancakeswap_v2',0,'bsc')
      ON CONFLICT DO NOTHING
    `)
    // BSC meme tokens
    await db.query(`
      INSERT INTO tokens (address, symbol, name, decimals) VALUES
        ('0x25d887ce7a35172c62febfd67a1856f20faebb00','PEPE','Pepe',18),
        ('0xfb5b838b6cfeedc2873ab27866079ac55363d37e','FLOKI','Floki',9)
      ON CONFLICT DO NOTHING
    `)
    console.log('[API] BSC seed data OK')

    // Add BSC indexer state key if not exists
    await db.query(`
      INSERT INTO indexer_state (key, value) VALUES ('last_block_bsc_pool_created', '0')
      ON CONFLICT (key) DO NOTHING
    `)

    // Add chain column to pools if not exists
    await db.query(`
      ALTER TABLE pools ADD COLUMN IF NOT EXISTS chain VARCHAR(20) NOT NULL DEFAULT 'base'
    `)
    // Update BSC seed pools
    await db.query(`
      UPDATE pools SET chain = 'bsc' WHERE dex IN ('pancakeswap_v3', 'pancakeswap_v2')
    `)
    console.log('[API] pools.chain migration OK')

    // Widen address columns for Solana (base58 up to 44 chars, signatures up to 88 chars)
    // Run each ALTER separately — some may fail if a view/rule depends on the column
    const alterStmts = [
      `ALTER TABLE tokens ALTER COLUMN address TYPE VARCHAR(50)`,
      `ALTER TABLE pools ALTER COLUMN address TYPE VARCHAR(70)`,
      `ALTER TABLE pools ALTER COLUMN token0 TYPE VARCHAR(50)`,
      `ALTER TABLE pools ALTER COLUMN token1 TYPE VARCHAR(50)`,
      `ALTER TABLE swaps ALTER COLUMN pool_address TYPE VARCHAR(70)`,
      `ALTER TABLE swaps ALTER COLUMN tx_hash TYPE VARCHAR(100)`,
      `ALTER TABLE swaps ALTER COLUMN sender TYPE VARCHAR(50)`,
      `ALTER TABLE swaps ALTER COLUMN recipient TYPE VARCHAR(50)`,
      `ALTER TABLE wallet_pnl ALTER COLUMN wallet_address TYPE VARCHAR(50)`,
      `ALTER TABLE wallet_pnl ALTER COLUMN best_token_address TYPE VARCHAR(50)`,
    ]
    for (const stmt of alterStmts) {
      try { await db.query(stmt) }
      catch (e: any) { console.warn(`[Migration] ${stmt.slice(0, 60)}... skipped:`, e?.message?.slice(0, 80)) }
    }
    // Solana seed tokens
    await db.query(`
      INSERT INTO tokens (address, symbol, name, decimals) VALUES
        ('So11111111111111111111111111111111111111112','SOL','Wrapped SOL',9),
        ('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v','USDC','USD Coin',6),
        ('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB','USDT','Tether USD',6)
      ON CONFLICT DO NOTHING
    `)
    console.log('[API] Solana column widening + seed tokens OK')
  } catch (e: unknown) {
    console.warn('[API] Migration warning:', e instanceof Error ? e.message : e)
  }
}

async function startWorkers() {
  // Start SolanaIndexer first (needed for on-demand wallet indexing)
  try {
    const { SolanaIndexerWorker, setSolanaIndexerInstance } = await import('./solanaIndexer')
    const solanaIndexer = new SolanaIndexerWorker()
    setSolanaIndexerInstance(solanaIndexer)
    await solanaIndexer.start()
    console.log('[API] SolanaIndexerWorker started')
  } catch (e) {
    console.warn('[API] SolanaIndexerWorker failed to start:', e)
  }

  // SmartMoney can take minutes to compute — don't block other workers
  try {
    const { SmartMoneyWorker } = await import('./smartMoneyWorker')
    const smartMoney = new SmartMoneyWorker()
    smartMoney.start().catch(e => console.warn('[API] SmartMoneyWorker error:', e))
    console.log('[API] SmartMoneyWorker started')
  } catch (e) {
    console.warn('[API] SmartMoneyWorker failed to start:', e)
  }

  try {
    const { IndexerWorker } = await import('./indexerWorker')
    const { AggregatorWorker } = await import('./aggregatorWorker')
    const { PairDiscoveryWorker } = await import('./pairDiscoveryWorker')
    const indexer = new IndexerWorker()
    const aggregator = new AggregatorWorker()
    const discovery = new PairDiscoveryWorker({
      onNewPool: (address: string) => indexer.addPool(address),
    })
    discovery.start().catch((e: unknown) => console.error('[API] Discovery error:', e))
    await indexer.start()
    aggregator.start()
    console.log('[API] IndexerWorker + AggregatorWorker + PairDiscoveryWorker started')
  } catch (e) {
    console.warn('[API] IndexerWorker failed to start:', e)
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
  startWorkers()
}

start().catch((err) => {
  console.error('[API] Fatal:', err)
  process.exit(1)
})
