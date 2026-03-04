import type { Pool, PairsResponse } from '@dex/shared'
import type { PairsQuery } from '@dex/shared'
import { MOCK_POOLS, MOCK_STATS, buildSwapsForPool } from './mockData'
import { fetchDexScreenerPairs } from './dexscreener'
import type { Stats } from '../hooks/useStats'
import type { FilterValues, TextFilterValues } from '../components/FiltersModal'

const USE_MOCK = false

const PAGE_SIZE = 50

// Map filter keys to Pool field names
const FILTER_KEY_MAP: Record<string, string> = {
  liquidity: 'liquidity_usd',
  mcap: 'mcap_usd',
  fdv: 'mcap_usd', // FDV approximated by mcap for mock data
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

function filterPools(pools: Pool[], filter?: string): Pool[] {
  if (!filter || filter === 'trending' || filter === 'top') return pools
  const now = Date.now()
  const dayAgo = now - 24 * 3600_000
  if (filter === 'new') {
    return pools.filter(p => new Date(p.created_at).getTime() > dayAgo)
  }
  if (filter === 'gainers') {
    return pools.filter(p => p.change_24h > 0)
  }
  if (filter === 'losers') {
    return pools.filter(p => p.change_24h < 0)
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

export async function getPairs(params: PairsQuery & { customFilters?: FilterValues }): Promise<PairsResponse> {
  let pools: Pool[]

  if (USE_MOCK) {
    pools = MOCK_POOLS
  } else {
    pools = await fetchDexScreenerPairs('base')
  }

  const filtered = filterPools(pools, params.filter)
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

export async function getPair(address: string): Promise<(Pool & { recent_swaps: any[] }) | null> {
  if (USE_MOCK) {
    const idx = MOCK_POOLS.findIndex(p => p.address === address)
    if (idx === -1) return null
    const pool = MOCK_POOLS[idx]
    return { ...pool, recent_swaps: buildSwapsForPool(idx, pool.price_usd) }
  }

  // In live mode: look up the pair from DexScreener by address
  const pools = await fetchDexScreenerPairs('base')
  const pool  = pools.find(p => p.address.toLowerCase() === address.toLowerCase())
  if (!pool) return null
  return { ...pool, recent_swaps: [] }
}

export async function getStats(): Promise<Stats> {
  if (USE_MOCK) {
    return MOCK_STATS
  }

  // Derive stats from live pair data
  const pools = await fetchDexScreenerPairs('base')
  const volume_24h = pools.reduce((sum, p) => sum + p.volume_24h, 0)
  const txns_24h   = pools.reduce((sum, p) => sum + p.txns_24h,  0)

  return {
    volume_24h,
    txns_24h,
    latest_block: 0,
    block_ts:     new Date().toISOString(),
  }
}
