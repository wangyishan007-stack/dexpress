'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import type { PairsResponse } from '@dex/shared'
import { pairsFetcher } from '../lib/dexscreener-client'
import { type ChainSlug } from '@/lib/chains'

export interface Stats {
  volume_24h:   number
  txns_24h:     number
  latest_block: number
  block_ts:     string | null
}

async function fetchLatestBlock(key: string): Promise<{ block: number; ts: string }> {
  const chain = key.split(':')[1] || 'base'
  try {
    const res = await fetch(`/api/rpc?chain=${chain}`, { signal: AbortSignal.timeout(6_000) })
    if (!res.ok) return { block: 0, ts: null as unknown as string }
    return await res.json()
  } catch {
    return { block: 0, ts: null as unknown as string }
  }
}

/** Derive stats from the same SWR cache as usePairs — no extra API calls */
export function useStats(chain: ChainSlug = 'base' as ChainSlug): Stats {
  const { data } = useSWR<PairsResponse>(
    `pairs:${chain}`,
    pairsFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
      refreshInterval: 90_000,
      keepPreviousData: true,
    }
  )

  const { data: blockData } = useSWR(
    `latest-block:${chain}`,
    fetchLatestBlock,
    { refreshInterval: 12_000, revalidateOnFocus: false }
  )

  return useMemo(() => {
    const volume_24h = data?.pairs?.reduce((sum, p) => sum + (p.volume_24h || 0), 0) ?? 0
    const txns_24h   = data?.pairs?.reduce((sum, p) => sum + (p.txns_24h || 0), 0) ?? 0
    return {
      volume_24h,
      txns_24h,
      latest_block: blockData?.block ?? 0,
      block_ts:     blockData?.ts ?? null,
    }
  }, [data?.pairs, blockData])
}
