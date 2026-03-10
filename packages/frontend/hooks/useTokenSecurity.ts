import useSWR from 'swr'
import { fetchTokenSecurity, type GoPlusResult } from '../lib/goplus'
import type { ChainSlug } from '../lib/chains'

export function useTokenSecurity(tokenAddress: string | undefined, chain: ChainSlug = 'base' as ChainSlug) {
  return useSWR<GoPlusResult | null>(
    tokenAddress ? `goplus-${chain}:${tokenAddress}` : null,
    () => fetchTokenSecurity(tokenAddress!, chain),
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  )
}
