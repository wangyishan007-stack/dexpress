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

import {
  createPublicClient,
  webSocket,
  http,
  type PublicClient,
  type Log,
} from 'viem'
import { base, bsc } from 'viem/chains'
import {
  db,
  redis,
  redisPub,
  insertSwap,
  RedisKeys,
  query,
} from '@dex/database'
import {
  UNIV3_SWAP_EVENT,
  AERODROME_SWAP_EVENT,
  UNIV4_SWAP_EVENT,
  PANCAKE_V3_SWAP_EVENT,
  PANCAKE_V2_SWAP_EVENT,
  BSC_ADDRESSES,
  ERC20_ABI,
  ADDRESSES,
  STABLECOINS,
  WETH_LOWER,
  BSC_STABLECOINS,
  WBNB_LOWER,
  type UniV3SwapEvent,
  type AerodromeSwapEvent,
  type UniV4SwapEvent,
} from '@dex/shared'
import {
  sqrtPriceX96ToPrice,
  aerodromeSwapToPrice,
  routeToUsd,
  routeToUsdBsc,
  calcAmountUsd,
  getEthUsdPrice,
  getBnbUsdPrice,
} from './utils/price'

interface PoolMeta {
  token0:    string
  token1:    string
  dex:       string
  decimals0: number
  decimals1: number
}

export class IndexerWorker {
  private wsClient!: PublicClient
  private bscWsClient?: PublicClient
  private httpClient: PublicClient
  private bscHttpClient?: PublicClient
  private pools: Map<string, PoolMeta> = new Map()
  private tokenDecimals: Map<string, number> = new Map()
  private ethUsdPrice = 0
  private bnbUsdPrice = 0
  private unsubscribeFns: (() => void)[] = []
  private bscUnsubscribeFns: (() => void)[] = []
  private running = false

  constructor() {
    // HTTP 客户端用于合约读取
    this.httpClient = createPublicClient({
      chain: base,
      transport: http(process.env.ALCHEMY_HTTP_URL!),
    })
    this.initWsClient()
    this.initBscWsClient()
    this.initBscHttpClient()
  }


  private initWsClient() {
    this.wsClient = createPublicClient({
      chain: base,
      transport: webSocket(process.env.ALCHEMY_WS_URL!, {
        reconnect: {
          attempts: Infinity,
          delay: 3_000,
        },
        onOpen:  () => console.log('[Indexer] WS connected'),
        onClose: () => {
          console.warn('[Indexer] WS disconnected, reconnecting…')
          if (this.running) {
            setTimeout(() => this.resubscribe(), 5_000)
          }
        },
      }),
    })
  }

  private initBscWsClient() {
    const bscWsUrl = process.env.BSC_WS_URL
    if (!bscWsUrl) return
    this.bscWsClient = createPublicClient({
      chain: bsc,
      transport: webSocket(bscWsUrl, {
        reconnect: { attempts: Infinity, delay: 3_000 },
        onOpen:  () => console.log('[Indexer] BSC WS connected'),
        onClose: () => {
          console.warn('[Indexer] BSC WS disconnected, reconnecting…')
          if (this.running) setTimeout(() => this.subscribeToBscSwaps(), 5_000)
        },
      }),
    })
  }

  private initBscHttpClient() {
    const bscHttpUrl = process.env.BSC_HTTP_URL || process.env.BSC_WS_URL?.replace('wss://', 'https://').replace('ws://', 'http://')
    if (!bscHttpUrl) return
    this.bscHttpClient = createPublicClient({
      chain: bsc,
      transport: http(bscHttpUrl),
    })
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  async start() {
    this.running = true
    console.log('[Indexer] Starting…')

    await this.loadPools()
    await this.refreshEthPrice()
    await this.refreshBnbPrice()
    this.startPricePoll()
    this.subscribeToSwaps()
    this.subscribeToBscSwaps()

    console.log(`[Indexer] Watching ${this.pools.size} pools`)
  }

  stop() {
    this.running = false
    this.unsubscribeFns.forEach((fn) => fn())
    this.unsubscribeFns = []
    this.bscUnsubscribeFns.forEach((fn) => fn())
    this.bscUnsubscribeFns = []
    console.log('[Indexer] Stopped')
  }

  private async resubscribe() {
    this.unsubscribeFns.forEach((fn) => fn())
    this.unsubscribeFns = []
    this.bscUnsubscribeFns.forEach((fn) => fn())
    this.bscUnsubscribeFns = []
    this.initWsClient()
    await this.loadPools()
    this.subscribeToSwaps()
    console.log(`[Indexer] Resubscribed to ${this.pools.size} pools`)
  }

  // ─── Pool loading ────────────────────────────────────────────

  async loadPools() {
    const rows = await query<{
      address: string; token0: string; token1: string
      dex: string; decimals0: number; decimals1: number
    }>(
      `SELECT p.address, p.token0, p.token1, p.dex,
              t0.decimals AS decimals0, t1.decimals AS decimals1
       FROM pools p
       JOIN tokens t0 ON t0.address = p.token0
       JOIN tokens t1 ON t1.address = p.token1`
    )

    this.pools.clear()
    for (const row of rows) {
      this.pools.set(row.address.toLowerCase(), {
        token0:    row.token0.toLowerCase(),
        token1:    row.token1.toLowerCase(),
        dex:       row.dex,
        decimals0: row.decimals0,
        decimals1: row.decimals1,
      })
      this.tokenDecimals.set(row.token0.toLowerCase(), row.decimals0)
      this.tokenDecimals.set(row.token1.toLowerCase(), row.decimals1)
    }
  }

  /** 外部调用：新 pool 被发现后，重新加载并重新订阅 */
  async addPool(address: string) {
    await this.loadPools()
    console.log(`[Indexer] Added pool ${address}, total: ${this.pools.size}`)
  }

  // ─── ETH price ───────────────────────────────────────────────

  private async refreshEthPrice() {
    this.ethUsdPrice = await getEthUsdPrice(this.httpClient, true)
    await redisPub.set(RedisKeys.ethUsdPrice, this.ethUsdPrice.toString())
    console.log(`[Indexer] ETH/USD = $${this.ethUsdPrice.toFixed(2)}`)
  }

  private async refreshBnbPrice() {
    if (!this.bscHttpClient) return
    this.bnbUsdPrice = await getBnbUsdPrice(this.bscHttpClient, true)
    console.log(`[Indexer] BNB/USD = $${this.bnbUsdPrice.toFixed(2)}`)
  }

  private startPricePoll() {
    setInterval(() => {
      this.refreshEthPrice()
      this.refreshBnbPrice()
    }, 30_000)
  }

  // ─── Swap subscriptions ──────────────────────────────────────

  private subscribeToSwaps() {
    // ── Uniswap V3 Swaps ──────────────────────────────────────
    const unsubV3 = this.wsClient.watchEvent({
      event: UNIV3_SWAP_EVENT as any,
      onLogs: (logs) => {
        for (const log of logs) {
          const meta = this.pools.get((log.address as string).toLowerCase())
          if (meta?.dex === 'uniswap_v3') {
            this.handleUniV3Swap(log as unknown as UniV3SwapEvent, meta).catch(
              (e) => console.error('[Indexer] V3 swap error:', e)
            )
          }
        }
      },
      onError: (err) => console.error('[Indexer] V3 watch error:', err.message),
    })

    // ── Aerodrome Swaps ───────────────────────────────────────
    const unsubAero = this.wsClient.watchEvent({
      event: AERODROME_SWAP_EVENT as any,
      onLogs: (logs) => {
        for (const log of logs) {
          const meta = this.pools.get((log.address as string).toLowerCase())
          if (meta?.dex === 'aerodrome') {
            this.handleAerodromeSwap(log as unknown as AerodromeSwapEvent, meta).catch(
              (e) => console.error('[Indexer] Aero swap error:', e)
            )
          }
        }
      },
      onError: (err) => console.error('[Indexer] Aero watch error:', err.message),
    })

    // ── Uniswap V4 Swaps (PoolManager) ──────────────────────
    const unsubV4 = this.wsClient.watchEvent({
      address: ADDRESSES.UNISWAP_V4_POOL_MANAGER as `0x${string}`,
      event: UNIV4_SWAP_EVENT as any,
      onLogs: (logs) => {
        for (const log of logs) {
          this.handleUniV4Swap(log as unknown as UniV4SwapEvent).catch(
            (e) => console.error('[Indexer] V4 swap error:', e)
          )
        }
      },
      onError: (err) => console.error('[Indexer] V4 watch error:', err.message),
    })

    this.unsubscribeFns.push(unsubV3, unsubAero, unsubV4)
  }

  // ─── Uniswap V3 swap handler ─────────────────────────────────

  private async handleUniV3Swap(log: UniV3SwapEvent, meta: PoolMeta) {
    const { sender, recipient, amount0, amount1, sqrtPriceX96 } = log.args

    // 计算 token0/token1 价格（token0 以 token1 计价）
    const priceToken0InToken1 = sqrtPriceX96ToPrice(
      sqrtPriceX96, meta.decimals0, meta.decimals1
    )

    // 路由到 USD
    const { token0Usd, token1Usd } = routeToUsd(
      meta.token0, meta.token1, priceToken0InToken1, this.ethUsdPrice
    )

    // 归一化数量
    const norm0 = Number(amount0) / 10 ** meta.decimals0
    const norm1 = Number(amount1) / 10 ** meta.decimals1
    const amountUsd = calcAmountUsd(norm0, norm1, token0Usd, token1Usd)

    // is_buy: amount0 < 0 意味着 token0 离开池子（被买入）
    const isBuy = amount0 < 0n

    // 目标 token 的 USD 价格（非稳定币/WETH 一侧）
    const priceUsd = this.derivePriceUsd(
      meta.token0, meta.token1, token0Usd, token1Usd, isBuy
    )

    const blockTs = await this.getBlockTimestamp(log.blockNumber)

    await this.persistSwap({
      poolAddress: log.address,
      blockNumber: log.blockNumber,
      txHash:      log.transactionHash,
      logIndex:    log.logIndex,
      timestamp:   blockTs,
      sender:      sender,
      recipient:   recipient,
      amount0:     norm0,
      amount1:     norm1,
      amountUsd,
      priceUsd,
      isBuy,
    })

    await this.updatePoolPrice(log.address, priceUsd, amountUsd)
    await this.publishSwapEvent(log.address, priceUsd, amountUsd, isBuy)
  }

  // ─── Aerodrome swap handler ───────────────────────────────────

  private async handleAerodromeSwap(log: AerodromeSwapEvent, meta: PoolMeta) {
    const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = log.args

    const priceToken0InToken1 = aerodromeSwapToPrice(
      amount0In, amount1In, amount0Out, amount1Out,
      meta.decimals0, meta.decimals1
    )

    const { token0Usd, token1Usd } = routeToUsd(
      meta.token0, meta.token1, priceToken0InToken1, this.ethUsdPrice
    )

    const norm0 = (Number(amount0In) - Number(amount0Out)) / 10 ** meta.decimals0
    const norm1 = (Number(amount1In) - Number(amount1Out)) / 10 ** meta.decimals1
    const amountUsd = calcAmountUsd(
      Math.abs(Number(amount0In) / 10 ** meta.decimals0),
      Math.abs(Number(amount1In) / 10 ** meta.decimals1),
      token0Usd, token1Usd
    )

    const isBuy = amount0Out > 0n  // token0 流出池 = 被买入
    const priceUsd = this.derivePriceUsd(
      meta.token0, meta.token1, token0Usd, token1Usd, isBuy
    )

    const blockTs = await this.getBlockTimestamp(log.blockNumber)

    await this.persistSwap({
      poolAddress: log.address,
      blockNumber: log.blockNumber,
      txHash:      log.transactionHash,
      logIndex:    log.logIndex ?? 0,
      timestamp:   blockTs,
      sender:      sender,
      recipient:   to,
      amount0:     norm0,
      amount1:     norm1,
      amountUsd,
      priceUsd,
      isBuy,
    })

    await this.updatePoolPrice(log.address, priceUsd, amountUsd)
    await this.publishSwapEvent(log.address, priceUsd, amountUsd, isBuy)
  }


  // ─── Uniswap V4 swap handler ─────────────────────────────────
  // V4 emits from PoolManager; pool is identified by `id` (bytes32 hash of pool key)
  // We look up the pool by matching id → pool address in our registry
  private async handleUniV4Swap(log: UniV4SwapEvent) {
    const { id, sender, amount0, amount1, sqrtPriceX96 } = log.args

    // V4 pools are stored with their computed id as address (prefixed with v4:)
    const poolKey = `v4:${id.toLowerCase()}`
    const meta = this.pools.get(poolKey)
    if (!meta) return // pool not tracked yet

    const priceToken0InToken1 = sqrtPriceX96ToPrice(sqrtPriceX96, meta.decimals0, meta.decimals1)
    const { token0Usd, token1Usd } = routeToUsd(
      meta.token0, meta.token1, priceToken0InToken1, this.ethUsdPrice
    )

    const norm0 = Number(amount0) / Math.pow(10, meta.decimals0)
    const norm1 = Number(amount1) / Math.pow(10, meta.decimals1)

    const isBuy = amount0 < 0n // negative = token0 out of pool → user bought token0
    const amountUsd = calcAmountUsd(norm0, norm1, token0Usd, token1Usd)
    const priceUsd = this.derivePriceUsd(meta.token0, meta.token1, token0Usd, token1Usd, isBuy)

    const blockTs = await this.getBlockTimestamp(log.blockNumber)
    if (!blockTs) return

    await insertSwap({
      pool_address: poolKey,
      block_number: Number(log.blockNumber),
      tx_hash:      log.transactionHash,
      log_index:    log.logIndex ?? 0,
      timestamp:    blockTs,
      sender:       sender,
      recipient:    sender,
      amount0:      norm0,
      amount1:      norm1,
      amount_usd:   amountUsd,
      price_usd:    priceUsd,
      is_buy:       isBuy,
    })

    await this.updatePoolPrice(poolKey, priceUsd, amountUsd)
    await this.publishSwapEvent(poolKey, priceUsd, amountUsd, isBuy)
  }


  // ─── BSC PancakeSwap V3 subscriptions ───────────────────────
  private subscribeToBscSwaps() {
    if (!this.bscWsClient) {
      console.log('[Indexer] BSC_WS_URL not set, skipping BSC indexing')
      return
    }

    const unsubBsc = this.bscWsClient.watchEvent({
      event: PANCAKE_V3_SWAP_EVENT as any,
      onLogs: (logs) => {
        for (const log of logs) {
          const meta = this.pools.get((log.address as string).toLowerCase())
          if (meta?.dex === 'pancakeswap_v3') {
            this.handleBscSwap(log as unknown as UniV3SwapEvent, meta).catch(
              (e) => console.error('[Indexer] BSC swap error:', e)
            )
          }
        }
      },
      onError: (err) => console.error('[Indexer] BSC watch error:', err.message),
    })

    // ── PancakeSwap V2 Swaps ────────────────────────────────
    const unsubBscV2 = this.bscWsClient.watchEvent({
      event: PANCAKE_V2_SWAP_EVENT as any,
      onLogs: (logs) => {
        for (const log of logs) {
          const meta = this.pools.get((log.address as string).toLowerCase())
          if (meta?.dex === 'pancakeswap_v2') {
            this.handleBscV2Swap(log as unknown as AerodromeSwapEvent, meta).catch(
              (e) => console.error('[Indexer] BSC V2 swap error:', e)
            )
          }
        }
      },
      onError: (err) => console.error('[Indexer] BSC V2 watch error:', err.message),
    })

    this.bscUnsubscribeFns.push(unsubBsc, unsubBscV2)
    console.log('[Indexer] BSC PancakeSwap V2 + V3 subscribed')
  }

  private async handleBscSwap(log: UniV3SwapEvent, meta: PoolMeta) {
    const { sender, recipient, amount0, amount1, sqrtPriceX96 } = log.args

    const priceToken0InToken1 = sqrtPriceX96ToPrice(sqrtPriceX96, meta.decimals0, meta.decimals1)
    const { token0Usd, token1Usd } = routeToUsdBsc(
      meta.token0, meta.token1, priceToken0InToken1, this.bnbUsdPrice
    )

    const norm0 = Number(amount0) / Math.pow(10, meta.decimals0)
    const norm1 = Number(amount1) / Math.pow(10, meta.decimals1)
    const isBuy = amount0 < 0n
    const amountUsd = calcAmountUsd(norm0, norm1, token0Usd, token1Usd)
    const priceUsd = this.derivePriceUsdBsc(meta.token0, meta.token1, token0Usd, token1Usd)

    const blockTs = await this.getBlockTimestamp(log.blockNumber, 'bsc')
    if (!blockTs) return

    await insertSwap({
      pool_address: log.address,
      block_number: Number(log.blockNumber),
      tx_hash:      log.transactionHash,
      log_index:    log.logIndex ?? 0,
      timestamp:    blockTs,
      sender:       sender,
      recipient:    recipient,
      amount0:      norm0,
      amount1:      norm1,
      amount_usd:   amountUsd,
      price_usd:    priceUsd,
      is_buy:       isBuy,
    })

    await this.updatePoolPrice(log.address, priceUsd, amountUsd)
    await this.publishSwapEvent(log.address, priceUsd, amountUsd, isBuy)
  }

  private async handleBscV2Swap(log: AerodromeSwapEvent, meta: PoolMeta) {
    const { sender, to, amount0In, amount1In, amount0Out, amount1Out } = log.args

    const priceToken0InToken1 = aerodromeSwapToPrice(
      amount0In, amount1In, amount0Out, amount1Out,
      meta.decimals0, meta.decimals1
    )
    const { token0Usd, token1Usd } = routeToUsdBsc(
      meta.token0, meta.token1, priceToken0InToken1, this.bnbUsdPrice
    )

    const norm0In  = Number(amount0In)  / Math.pow(10, meta.decimals0)
    const norm1In  = Number(amount1In)  / Math.pow(10, meta.decimals1)
    const norm0Out = Number(amount0Out) / Math.pow(10, meta.decimals0)
    const norm1Out = Number(amount1Out) / Math.pow(10, meta.decimals1)

    const isBuy = norm1In > 0 // token1 in → buying token0
    const norm0 = isBuy ? norm0Out : -norm0In
    const norm1 = isBuy ? -norm1In : norm1Out
    const amountUsd = calcAmountUsd(
      Math.abs(norm0In > 0 ? norm0In : norm0Out),
      Math.abs(norm1In > 0 ? norm1In : norm1Out),
      token0Usd, token1Usd
    )
    const priceUsd = this.derivePriceUsdBsc(meta.token0, meta.token1, token0Usd, token1Usd)

    const blockTs = await this.getBlockTimestamp(log.blockNumber, 'bsc')
    if (!blockTs) return

    await insertSwap({
      pool_address: log.address,
      block_number: Number(log.blockNumber),
      tx_hash:      log.transactionHash,
      log_index:    log.logIndex ?? 0,
      timestamp:    blockTs,
      sender:       sender,
      recipient:    to,
      amount0:      norm0,
      amount1:      norm1,
      amount_usd:   amountUsd,
      price_usd:    priceUsd,
      is_buy:       isBuy,
    })

    await this.updatePoolPrice(log.address, priceUsd, amountUsd)
    await this.publishSwapEvent(log.address, priceUsd, amountUsd, isBuy)
  }

  // ─── Helpers ─────────────────────────────────────────────────

  /** 决定最终上报的 USD 价格（非稳定币/WETH 一侧的 token） */
  private derivePriceUsd(
    token0: string, token1: string,
    token0Usd: number, token1Usd: number,
    _isBuy: boolean
  ): number {
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    // 返回"非主流资产"那一侧的价格
    if (STABLECOINS.has(t1) || t1 === WETH_LOWER) return token0Usd
    if (STABLECOINS.has(t0) || t0 === WETH_LOWER) return token1Usd
    // 两边都不是主流：返回 token0Usd（可能为 0）
    return token0Usd
  }

  /** BSC 版本：用 BSC 稳定币 + WBNB 判断 */
  private derivePriceUsdBsc(
    token0: string, token1: string,
    token0Usd: number, token1Usd: number,
  ): number {
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    if (BSC_STABLECOINS.has(t1) || t1 === WBNB_LOWER) return token0Usd
    if (BSC_STABLECOINS.has(t0) || t0 === WBNB_LOWER) return token1Usd
    return token0Usd
  }

  private blockTsCache = new Map<string, Date>()

  private async getBlockTimestamp(blockNumber: bigint, chain: 'base' | 'bsc' = 'base'): Promise<Date> {
    const cacheKey = `${chain}:${blockNumber}`
    if (this.blockTsCache.has(cacheKey)) {
      return this.blockTsCache.get(cacheKey)!
    }
    try {
      const client = chain === 'bsc' && this.bscHttpClient ? this.bscHttpClient : this.httpClient
      const block = await client.getBlock({ blockNumber })
      const ts = new Date(Number(block.timestamp) * 1000)
      // 只缓存最近 200 个区块
      if (this.blockTsCache.size > 200) {
        const oldest = this.blockTsCache.keys().next().value
        if (oldest) this.blockTsCache.delete(oldest)
      }
      this.blockTsCache.set(cacheKey, ts)
      return ts
    } catch {
      return new Date()
    }
  }

  private async persistSwap(p: {
    poolAddress: string; blockNumber: bigint; txHash: string; logIndex: number
    timestamp: Date; sender?: string; recipient?: string
    amount0: number; amount1: number; amountUsd: number; priceUsd: number
    isBuy: boolean
  }) {
    await insertSwap({
      pool_address: p.poolAddress,
      block_number: p.blockNumber,
      tx_hash:      p.txHash,
      log_index:    p.logIndex,
      timestamp:    p.timestamp,
      sender:       p.sender,
      recipient:    p.recipient,
      amount0:      p.amount0,
      amount1:      p.amount1,
      amount_usd:   p.amountUsd,
      price_usd:    p.priceUsd,
      is_buy:       p.isBuy,
    })

    // 更新/插入 1 分钟 K 线
    await this.upsertPriceSnapshot(p.poolAddress, p.timestamp, p.priceUsd, p.amountUsd)
  }

  private async upsertPriceSnapshot(
    poolAddress: string, ts: Date, priceUsd: number, amountUsd: number
  ) {
    // 截断到分钟
    const minuteTs = new Date(Math.floor(ts.getTime() / 60_000) * 60_000)
    await db.query(
      `INSERT INTO price_snapshots
         (pool_address, timestamp, open_usd, high_usd, low_usd, close_usd, volume_usd, tx_count)
       VALUES ($1, $2, $3, $3, $3, $3, $4, 1)
       ON CONFLICT (pool_address, timestamp) DO UPDATE SET
         high_usd   = GREATEST(price_snapshots.high_usd,  $3),
         low_usd    = LEAST   (price_snapshots.low_usd,   $3),
         close_usd  = $3,
         volume_usd = price_snapshots.volume_usd + $4,
         tx_count   = price_snapshots.tx_count   + 1`,
      [poolAddress.toLowerCase(), minuteTs, priceUsd, amountUsd]
    )
  }

  private async updatePoolPrice(poolAddress: string, priceUsd: number, _amountUsd: number) {
    if (priceUsd <= 0) return
    await db.query(
      `UPDATE pools SET price_usd = $1, updated_at = NOW() WHERE address = $2`,
      [priceUsd, poolAddress.toLowerCase()]
    )
    await redisPub.set(
      RedisKeys.tokenPrice(poolAddress.toLowerCase()),
      priceUsd.toString(),
      'EX', 300
    )
  }

  private async publishSwapEvent(
    poolAddress: string, priceUsd: number, amountUsd: number, isBuy: boolean
  ) {
    await redisPub.publish(
      'swap_events',
      JSON.stringify({
        pool:    poolAddress.toLowerCase(),
        price:   priceUsd,
        amount:  amountUsd,
        isBuy,
        ts:      Date.now(),
      })
    )
  }
}
