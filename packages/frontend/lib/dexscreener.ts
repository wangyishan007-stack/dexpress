/**
 * DexScreener API client + Pool type mapper
 * Endpoint: https://api.dexscreener.com/latest/dex/pairs/{chain}
 */

import type { Pool, Token, Dex } from '@dex/shared'

// ─── DexScreener raw types ────────────────────────────────────

interface DSToken {
  address: string
  name: string
  symbol: string
}

interface DSPair {
  chainId:     string
  dexId:       string
  url:         string
  pairAddress: string
  baseToken:   DSToken
  quoteToken:  DSToken
  priceNative: string
  priceUsd?:   string
  txns: {
    m5:  { buys: number; sells: number }
    h1:  { buys: number; sells: number }
    h6:  { buys: number; sells: number }
    h24: { buys: number; sells: number }
  }
  volume: {
    m5:  number
    h1:  number
    h6:  number
    h24: number
  }
  priceChange: {
    m5:  number
    h1:  number
    h6:  number
    h24: number
  }
  liquidity?: { usd: number; base: number; quote: number }
  fdv?:        number
  marketCap?:  number
  pairCreatedAt?: number   // epoch ms
  info?: {
    imageUrl?:  string
    websites?:  { url: string }[]
    socials?:   { type: string; url: string }[]
  }
  boosts?: { active: number }
}

interface DSResponse {
  schemaVersion: string
  pairs: DSPair[] | null
}

// ─── Helpers ─────────────────────────────────────────────────

function mapDex(dexId: string): Dex {
  const id = dexId.toLowerCase()
  if (id.includes('aerodrome') || id.includes('velodrome')) return 'aerodrome'
  if (id.includes('v4')) return 'uniswap_v4'
  return 'uniswap_v3'
}

function makeToken(t: DSToken, logoUrl?: string | null, createdAt?: string): Token {
  return {
    address:      t.address,
    symbol:       t.symbol,
    name:         t.name,
    decimals:     18,
    total_supply: '0',
    logo_url:     logoUrl ?? null,
    coingecko_id: null,
    is_verified:  false,
    created_at:   createdAt ?? new Date(0).toISOString(),
  }
}

/**
 * Rough trending score based on volume + price change + tx count.
 * Range approximates mock data (0–1000).
 */
function calcTrendingScore(vol24h: number, change24h: number, txns24h: number): number {
  const volScore    = Math.log10(Math.max(vol24h, 1)) * 40
  const changeBonus = Math.abs(change24h) * 2
  const txnsBonus   = Math.log10(Math.max(txns24h, 1)) * 20
  return Math.max(0, Math.round(volScore + changeBonus + txnsBonus))
}

// ─── Known top Base chain tokens for bootstrapping ───────────

const BASE_TOP_TOKENS = [
  '0x532f27101965dd16442E59d40670FaF5eBB142E4', // BRETT
  '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', // DEGEN
  '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', // VIRTUAL
  '0x940181a94A35A4569E4529A3CDfB74e38FD98631', // AERO
  '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4', // TOSHI
  '0x0578d8A44db98B23BF096A382e016e29a5Ce0ffe', // HIGHER
  '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842', // NORMIE
  '0x6921B130D297cc43754afba22e5EAc0FBf8Db75b', // DOGINME
  '0x9a26F5433671751C3276a065f57e5a02D2817973', // KEYCAT
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  '0x4200000000000000000000000000000000000006', // WETH
  '0x1C7a460413dD4e964f96D8dFC56E7223cE88CD85', // SEAM
  '0xA88594D404727625A9437C3f886C7643872296AE', // WELL
  '0x78a087d713Be963Bf307b18F2Ff8122EF9A63ae9', // BSWAP
  '0xF6e932Ca12afa26665dC4dDE7e27be02A7c02e50', // MOCHI
]

// ─── Main fetch function ──────────────────────────────────────

export async function fetchDexScreenerPairs(chain = 'base'): Promise<Pool[]> {
  // Use tokens endpoint with known Base tokens (max 30 addresses per call)
  const tokenAddrs = BASE_TOP_TOKENS.join(',')
  const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddrs}`

  console.log('[DexScreener] Fetching:', url)

  let res: Response
  try {
    res = await fetch(url, {
      cache: 'no-store',  // disable Next.js cache for debugging
      headers: { 
        'Accept': 'application/json',
      },
    })
    console.log('[DexScreener] Response status:', res.status)
  } catch (err) {
    console.error('[DexScreener] fetch failed:', err)
    return []
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error(`[DexScreener] API error: ${res.status} ${res.statusText}`, text.slice(0, 500))
    return []
  }

  let data: DSResponse
  try {
    const text = await res.text()
    console.log('[DexScreener] Response length:', text.length)
    data = JSON.parse(text)
  } catch (err) {
    console.error('[DexScreener] JSON parse error:', err)
    return []
  }

  // Defensive: ensure pairs is an array
  const rawPairs = data?.pairs
  console.log('[DexScreener] pairs type:', typeof rawPairs, 'isArray:', Array.isArray(rawPairs), 'length:', rawPairs?.length)
  
  if (!Array.isArray(rawPairs)) {
    console.warn('[DexScreener] pairs is not an array, data keys:', Object.keys(data || {}))
    return []
  }

  // Filter to only include pairs from Base chain + dedupe by pairAddress
  const seen = new Set<string>()
  const pairs = rawPairs.filter(p => {
    if (p.chainId !== chain) return false
    if (seen.has(p.pairAddress)) return false
    seen.add(p.pairAddress)
    return true
  })
  console.log('[DexScreener] Filtered pairs for chain', chain, ':', pairs.length)
  
  const now = new Date().toISOString()

  return pairs
    .filter(p => p.priceUsd && parseFloat(p.priceUsd) > 0)
    .map((p): Pool => {
      const buys5m    = p.txns.m5.buys   ?? 0
      const sells5m   = p.txns.m5.sells  ?? 0
      const buys1h    = p.txns.h1.buys   ?? 0
      const sells1h   = p.txns.h1.sells  ?? 0
      const buys6h    = p.txns.h6.buys   ?? 0
      const sells6h   = p.txns.h6.sells  ?? 0
      const buys24h   = p.txns.h24.buys  ?? 0
      const sells24h  = p.txns.h24.sells ?? 0

      const txns5m    = buys5m  + sells5m
      const txns1h    = buys1h  + sells1h
      const txns6h    = buys6h  + sells6h
      const txns24h   = buys24h + sells24h

      const vol24h    = p.volume?.h24    ?? 0
      const change24h = p.priceChange?.h24 ?? 0
      const tScore    = calcTrendingScore(vol24h, change24h, txns24h)

      const createdAt = p.pairCreatedAt
        ? new Date(p.pairCreatedAt).toISOString()
        : now

      const logoUrl = p.info?.imageUrl ?? null

      return {
        address:        p.pairAddress,
        dex:            mapDex(p.dexId),
        fee_tier:       null,
        price_usd:      parseFloat(p.priceUsd!),
        liquidity_usd:  p.liquidity?.usd ?? 0,

        volume_5m:      p.volume?.m5  ?? 0,
        volume_1h:      p.volume?.h1  ?? 0,
        volume_6h:      p.volume?.h6  ?? 0,
        volume_24h:     vol24h,

        txns_5m:        txns5m,
        txns_1h:        txns1h,
        txns_6h:        txns6h,
        txns_24h:       txns24h,

        buys_5m:        buys5m,
        buys_1h:        buys1h,
        buys_6h:        buys6h,
        buys_24h:       buys24h,

        sells_5m:       sells5m,
        sells_1h:       sells1h,
        sells_6h:       sells6h,
        sells_24h:      sells24h,

        // DexScreener doesn't expose unique maker counts
        makers_5m:      0,
        makers_1h:      0,
        makers_6h:      0,
        makers_24h:     0,

        change_5m:      p.priceChange?.m5  ?? 0,
        change_1h:      p.priceChange?.h1  ?? 0,
        change_6h:      p.priceChange?.h6  ?? 0,
        change_24h:     change24h,

        trending_score: tScore,
        trending_5m:    tScore,
        trending_1h:    tScore,
        trending_6h:    tScore,
        trending_24h:   tScore,

        holder_count:   0,
        created_at:     createdAt,
        updated_at:     now,

        // token0 = quote (e.g. WETH/USDC), token1 = base (the traded token)
        token0: makeToken(p.quoteToken, null,    createdAt),
        token1: makeToken(p.baseToken,  logoUrl, createdAt),

        mcap_usd:       p.marketCap ?? p.fdv ?? 0,
        sparkline_data: [],
      }
    })
}
