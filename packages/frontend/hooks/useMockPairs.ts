'use client'

/**
 * useMockPairs — thin wrapper around usePairs that accepts
 * customFilters (applied client-side after fetch) so that
 * existing call-sites in page.tsx don't need to change.
 */

import { useMemo }           from 'react'
import type { PairsQuery, Pool } from '@dex/shared'
import { usePairs }          from './usePairs'
import type { FilterValues } from '../components/FiltersModal'

export { useLivePrices } from './usePairs'

const FILTER_KEY_MAP: Record<string, string> = {
  liquidity: 'liquidity_usd',
  mcap:      'mcap_usd',
  fdv:       'mcap_usd',
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
        value = (pool as unknown as Record<string, unknown>)[field] as number | undefined
      }

      if (value === undefined || value === null) value = 0
      if (min !== '' && value < Number(min)) return false
      if (max !== '' && value > Number(max)) return false
    }
    return true
  })
}

interface MockPairsParams extends Omit<PairsQuery, 'limit' | 'offset'> {
  customFilters?: FilterValues
}

export function useMockPairs({ customFilters, ...baseParams }: MockPairsParams) {
  const result = usePairs(baseParams)

  const pairs = useMemo(
    () => applyCustomFilters(result.pairs, customFilters),
    [result.pairs, customFilters]
  )

  // [P0 fix] hasMore: when custom filters active, compare filtered length; otherwise use original hasMore
  const hasCustomFilters = customFilters && Object.values(customFilters).some(
    ({ min, max }) => min !== '' || max !== ''
  )
  const total = hasCustomFilters ? pairs.length : result.total
  const hasMore = hasCustomFilters ? pairs.length < result.pairs.length : result.hasMore

  return { ...result, pairs, total, hasMore }
}
