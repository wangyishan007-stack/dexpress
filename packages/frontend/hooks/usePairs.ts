'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import useSWR from 'swr'
import type { PairsQuery, PairsResponse, Pool, SortField } from '@dex/shared'
import { pairsFetcher } from '../lib/dexscreener-client'

const PAGE_SIZE = 50

// [#9] Whitelist of valid sort fields
const VALID_SORT_FIELDS = new Set<string>([
  'trending_score', 'trending_5m', 'trending_1h', 'trending_6h', 'trending_24h',
  'volume_5m', 'volume_1h', 'volume_6h', 'volume_24h',
  'change_5m', 'change_1h', 'change_6h', 'change_24h',
  'txns_5m', 'txns_1h', 'txns_6h', 'txns_24h',
  'buys_5m', 'buys_1h', 'buys_6h', 'buys_24h',
  'sells_5m', 'sells_1h', 'sells_6h', 'sells_24h',
  'liquidity_usd', 'mcap_usd', 'created_at', 'price_usd',
])

// [#9] Client-side sorting with whitelist validation
function sortPools(pools: Pool[], sort: string, order: 'asc' | 'desc'): Pool[] {
  // Validate sort field
  const sortField = VALID_SORT_FIELDS.has(sort) ? sort : 'trending_score'
  
  return [...pools].sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[sortField] ?? 0
    const bVal = (b as unknown as Record<string, unknown>)[sortField] ?? 0
    const aNum = typeof aVal === 'string' ? new Date(aVal).getTime() : Number(aVal)
    const bNum = typeof bVal === 'string' ? new Date(bVal).getTime() : Number(bVal)
    return order === 'desc' ? bNum - aNum : aNum - bNum
  })
}

// Client-side filtering
function filterPools(pools: Pool[], filter?: string): Pool[] {
  if (!filter || filter === 'trending' || filter === 'top') return pools
  const dayAgo = Date.now() - 24 * 3600_000
  if (filter === 'new') return pools.filter(p => new Date(p.created_at).getTime() > dayAgo)
  if (filter === 'gainers') return pools.filter(p => p.change_24h > 0)
  if (filter === 'losers') return pools.filter(p => p.change_24h < 0)
  return pools
}

export function usePairs(baseParams: Omit<PairsQuery, 'limit' | 'offset'>) {
  const [size, setSize] = useState(1)

  // [#8] Reset size when filter/sort/order changes
  const paramsKey = `${baseParams.filter}-${baseParams.sort}-${baseParams.order}`
  useEffect(() => {
    setSize(1)
  }, [paramsKey])

  // [#14] Expose error state
  const { data, error, isLoading, isValidating, mutate } = useSWR<PairsResponse>(
    'dexscreener-pairs',
    pairsFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
      refreshInterval: 90_000,
      keepPreviousData: true,   // Show stale data while revalidating
    }
  )

  // Apply filtering and sorting client-side
  const processedPairs = useMemo(() => {
    if (!data?.pairs) return []
    let pools = filterPools(data.pairs, baseParams.filter)
    pools = sortPools(pools, baseParams.sort ?? 'trending_score', baseParams.order ?? 'desc')
    return pools
  }, [data?.pairs, baseParams.filter, baseParams.sort, baseParams.order])

  // Pagination
  const limit = size * PAGE_SIZE
  const pairs = processedPairs.slice(0, limit)
  const total = processedPairs.length
  const hasMore = pairs.length < total

  const loadMore = useCallback(() => {
    if (!isValidating) setSize((s) => s + 1)
  }, [isValidating])

  // [#14] Return error state
  return { pairs, total, hasMore, isLoading, isValidating, error, loadMore, mutate }
}

// [#4] Fixed: Overlay live prices on pairs from WebSocket with proper cleanup
export function useLivePrices(initialPairs: Pool[]) {
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [flashing, setFlashing] = useState<Record<string, 'up' | 'down'>>({})
  const prevPrices = useRef<Record<string, number>>({})
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // [#4] Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(t => clearTimeout(t))
      timeoutRefs.current.clear()
    }
  }, [])

  const handlePriceUpdate = useCallback(
    (event: { pool_address: string; price_usd: number; is_buy: boolean }) => {
      const addr = event.pool_address
      const price = event.price_usd
      const prev = prevPrices.current[addr]

      setPrices((p) => ({ ...p, [addr]: price }))

      if (prev !== undefined && price !== prev) {
        const direction = price > prev ? 'up' : 'down'
        setFlashing((f) => ({ ...f, [addr]: direction }))

        // [#4] Clear existing timeout for this address
        const existingTimeout = timeoutRefs.current.get(addr)
        if (existingTimeout) clearTimeout(existingTimeout)

        // [#4] Set new timeout and store reference
        const newTimeout = setTimeout(() => {
          setFlashing((f) => {
            const n = { ...f }
            delete n[addr]
            return n
          })
          timeoutRefs.current.delete(addr)
        }, 700)
        timeoutRefs.current.set(addr, newTimeout)
      }

      prevPrices.current[addr] = price
    },
    []
  )

  return { prices, flashing, handlePriceUpdate }
}
