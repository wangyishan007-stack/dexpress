'use client'

import useSWR from 'swr'
import { fetchWalletSwaps } from '@/lib/moralis'
import { POLL_INTERVAL_MS, type DetectedSwap } from '@/lib/copyTrade'
import type { ChainSlug } from '@/lib/chains'

async function fetchActivity(addresses: string[], chain: ChainSlug): Promise<DetectedSwap[]> {
  // Fetch swaps for each wallet via Moralis decoded swaps API
  const BATCH = 3
  const allSwaps: DetectedSwap[] = []

  for (let i = 0; i < addresses.length; i += BATCH) {
    const batch = addresses.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(addr => fetchWalletSwaps(addr, chain, 20))
    )
    for (const r of results) {
      if (r.status === 'fulfilled') allSwaps.push(...r.value)
    }
  }

  // Dedupe by txHash and sort newest first
  const seen = new Set<string>()
  const unique = allSwaps.filter(s => {
    if (seen.has(s.txHash)) return false
    seen.add(s.txHash)
    return true
  })

  return unique.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

export function useWalletActivity(addresses: string[], chain: ChainSlug) {
  const key = addresses.length > 0
    ? `wallet-activity-${chain}:${addresses.map(a => a.toLowerCase()).sort().join(',')}`
    : null

  return useSWR<DetectedSwap[]>(
    key,
    () => fetchActivity(addresses, chain),
    {
      refreshInterval: POLL_INTERVAL_MS,
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
    }
  )
}
