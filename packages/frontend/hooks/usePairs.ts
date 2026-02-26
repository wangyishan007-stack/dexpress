'use client'

import { useState, useCallback, useRef } from 'react'
import useSWRInfinite from 'swr/infinite'
import type { PairsQuery, PairsResponse, Pool } from '@dex/shared'
import { buildPairsUrl } from '../lib/api'

const PAGE_SIZE = 50

const fetcher = (url: string): Promise<PairsResponse> =>
  fetch(url).then((r) => r.json())

export function usePairs(baseParams: Omit<PairsQuery, 'limit' | 'offset'>) {
  const getKey = (pageIndex: number, previousPageData: PairsResponse | null) => {
    if (previousPageData && previousPageData.pairs.length < PAGE_SIZE) return null
    return buildPairsUrl({
      ...baseParams,
      limit:  PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    })
  }

  const { data, size, setSize, isLoading, isValidating, mutate } =
    useSWRInfinite<PairsResponse>(getKey, fetcher, {
      revalidateOnFocus:  false,
      revalidateIfStale:  false,
      dedupingInterval:   8_000,
      refreshInterval:    10_000,  // re-fetch every 10s
    })

  const pairs:  Pool[] = data?.flatMap((d) => d.pairs) ?? []
  const total:  number = data?.[0]?.total ?? 0
  const hasMore = pairs.length < total

  const loadMore = useCallback(() => {
    if (!isValidating) setSize((s) => s + 1)
  }, [isValidating, setSize])

  return { pairs, total, hasMore, isLoading, isValidating, loadMore, mutate }
}

// Overlay live prices on pairs from WebSocket
export function useLivePrices(initialPairs: Pool[]) {
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [flashing, setFlashing] = useState<Record<string, 'up' | 'down'>>({})
  const prevPrices = useRef<Record<string, number>>({})

  const handlePriceUpdate = useCallback(
    (event: { pool_address: string; price_usd: number; is_buy: boolean }) => {
      const addr  = event.pool_address
      const price = event.price_usd
      const prev  = prevPrices.current[addr]

      setPrices((p) => ({ ...p, [addr]: price }))

      if (prev !== undefined && price !== prev) {
        const direction = price > prev ? 'up' : 'down'
        setFlashing((f) => ({ ...f, [addr]: direction }))
        setTimeout(() => setFlashing((f) => { const n = { ...f }; delete n[addr]; return n }), 700)
      }

      prevPrices.current[addr] = price
    },
    []
  )

  return { prices, flashing, handlePriceUpdate }
}
