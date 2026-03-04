'use client'

import { useMemo } from 'react'
import useSWR from 'swr'
import type { PairsResponse } from '@dex/shared'
import { pairsFetcher } from '../lib/dexscreener-client'

export interface Stats {
  volume_24h:   number
  txns_24h:     number
  latest_block: number
  block_ts:     string | null
}

const DEFAULT_STATS: Stats = { volume_24h: 0, txns_24h: 0, latest_block: 0, block_ts: null }

const BASE_RPC = 'https://mainnet.base.org'

async function fetchLatestBlock(): Promise<{ block: number; ts: string }> {
  try {
    const res = await fetch(BASE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
    })
    const data = await res.json()
    return { block: parseInt(data.result, 16), ts: new Date().toISOString() }
  } catch {
    return { block: 0, ts: null as unknown as string }
  }
}

/** Derive stats from the same SWR cache as usePairs — no extra API calls */
export function useStats(): Stats {
  const { data } = useSWR<PairsResponse>(
    'dexscreener-pairs',
    pairsFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
      refreshInterval: 90_000,
    }
  )

  const { data: blockData } = useSWR(
    'base-latest-block',
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
