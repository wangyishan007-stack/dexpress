/**
 * Workers Entry Point
 *
 * 启动顺序：
 *  1. PairDiscoveryWorker — 发现并追溯历史 pool
 *  2. IndexerWorker       — 实时监听 swap 事件
 *  3. AggregatorWorker    — 定时聚合指标
 */

import dotenv from 'dotenv'
import path   from 'path'

// __dirname 在 CommonJS 中可直接使用
// workers/src → workers → packages → project root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') })

import { IndexerWorker }       from './IndexerWorker'
import { AggregatorWorker }    from './AggregatorWorker'
import { PairDiscoveryWorker } from './PairDiscoveryWorker'

async function main() {
  console.log('[Workers] Starting Base DEX Screener workers…')
  console.log('[Workers] DATABASE_URL:', process.env.DATABASE_URL ? '✓ set' : '✗ missing')
  console.log('[Workers] ALCHEMY_WS_URL:', process.env.ALCHEMY_WS_URL ? '✓ set' : '✗ missing')

  const indexer    = new IndexerWorker()
  const aggregator = new AggregatorWorker()
  const discovery  = new PairDiscoveryWorker({
    onNewPool: (address) => indexer.addPool(address),
  })

  const shutdown = (signal: string) => {
    console.log(`\n[Workers] ${signal} — shutting down`)
    indexer.stop()
    aggregator.stop()
    discovery.stop()
    process.exit(0)
  }

  process.on('SIGINT',  () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  process.on('uncaughtException',  (err)    => console.error('[Workers] Uncaught exception:', err))
  process.on('unhandledRejection', (reason) => console.error('[Workers] Unhandled rejection:', reason))

  // 启动顺序：先发现 pools → 再订阅 swaps → 再聚合
  await discovery.start()
  await indexer.start()
  aggregator.start()

  console.log('[Workers] All workers running ✓')
}

main().catch((err) => {
  console.error('[Workers] Fatal error:', err)
  process.exit(1)
})
