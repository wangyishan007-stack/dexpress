/**
 * SolanaIndexerWorker
 *
 * Uses Helius Enhanced Transactions API to index Solana DEX swaps.
 * Writes to the same swaps/pools/tokens tables used by EVM indexers.
 * SmartMoneyWorker + wallet API routes then work for chain='solana' automatically.
 */

import { query, insertSwap, upsertToken, upsertPool } from '@dex/database'
import { redis } from '@dex/database'

// ── Constants ────────────────────────────────────────────────────────────────

const HELIUS_API_KEY = process.env.HELIUS_API_KEY ?? ''
const HELIUS_BASE   = 'https://api.helius.xyz/v0'
const JUPITER_PRICE = 'https://api.jup.ag/price/v2'
const JUPITER_TOKENS = 'https://token.jup.ag/strict'  // strict list is smaller, loads faster

const POLL_INTERVAL_MS   = 5 * 60 * 1000  // 5 minutes
const PRICE_CACHE_TTL    = 30_000          // 30s
const STALE_THRESHOLD_MS = 60 * 60 * 1000  // 1 hour
const MAX_WALLETS        = 100
const HELIUS_RATE_MS     = 550             // ~2 req/s

// Seed wallets: known active Solana DEX traders for bootstrapping
const SOLANA_SEED_WALLETS = [
  '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',  // active trader already indexed
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',   // Jupiter aggregator
  'FMcVchfQXrSPZ3ffWfj77HBdwHDxxNk13aKzYRkMkHBk',  // active meme trader
  'BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV',  // Raydium whale
  '2iCmrRHvyET8KMjNYoMa4R3g1JjwpMixqFj6idLt2gNf',  // known SOL trader
  'GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ',   // active DEX user
  'HWEoBxYs7ssKueFhPVhbRCpLYv4wnerxhFxYCJNpz6zp',   // Orca trader
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',    // Meteora trader
  'CEU3Bwk4tVGRF2VJDJJUkhnMSXxNVpJEgPeYyxjFp4aF',  // high-freq DEX bot
  'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',  // active Raydium LP
]

const SOLANA_QUOTE_TOKENS = new Set([
  'So11111111111111111111111111111111111111112',     // SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',  // USDT
])

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const SOL_DECIMALS = 9

// ── Types ────────────────────────────────────────────────────────────────────

interface HeliusTokenAmount {
  tokenAmount: string
  decimals: number
}

interface HeliusTokenTransfer {
  userAccount: string
  tokenAccount: string
  mint: string
  rawTokenAmount: HeliusTokenAmount
}

interface HeliusNativeTransfer {
  account: string
  amount: string // lamports
}

interface HeliusInnerSwap {
  tokenInputs: Array<{ mint: string; rawTokenAmount: HeliusTokenAmount }>
  tokenOutputs: Array<{ mint: string; rawTokenAmount: HeliusTokenAmount }>
  programInfo: { source: string; account: string; programName: string; instructionName: string }
}

interface HeliusSwapEvent {
  nativeInput?: HeliusNativeTransfer
  nativeOutput?: HeliusNativeTransfer
  tokenInputs: HeliusTokenTransfer[]
  tokenOutputs: HeliusTokenTransfer[]
  innerSwaps: HeliusInnerSwap[]
}

interface HeliusTx {
  signature: string
  timestamp: number  // unix seconds
  slot: number
  type: string
  source: string
  feePayer: string
  events: { swap?: HeliusSwapEvent }
  description?: string
}

interface ParsedSwap {
  signature: string
  timestamp: Date
  slot: number
  wallet: string
  tokenInMint: string
  tokenOutMint: string
  tokenInAmount: number   // normalized
  tokenOutAmount: number  // normalized
  tokenInDecimals: number
  tokenOutDecimals: number
  dex: string             // raydium, orca, meteora, jupiter
  poolAccount: string     // AMM pool account from innerSwaps
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance: SolanaIndexerWorker | null = null
export function setSolanaIndexerInstance(w: SolanaIndexerWorker) { _instance = w }
export function getSolanaIndexer(): SolanaIndexerWorker | null { return _instance }

// ── Worker ───────────────────────────────────────────────────────────────────

export class SolanaIndexerWorker {
  private timer?: NodeJS.Timeout
  private isRunning = false
  private priceCache = new Map<string, { price: number; ts: number }>()
  private jupiterTokenMap: Map<string, { symbol: string; name: string; decimals: number; logoURI?: string }> | null = null
  private tokenMetaCache = new Map<string, { symbol: string; name: string; decimals: number; logoURI?: string }>()
  private lastHeliusCall = 0

  async start() {
    if (!HELIUS_API_KEY) {
      console.log('[SolanaIndexer] No HELIUS_API_KEY, skipping')
      return
    }
    console.log('[SolanaIndexer] Starting...')
    // Load Jupiter token list in background
    this.loadJupiterTokens().catch(() => {})
    // First scan
    this.runScan().catch(e => console.error('[SolanaIndexer] scan error:', e))
    this.timer = setInterval(() => {
      this.runScan().catch(e => console.error('[SolanaIndexer] scan error:', e))
    }, POLL_INTERVAL_MS)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
  }

  // ── Public: on-demand indexing ──────────────────────────────────────────

  async indexOnDemand(walletAddress: string): Promise<boolean> {
    if (!HELIUS_API_KEY) return false
    const stale = await this.isWalletStale(walletAddress)
    if (!stale) return false
    const count = await this.indexWallet(walletAddress)
    return count > 0
  }

  async isWalletStale(walletAddress: string): Promise<boolean> {
    const rows = await query<{ latest: string }>(`
      SELECT MAX(s.timestamp)::text AS latest
      FROM swaps s
      JOIN pools p ON p.address = s.pool_address
      WHERE s.sender = $1 AND p.chain = 'solana'
    `, [walletAddress])
    if (!rows.length || !rows[0].latest) return true
    return Date.now() - new Date(rows[0].latest).getTime() > STALE_THRESHOLD_MS
  }

  // ── Periodic scan ──────────────────────────────────────────────────────

  private async runScan() {
    if (this.isRunning) return
    this.isRunning = true
    const t0 = Date.now()
    try {
      // Re-price existing swaps that have amount_usd = 0
      await this.repriceZeroUsdSwaps()

      const wallets = await this.getWalletsToIndex()
      if (!wallets.length) {
        console.log('[SolanaIndexer] No wallets to index')
        return
      }
      let totalNew = 0
      for (const w of wallets) {
        try {
          const n = await this.indexWallet(w)
          totalNew += n
        } catch (e) {
          console.warn(`[SolanaIndexer] Failed to index ${w.slice(0, 8)}...:`, e)
        }
      }
      console.log(`[SolanaIndexer] Scan done: ${wallets.length} wallets, ${totalNew} new swaps in ${Date.now() - t0}ms`)

      // Trigger SmartMoneyWorker recalc if we got new data
      if (totalNew > 0) {
        try {
          const { SmartMoneyWorker } = await import('./smartMoneyWorker')
          const w = new SmartMoneyWorker()
          w.calculateNow().catch(e => console.warn('[SolanaIndexer] SmartMoney recalc error:', e))
          console.log('[SolanaIndexer] Triggered SmartMoneyWorker recalc after new data')
        } catch { /* ignore */ }
      }
    } finally {
      this.isRunning = false
    }
  }

  private async getWalletsToIndex(): Promise<string[]> {
    const wallets = new Set<string>()

    // 1. Known wallets from wallet_pnl
    const pnlRows = await query<{ wallet_address: string }>(`
      SELECT DISTINCT wallet_address FROM wallet_pnl
      WHERE chain = 'solana'
      ORDER BY wallet_address
      LIMIT $1
    `, [MAX_WALLETS])
    for (const r of pnlRows) wallets.add(r.wallet_address)

    // 2. On-demand queue from Redis
    try {
      const queued = await redis.smembers('solana:wallets_to_index')
      for (const w of queued) wallets.add(w)
      if (queued.length) await redis.del('solana:wallets_to_index')
    } catch { /* redis may not be available */ }

    // 3. Discover active wallets from existing swaps (bootstrap when wallet_pnl empty)
    if (wallets.size < MAX_WALLETS) {
      try {
        const swapWallets = await query<{ sender: string }>(`
          SELECT DISTINCT s.sender FROM swaps s
          JOIN pools p ON p.address = s.pool_address
          WHERE p.chain = 'solana' AND s.sender IS NOT NULL
            AND length(s.sender) >= 32
          ORDER BY s.sender
          LIMIT $1
        `, [MAX_WALLETS - wallets.size])
        for (const r of swapWallets) wallets.add(r.sender)
      } catch { /* ignore */ }
    }

    // 4. Seed wallets for initial bootstrap
    for (const w of SOLANA_SEED_WALLETS) wallets.add(w)

    return Array.from(wallets).slice(0, MAX_WALLETS)
  }

  // ── Core: index a single wallet ────────────────────────────────────────

  async indexWallet(walletAddress: string): Promise<number> {
    const cursor = await this.getCursor(walletAddress)
    const allTxs: HeliusTx[] = []

    // Paginate through Helius API
    let before: string | undefined
    for (let page = 0; page < 5; page++) { // max 5 pages = 500 txs
      const txs = await this.fetchHeliusSwaps(walletAddress, before)
      if (!txs.length) break

      // Stop if we've reached the cursor
      let hitCursor = false
      for (const tx of txs) {
        if (tx.signature === cursor) { hitCursor = true; break }
        allTxs.push(tx)
      }
      if (hitCursor) break
      before = txs[txs.length - 1].signature
    }

    if (!allTxs.length) return 0

    // Collect unique mints for pricing
    const mints = new Set<string>()
    const parsed: ParsedSwap[] = []
    for (const tx of allTxs) {
      const p = this.parseSwap(tx)
      if (!p) continue
      parsed.push(p)
      mints.add(p.tokenInMint)
      mints.add(p.tokenOutMint)
    }

    if (!parsed.length) return 0

    // Fetch prices for all mints
    await this.fetchJupiterPrices(Array.from(mints))

    // Process oldest first; override wallet with the target address
    parsed.reverse()
    let inserted = 0
    for (const swap of parsed) {
      swap.wallet = walletAddress
      try {
        await this.discoverTokens(swap)
        const poolAddr = await this.discoverPool(swap)
        const { amountUsd, priceUsd, isBuy } = this.resolveSwapUsd(swap)

        await insertSwap({
          pool_address: poolAddr,
          block_number: swap.slot,
          tx_hash: swap.signature,
          log_index: 0,
          timestamp: swap.timestamp,
          sender: swap.wallet,
          recipient: null,
          amount0: swap.tokenInAmount,
          amount1: swap.tokenOutAmount,
          amount_usd: amountUsd,
          price_usd: priceUsd,
          is_buy: isBuy,
          caseSensitive: true,
        })
        inserted++
      } catch (e: any) {
        if (e?.code !== '23505') { // not a duplicate
          console.warn(`[SolanaIndexer] insert error for ${swap.signature.slice(0, 8)}:`, e?.message)
        }
      }
    }

    // Save cursor (newest signature)
    if (allTxs.length) {
      await this.setCursor(walletAddress, allTxs[0].signature)
    }

    if (inserted > 0) {
      console.log(`[SolanaIndexer] ${walletAddress.slice(0, 8)}... +${inserted} swaps`)
    }
    return inserted
  }

  // ── Re-price swaps with missing USD amounts ────────────────────────────

  private async repriceZeroUsdSwaps() {
    try {
      // Find Solana swaps with amount_usd = 0 (price was unavailable at insert time)
      const rows = await query<{
        tx_hash: string
        pool_address: string
        amount0: string
        amount1: string
        token0: string
        token1: string
      }>(`
        SELECT s.tx_hash, s.pool_address, s.amount0::text, s.amount1::text,
               p.token0, p.token1
        FROM swaps s
        JOIN pools p ON p.address = s.pool_address
        WHERE p.chain = 'solana' AND (s.amount_usd = 0 OR s.amount_usd IS NULL)
        LIMIT 200
      `)
      if (!rows.length) return

      // Collect unique mints
      const mints = new Set<string>()
      for (const r of rows) { mints.add(r.token0); mints.add(r.token1) }

      // Fetch current prices
      await this.fetchJupiterPrices(Array.from(mints))

      let updated = 0
      for (const r of rows) {
        const price0 = this.getCachedPrice(r.token0)
        const price1 = this.getCachedPrice(r.token1)
        const amt0 = Math.abs(Number(r.amount0))
        const amt1 = Math.abs(Number(r.amount1))

        let amountUsd = 0
        if (price0 > 0) amountUsd = amt0 * price0
        else if (price1 > 0) amountUsd = amt1 * price1

        if (amountUsd > 0) {
          let priceUsd = 0
          if (SOLANA_QUOTE_TOKENS.has(r.token0)) priceUsd = price1
          else if (SOLANA_QUOTE_TOKENS.has(r.token1)) priceUsd = price0
          else priceUsd = price0 || price1

          await query(`
            UPDATE swaps SET amount_usd = $1, price_usd = $2
            WHERE tx_hash = $3 AND pool_address = $4
          `, [amountUsd, priceUsd, r.tx_hash, r.pool_address])
          updated++
        }
      }
      if (updated > 0) {
        console.log(`[SolanaIndexer] Re-priced ${updated} swaps with missing USD amounts`)
      }
    } catch (e) {
      console.warn('[SolanaIndexer] repriceZeroUsdSwaps error:', e)
    }
  }

  // ── Helius API ─────────────────────────────────────────────────────────

  private async fetchHeliusSwaps(wallet: string, before?: string): Promise<HeliusTx[]> {
    await this.rateLimit()
    const url = new URL(`${HELIUS_BASE}/addresses/${wallet}/transactions`)
    url.searchParams.set('api-key', HELIUS_API_KEY)
    url.searchParams.set('type', 'SWAP')
    url.searchParams.set('limit', '100')
    if (before) url.searchParams.set('before', before)

    console.log(`[SolanaIndexer] Fetching Helius swaps for ${wallet.slice(0, 8)}...`)
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Helius ${res.status}: ${text.slice(0, 200)}`)
    }
    const data = await res.json()
    console.log(`[SolanaIndexer] Helius returned ${Array.isArray(data) ? data.length : 0} txs for ${wallet.slice(0, 8)}...`)
    return data
  }

  // ── Swap Parsing ───────────────────────────────────────────────────────

  private parseSwap(tx: HeliusTx): ParsedSwap | null {
    if (tx.type !== 'SWAP' || !tx.events?.swap) return null
    const swap = tx.events.swap

    // Extract token in (what user spent)
    let tokenInMint: string
    let tokenInAmount: number
    let tokenInDecimals: number

    if (swap.nativeInput && Number(swap.nativeInput.amount) > 0) {
      tokenInMint = SOL_MINT
      tokenInAmount = Number(swap.nativeInput.amount) / 1e9
      tokenInDecimals = SOL_DECIMALS
    } else if (swap.tokenInputs.length > 0) {
      const ti = swap.tokenInputs[0]
      tokenInMint = ti.mint
      tokenInDecimals = ti.rawTokenAmount.decimals
      tokenInAmount = Number(ti.rawTokenAmount.tokenAmount) / (10 ** tokenInDecimals)
    } else {
      return null // can't determine input
    }

    // Extract token out (what user received)
    let tokenOutMint: string
    let tokenOutAmount: number
    let tokenOutDecimals: number

    if (swap.nativeOutput && Number(swap.nativeOutput.amount) > 0) {
      tokenOutMint = SOL_MINT
      tokenOutAmount = Number(swap.nativeOutput.amount) / 1e9
      tokenOutDecimals = SOL_DECIMALS
    } else if (swap.tokenOutputs.length > 0) {
      const to = swap.tokenOutputs[0]
      tokenOutMint = to.mint
      tokenOutDecimals = to.rawTokenAmount.decimals
      tokenOutAmount = Number(to.rawTokenAmount.tokenAmount) / (10 ** tokenOutDecimals)
    } else {
      return null // can't determine output
    }

    // Skip if same token (not a real swap)
    if (tokenInMint === tokenOutMint) return null

    // Determine DEX and pool account from innerSwaps
    let dex = tx.source?.toLowerCase() || 'jupiter'
    let poolAccount = ''
    if (swap.innerSwaps?.length > 0) {
      const inner = swap.innerSwaps[0]
      if (inner.programInfo) {
        dex = inner.programInfo.source?.toLowerCase() || dex
        poolAccount = inner.programInfo.account || ''
      }
    }
    // Normalize DEX names
    if (dex.includes('raydium')) dex = 'raydium'
    else if (dex.includes('orca') || dex.includes('whirlpool')) dex = 'orca'
    else if (dex.includes('meteora')) dex = 'meteora'
    else if (dex.includes('jupiter')) dex = 'jupiter'

    // If no pool account, generate deterministic ID
    if (!poolAccount) {
      const [m0, m1] = tokenInMint < tokenOutMint
        ? [tokenInMint, tokenOutMint]
        : [tokenOutMint, tokenInMint]
      poolAccount = `sol:${m0.slice(0, 8)}:${m1.slice(0, 8)}:${dex}`
    }

    return {
      signature: tx.signature,
      timestamp: new Date(tx.timestamp * 1000),
      slot: tx.slot,
      wallet: tx.feePayer,  // will be overridden with actual target wallet in indexWallet
      tokenInMint,
      tokenOutMint,
      tokenInAmount,
      tokenOutAmount,
      tokenInDecimals,
      tokenOutDecimals,
      dex,
      poolAccount,
    }
  }

  // ── Token & Pool Discovery ─────────────────────────────────────────────

  private async discoverTokens(swap: ParsedSwap) {
    for (const mint of [swap.tokenInMint, swap.tokenOutMint]) {
      let info = this.jupiterTokenMap?.get(mint)

      // Fallback: fetch from Helius DAS if no Jupiter data
      if (!info && HELIUS_API_KEY) {
        try {
          const cached = this.tokenMetaCache?.get(mint)
          if (cached) { info = cached }
          else {
            await this.rateLimit()
            const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0', id: 'meta',
                method: 'getAsset',
                params: { id: mint },
              }),
              signal: AbortSignal.timeout(10_000),
            })
            if (res.ok) {
              const json = await res.json() as any
              const content = json.result?.content?.metadata
              if (content?.symbol) {
                info = { symbol: content.symbol, name: content.name || content.symbol, decimals: 0 }
                this.tokenMetaCache?.set(mint, info)
              }
            }
          }
        } catch { /* ignore */ }
      }

      await upsertToken({
        address: mint,
        symbol: info?.symbol || mint.slice(0, 6),
        name: info?.name || mint.slice(0, 6),
        decimals: mint === swap.tokenInMint ? swap.tokenInDecimals : swap.tokenOutDecimals,
        logo_url: info?.logoURI,
        caseSensitive: true,
      })
    }
  }

  private async discoverPool(swap: ParsedSwap): Promise<string> {
    // Determine token0/token1 ordering: quote token goes to token1
    let token0 = swap.tokenInMint
    let token1 = swap.tokenOutMint
    if (SOLANA_QUOTE_TOKENS.has(token0) && !SOLANA_QUOTE_TOKENS.has(token1)) {
      ;[token0, token1] = [token1, token0]
    } else if (!SOLANA_QUOTE_TOKENS.has(token0) && !SOLANA_QUOTE_TOKENS.has(token1)) {
      // Neither is quote, sort lexicographically
      if (token0 > token1) [token0, token1] = [token1, token0]
    }

    await upsertPool({
      address: swap.poolAccount,
      token0,
      token1,
      dex: swap.dex,
      chain: 'solana',
      caseSensitive: true,
    })

    return swap.poolAccount
  }

  // ── USD Price Resolution ───────────────────────────────────────────────

  private resolveSwapUsd(swap: ParsedSwap): { amountUsd: number; priceUsd: number; isBuy: boolean } {
    const priceIn = this.getCachedPrice(swap.tokenInMint)
    const priceOut = this.getCachedPrice(swap.tokenOutMint)

    // Calculate USD amount from whichever side has a price
    let amountUsd = 0
    if (priceIn > 0) amountUsd = swap.tokenInAmount * priceIn
    else if (priceOut > 0) amountUsd = swap.tokenOutAmount * priceOut

    // is_buy = spending quote token to get a non-quote token
    const isBuy = SOLANA_QUOTE_TOKENS.has(swap.tokenInMint) && !SOLANA_QUOTE_TOKENS.has(swap.tokenOutMint)

    // price_usd = price of the non-quote (base) token
    let priceUsd = 0
    if (SOLANA_QUOTE_TOKENS.has(swap.tokenInMint)) {
      priceUsd = priceOut  // tokenOut is the base token
    } else if (SOLANA_QUOTE_TOKENS.has(swap.tokenOutMint)) {
      priceUsd = priceIn   // tokenIn is the base token
    } else {
      priceUsd = priceIn || priceOut
    }

    return { amountUsd, priceUsd, isBuy }
  }

  // ── Jupiter Price API ──────────────────────────────────────────────────

  private async fetchJupiterPrices(mints: string[]) {
    // Filter out already cached
    const now = Date.now()
    const needed = mints.filter(m => {
      const c = this.priceCache.get(m)
      return !c || now - c.ts > PRICE_CACHE_TTL
    })
    if (!needed.length) return

    // Try Jupiter API first, then fallback to Helius DAS
    for (let i = 0; i < needed.length; i += 100) {
      const batch = needed.slice(i, i + 100)
      let fetched = false

      // Jupiter
      try {
        const res = await fetch(`${JUPITER_PRICE}?ids=${batch.join(',')}`, {
          signal: AbortSignal.timeout(10_000),
        })
        if (res.ok) {
          const json = await res.json() as { data: Record<string, { price: string }> }
          for (const [mint, info] of Object.entries(json.data ?? {})) {
            const price = Number(info.price)
            if (price > 0) { this.priceCache.set(mint, { price, ts: now }); fetched = true }
          }
        }
      } catch {
        console.warn('[SolanaIndexer] Jupiter price API unreachable, trying Helius DAS')
      }

      // Fallback: Helius getAssetBatch for price data
      if (!fetched && HELIUS_API_KEY) {
        try {
          await this.rateLimit()
          const dasUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
          const res = await fetch(dasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 'price',
              method: 'getAssetBatch',
              params: { ids: batch },
            }),
            signal: AbortSignal.timeout(15_000),
          })
          if (res.ok) {
            const json = await res.json() as { result?: Array<{ id: string; token_info?: { price_info?: { price_per_token?: number } } }> }
            for (const asset of json.result ?? []) {
              const price = asset?.token_info?.price_info?.price_per_token
              if (price && price > 0) {
                this.priceCache.set(asset.id, { price, ts: now })
              }
            }
          }
        } catch (e) {
          console.warn('[SolanaIndexer] Helius DAS price fallback error:', e)
        }
      }
    }
  }

  private getCachedPrice(mint: string): number {
    return this.priceCache.get(mint)?.price ?? 0
  }

  // ── Jupiter Token List ─────────────────────────────────────────────────

  private async loadJupiterTokens() {
    try {
      const res = await fetch(JUPITER_TOKENS, { signal: AbortSignal.timeout(30_000) })
      if (!res.ok) return
      const tokens = await res.json() as Array<{
        address: string; symbol: string; name: string
        decimals: number; logoURI?: string
      }>
      this.jupiterTokenMap = new Map()
      for (const t of tokens) {
        this.jupiterTokenMap.set(t.address, {
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
          logoURI: t.logoURI,
        })
      }
      console.log(`[SolanaIndexer] Jupiter token list loaded: ${this.jupiterTokenMap.size} tokens`)
    } catch (e) {
      console.warn('[SolanaIndexer] Failed to load Jupiter token list:', e)
    }
  }

  // ── Cursor Management (Redis) ──────────────────────────────────────────

  private async getCursor(wallet: string): Promise<string | null> {
    try {
      return await redis.get(`solana:cursor:${wallet}`)
    } catch { return null }
  }

  private async setCursor(wallet: string, signature: string) {
    try {
      await redis.set(`solana:cursor:${wallet}`, signature, 'EX', 86400 * 7) // 7 day TTL
    } catch { /* ignore */ }
  }

  // ── Rate Limiting ──────────────────────────────────────────────────────

  private async rateLimit() {
    const now = Date.now()
    const wait = this.lastHeliusCall + HELIUS_RATE_MS - now
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    this.lastHeliusCall = Date.now()
  }
}
