/**
 * GeckoTerminal API client (replaces DexScreener)
 * Free, no API key required.
 *
 * Endpoints used:
 *   GET /api/v2/networks/base/trending_pools          → trending (20 pools)
 *   GET /api/v2/networks/base/pools?sort=h24_volume_usd_desc&page={n} → top by volume (20/page)
 *   GET /api/v2/networks/base/new_pools               → newest pools (20)
 */

import type { Pool, Token, Dex, PairsResponse } from '@dex/shared'
import { getChain, DEFAULT_CHAIN, SUPPORTED_CHAINS, type ChainSlug } from '@/lib/chains'

const GT_BASE     = 'https://api.geckoterminal.com/api/v2'
const GT_HEADERS  = { Accept: 'application/json;version=20230302' }
const FETCH_TIMEOUT = 6_000

// ─── GeckoTerminal raw types ──────────────────────────────────

interface GTTransactionWindow {
  buys:    number
  sells:   number
  buyers:  number
  sellers: number
}

interface GTPoolAttributes {
  address:                       string
  name:                          string
  pool_created_at:               string | null
  base_token_price_usd:          string | null
  base_token_price_native_currency: string | null
  quote_token_price_usd:         string | null
  reserve_in_usd:                string | null
  fdv_usd:                       string | null
  market_cap_usd:                string | null
  locked_liquidity_percentage:   string | null
  pool_fee:                      string | null
  price_change_percentage: {
    m5?: string; m15?: string; m30?: string
    h1?: string; h6?: string; h24?: string
  }
  transactions: {
    m5: GTTransactionWindow; m15: GTTransactionWindow; m30: GTTransactionWindow
    h1: GTTransactionWindow; h6: GTTransactionWindow;  h24: GTTransactionWindow
  }
  volume_usd: {
    m5: string; m15: string; m30: string
    h1: string; h6: string;  h24: string
  }
}

interface GTRelationship {
  data: { id: string; type: string }
}

interface GTPool {
  id:            string
  type:          string
  attributes:    GTPoolAttributes
  relationships: {
    base_token:  GTRelationship
    quote_token: GTRelationship
    dex:         GTRelationship
  }
}

interface GTIncludedToken {
  id:   string
  type: string
  attributes: {
    address:   string
    name:      string
    symbol:    string
    image_url: string | null
  }
}

interface GTResponse {
  data:      GTPool[]
  included?: GTIncludedToken[]
}

// ─── Helpers ─────────────────────────────────────────────────

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT): Promise<Response> {
  // Route through our API proxy to handle network/proxy issues
  const proxyUrl = `/api/gt?url=${encodeURIComponent(url)}`
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController()
    const tid  = setTimeout(() => ctrl.abort(), ms)
    try {
      const res = await fetch(proxyUrl, { signal: ctrl.signal })
      if (res.status === 429 && attempt === 0) {
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      return res
    } finally {
      clearTimeout(tid)
    }
  }
  // Unreachable, but TypeScript needs it
  return fetch(proxyUrl, { signal: AbortSignal.timeout(ms) })
}

function safeFloat(v: string | null | undefined, fallback = 0): number {
  if (v == null) return fallback
  const n = parseFloat(v)
  return isFinite(n) ? n : fallback
}

function mapDex(dexId: string): Dex {
  const id = dexId.toLowerCase()
  // Base
  if (id.includes('aerodrome') || id.includes('velodrome')) return 'aerodrome'
  if (id.includes('uniswap') && id.includes('v4')) return 'uniswap_v4'
  if (id.includes('uniswap')) return 'uniswap_v3'
  // BNB
  if (id.includes('pancakeswap') && id.includes('v2')) return 'pancakeswap_v2'
  if (id.includes('pancakeswap')) return 'pancakeswap_v3'
  // Solana
  if (id.includes('raydium')) return 'raydium'
  if (id.includes('orca') || id.includes('whirlpool')) return 'orca'
  if (id.includes('meteora')) return 'meteora'
  // Fallback: return normalized id
  return id
}

/** Extract token address from GeckoTerminal relationship id: "base_0x..." → "0x..." */
function relIdToAddress(id: string): string {
  const parts = id.split('_')
  // id format: "base_0xABC..." — skip the chain prefix
  return parts.length >= 2 ? parts.slice(1).join('_') : id
}

/**
 * Parse pool name to get base/quote symbols.
 * Format: "TOKEN0 / TOKEN1" or "TOKEN0 / TOKEN1 0.05%"
 */
function parsePoolName(name: string): { baseSymbol: string; quoteSymbol: string } {
  const [baseRaw = '', quoteRaw = ''] = name.split(' / ')
  // Strip trailing fee like "0.05%" or "0.3%"
  const quoteSymbol = quoteRaw.replace(/\s+\d+\.?\d*%$/, '').trim()
  return { baseSymbol: baseRaw.trim(), quoteSymbol }
}

function makeToken(
  symbol: string,
  address: string,
  logoUrl?: string | null,
  createdAt?: string
): Token {
  return {
    address,
    symbol,
    name:         symbol,
    decimals:     18,
    total_supply: '0',
    logo_url:     logoUrl ?? null,
    coingecko_id: null,
    is_verified:  false,
    created_at:   createdAt ?? new Date(0).toISOString(),
  }
}

/** Build a 12-point sparkline from 4 change percentages by interpolating between
 *  price-at-24h-ago, 6h-ago, 1h-ago, 5m-ago, and now. */
function buildSparklineFromChanges(
  price: number, c5m: number, c1h: number, c6h: number, c24h: number
): number[] {
  if (!price) return []
  // Derive historical prices: price_ago = price / (1 + change/100)
  // Guard against division by zero (change = -100%) and Infinity
  const safeDiv = (p: number, c: number) => {
    const d = 1 + c / 100
    if (d === 0 || !isFinite(d)) return p
    const r = p / d
    return isFinite(r) ? r : p
  }
  const p24 = safeDiv(price, c24h)
  const p6  = safeDiv(price, c6h)
  const p1  = safeDiv(price, c1h)
  const p5m = safeDiv(price, c5m)
  // 5 anchor points at relative time positions within 24h
  const anchors = [
    { t: 0,    p: p24 },  // 24h ago
    { t: 0.75, p: p6 },   // 6h ago  (18/24)
    { t: 0.96, p: p1 },   // 1h ago  (23/24)
    { t: 0.997, p: p5m }, // 5m ago
    { t: 1,    p: price }, // now
  ]
  // Interpolate to 12 evenly spaced points
  const out: number[] = []
  for (let i = 0; i < 12; i++) {
    const t = i / 11
    let j = 0
    while (j < anchors.length - 2 && anchors[j + 1].t < t) j++
    const a = anchors[j], b = anchors[j + 1]
    const frac = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t)
    out.push(a.p + (b.p - a.p) * frac)
  }
  return out
}

/**
 * Trending score fallback: used for pools NOT in GT's trending list.
 */
function calcTrendingScore(makers: number, change: number, txns: number): number {
  const makersScore = Math.log10(Math.max(makers, 1) + 1) * 100
  const changeBonus = change > 0 ? Math.min(change, 100) * 1.5 : 0
  const txnsScore   = Math.log10(Math.max(txns, 1)   + 1) * 30
  return Math.max(0, Math.round(makersScore + changeBonus + txnsScore))
}

function mapPool(p: GTPool, logos?: LogoMap): Pool | null {
  try {
    const a   = p.attributes
    const now = new Date().toISOString()

    const price = safeFloat(a.base_token_price_usd)
    if (!isFinite(price) || price <= 0) return null

    const { baseSymbol, quoteSymbol } = parsePoolName(a.name)
    const baseAddr  = relIdToAddress(p.relationships.base_token.data.id)
    const quoteAddr = relIdToAddress(p.relationships.quote_token.data.id)
    const dexId     = p.relationships.dex.data.id

    const t = a.transactions

    // txns per window
    const txns5m  = (t.m5.buys  + t.m5.sells)
    const txns1h  = (t.h1.buys  + t.h1.sells)
    const txns6h  = (t.h6.buys  + t.h6.sells)
    const txns24h = (t.h24.buys + t.h24.sells)

    // makers = unique wallets (buyers + sellers, best proxy from GT)
    const makers5m  = (t.m5.buyers  + t.m5.sellers)
    const makers1h  = (t.h1.buyers  + t.h1.sellers)
    const makers6h  = (t.h6.buyers  + t.h6.sellers)
    const makers24h = (t.h24.buyers + t.h24.sellers)

    const change5m  = safeFloat(a.price_change_percentage.m5)
    const change1h  = safeFloat(a.price_change_percentage.h1)
    const change6h  = safeFloat(a.price_change_percentage.h6)
    const change24h = safeFloat(a.price_change_percentage.h24)

    const trending5m  = calcTrendingScore(makers5m,  change5m,  txns5m)
    const trending1h  = calcTrendingScore(makers1h,  change1h,  txns1h)
    const trending6h  = calcTrendingScore(makers6h,  change6h,  txns6h)
    const trending24h = calcTrendingScore(makers24h, change24h, txns24h)

    const createdAt = a.pool_created_at ?? now

    return {
      address:        a.address,
      dex:            mapDex(dexId),
      fee_tier:       null,
      price_usd:      price,
      liquidity_usd:  safeFloat(a.reserve_in_usd),

      volume_5m:      safeFloat(a.volume_usd.m5),
      volume_1h:      safeFloat(a.volume_usd.h1),
      volume_6h:      safeFloat(a.volume_usd.h6),
      volume_24h:     safeFloat(a.volume_usd.h24),

      txns_5m: txns5m,   txns_1h: txns1h,   txns_6h: txns6h,   txns_24h: txns24h,
      buys_5m:  t.m5.buys,  buys_1h:  t.h1.buys,  buys_6h:  t.h6.buys,  buys_24h:  t.h24.buys,
      sells_5m: t.m5.sells, sells_1h: t.h1.sells, sells_6h: t.h6.sells, sells_24h: t.h24.sells,
      buyers_5m:  t.m5.buyers,  buyers_1h:  t.h1.buyers,  buyers_6h:  t.h6.buyers,  buyers_24h:  t.h24.buyers,
      sellers_5m: t.m5.sellers, sellers_1h: t.h1.sellers, sellers_6h: t.h6.sellers, sellers_24h: t.h24.sellers,

      makers_5m: makers5m, makers_1h: makers1h, makers_6h: makers6h, makers_24h: makers24h,

      change_5m: change5m, change_1h: change1h, change_6h: change6h, change_24h: change24h,

      trending_score: trending6h,
      trending_5m:    trending5m,
      trending_1h:    trending1h,
      trending_6h:    trending6h,
      trending_24h:   trending24h,

      holder_count:   0,
      created_at:     createdAt,
      updated_at:     now,

      token0: makeToken(baseSymbol,  baseAddr,  logos?.get(p.relationships.base_token.data.id) ?? null, createdAt),
      token1: makeToken(quoteSymbol, quoteAddr, logos?.get(p.relationships.quote_token.data.id) ?? null, createdAt),

      mcap_usd:       safeFloat(a.market_cap_usd) || safeFloat(a.fdv_usd),
      sparkline_data: buildSparklineFromChanges(price, change5m, change1h, change6h, change24h),
    }
  } catch (err) {
    console.error('[GeckoTerminal] mapPool error:', p.id, err)
    return null
  }
}

// ─── Fetch helpers ────────────────────────────────────────────

/** Map from "base_0xABC..." → image_url */
type LogoMap = Map<string, string>

function parseGTResponse(data: GTResponse): { pools: GTPool[]; logos: LogoMap } {
  const logos: LogoMap = new Map()
  if (Array.isArray(data?.included)) {
    for (const t of data.included) {
      if (t.type === 'token' && t.attributes?.image_url) {
        logos.set(t.id, t.attributes.image_url)
      }
    }
  }
  return { pools: Array.isArray(data?.data) ? data.data : [], logos }
}

/** Fetch all GT URLs in one server-side batch (rate-limited on server) */
async function fetchGTBatch(urls: string[]): Promise<{ pools: GTPool[]; logos: LogoMap }[]> {
  // Add include param to each URL
  const fullUrls = urls.map(url => {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}include=base_token,quote_token`
  })

  try {
    const res = await fetch('/api/gt/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: fullUrls }),
    })
    if (!res.ok) {
      console.warn('[GT] batch error:', res.status)
      return fullUrls.map(() => ({ pools: [], logos: new Map() }))
    }
    const { results } = await res.json() as {
      results: { status: number; data: GTResponse }[]
    }
    return results.map(r =>
      r.status === 200 ? parseGTResponse(r.data) : { pools: [], logos: new Map() }
    )
  } catch (err) {
    console.warn('[GT] batch fetch error:', err)
    return fullUrls.map(() => ({ pools: [], logos: new Map() }))
  }
}

// ─── In-memory cache with stale-while-revalidate ─────────────

interface ChainCache { pools: Pool[]; ts: number; refreshing: boolean }
const _cacheByChain = new Map<ChainSlug, ChainCache>()
const CACHE_FRESH_TTL = 30_000  // 30s — serve instantly
const CACHE_STALE_TTL = 120_000 // 2min — serve stale, refresh in bg

function _getCache(chain: ChainSlug): ChainCache {
  let c = _cacheByChain.get(chain)
  if (!c) { c = { pools: [], ts: 0, refreshing: false }; _cacheByChain.set(chain, c) }
  return c
}

// ─── Main export ──────────────────────────────────────────────

const TRENDING_WINDOWS = ['5m', '1h', '6h', '24h'] as const

/**
 * Build GT API URLs. Strategy:
 * - Indexes 0-3: trending per time window (5m, 1h, 6h, 24h) — matches GT website sorting
 * - Index 4: trending (no duration) — fallback for chains where duration params return 0
 * - Indexes 5-7: new_pools (3 pages — broader coverage for New Pairs page)
 * - Indexes 8-9: pools by volume (broadest coverage)
 */
function buildGTUrls(chain: ChainSlug): string[] {
  const network = getChain(chain).geckoTerminalSlug
  return [
    `${GT_BASE}/networks/${network}/trending_pools?duration=5m`,
    `${GT_BASE}/networks/${network}/trending_pools?duration=1h`,
    `${GT_BASE}/networks/${network}/trending_pools?duration=6h`,
    `${GT_BASE}/networks/${network}/trending_pools?duration=24h`,
    `${GT_BASE}/networks/${network}/trending_pools`,
    `${GT_BASE}/networks/${network}/new_pools?page=1`,
    `${GT_BASE}/networks/${network}/new_pools?page=2`,
    `${GT_BASE}/networks/${network}/new_pools?page=3`,
    `${GT_BASE}/networks/${network}/pools?sort=h24_volume_usd_desc&page=1`,
    `${GT_BASE}/networks/${network}/pools?sort=h24_volume_usd_desc&page=2`,
  ]
}

async function fetchPoolsFromGT(chain: ChainSlug = DEFAULT_CHAIN, retries = 1): Promise<Pool[]> {
  // Single batch request — server handles rate limiting
  const results = await fetchGTBatch(buildGTUrls(chain))

  // Helper: build rank map from GT pool list
  const buildRankMap = (pools: GTPool[]) => {
    const m = new Map<string, number>()
    pools.forEach((p, i) => m.set(p.attributes.address, pools.length - i))
    return m
  }

  // Build fallback chain: no-duration (index 4) → 24h (index 3)
  const noDurPools = results[4]?.pools ?? []
  const h24Pools   = results[3]?.pools ?? []
  const fallbackRank = noDurPools.length > 0
    ? buildRankMap(noDurPools)
    : h24Pools.length > 0
      ? buildRankMap(h24Pools)
      : new Map<string, number>()

  // Build trending rank per time window from GT's order (first 4 results)
  // Fall back for chains where specific durations return 0 (BNB 6h, Solana 5m/1h/6h)
  const trendingRanks = TRENDING_WINDOWS.map((_, wi) => {
    const pools = results[wi]?.pools ?? []
    if (pools.length > 0) return buildRankMap(pools)
    return fallbackRank
  })

  const allLogos: LogoMap = new Map()
  for (const r of results) {
    for (const [k, v] of r.logos) allLogos.set(k, v)
  }

  const raw = results.flatMap(r => r.pools)
  const seen = new Set<string>()
  const pools = raw
    .filter(p => {
      const addr = p.attributes?.address
      if (!addr || seen.has(addr)) return false
      seen.add(addr)
      return true
    })
    .map(p => mapPool(p, allLogos))
    .filter((p): p is Pool => p !== null)

  // Override trending scores with GT's actual trending order per window
  for (const pool of pools) {
    TRENDING_WINDOWS.forEach((w, wi) => {
      const rank = trendingRanks[wi].get(pool.address)
      if (rank !== undefined) {
        const score = 10000 + rank * 100
        ;(pool as any)[`trending_${w}`] = score
      }
    })
    // Default trending_score uses 6h window
    const rank6h = trendingRanks[2].get(pool.address)
    if (rank6h !== undefined) {
      pool.trending_score = 10000 + rank6h * 100
    }
  }

  // Retry once if GT returned empty (transient 429 / rate limit)
  if (pools.length === 0 && retries > 0) {
    await new Promise(r => setTimeout(r, 2000))
    return fetchPoolsFromGT(chain, retries - 1)
  }

  return pools
}

export async function fetchDexScreenerClient(chain: ChainSlug = DEFAULT_CHAIN): Promise<Pool[]> {
  const cc = _getCache(chain)
  const age = Date.now() - cc.ts

  // Fresh cache — return instantly
  if (cc.pools.length > 0 && age < CACHE_FRESH_TTL) {
    return cc.pools
  }

  // Stale cache — return instantly but kick off background refresh
  if (cc.pools.length > 0 && age < CACHE_STALE_TTL) {
    if (!cc.refreshing) {
      cc.refreshing = true
      fetchPoolsFromGT(chain)
        .then(pools => {
          if (pools.length > 0) {
            cc.pools = pools
            cc.ts = Date.now()
          }
        })
        .catch(() => {})
        .finally(() => { cc.refreshing = false })
    }
    return cc.pools
  }

  // No cache or hard-expired — block and wait
  const pools = await fetchPoolsFromGT(chain)

  if (pools.length > 0) {
    cc.pools = pools
    cc.ts = Date.now()
  }

  return pools.length > 0 ? pools : cc.pools
}

// ─── SWR fetcher ──────────────────────────────────────────────

/** SWR fetcher. Key format: 'pairs:{chain}' e.g. 'pairs:base' or 'pairs:all' */
export async function pairsFetcher(key: string): Promise<PairsResponse> {
  const chainStr = key.split(':')[1] || DEFAULT_CHAIN

  // "All Chains" mode — fetch all supported chains in parallel and merge
  if (chainStr === 'all') {
    const allPools = await Promise.all(
      SUPPORTED_CHAINS.map(c =>
        fetchDexScreenerClient(c).then(pools =>
          pools.map(p => ({ ...p, _chain: c as string }))
        )
      )
    )
    const merged = allPools.flat()
    const sorted = merged.sort((a, b) => b.trending_score - a.trending_score)
    return { pairs: sorted, total: sorted.length, limit: sorted.length, offset: 0 }
  }

  const chain = chainStr as ChainSlug
  const pools = await fetchDexScreenerClient(chain)
  // Throw on empty so SWR retries instead of caching empty result as valid data
  if (pools.length === 0) {
    throw new Error(`No pools returned for ${chain} — possible rate limiting`)
  }
  const sorted = [...pools].sort((a, b) => b.trending_score - a.trending_score)
  return { pairs: sorted, total: sorted.length, limit: sorted.length, offset: 0 }
}

// ─── Extended pool data for detail page ──────────────────

export interface PoolExtended {
  base_token_price_native: number
  quote_token_price_usd: number
  locked_liquidity_pct: number | null
  fdv_usd: number
}

// ─── Batch token logo lookup (GT) ─────────────────────────────

const _tokenLogoCache = new Map<string, string | null>()

/** Fetch logos for multiple tokens in one batch call via GT /tokens/{addr}/info */
export async function fetchTokenLogos(
  tokenAddresses: string[],
  chain: ChainSlug = DEFAULT_CHAIN,
): Promise<Map<string, string>> {
  const network = getChain(chain).geckoTerminalSlug
  const isEvm = getChain(chain).chainType === 'evm'
  const result = new Map<string, string>()

  // Filter out already-cached and deduplicate
  const toFetch: string[] = []
  for (const addr of tokenAddresses) {
    if (!addr) continue
    const key = `${chain}:${isEvm ? addr.toLowerCase() : addr}`
    const cached = _tokenLogoCache.get(key)
    if (cached !== undefined) {
      if (cached) result.set(addr, cached)
      continue
    }
    toFetch.push(addr)
  }

  if (toFetch.length === 0) return result

  // Batch via /api/gt/batch — max ~6 at a time to avoid GT rate limits
  const urls = toFetch.slice(0, 6).map(addr =>
    `${GT_BASE}/networks/${network}/tokens/${addr}/info`
  )

  try {
    const batchRes = await fetch('/api/gt/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!batchRes.ok) return result
    const { results } = await batchRes.json() as { results: { status: number; data: any }[] }

    for (let i = 0; i < toFetch.length && i < results.length; i++) {
      const addr = toFetch[i]
      const key = `${chain}:${isEvm ? addr.toLowerCase() : addr}`
      const r = results[i]
      const imgUrl = r?.status === 200 ? (r.data?.data?.attributes?.image_url || null) : null
      _tokenLogoCache.set(key, imgUrl)
      if (imgUrl) result.set(addr, imgUrl)
    }
  } catch (e) {
    console.error('[fetchTokenLogos] error:', e)
  }

  return result
}

// ─── Token info (social links, description) ──────────────

export interface TokenInfo {
  image_url: string | null
  websites: string[]
  twitter_handle: string | null
  telegram_handle: string | null
  discord_url: string | null
  description: string | null
}

const _tokenInfoCache = new Map<string, { data: TokenInfo; ts: number }>()
const TOKEN_INFO_CACHE_TTL = 300_000 // 5min — social links rarely change

export async function fetchTokenInfo(tokenAddress: string, chain: ChainSlug = DEFAULT_CHAIN): Promise<TokenInfo | null> {
  const isEvm = getChain(chain).chainType === 'evm'
  const cacheKey = `${chain}:${isEvm ? tokenAddress.toLowerCase() : tokenAddress}`
  const cached = _tokenInfoCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < TOKEN_INFO_CACHE_TTL) return cached.data

  try {
    const network = getChain(chain).geckoTerminalSlug
    const url = `${GT_BASE}/networks/${network}/tokens/${tokenAddress}/info`
    const batchRes = await fetch('/api/gt/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [url] }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!batchRes.ok) return null
    const { results } = await batchRes.json() as { results: { status: number; data: any }[] }
    const r = results?.[0]
    if (!r || r.status !== 200) return null

    const a = r.data?.data?.attributes
    if (!a) return null

    const info: TokenInfo = {
      image_url:        a.image_url || null,
      websites:         Array.isArray(a.websites) ? a.websites : [],
      twitter_handle:   a.twitter_handle || null,
      telegram_handle:  a.telegram_handle || null,
      discord_url:      a.discord_url || null,
      description:      a.description || null,
    }
    _tokenInfoCache.set(cacheKey, { data: info, ts: Date.now() })
    return info
  } catch (e) {
    console.error('[fetchTokenInfo] error:', e)
    return null
  }
}

// ─── Single pair lookup ───────────────────────────────────────

export interface GTTrade {
  id: string
  tx_hash: string
  timestamp: string
  is_buy: boolean
  amount_usd: number
  amount0: number
  amount1: number
  price_usd: number
  sender: string | null
}

export async function fetchPoolTrades(address: string, chain: ChainSlug = DEFAULT_CHAIN, beforeTimestamp?: string): Promise<GTTrade[]> {
  try {
    const network = getChain(chain).geckoTerminalSlug
    let url = `${GT_BASE}/networks/${network}/pools/${address}/trades?trade_volume_in_usd_greater_than=0`
    if (beforeTimestamp) {
      url += `&before_timestamp=${encodeURIComponent(beforeTimestamp)}`
    }

    // Try direct GT API first (fast, no server proxy), fallback to batch proxy
    let data: any = null
    try {
      const directRes = await fetch(url, {
        headers: { Accept: 'application/json;version=20230302' },
        signal: AbortSignal.timeout(5_000),
      })
      if (directRes.ok) data = await directRes.json()
    } catch {}

    if (!data) {
      const batchRes = await fetch('/api/gt/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [url] }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      })
      if (!batchRes.ok) return []
      const { results } = await batchRes.json() as { results: { status: number; data: any }[] }
      const r = results?.[0]
      if (!r || r.status !== 200) return []
      data = r.data
    }

    if (!Array.isArray(data?.data)) return []

    return data.data.map((t: any) => {
      const a = t.attributes
      const isBuy = a.kind === 'buy'
      return {
        id: t.id,
        tx_hash: a.tx_hash,
        timestamp: a.block_timestamp,
        is_buy: isBuy,
        amount_usd: safeFloat(a.volume_in_usd),
        amount0: safeFloat(isBuy ? a.to_token_amount : a.from_token_amount),
        amount1: safeFloat(isBuy ? a.from_token_amount : a.to_token_amount),
        price_usd: safeFloat(isBuy ? a.price_to_in_usd : a.price_from_in_usd),
        sender: a.tx_from_address ?? null,
      }
    })
  } catch (e) {
    console.error('[fetchPoolTrades] error:', e)
    return []
  }
}

// ─── Search pools ────────────────────────────────────────────

export async function searchPools(query: string, chain: ChainSlug = DEFAULT_CHAIN): Promise<Pool[]> {
  if (!query.trim()) return []
  try {
    const network = getChain(chain).geckoTerminalSlug
    const url = `${GT_BASE}/search/pools?query=${encodeURIComponent(query)}&network=${network}&include=base_token,quote_token&page=1`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return []
    const data = await res.json()
    const { pools: rawPools, logos } = parseGTResponse(data)
    return rawPools.map(p => mapPool(p, logos)).filter((p): p is Pool => p !== null)
  } catch (e) {
    console.error('[searchPools] error:', e)
    return []
  }
}

// ─── Pools by token address ──────────────────────────────────

export async function fetchPoolsByToken(tokenAddress: string, chain: ChainSlug = DEFAULT_CHAIN): Promise<Pool[]> {
  if (!tokenAddress) return []
  try {
    const network = getChain(chain).geckoTerminalSlug
    const url = `${GT_BASE}/networks/${network}/tokens/${tokenAddress}/pools?include=base_token,quote_token&page=1`
    const res = await fetchWithTimeout(url)
    if (!res.ok) return []
    const data = await res.json()
    const { pools: rawPools, logos } = parseGTResponse(data)
    return rawPools.map(p => mapPool(p, logos)).filter((p): p is Pool => p !== null)
  } catch (e) {
    console.error('[fetchPoolsByToken] error:', e)
    return []
  }
}

// ─── Get cached pools (for search modal "recently updated") ──

export function getCachedPools(chain: string = DEFAULT_CHAIN): Pool[] {
  if (chain === 'all') {
    return SUPPORTED_CHAINS.flatMap(c =>
      _getCache(c).pools.map(p => ({ ...p, _chain: p._chain || c }))
    )
  }
  return _getCache(chain as ChainSlug).pools
}

// ─── Token logo lookup from GT cache (consistent with pair page) ──

export function getTokenLogoFromCache(tokenAddress: string, chain: ChainSlug = DEFAULT_CHAIN): string | null {
  if (!tokenAddress) return null
  const addrLower = tokenAddress.toLowerCase()
  const pools = _getCache(chain).pools
  for (const p of pools) {
    if (p.token0.address.toLowerCase() === addrLower && p.token0.logo_url) return p.token0.logo_url
    if (p.token1.address.toLowerCase() === addrLower && p.token1.logo_url) return p.token1.logo_url
  }
  return null
}

// ─── Instant detail lookup from list/detail cache (no network) ──

export function getPoolFromCache(address: string, chain: ChainSlug = DEFAULT_CHAIN): (Pool & PoolExtended & { recent_swaps: GTTrade[] }) | null {
  const isEvm = getChain(chain).chainType === 'evm'
  const addrKey = isEvm ? address.toLowerCase() : address
  const cacheKey = `${chain}:${addrKey}`
  const detail = _detailCache.get(cacheKey)
  if (detail) return detail.data
  return _poolFromList(addrKey, chain)
}

// ─── Per-address detail cache ──────────────────────────────
// Avoids redundant GT API calls when revisiting detail pages
const _detailCache = new Map<string, { data: Pool & PoolExtended & { recent_swaps: GTTrade[] }; ts: number }>()
const DETAIL_CACHE_TTL = 60_000 // 60s

/** Seed the detail cache with a Pool from fetchPoolsByToken — avoids a redundant GT call */
export function seedDetailCache(pool: Pool, chain: ChainSlug = DEFAULT_CHAIN): void {
  const isEvm = getChain(chain).chainType === 'evm'
  const addrKey = isEvm ? pool.address.toLowerCase() : pool.address
  const cacheKey = `${chain}:${addrKey}`
  if (_detailCache.has(cacheKey)) return // don't overwrite richer data
  _detailCache.set(cacheKey, {
    data: {
      ...pool,
      base_token_price_native: 0,
      quote_token_price_usd: 0,
      locked_liquidity_pct: null as number | null,
      fdv_usd: pool.mcap_usd,
      recent_swaps: [] as never[],
    },
    ts: Date.now(),
  })
}

// ─── Single pair lookup ───────────────────────────────────────

function _poolFromList(addr: string, chain: ChainSlug = DEFAULT_CHAIN): (Pool & PoolExtended & { recent_swaps: GTTrade[] }) | null {
  const isEvm = getChain(chain).chainType === 'evm'
  const fromList = _getCache(chain).pools.find(p => isEvm ? p.address.toLowerCase() === addr : p.address === addr)
  if (!fromList) return null
  return {
    ...fromList,
    base_token_price_native: 0,
    quote_token_price_usd: 0,
    locked_liquidity_pct: null as number | null,
    fdv_usd: fromList.mcap_usd,
    recent_swaps: [] as never[],
  }
}

export async function fetchPairByAddress(
  address: string,
  chain: ChainSlug = DEFAULT_CHAIN
): Promise<(Pool & PoolExtended & { recent_swaps: GTTrade[] }) | null> {
  const isEvm = getChain(chain).chainType === 'evm'
  const addrKey = isEvm ? address.toLowerCase() : address
  const cacheKey = `${chain}:${addrKey}`

  // 1. Check per-address detail cache (avoids redundant API calls)
  const cached = _detailCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < DETAIL_CACHE_TTL) {
    return cached.data
  }

  // 2. Fetch from GT API (always await — ensures extended fields like native price are real)
  const result = await _fetchAndCacheDetail(address, cacheKey, chain)
  if (result) return result

  // 3. Not a pool address — try as token address (find its top pool)
  const tokenPools = await fetchPoolsByToken(address, chain)
  if (tokenPools.length > 0) {
    const topPoolAddr = tokenPools[0].address
    const topCacheKey = `${chain}:${isEvm ? topPoolAddr.toLowerCase() : topPoolAddr}`
    const tokenResult = await _fetchAndCacheDetail(topPoolAddr, topCacheKey, chain)
    if (tokenResult) return tokenResult
  }

  // 4. API failed — use list cache as fallback (extended fields will be 0)
  // Kick off background fetch so the detail cache is populated for next SWR refresh
  const fallback = _poolFromList(addrKey, chain)
  if (fallback) {
    _fetchAndCacheDetail(address, cacheKey, chain).catch(() => {})
  }
  return fallback
}

async function _fetchAndCacheDetail(
  address: string,
  cacheKey: string,
  chain: ChainSlug = DEFAULT_CHAIN,
): Promise<(Pool & PoolExtended & { recent_swaps: GTTrade[] }) | null> {
  try {
    const network = getChain(chain).geckoTerminalSlug
    const poolUrl = `${GT_BASE}/networks/${network}/pools/${address}?include=base_token,quote_token`
    const tradesUrl = `${GT_BASE}/networks/${network}/pools/${address}/trades?trade_volume_in_usd_greater_than=0`

    // Fetch pool + trades in ONE batch call — avoids coalesce delay + rate-limit contention
    const batchRes = await fetch('/api/gt/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [poolUrl, tradesUrl] }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!batchRes.ok) return null
    const { results } = await batchRes.json() as { results: { status: number; data: any }[] }

    // --- Parse pool data (index 0) ---
    const poolR = results?.[0]
    if (!poolR || poolR.status !== 200) return null

    const data = poolR.data
    // Single pool endpoint returns data as object, not array
    const raw = data?.data as GTPool | undefined
    if (!raw) return null

    const logos: LogoMap = new Map()
    if (Array.isArray(data?.included)) {
      for (const t of data.included as GTIncludedToken[]) {
        if (t.type === 'token' && t.attributes?.image_url) {
          logos.set(t.id, t.attributes.image_url)
        }
      }
    }
    const pool = mapPool(raw, logos)
    if (!pool) return null

    const a = raw.attributes
    const result = {
      ...pool,
      base_token_price_native: safeFloat(a.base_token_price_native_currency),
      quote_token_price_usd:   safeFloat(a.quote_token_price_usd),
      locked_liquidity_pct:    a.locked_liquidity_percentage != null ? safeFloat(a.locked_liquidity_percentage) : null,
      fdv_usd:                 safeFloat(a.fdv_usd),
      recent_swaps: [] as GTTrade[],
    }

    // --- Parse trades (index 1) and include in result ---
    const tradesR = results?.[1]
    if (tradesR?.status === 200 && Array.isArray(tradesR.data?.data)) {
      result.recent_swaps = tradesR.data.data.map((t: any) => {
        const ta = t.attributes
        const isBuy = ta.kind === 'buy'
        return {
          id: t.id,
          tx_hash: ta.tx_hash,
          timestamp: ta.block_timestamp,
          is_buy: isBuy,
          amount_usd: safeFloat(ta.volume_in_usd),
          amount0: safeFloat(isBuy ? ta.to_token_amount : ta.from_token_amount),
          amount1: safeFloat(isBuy ? ta.from_token_amount : ta.to_token_amount),
          price_usd: safeFloat(isBuy ? ta.price_to_in_usd : ta.price_from_in_usd),
          sender: ta.tx_from_address ?? null,
        }
      })
    }

    // Cache for subsequent visits
    _detailCache.set(cacheKey, { data: result, ts: Date.now() })
    return result
  } catch (e) {
    console.error('[fetchPairByAddress] error:', e)
    return null
  }
}
