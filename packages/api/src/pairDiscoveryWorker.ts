/**
 * PairDiscoveryWorker
 *
 * 职责：
 *  1. bootstrap() — 通过 Factory.getPool 快速注入高活跃度的已知 pairs
 *  2. catchUpHistorical() — 追溯近 2000 块内的新 PoolCreated 事件
 *  3. 实时订阅 PoolCreated / PairCreated
 */

import {
  createPublicClient,
  webSocket,
  http,
  getAddress,
  type PublicClient,
} from 'viem'
import { base } from 'viem/chains'
import { upsertToken, upsertPool, db, query } from '@dex/database'
import {
  ADDRESSES,
  UNIV3_POOL_CREATED_EVENT,
  AERODROME_PAIR_CREATED_EVENT,
  ERC20_ABI,
  type PoolCreatedEvent,
} from '@dex/shared'

// Uniswap V3 Factory getPool ABI
const FACTORY_ABI = [
  {
    type: 'function',
    name: 'getPool',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee',    type: 'uint24'  },
    ],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
] as const

// 已知高活跃度 pairs（WETH + USDC + USDT 的各个 fee tier）
const BOOTSTRAP_PAIRS = [
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.USDC, fee: 500  },
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.USDC, fee: 3000 },
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.USDC, fee: 100  },
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.USDT, fee: 500  },
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.USDT, fee: 3000 },
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.DAI,  fee: 500  },
  { tokenA: ADDRESSES.USDC, tokenB: ADDRESSES.USDT, fee: 100  },
]

export class PairDiscoveryWorker {
  private wsClient!:    PublicClient
  private httpClient:   PublicClient
  private onNewPool?:  (address: string) => void
  private unsubscribeFns: (() => void)[] = []

  constructor(options: { onNewPool?: (address: string) => void } = {}) {
    this.onNewPool   = options.onNewPool
    this.httpClient  = createPublicClient({
      chain: base,
      transport: http(process.env.ALCHEMY_HTTP_URL!),
    })
    this.initWsClient()
  }

  private initWsClient() {
    this.wsClient = createPublicClient({
      chain: base,
      transport: webSocket(process.env.ALCHEMY_WS_URL!, {
        reconnect: { attempts: Infinity, delay: 3_000 },
      }),
    })
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  async start() {
    console.log('[Discovery] Starting…')

    // 0. 预加载 1inch token list（用于 Logo）
    await this.loadTokenList()

    // 1. 快速注入已知高活跃 pairs
    await this.bootstrapKnownPairs()

    // 2. 追溯近 2000 块
    await this.catchUpHistorical()

    // 3. 实时订阅
    this.subscribeToFactories()
    console.log('[Discovery] Listening for new pools…')

    // 4. 后台 backfill：为已有但缺少 Logo 的 token 填充图标
    this.backfillLogos().catch((e) => console.warn('[Discovery] Logo backfill error:', e))
  }

  stop() {
    this.unsubscribeFns.forEach((fn) => fn())
    this.unsubscribeFns = []
  }

  // ─── Bootstrap ───────────────────────────────────────────────

  private async bootstrapKnownPairs() {
    console.log('[Discovery] Bootstrapping known high-volume pairs…')

    // 先确保 WETH/USDC/USDT/DAI token 记录存在
    const baseTokens = [
      { address: ADDRESSES.WETH, symbol: 'WETH',  name: 'Wrapped Ether',  decimals: 18 },
      { address: ADDRESSES.USDC, symbol: 'USDC',  name: 'USD Coin',       decimals: 6  },
      { address: ADDRESSES.USDT, symbol: 'USDT',  name: 'Tether USD',     decimals: 6  },
      { address: ADDRESSES.DAI,  symbol: 'DAI',   name: 'Dai Stablecoin', decimals: 18 },
    ]

    for (const t of baseTokens) {
      await upsertToken({ ...t, total_supply: 0n }).catch(() => {})
    }

    // 查询每个 pair 的 pool 地址
    const results = await Promise.allSettled(
      BOOTSTRAP_PAIRS.map(async ({ tokenA, tokenB, fee }) => {
        const poolAddr = await this.httpClient.readContract({
          address:      ADDRESSES.UNISWAP_V3_FACTORY as `0x${string}`,
          abi:          FACTORY_ABI,
          functionName: 'getPool',
          args:         [tokenA as `0x${string}`, tokenB as `0x${string}`, fee],
        }) as string

        if (!poolAddr || poolAddr === '0x0000000000000000000000000000000000000000') return

        const addr = poolAddr.toLowerCase()
        // token0/token1 在 V3 中 address 排序小的在前
        const [tok0, tok1] = tokenA.toLowerCase() < tokenB.toLowerCase()
          ? [tokenA.toLowerCase(), tokenB.toLowerCase()]
          : [tokenB.toLowerCase(), tokenA.toLowerCase()]

        await upsertPool({ address: addr, token0: tok0, token1: tok1, dex: 'uniswap_v3', fee_tier: fee })
        this.onNewPool?.(addr)
        console.log(`[Discovery] Bootstrap pool: ${addr} fee=${fee}`)
      })
    )

    const ok  = results.filter((r) => r.status === 'fulfilled').length
    const err = results.filter((r) => r.status === 'rejected').length
    console.log(`[Discovery] Bootstrap done: ${ok} OK, ${err} failed`)
  }

  // ─── Subscriptions ───────────────────────────────────────────

  private subscribeToFactories() {
    const unsubV3 = this.wsClient.watchEvent({
      address: ADDRESSES.UNISWAP_V3_FACTORY as `0x${string}`,
      event:   UNIV3_POOL_CREATED_EVENT as any,
      onLogs:  (logs) => {
        for (const log of logs) {
          this.handleUniV3PoolCreated(log as unknown as PoolCreatedEvent)
            .catch((e) => console.error('[Discovery] V3 pool error:', e))
        }
      },
      onError: (err) => console.error('[Discovery] V3 watch error:', err),
    })

    const unsubAero = this.wsClient.watchEvent({
      address: ADDRESSES.AERODROME_FACTORY as `0x${string}`,
      event:   AERODROME_PAIR_CREATED_EVENT as any,
      onLogs:  (logs) => {
        for (const log of logs) {
          this.handleAerodromePairCreated(log as unknown as PoolCreatedEvent)
            .catch((e) => console.error('[Discovery] Aero pool error:', e))
        }
      },
      onError: (err) => console.error('[Discovery] Aero watch error:', err),
    })

    this.unsubscribeFns.push(unsubV3, unsubAero)
  }

  // ─── Pool created handlers ───────────────────────────────────

  private async handleUniV3PoolCreated(log: PoolCreatedEvent) {
    const { token0, token1, fee, tickSpacing, pool } = log.args
    if (!pool) return

    const poolAddr = pool.toLowerCase()
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    console.log(`[Discovery] New V3 pool: ${poolAddr} (${t0.slice(0,10)}/${t1.slice(0,10)} fee=${fee})`)

    await Promise.all([
      this.fetchAndSaveToken(t0),
      this.fetchAndSaveToken(t1),
    ])

    await upsertPool({ address: poolAddr, token0: t0, token1: t1, dex: 'uniswap_v3', fee_tier: fee, tick_spacing: tickSpacing })
    await this.saveLastBlock('last_block_pool_created', log.blockNumber)
    this.onNewPool?.(poolAddr)
  }

  private async handleAerodromePairCreated(log: PoolCreatedEvent) {
    const { token0, token1, pair } = log.args
    if (!pair) return

    const pairAddr = pair.toLowerCase()
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    console.log(`[Discovery] New Aero pair: ${pairAddr} (${t0.slice(0,10)}/${t1.slice(0,10)})`)

    await Promise.all([
      this.fetchAndSaveToken(t0),
      this.fetchAndSaveToken(t1),
    ])

    await upsertPool({ address: pairAddr, token0: t0, token1: t1, dex: 'aerodrome' })
    await this.saveLastBlock('last_block_pool_created', log.blockNumber)
    this.onNewPool?.(pairAddr)
  }

  // ─── Token Logo（1inch token list + Trust Wallet fallback）───

  // address(小写) → logoURI
  private logoCache = new Map<string, string>()

  /** 启动时从 1inch 拉取 Base chain 的 token list，缓存到内存 */
  private async loadTokenList(): Promise<void> {
    try {
      const res = await fetch('https://tokens.1inch.io/v1.2/8453', {
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        console.warn(`[Discovery] 1inch token list HTTP ${res.status}`)
        return
      }
      const data = await res.json() as Record<string, { logoURI?: string }>
      for (const [addr, info] of Object.entries(data)) {
        if (info.logoURI) this.logoCache.set(addr.toLowerCase(), info.logoURI)
      }
      console.log(`[Discovery] Loaded ${this.logoCache.size} token logos from 1inch`)
    } catch (err) {
      console.warn('[Discovery] Failed to load 1inch token list:', err)
    }
  }

  /**
   * 获取 token 的 logo URL：
   * 1. 先查 1inch cache
   * 2. 退回 Trust Wallet GitHub assets（URL 规则固定，前端 <img onError> 会处理 404）
   */
  private getLogoUrl(address: string): string | null {
    const lower = address.toLowerCase()
    if (this.logoCache.has(lower)) return this.logoCache.get(lower)!
    try {
      const checksum = getAddress(address)
      return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/assets/${checksum}/logo.png`
    } catch {
      return null
    }
  }

  /** 后台为数据库中 logo_url IS NULL 的 token 补充图标 */
  private async backfillLogos(): Promise<void> {
    const rows = await query<{ address: string }>(
      `SELECT address FROM tokens WHERE logo_url IS NULL`
    )
    if (rows.length === 0) return
    console.log(`[Discovery] Backfilling logos for ${rows.length} tokens…`)
    let updated = 0
    for (const { address } of rows) {
      const logoUrl = this.getLogoUrl(address)
      if (logoUrl) {
        await db.query(`UPDATE tokens SET logo_url = $1, updated_at = NOW() WHERE address = $2`, [logoUrl, address])
        updated++
      }
    }
    console.log(`[Discovery] Logo backfill done: ${updated} updated`)
  }

  // ─── Token metadata ───────────────────────────────────────────

  private tokenCache = new Set<string>()

  private async fetchAndSaveToken(address: string): Promise<void> {
    if (this.tokenCache.has(address)) return

    const existing = await query<{ address: string }>(
      'SELECT address FROM tokens WHERE address = $1', [address]
    )
    if (existing.length > 0) {
      this.tokenCache.add(address)
      return
    }

    try {
      const [symbol, name, decimals, totalSupply] = await Promise.all([
        this.httpClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol'      }) as Promise<string>,
        this.httpClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: 'name'        }) as Promise<string>,
        this.httpClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals'    }) as Promise<number>,
        this.httpClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: 'totalSupply' }) as Promise<bigint>,
      ])

      await upsertToken({
        address,
        symbol:       symbol ?? '???',
        name:         name   ?? 'Unknown',
        decimals:     decimals ?? 18,
        total_supply: totalSupply,
        logo_url:     this.getLogoUrl(address) ?? undefined,
      })
      this.tokenCache.add(address)
      console.log(`[Discovery] Token: ${symbol} (${address.slice(0,10)}…)`)
    } catch {
      await upsertToken({
        address,
        symbol:   '???',
        name:     'Unknown',
        decimals: 18,
        logo_url: this.getLogoUrl(address) ?? undefined,
      }).catch(() => {})
      this.tokenCache.add(address)
    }
  }

  // ─── Historical catchup ──────────────────────────────────────

  private async catchUpHistorical() {
    const [lastBlock]    = await query<{ value: string }>(`SELECT value FROM indexer_state WHERE key = 'last_block_pool_created'`)
    const fromBlock      = BigInt(lastBlock?.value ?? 0)
    const currentBlock   = await this.httpClient.getBlockNumber()

    // 最多追溯 100 块（Alchemy free tier: 10 blocks per getLogs request → 10 pages）
    const CATCHUP_RANGE  = 100n
    const safeFromBlock  = currentBlock - CATCHUP_RANGE > fromBlock
      ? currentBlock - CATCHUP_RANGE
      : fromBlock

    if (safeFromBlock >= currentBlock) {
      console.log('[Discovery] Historical catchup not needed')
      return
    }

    console.log(`[Discovery] Catching up ${safeFromBlock} → ${currentBlock} (${currentBlock - safeFromBlock} blocks)`)

    // Alchemy free tier: max 10 blocks per eth_getLogs request
    const PAGE = 10n
    const allV3Logs: any[]   = []
    const allAeroLogs: any[] = []

    try {
      for (let from = safeFromBlock; from <= currentBlock; from += PAGE) {
        const to = from + PAGE - 1n < currentBlock ? from + PAGE - 1n : currentBlock
        const [v3Logs, aeroLogs] = await Promise.all([
          this.httpClient.getLogs({
            address:   ADDRESSES.UNISWAP_V3_FACTORY as `0x${string}`,
            event:     UNIV3_POOL_CREATED_EVENT as any,
            fromBlock: from,
            toBlock:   to,
          }),
          this.httpClient.getLogs({
            address:   ADDRESSES.AERODROME_FACTORY as `0x${string}`,
            event:     AERODROME_PAIR_CREATED_EVENT as any,
            fromBlock: from,
            toBlock:   to,
          }),
        ])
        allV3Logs.push(...v3Logs)
        allAeroLogs.push(...aeroLogs)
      }

      console.log(`[Discovery] Found ${allV3Logs.length} V3 + ${allAeroLogs.length} Aero pools in range`)

      // Process in small parallel batches to avoid RPC rate limits
      const BATCH = 5
      for (let i = 0; i < allV3Logs.length; i += BATCH) {
        await Promise.allSettled(
          allV3Logs.slice(i, i + BATCH).map((log) => this.handleUniV3PoolCreated(log as unknown as PoolCreatedEvent))
        )
      }
      for (let i = 0; i < allAeroLogs.length; i += BATCH) {
        await Promise.allSettled(
          allAeroLogs.slice(i, i + BATCH).map((log) => this.handleAerodromePairCreated(log as unknown as PoolCreatedEvent))
        )
      }
    } catch (err) {
      console.error('[Discovery] Catchup error:', err)
    }
  }

  private async saveLastBlock(key: string, blockNumber: bigint) {
    await db.query(
      `UPDATE indexer_state SET value = $1, updated_at = NOW() WHERE key = $2`,
      [blockNumber.toString(), key]
    )
  }
}
