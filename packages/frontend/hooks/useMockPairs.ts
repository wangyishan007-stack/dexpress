'use client'

/**
 * useMockPairs — thin wrapper around usePairs that accepts
 * customFilters (applied client-side after fetch) so that
 * existing call-sites in page.tsx don't need to change.
 */

import { useMemo }           from 'react'
import type { PairsQuery, Pool } from '@dex/shared'
import { usePairs }          from './usePairs'
import type { FilterValues, TextFilterValues } from '../components/FiltersModal'

export { useLivePrices } from './usePairs'

const FILTER_KEY_MAP: Record<string, string> = {
  liquidity: 'liquidity_usd',
  mcap:      'mcap_usd',
  fdv:       '_fdv', // computed below
}

function applyCustomFilters(pools: Pool[], customFilters?: FilterValues, textFilters?: TextFilterValues): Pool[] {
  if (!customFilters && !textFilters) return pools
  const now = Date.now()

  return pools.filter(pool => {
    // Range filters
    if (customFilters) {
      for (const [key, { min, max }] of Object.entries(customFilters)) {
        if (min === '' && max === '') continue

        let value: number | undefined
        if (key === 'pair_age') {
          value = (now - new Date(pool.created_at).getTime()) / 3600_000
        } else if (key === 'fdv') {
          // FDV = totalSupply * price (not mcap)
          const base = pool.token0 ?? pool.token1
          const rawSupply = BigInt(base?.total_supply || '0')
          const totalSupply = Number(rawSupply) / Math.pow(10, base?.decimals ?? 18)
          value = totalSupply > 0 ? totalSupply * Number(pool.price_usd) : 0
        } else {
          const field = FILTER_KEY_MAP[key] ?? key
          value = (pool as unknown as Record<string, unknown>)[field] as number | undefined
        }

        if (value === undefined || value === null) value = 0
        if (min !== '' && value < Number(min)) return false
        if (max !== '' && value > Number(max)) return false
      }
    }

    // Text filters
    if (textFilters) {
      if (textFilters.labels) {
        const labelList = textFilters.labels.split(',').map(l => l.trim().toLowerCase()).filter(Boolean)
        if (labelList.length > 0) {
          const poolText = [
            pool.token0?.symbol, pool.token0?.name,
            pool.token1?.symbol, pool.token1?.name,
          ].map(s => (s ?? '').toLowerCase())
          const matches = labelList.some(label => poolText.some(t => t.includes(label)))
          if (!matches) return false
        }
      }
      if (textFilters.addressSuffixes) {
        const suffixList = textFilters.addressSuffixes.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        if (suffixList.length > 0) {
          const addr = (pool.address ?? '').toLowerCase()
          const matches = suffixList.some(suffix => addr.endsWith(suffix))
          if (!matches) return false
        }
      }
    }

    return true
  })
}

interface MockPairsParams extends Omit<PairsQuery, 'limit' | 'offset'> {
  customFilters?: FilterValues
  textFilters?:   TextFilterValues
}

export function useMockPairs({ customFilters, textFilters, ...baseParams }: MockPairsParams) {
  const result = usePairs(baseParams)

  const pairs = useMemo(
    () => applyCustomFilters(result.pairs, customFilters, textFilters),
    [result.pairs, customFilters, textFilters]
  )

  const hasCustomFilters = (customFilters && Object.values(customFilters).some(
    ({ min, max }) => min !== '' || max !== ''
  )) || !!(textFilters?.labels || textFilters?.addressSuffixes)

  const total = hasCustomFilters ? pairs.length : result.total

  // BUG B fix: when custom filters active, also check result.hasMore so we keep
  // loading more pages from the server even if all current-page items pass the filter
  const hasMore = hasCustomFilters
    ? pairs.length < result.pairs.length || result.hasMore
    : result.hasMore

  return { ...result, pairs, total, hasMore }
}
