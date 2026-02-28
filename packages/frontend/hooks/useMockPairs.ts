'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import type { PairsQuery, Pool } from '@dex/shared'
import { getPairs } from '../lib/dataProvider'
import type { FilterValues } from '../components/FiltersModal'

export { useLivePrices } from './usePairs'

const PAGE_SIZE = 50

interface MockPairsParams extends Omit<PairsQuery, 'limit' | 'offset'> {
  customFilters?: FilterValues
}

export function useMockPairs(baseParams: MockPairsParams) {
  const [size, setSize]         = useState(1)
  const [isLoading, setLoading] = useState(true)

  const customFiltersKey = baseParams.customFilters
    ? JSON.stringify(baseParams.customFilters)
    : ''

  // Simulate initial loading
  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(() => setLoading(false), 800)
    return () => clearTimeout(timer)
  }, [baseParams.sort, baseParams.filter, baseParams.order, baseParams.window, customFiltersKey])

  // Reset page size on param change
  useEffect(() => {
    setSize(1)
  }, [baseParams.sort, baseParams.filter, baseParams.order, baseParams.window, customFiltersKey])

  const result = useMemo(() => {
    return getPairs({
      ...baseParams,
      limit:  size * PAGE_SIZE,
      offset: 0,
    })
  }, [baseParams.sort, baseParams.filter, baseParams.order, baseParams.window, customFiltersKey, size])

  const pairs:   Pool[] = result.pairs
  const total:   number = result.total
  const hasMore: boolean = pairs.length < total

  const loadMore = useCallback(() => {
    setSize(s => s + 1)
  }, [])

  const mutate = useCallback(() => {}, [])

  return {
    pairs,
    total,
    hasMore,
    isLoading,
    isValidating: false,
    loadMore,
    mutate,
  }
}
