/**
 * 快速连接测试脚本
 * 验证：PostgreSQL 连通 + Redis 连通 + Alchemy WebSocket 正常
 */

import dotenv from 'dotenv'
import path   from 'path'
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') })

import { Pool }   from 'pg'
import Redis      from 'ioredis'
import { createPublicClient, webSocket, http } from 'viem'
import { base }   from 'viem/chains'

const RESET  = '\x1b[0m'
const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const YELLOW = '\x1b[33m'

function ok(msg: string)   { console.log(`${GREEN}  ✓${RESET} ${msg}`) }
function fail(msg: string) { console.log(`${RED}  ✗${RESET} ${msg}`) }
function info(msg: string) { console.log(`${YELLOW}  →${RESET} ${msg}`) }

async function testPostgres() {
  info('Testing PostgreSQL connection…')
  const pg = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const res = await pg.query('SELECT current_database() AS db, version()')
    ok(`PostgreSQL: ${res.rows[0].db} — ${res.rows[0].version.split(' ').slice(0,2).join(' ')}`)
    // Check tables exist
    const tables = await pg.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
    )
    ok(`Tables: ${tables.rows.map((r: any) => r.table_name).join(', ')}`)
  } catch (err: any) {
    fail(`PostgreSQL: ${err.message}`)
  } finally {
    await pg.end()
  }
}

async function testRedis() {
  info('Testing Redis connection…')
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
  })
  try {
    const pong = await redis.ping()
    ok(`Redis: ${pong}`)
    await redis.set('test:key', 'hello', 'EX', 10)
    const val = await redis.get('test:key')
    ok(`Redis read/write: ${val}`)
  } catch (err: any) {
    fail(`Redis: ${err.message}`)
  } finally {
    redis.disconnect()
  }
}

async function testAlchemy() {
  info('Testing Alchemy HTTP connection…')
  try {
    const client = createPublicClient({
      chain: base,
      transport: http(process.env.ALCHEMY_HTTP_URL!),
    })
    const blockNumber = await client.getBlockNumber()
    ok(`Alchemy HTTP: current block #${blockNumber}`)
  } catch (err: any) {
    fail(`Alchemy HTTP: ${err.message}`)
  }

  info('Testing Alchemy WebSocket (5s timeout)…')
  await new Promise<void>((resolve) => {
    const client = createPublicClient({
      chain: base,
      transport: webSocket(process.env.ALCHEMY_WS_URL!),
    })

    const timeout = setTimeout(() => {
      fail('Alchemy WS: timeout (no block in 5s — chain might be fine, check URL)')
      resolve()
    }, 5000)

    // Just watch for a block to confirm WS works
    const unsub = client.watchBlocks({
      onBlock: (block) => {
        clearTimeout(timeout)
        ok(`Alchemy WS: block #${block.number} received ✓`)
        unsub()
        resolve()
      },
      onError: (err) => {
        clearTimeout(timeout)
        fail(`Alchemy WS: ${err.message}`)
        resolve()
      },
    })
  })
}

async function testChainlink() {
  info('Testing Chainlink ETH/USD price feed…')
  try {
    const { getEthUsdPrice } = await import('./utils/price')
    const client = createPublicClient({ chain: base, transport: http(process.env.ALCHEMY_HTTP_URL!) })
    const price  = await getEthUsdPrice(client, true)
    ok(`ETH/USD = $${price.toFixed(2)}`)
  } catch (err: any) {
    fail(`Chainlink: ${err.message}`)
  }
}

async function main() {
  console.log('\n=== Base DEX Screener — Connection Test ===\n')
  await testPostgres()
  await testRedis()
  await testAlchemy()
  await testChainlink()
  console.log('\n=== Done ===\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
