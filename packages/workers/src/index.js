"use strict";
/**
 * Workers Entry Point
 *
 * 启动顺序：
 *  1. PairDiscoveryWorker — 后台发现 pool（不阻塞后续启动）
 *  2. IndexerWorker       — 实时监听 swap 事件（await ready）
 *  3. AggregatorWorker    — 定时聚合指标（Indexer ready 后启动）
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// __dirname 在 CommonJS 中可直接使用
// workers/src → workers → packages → project root
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '..', '..', '..', '.env') });
const IndexerWorker_1 = require("./IndexerWorker");
const AggregatorWorker_1 = require("./AggregatorWorker");
const PairDiscoveryWorker_1 = require("./PairDiscoveryWorker");
async function main() {
    console.log('[Workers] Starting Base DEX Screener workers…');
    console.log('[Workers] DATABASE_URL:', process.env.DATABASE_URL ? '✓ set' : '✗ missing');
    console.log('[Workers] ALCHEMY_WS_URL:', process.env.ALCHEMY_WS_URL ? '✓ set' : '✗ missing');
    const indexer = new IndexerWorker_1.IndexerWorker();
    const aggregator = new AggregatorWorker_1.AggregatorWorker();
    const discovery = new PairDiscoveryWorker_1.PairDiscoveryWorker({
        onNewPool: (address) => indexer.addPool(address),
    });
    const shutdown = (signal) => {
        console.log(`\n[Workers] ${signal} — shutting down`);
        indexer.stop();
        aggregator.stop();
        discovery.stop();
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('uncaughtException', (err) => console.error('[Workers] Uncaught exception:', err));
    process.on('unhandledRejection', (reason) => console.error('[Workers] Unhandled rejection:', reason));
    // 1. Discovery: 后台运行（bootstrap + catchup + subscribe），不阻塞
    discovery.start().catch((e) => console.error('[Workers] Discovery error:', e));
    // 2. Indexer: await 直到 pools 加载完毕、swap 监听就绪
    await indexer.start();
    // 3. Aggregator: Indexer ready 后启动
    aggregator.start();
    console.log('[Workers] All workers running ✓');
}
main().catch((err) => {
    console.error('[Workers] Fatal error:', err);
    process.exit(1);
});
