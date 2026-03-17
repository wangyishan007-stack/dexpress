/**
 * PairDiscoveryWorker
 *
 * 职责：
 *  1. bootstrap() — 通过 Factory.getPool 快速注入高活跃度的已知 pairs
 *  2. catchUpHistorical() — 追溯近 2000 块内的新 PoolCreated 事件
 *  3. 实时订阅 PoolCreated / PairCreated
 *
 * 支持链: Base + BSC (BSC 需要 BSC_WS_URL / BSC_HTTP_URL 环境变量)
 */

import {
  createPublicClient,
  webSocket,
  http,
  getAddress,
  type PublicClient,
} from 'viem'
import { base } from 'viem/chains'
import { bsc } from 'viem/chains'
import { upsertToken, upsertPool, db, query } from '@dex/database'
import {
  ADDRESSES,
  BSC_ADDRESSES,
  UNIV3_POOL_CREATED_EVENT,
  AERODROME_PAIR_CREATED_EVENT,
  PANCAKE_V2_PAIR_CREATED_EVENT,
  ERC20_ABI,
  type PoolCreatedEvent,
} from '@dex/shared'

// Uniswap V3 / PancakeSwap V3 Factory getPool ABI
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

// 已知高活跃度 pairs — Base（WETH + USDC + USDT 的各个 fee tier）
const BOOTSTRAP_PAIRS = [
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.USDC, fee: 500  },
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.USDC, fee: 3000 },
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.USDC, fee: 100  },
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.USDT, fee: 500  },
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.USDT, fee: 3000 },
  { tokenA: ADDRESSES.WETH, tokenB: ADDRESSES.DAI,  fee: 500  },
  { tokenA: ADDRESSES.USDC, tokenB: ADDRESSES.USDT, fee: 100  },
]

// 已知高活跃度 pairs — BSC（PancakeSwap V3）
const BSC_BOOTSTRAP_PAIRS = [
  { tokenA: BSC_ADDRESSES.USDT, tokenB: BSC_ADDRESSES.WBNB, fee: 500  },
  { tokenA: BSC_ADDRESSES.USDC, tokenB: BSC_ADDRESSES.WBNB, fee: 500  },
  { tokenA: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', tokenB: BSC_ADDRESSES.WBNB, fee: 500  }, // ETH
  { tokenA: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', tokenB: BSC_ADDRESSES.WBNB, fee: 500  }, // BTCB
  { tokenA: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', tokenB: BSC_ADDRESSES.WBNB, fee: 2500 }, // CAKE
]

export class PairDiscoveryWorker {
  private wsClient!:    PublicClient
  private httpClient:   PublicClient
  private bscWsClient:  PublicClient | null = null
  private bscHttpClient: PublicClient | null = null
  private onNewPool?:  (address: string) => void
  private unsubscribeFns: (() => void)[] = []

  constructor(options: { onNewPool?: (address: string) => void } = {}) {
    this.onNewPool   = options.onNewPool
    this.httpClient  = createPublicClient({
      chain: base,
      transport: http(process.env.ALCHEMY_HTTP_URL!),
    })
    this.initWsClient()
    this.initBscClients()
  }

  private initWsClient() {
    this.wsClient = createPublicClient({
      chain: base,
      transport: webSocket(process.env.ALCHEMY_WS_URL!, {
        reconnect: { attempts: Infinity, delay: 3_000 },
      }),
    })
  }

  private initBscClients() {
    const bscWsUrl = process.env.BSC_WS_URL
    const bscHttpUrl = process.env.BSC_HTTP_URL
    if (!bscWsUrl || !bscHttpUrl) {
      console.log('[Discovery] BSC_WS_URL/BSC_HTTP_URL not set, skipping BSC')
      return
    }
    this.bscHttpClient = createPublicClient({
      chain: bsc,
      transport: http(bscHttpUrl),
    })
    this.bscWsClient = createPublicClient({
      chain: bsc,
      transport: webSocket(bscWsUrl, {
        reconnect: { attempts: Infinity, delay: 3_000 },
      }),
    })
    console.log('[Discovery] BSC clients initialized')
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  async start() {
    console.log('[Discovery] Starting…')

    // 0. 预加载 1inch token list（用于 Logo）
    await this.loadTokenList()

    // 1. 快速注入已知高活跃 pairs — Base
    await this.bootstrapKnownPairs()

    // 2. 追溯近 100 块 — Base
    await this.catchUpHistorical()

    // 3. 实时订阅 — Base
    this.subscribeToFactories()
    console.log('[Discovery] Base: Listening for new pools…')

    // ── BSC ──
    if (this.bscHttpClient) {
      await this.bootstrapBscPairs()
      await this.catchUpBscHistorical()
      this.subscribeToBscFactories()
      console.log('[Discovery] BSC: Listening for new pools…')
    }

    // 4. 后台 backfill：为已有但缺少 Logo 的 token 填充图标
    this.backfillLogos().catch((e) => console.warn('[Discovery] Logo backfill error:', e))
  }

  stop() {
    this.unsubscribeFns.forEach((fn) => fn())
    this.unsubscribeFns = []
  }

  // ─── Bootstrap (Base) ─────────────────────────────────────────

  private async bootstrapKnownPairs() {
    console.log('[Discovery] Base: Bootstrapping known high-volume pairs…')

    const baseTokens = [
      { address: ADDRESSES.WETH, symbol: 'WETH',  name: 'Wrapped Ether',  decimals: 18 },
      { address: ADDRESSES.USDC, symbol: 'USDC',  name: 'USD Coin',       decimals: 6  },
      { address: ADDRESSES.USDT, symbol: 'USDT',  name: 'Tether USD',     decimals: 6  },
      { address: ADDRESSES.DAI,  symbol: 'DAI',   name: 'Dai Stablecoin', decimals: 18 },
    ]

    for (const t of baseTokens) {
      await upsertToken({ ...t, total_supply: 0n }).catch(() => {})
    }

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
        const [tok0, tok1] = tokenA.toLowerCase() < tokenB.toLowerCase()
          ? [tokenA.toLowerCase(), tokenB.toLowerCase()]
          : [tokenB.toLowerCase(), tokenA.toLowerCase()]

        await upsertPool({ address: addr, token0: tok0, token1: tok1, dex: 'uniswap_v3', fee_tier: fee })
        this.onNewPool?.(addr)
        console.log(`[Discovery] Base bootstrap pool: ${addr} fee=${fee}`)
      })
    )

    const ok  = results.filter((r) => r.status === 'fulfilled').length
    const err = results.filter((r) => r.status === 'rejected').length
    console.log(`[Discovery] Base bootstrap done: ${ok} OK, ${err} failed`)
  }

  // ─── Bootstrap (BSC) ──────────────────────────────────────────

  private async bootstrapBscPairs() {
    if (!this.bscHttpClient) return
    console.log('[Discovery] BSC: Bootstrapping known high-volume pairs…')

    const bscTokens = [
      { address: BSC_ADDRESSES.WBNB, symbol: 'WBNB', name: 'Wrapped BNB',        decimals: 18 },
      { address: BSC_ADDRESSES.USDT, symbol: 'USDT', name: 'Tether USD',         decimals: 18 },
      { address: BSC_ADDRESSES.USDC, symbol: 'USDC', name: 'USD Coin',           decimals: 18 },
      { address: BSC_ADDRESSES.BUSD, symbol: 'BUSD', name: 'Binance USD',        decimals: 18 },
      { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'ETH',  name: 'Ethereum Token',       decimals: 18 },
      { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol: 'BTCB', name: 'Binance-Peg BTCB',    decimals: 18 },
      { address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'CAKE', name: 'PancakeSwap Token',    decimals: 18 },
    ]

    for (const t of bscTokens) {
      await upsertToken({ ...t, total_supply: 0n, logo_url: this.getBscLogoUrl(t.address) ?? undefined }).catch(() => {})
    }

    const results = await Promise.allSettled(
      BSC_BOOTSTRAP_PAIRS.map(async ({ tokenA, tokenB, fee }) => {
        const poolAddr = await this.bscHttpClient!.readContract({
          address:      BSC_ADDRESSES.PANCAKE_V3_FACTORY as `0x${string}`,
          abi:          FACTORY_ABI,
          functionName: 'getPool',
          args:         [tokenA as `0x${string}`, tokenB as `0x${string}`, fee],
        }) as string

        if (!poolAddr || poolAddr === '0x0000000000000000000000000000000000000000') return

        const addr = poolAddr.toLowerCase()
        const [tok0, tok1] = tokenA.toLowerCase() < tokenB.toLowerCase()
          ? [tokenA.toLowerCase(), tokenB.toLowerCase()]
          : [tokenB.toLowerCase(), tokenA.toLowerCase()]

        await upsertPool({ address: addr, token0: tok0, token1: tok1, dex: 'pancakeswap_v3', fee_tier: fee, chain: 'bsc' })
        this.onNewPool?.(addr)
        console.log(`[Discovery] BSC bootstrap pool: ${addr} fee=${fee}`)
      })
    )

    const ok  = results.filter((r) => r.status === 'fulfilled').length
    const err = results.filter((r) => r.status === 'rejected').length
    console.log(`[Discovery] BSC bootstrap done: ${ok} OK, ${err} failed`)
  }

  // ─── Subscriptions (Base) ─────────────────────────────────────

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

  // ─── Subscriptions (BSC) ──────────────────────────────────────

  private subscribeToBscFactories() {
    if (!this.bscWsClient) return

    // PancakeSwap V3 Factory — PoolCreated (same event sig as Uniswap V3)
    const unsubV3 = this.bscWsClient.watchEvent({
      address: BSC_ADDRESSES.PANCAKE_V3_FACTORY as `0x${string}`,
      event:   UNIV3_POOL_CREATED_EVENT as any,
      onLogs:  (logs) => {
        for (const log of logs) {
          this.handleBscPoolCreated(log as unknown as PoolCreatedEvent)
            .catch((e) => console.error('[Discovery] BSC V3 pool error:', e))
        }
      },
      onError: (err) => console.error('[Discovery] BSC V3 watch error:', err),
    })

    // PancakeSwap V2 Factory — PairCreated
    const unsubV2 = this.bscWsClient.watchEvent({
      address: BSC_ADDRESSES.PANCAKE_V2_FACTORY as `0x${string}`,
      event:   PANCAKE_V2_PAIR_CREATED_EVENT as any,
      onLogs:  (logs) => {
        for (const log of logs) {
          this.handleBscPairCreated(log as unknown as PoolCreatedEvent)
            .catch((e) => console.error('[Discovery] BSC V2 pair error:', e))
        }
      },
      onError: (err) => console.error('[Discovery] BSC V2 watch error:', err),
    })

    this.unsubscribeFns.push(unsubV3, unsubV2)
  }

  // ─── Pool created handlers (Base) ─────────────────────────────

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

  // ─── Pool created handlers (BSC) ──────────────────────────────

  private async handleBscPoolCreated(log: PoolCreatedEvent) {
    const { token0, token1, fee, tickSpacing, pool } = log.args
    if (!pool) return

    const poolAddr = pool.toLowerCase()
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    console.log(`[Discovery] BSC new V3 pool: ${poolAddr} (${t0.slice(0,10)}/${t1.slice(0,10)} fee=${fee})`)

    await Promise.all([
      this.fetchAndSaveBscToken(t0),
      this.fetchAndSaveBscToken(t1),
    ])

    await upsertPool({ address: poolAddr, token0: t0, token1: t1, dex: 'pancakeswap_v3', fee_tier: fee, tick_spacing: tickSpacing, chain: 'bsc' })
    await this.saveLastBlock('last_block_bsc_pool_created', log.blockNumber)
    this.onNewPool?.(poolAddr)
  }

  private async handleBscPairCreated(log: PoolCreatedEvent) {
    const { token0, token1, pair } = log.args
    if (!pair) return

    const pairAddr = pair.toLowerCase()
    const t0 = token0.toLowerCase()
    const t1 = token1.toLowerCase()

    console.log(`[Discovery] BSC new V2 pair: ${pairAddr} (${t0.slice(0,10)}/${t1.slice(0,10)})`)

    await Promise.all([
      this.fetchAndSaveBscToken(t0),
      this.fetchAndSaveBscToken(t1),
    ])

    await upsertPool({ address: pairAddr, token0: t0, token1: t1, dex: 'pancakeswap_v2', chain: 'bsc' })
    await this.saveLastBlock('last_block_bsc_pool_created', log.blockNumber)
    this.onNewPool?.(pairAddr)
  }

  // ─── Token Logo（1inch token list + Trust Wallet fallback）───

  // address(小写) → logoURI
  private logoCache = new Map<string, string>()

  /** 启动时从 1inch 拉取 Base + BSC chain 的 token list，缓存到内存 */
  private async loadTokenList(): Promise<void> {
    // Base (chainId 8453)
    await this.loadTokenListForChain(8453, 'Base')
    // BSC (chainId 56)
    if (this.bscHttpClient) {
      await this.loadTokenListForChain(56, 'BSC')
    }
  }

  private async loadTokenListForChain(chainId: number, label: string): Promise<void> {
    try {
      const res = await fetch(`https://tokens.1inch.io/v1.2/${chainId}`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) {
        console.warn(`[Discovery] 1inch ${label} token list HTTP ${res.status}`)
        return
      }
      const data = await res.json() as Record<string, { logoURI?: string }>
      let count = 0
      for (const [addr, info] of Object.entries(data)) {
        if (info.logoURI) {
          this.logoCache.set(addr.toLowerCase(), info.logoURI)
          count++
        }
      }
      console.log(`[Discovery] Loaded ${count} ${label} token logos from 1inch`)
    } catch (err) {
      console.warn(`[Discovery] Failed to load 1inch ${label} token list:`, err)
    }
  }

  /**
   * 获取 Base token 的 logo URL：
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

  /** BSC token logo: 1inch cache → Trust Wallet smartchain fallback */
  private getBscLogoUrl(address: string): string | null {
    const lower = address.toLowerCase()
    if (this.logoCache.has(lower)) return this.logoCache.get(lower)!
    try {
      const checksum = getAddress(address)
      return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/assets/${checksum}/logo.png`
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
      const logoUrl = this.getLogoUrl(address) || this.getBscLogoUrl(address)
      if (logoUrl) {
        await db.query(`UPDATE tokens SET logo_url = $1, updated_at = NOW() WHERE address = $2`, [logoUrl, address])
        updated++
      }
    }
    console.log(`[Discovery] Logo backfill done: ${updated} updated`)
  }

  // ─── Token metadata (Base) ─────────────────────────────────────

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

  // ─── Token metadata (BSC) ──────────────────────────────────────

  private async fetchAndSaveBscToken(address: string): Promise<void> {
    if (!this.bscHttpClient) return
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
        this.bscHttpClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: 'symbol'      }) as Promise<string>,
        this.bscHttpClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: 'name'        }) as Promise<string>,
        this.bscHttpClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: 'decimals'    }) as Promise<number>,
        this.bscHttpClient.readContract({ address: address as `0x${string}`, abi: ERC20_ABI, functionName: 'totalSupply' }) as Promise<bigint>,
      ])

      await upsertToken({
        address,
        symbol:       symbol ?? '???',
        name:         name   ?? 'Unknown',
        decimals:     decimals ?? 18,
        total_supply: totalSupply,
        logo_url:     this.getBscLogoUrl(address) ?? undefined,
      })
      this.tokenCache.add(address)
      console.log(`[Discovery] BSC Token: ${symbol} (${address.slice(0,10)}…)`)
    } catch {
      await upsertToken({
        address,
        symbol:   '???',
        name:     'Unknown',
        decimals: 18,
        logo_url: this.getBscLogoUrl(address) ?? undefined,
      }).catch(() => {})
      this.tokenCache.add(address)
    }
  }

  // ─── Historical catchup (Base) ─────────────────────────────────

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
      console.log('[Discovery] Base historical catchup not needed')
      return
    }

    console.log(`[Discovery] Base catching up ${safeFromBlock} → ${currentBlock} (${currentBlock - safeFromBlock} blocks)`)

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

      console.log(`[Discovery] Base found ${allV3Logs.length} V3 + ${allAeroLogs.length} Aero pools in range`)

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
      console.error('[Discovery] Base catchup error:', err)
    }
  }

  // ─── Historical catchup (BSC) ──────────────────────────────────

  private async catchUpBscHistorical() {
    if (!this.bscHttpClient) return

    const [lastBlock] = await query<{ value: string }>(`SELECT value FROM indexer_state WHERE key = 'last_block_bsc_pool_created'`)
    const fromBlock   = BigInt(lastBlock?.value ?? 0)
    const currentBlock = await this.bscHttpClient.getBlockNumber()

    // BSC public RPC: larger block range allowed (~2000 blocks)
    const CATCHUP_RANGE = 2000n
    const safeFromBlock = currentBlock - CATCHUP_RANGE > fromBlock
      ? currentBlock - CATCHUP_RANGE
      : fromBlock

    if (safeFromBlock >= currentBlock) {
      console.log('[Discovery] BSC historical catchup not needed')
      return
    }

    console.log(`[Discovery] BSC catching up ${safeFromBlock} → ${currentBlock} (${currentBlock - safeFromBlock} blocks)`)

    // Public RPC: use 500 block pages
    const PAGE = 500n
    const allV3Logs: any[] = []
    const allV2Logs: any[] = []

    try {
      for (let from = safeFromBlock; from <= currentBlock; from += PAGE) {
        const to = from + PAGE - 1n < currentBlock ? from + PAGE - 1n : currentBlock
        const [v3Logs, v2Logs] = await Promise.all([
          this.bscHttpClient.getLogs({
            address:   BSC_ADDRESSES.PANCAKE_V3_FACTORY as `0x${string}`,
            event:     UNIV3_POOL_CREATED_EVENT as any,
            fromBlock: from,
            toBlock:   to,
          }),
          this.bscHttpClient.getLogs({
            address:   BSC_ADDRESSES.PANCAKE_V2_FACTORY as `0x${string}`,
            event:     PANCAKE_V2_PAIR_CREATED_EVENT as any,
            fromBlock: from,
            toBlock:   to,
          }),
        ])
        allV3Logs.push(...v3Logs)
        allV2Logs.push(...v2Logs)
      }

      console.log(`[Discovery] BSC found ${allV3Logs.length} V3 + ${allV2Logs.length} V2 pools in range`)

      const BATCH = 5
      for (let i = 0; i < allV3Logs.length; i += BATCH) {
        await Promise.allSettled(
          allV3Logs.slice(i, i + BATCH).map((log) => this.handleBscPoolCreated(log as unknown as PoolCreatedEvent))
        )
      }
      for (let i = 0; i < allV2Logs.length; i += BATCH) {
        await Promise.allSettled(
          allV2Logs.slice(i, i + BATCH).map((log) => this.handleBscPairCreated(log as unknown as PoolCreatedEvent))
        )
      }
    } catch (err) {
      console.error('[Discovery] BSC catchup error:', err)
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private async saveLastBlock(key: string, blockNumber: bigint) {
    // Upsert: insert if not exists, update if exists
    await db.query(
      `INSERT INTO indexer_state (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, blockNumber.toString()]
    )
  }
}
