import type { Pool, PairsResponse } from '@dex/shared'
import type { PairsQuery } from '@dex/shared'
import { MOCK_POOLS, MOCK_STATS, buildSwapsForPool } from './mockData'
import { fetchDexScreenerPairs } from './dexscreener'
import { fetchPairByAddress, fetchDexScreenerClient } from './dexscreener-client'
import type { ChainSlug } from './chains'
import type { Stats } from '../hooks/useStats'
import type { FilterValues, TextFilterValues } from '../components/FiltersModal'

const USE_MOCK = false

const PAGE_SIZE = 50

// Map filter keys to Pool field names
const FILTER_KEY_MAP: Record<string, string> = {
  liquidity: 'liquidity_usd',
  mcap: 'mcap_usd',
  fdv: '_fdv', // computed in applyCustomFilters
}

function sortPools(pools: Pool[], sort: string, order: 'asc' | 'desc'): Pool[] {
  return [...pools].sort((a, b) => {
    const aVal = (a as any)[sort] ?? 0
    const bVal = (b as any)[sort] ?? 0
    const aNum = typeof aVal === 'string' ? new Date(aVal).getTime() : Number(aVal)
    const bNum = typeof bVal === 'string' ? new Date(bVal).getTime() : Number(bVal)
    return order === 'desc' ? bNum - aNum : aNum - bNum
  })
}

function filterPools(pools: Pool[], filter?: string, sort?: string): Pool[] {
  if (!filter || filter === 'trending' || filter === 'top') return pools
  const dayAgo = Date.now() - 24 * 3600_000
  if (filter === 'new') {
    return pools.filter(p => new Date(p.created_at).getTime() > dayAgo)
  }
  const changeField = (sort?.startsWith('change_') ? sort : 'change_24h') as keyof Pool
  if (filter === 'gainers') {
    return pools.filter(p => ((p[changeField] as number) ?? 0) > 0)
  }
  if (filter === 'losers') {
    return pools.filter(p => ((p[changeField] as number) ?? 0) < 0)
  }
  return pools
}

function applyCustomFilters(pools: Pool[], customFilters?: FilterValues): Pool[] {
  if (!customFilters) return pools
  const now = Date.now()

  return pools.filter(pool => {
    for (const [key, { min, max }] of Object.entries(customFilters)) {
      if (min === '' && max === '') continue

      let value: number | undefined

      if (key === 'pair_age') {
        value = (now - new Date(pool.created_at).getTime()) / 3600_000
      } else if (key === 'fdv') {
        const base = pool.token0 ?? pool.token1
        const rawSupply = BigInt(base?.total_supply || '0')
        const totalSupply = Number(rawSupply) / Math.pow(10, base?.decimals ?? 18)
        value = totalSupply > 0 ? totalSupply * Number(pool.price_usd) : 0
      } else {
        const field = FILTER_KEY_MAP[key] ?? key
        value = (pool as any)[field]
      }

      // Treat missing fields as 0 so min filters reject them properly
      if (value === undefined || value === null) value = 0

      if (min !== '' && value < Number(min)) return false
      if (max !== '' && value > Number(max)) return false
    }
    return true
  })
}

export async function getPairs(params: PairsQuery & { customFilters?: FilterValues }, chain?: ChainSlug): Promise<PairsResponse> {
  let pools: Pool[]

  if (USE_MOCK) {
    pools = MOCK_POOLS
  } else {
    pools = await fetchDexScreenerClient(chain)
  }

  const filtered = filterPools(pools, params.filter, params.sort)
  const custom   = applyCustomFilters(filtered, params.customFilters)
  const sorted   = sortPools(custom, params.sort ?? 'trending_score', params.order ?? 'desc')
  const offset   = params.offset ?? 0
  const limit    = params.limit ?? PAGE_SIZE
  const sliced   = sorted.slice(offset, offset + limit)

  return {
    pairs:  sliced,
    total:  sorted.length,
    limit,
    offset,
  }
}

export async function getPair(address: string, chain?: ChainSlug): Promise<(Pool & { recent_swaps: any[] }) | null> {
  if (USE_MOCK) {
    const idx = MOCK_POOLS.findIndex(p => p.address === address)
    if (idx === -1) return null
    const pool = MOCK_POOLS[idx]
    return { ...pool, recent_swaps: buildSwapsForPool(idx, pool.price_usd) }
  }

  // Try cached GT pools first, then single pool lookup
  const pools = await fetchDexScreenerClient(chain)
  const cached = pools.find(p => p.address.toLowerCase() === address.toLowerCase())
  if (cached) return { ...cached, recent_swaps: [] }

  // Fallback: fetch single pool from GeckoTerminal
  const pool = await fetchPairByAddress(address, chain)
  if (!pool) return null
  return { ...pool, recent_swaps: [] }
}

export async function getStats(chain?: ChainSlug): Promise<Stats> {
  if (USE_MOCK) {
    return MOCK_STATS
  }

  // Derive stats from live GT data
  const pools = await fetchDexScreenerClient(chain)
  const volume_24h = pools.reduce((sum, p) => sum + p.volume_24h, 0)
  const txns_24h   = pools.reduce((sum, p) => sum + p.txns_24h,  0)

  return {
    volume_24h,
    txns_24h,
    latest_block: 0,
    block_ts:     new Date().toISOString(),
  }
}
