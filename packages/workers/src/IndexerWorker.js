"use strict";
/**
 * IndexerWorker
 *
 * 职责：
 *  1. 启动时加载数据库中所有已知 pool
 *  2. 订阅 Uniswap V3 Swap 事件 + Aerodrome Swap 事件
 *  3. 解析事件，写入 swaps 表，更新 pools.price_usd
 *  4. 实时发布价格更新到 Redis Pub/Sub（供 WebSocket 推送）
 *  5. 断连自动重连
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IndexerWorker = void 0;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const database_1 = require("@dex/database");
const shared_1 = require("@dex/shared");
const price_1 = require("./utils/price");
class IndexerWorker {
    wsClient;
    httpClient;
    pools = new Map();
    tokenDecimals = new Map();
    ethUsdPrice = 0;
    unsubscribeFns = [];
    running = false;
    constructor() {
        // HTTP 客户端用于合约读取
        this.httpClient = (0, viem_1.createPublicClient)({
            chain: chains_1.base,
            transport: (0, viem_1.http)(process.env.ALCHEMY_HTTP_URL),
        });
        this.initWsClient();
    }
    initWsClient() {
        this.wsClient = (0, viem_1.createPublicClient)({
            chain: chains_1.base,
            transport: (0, viem_1.webSocket)(process.env.ALCHEMY_WS_URL, {
                reconnect: {
                    attempts: Infinity,
                    delay: 3_000,
                },
                onOpen: () => console.log('[Indexer] WS connected'),
                onClose: () => {
                    console.warn('[Indexer] WS disconnected, reconnecting…');
                    if (this.running) {
                        setTimeout(() => this.resubscribe(), 5_000);
                    }
                },
            }),
        });
    }
    // ─── Lifecycle ──────────────────────────────────────────────
    async start() {
        this.running = true;
        console.log('[Indexer] Starting…');
        await this.loadPools();
        await this.refreshEthPrice();
        this.startEthPricePoll();
        this.subscribeToSwaps();
        console.log(`[Indexer] Watching ${this.pools.size} pools`);
    }
    stop() {
        this.running = false;
        this.unsubscribeFns.forEach((fn) => fn());
        this.unsubscribeFns = [];
        console.log('[Indexer] Stopped');
    }
    async resubscribe() {
        this.unsubscribeFns.forEach((fn) => fn());
        this.unsubscribeFns = [];
        this.initWsClient();
        await this.loadPools();
        this.subscribeToSwaps();
        console.log(`[Indexer] Resubscribed to ${this.pools.size} pools`);
    }
    // ─── Pool loading ────────────────────────────────────────────
    async loadPools() {
        const rows = await (0, database_1.query)(`SELECT p.address, p.token0, p.token1, p.dex,
              t0.decimals AS decimals0, t1.decimals AS decimals1
       FROM pools p
       JOIN tokens t0 ON t0.address = p.token0
       JOIN tokens t1 ON t1.address = p.token1`);
        this.pools.clear();
        for (const row of rows) {
            this.pools.set(row.address.toLowerCase(), {
                token0: row.token0.toLowerCase(),
                token1: row.token1.toLowerCase(),
                dex: row.dex,
                decimals0: row.decimals0,
                decimals1: row.decimals1,
            });
            this.tokenDecimals.set(row.token0.toLowerCase(), row.decimals0);
            this.tokenDecimals.set(row.token1.toLowerCase(), row.decimals1);
        }
    }
    /** 外部调用：新 pool 被发现后，重新加载并重新订阅 */
    async addPool(address) {
        await this.loadPools();
        console.log(`[Indexer] Added pool ${address}, total: ${this.pools.size}`);
    }
    // ─── ETH price ───────────────────────────────────────────────
    async refreshEthPrice() {
        this.ethUsdPrice = await (0, price_1.getEthUsdPrice)(this.httpClient, true);
        await database_1.redisPub.set(database_1.RedisKeys.ethUsdPrice, this.ethUsdPrice.toString());
        console.log(`[Indexer] ETH/USD = $${this.ethUsdPrice.toFixed(2)}`);
    }
    startEthPricePoll() {
        setInterval(() => this.refreshEthPrice(), 30_000);
    }
    // ─── Swap subscriptions ──────────────────────────────────────
    subscribeToSwaps() {
        // ── Uniswap V3 Swaps ──────────────────────────────────────
        const unsubV3 = this.wsClient.watchEvent({
            event: shared_1.UNIV3_SWAP_EVENT,
            onLogs: (logs) => {
                for (const log of logs) {
                    const meta = this.pools.get(log.address.toLowerCase());
                    if (meta?.dex === 'uniswap_v3') {
                        this.handleUniV3Swap(log, meta).catch((e) => console.error('[Indexer] V3 swap error:', e));
                    }
                }
            },
            onError: (err) => console.error('[Indexer] V3 watch error:', err.message),
        });
        // ── Aerodrome Swaps ───────────────────────────────────────
        const unsubAero = this.wsClient.watchEvent({
            event: shared_1.AERODROME_SWAP_EVENT,
            onLogs: (logs) => {
                for (const log of logs) {
                    const meta = this.pools.get(log.address.toLowerCase());
                    if (meta?.dex === 'aerodrome') {
                        this.handleAerodromeSwap(log, meta).catch((e) => console.error('[Indexer] Aero swap error:', e));
                    }
                }
            },
            onError: (err) => console.error('[Indexer] Aero watch error:', err.message),
        });
        this.unsubscribeFns.push(unsubV3, unsubAero);
    }
    // ─── Uniswap V3 swap handler ─────────────────────────────────
    async handleUniV3Swap(log, meta) {
        const { sender, recipient, amount0, amount1, sqrtPriceX96 } = log.args;
        // 计算 token0/token1 价格（token0 以 token1 计价）
        const priceToken0InToken1 = (0, price_1.sqrtPriceX96ToPrice)(sqrtPriceX96, meta.decimals0, meta.decimals1);
        // 路由到 USD
        const { token0Usd, token1Usd } = (0, price_1.routeToUsd)(meta.token0, meta.token1, priceToken0InToken1, this.ethUsdPrice);
        // 归一化数量
        const norm0 = Number(amount0) / 10 ** meta.decimals0;
        const norm1 = Number(amount1) / 10 ** meta.decimals1;
        const amountUsd = (0, price_1.calcAmountUsd)(norm0, norm1, token0Usd, token1Usd);
        // is_buy: amount0 < 0 意味着 token0 离开池子（被买入）
        const isBuy = amount0 < 0n;
        // 目标 token 的 USD 价格（非稳定币/WETH 一侧）
        const priceUsd = this.derivePriceUsd(meta.token0, meta.token1, token0Usd, token1Usd, isBuy);
        const blockTs = await this.getBlockTimestamp(log.blockNumber);
        await this.persistSwap({
            poolAddress: log.address,
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            logIndex: log.logIndex,
            timestamp: blockTs,
            sender: sender,
            recipient: recipient,
            amount0: norm0,
            amount1: norm1,
            amountUsd,
            priceUsd,
            isBuy,
        });
        await this.updatePoolPrice(log.address, priceUsd, amountUsd);
        await this.publishSwapEvent(log.address, priceUsd, amountUsd, isBuy);
    }
    // ─── Aerodrome swap handler ───────────────────────────────────
    async handleAerodromeSwap(log, meta) {
        const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = log.args;
        const priceToken0InToken1 = (0, price_1.aerodromeSwapToPrice)(amount0In, amount1In, amount0Out, amount1Out, meta.decimals0, meta.decimals1);
        const { token0Usd, token1Usd } = (0, price_1.routeToUsd)(meta.token0, meta.token1, priceToken0InToken1, this.ethUsdPrice);
        const norm0 = (Number(amount0In) - Number(amount0Out)) / 10 ** meta.decimals0;
        const norm1 = (Number(amount1In) - Number(amount1Out)) / 10 ** meta.decimals1;
        const amountUsd = (0, price_1.calcAmountUsd)(Math.abs(Number(amount0In) / 10 ** meta.decimals0), Math.abs(Number(amount1In) / 10 ** meta.decimals1), token0Usd, token1Usd);
        const isBuy = amount0Out > 0n; // token0 流出池 = 被买入
        const priceUsd = this.derivePriceUsd(meta.token0, meta.token1, token0Usd, token1Usd, isBuy);
        const blockTs = await this.getBlockTimestamp(log.blockNumber);
        await this.persistSwap({
            poolAddress: log.address,
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            logIndex: log.logIndex ?? 0,
            timestamp: blockTs,
            sender: sender,
            recipient: to,
            amount0: norm0,
            amount1: norm1,
            amountUsd,
            priceUsd,
            isBuy,
        });
        await this.updatePoolPrice(log.address, priceUsd, amountUsd);
        await this.publishSwapEvent(log.address, priceUsd, amountUsd, isBuy);
    }
    // ─── Helpers ─────────────────────────────────────────────────
    /** 决定最终上报的 USD 价格（非稳定币/WETH 一侧的 token） */
    derivePriceUsd(token0, token1, token0Usd, token1Usd, _isBuy) {
        const t0 = token0.toLowerCase();
        const t1 = token1.toLowerCase();
        // 返回"非主流资产"那一侧的价格
        if (shared_1.STABLECOINS.has(t1) || t1 === shared_1.WETH_LOWER)
            return token0Usd;
        if (shared_1.STABLECOINS.has(t0) || t0 === shared_1.WETH_LOWER)
            return token1Usd;
        // 两边都不是主流：返回 token0Usd（可能为 0）
        return token0Usd;
    }
    blockTsCache = new Map();
    async getBlockTimestamp(blockNumber) {
        if (this.blockTsCache.has(blockNumber)) {
            return this.blockTsCache.get(blockNumber);
        }
        try {
            const block = await this.httpClient.getBlock({ blockNumber });
            const ts = new Date(Number(block.timestamp) * 1000);
            // 只缓存最近 100 个区块
            if (this.blockTsCache.size > 100) {
                const oldest = this.blockTsCache.keys().next().value;
                this.blockTsCache.delete(oldest);
            }
            this.blockTsCache.set(blockNumber, ts);
            return ts;
        }
        catch {
            return new Date();
        }
    }
    async persistSwap(p) {
        await (0, database_1.insertSwap)({
            pool_address: p.poolAddress,
            block_number: p.blockNumber,
            tx_hash: p.txHash,
            log_index: p.logIndex,
            timestamp: p.timestamp,
            sender: p.sender,
            recipient: p.recipient,
            amount0: p.amount0,
            amount1: p.amount1,
            amount_usd: p.amountUsd,
            price_usd: p.priceUsd,
            is_buy: p.isBuy,
        });
        // 更新/插入 1 分钟 K 线
        await this.upsertPriceSnapshot(p.poolAddress, p.timestamp, p.priceUsd, p.amountUsd);
    }
    async upsertPriceSnapshot(poolAddress, ts, priceUsd, amountUsd) {
        // 截断到分钟
        const minuteTs = new Date(Math.floor(ts.getTime() / 60_000) * 60_000);
        await database_1.db.query(`INSERT INTO price_snapshots
         (pool_address, timestamp, open_usd, high_usd, low_usd, close_usd, volume_usd, tx_count)
       VALUES ($1, $2, $3, $3, $3, $3, $4, 1)
       ON CONFLICT (pool_address, timestamp) DO UPDATE SET
         high_usd   = GREATEST(price_snapshots.high_usd,  $3),
         low_usd    = LEAST   (price_snapshots.low_usd,   $3),
         close_usd  = $3,
         volume_usd = price_snapshots.volume_usd + $4,
         tx_count   = price_snapshots.tx_count   + 1`, [poolAddress.toLowerCase(), minuteTs, priceUsd, amountUsd]);
    }
    async updatePoolPrice(poolAddress, priceUsd, _amountUsd) {
        if (priceUsd <= 0)
            return;
        await database_1.db.query(`UPDATE pools SET price_usd = $1, updated_at = NOW() WHERE address = $2`, [priceUsd, poolAddress.toLowerCase()]);
        await database_1.redisPub.set(database_1.RedisKeys.tokenPrice(poolAddress.toLowerCase()), priceUsd.toString(), 'EX', 300);
    }
    async publishSwapEvent(poolAddress, priceUsd, amountUsd, isBuy) {
        await database_1.redisPub.publish('swap_events', JSON.stringify({
            pool: poolAddress.toLowerCase(),
            price: priceUsd,
            amount: amountUsd,
            isBuy,
            ts: Date.now(),
        }));
    }
}
exports.IndexerWorker = IndexerWorker;
