'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { MOCK_STATS } from '../lib/mockData'

export interface Stats {
  volume_24h:   number
  txns_24h:     number
  latest_block: number
  block_ts:     string | null
}

const USE_MOCK = true

const DEFAULT_STATS: Stats = { volume_24h: 0, txns_24h: 0, latest_block: 0, block_ts: null }

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useStats(): Stats {
  const [mockReady, setMockReady] = useState(false)

  // Delay mock data until after hydration to avoid SSR mismatch
  useEffect(() => {
    if (USE_MOCK) setMockReady(true)
  }, [])

  const { data } = useSWR<Stats>(
    USE_MOCK ? null : '/api/stats',
    fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: false }
  )

  if (USE_MOCK) return mockReady ? MOCK_STATS : DEFAULT_STATS

  return data ?? DEFAULT_STATS
}
