import useSWR from 'swr'
import { fetchTokenLogos } from '../lib/dexscreener-client'
import type { ChainSlug } from '@/lib/chains'

/**
 * Batch-fetch GT token logos for a list of token addresses.
 * Returns a Map<address, logoUrl> that updates asynchronously.
 */
export function useTokenLogos(tokenAddresses: string[], chain: ChainSlug) {
  // Stable key: sort + dedupe addresses
  const sorted = [...new Set(tokenAddresses.filter(Boolean))].sort()
  const key = sorted.length > 0 ? `token-logos-${chain}:${sorted.join(',')}` : null

  const { data } = useSWR<Map<string, string>>(
    key,
    () => fetchTokenLogos(sorted, chain),
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )

  return data ?? new Map<string, string>()
}
