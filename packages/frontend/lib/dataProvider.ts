import type { Pool, PairsResponse } from '@dex/shared'
import type { PairsQuery } from '@dex/shared'
import { MOCK_POOLS, MOCK_STATS, buildSwapsForPool } from './mockData'
import type { Stats } from '../hooks/useStats'
import type { FilterValues, TextFilterValues } from '../components/FiltersModal'

const USE_MOCK = true

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

export function getPairs(params: PairsQuery & { customFilters?: FilterValues }): PairsResponse {
  if (!USE_MOCK) {
    throw new Error('API mode not implemented — set USE_MOCK = true')
  }

  const filtered = filterPools(MOCK_POOLS, params.filter)
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

export function getPair(address: string): (Pool & { recent_swaps: any[] }) | null {
  if (!USE_MOCK) {
    throw new Error('API mode not implemented — set USE_MOCK = true')
  }
  const idx = MOCK_POOLS.findIndex(p => p.address === address)
  if (idx === -1) return null
  const pool = MOCK_POOLS[idx]
  return { ...pool, recent_swaps: buildSwapsForPool(idx, pool.price_usd) }
}

export function getStats(): Stats {
  if (!USE_MOCK) {
    throw new Error('API mode not implemented — set USE_MOCK = true')
  }
  return MOCK_STATS
}
