'use client'

import useSWR from 'swr'

export interface Stats {
  volume_24h:   number
  txns_24h:     number
  latest_block: number
  block_ts:     string | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function useStats() {
  const { data } = useSWR<Stats>('/api/stats', fetcher, {
    refreshInterval:   10_000,
    revalidateOnFocus: false,
  })
  return data ?? { volume_24h: 0, txns_24h: 0, latest_block: 0, block_ts: null }
}
