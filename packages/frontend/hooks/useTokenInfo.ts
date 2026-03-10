import useSWR from 'swr'
import { fetchTokenInfo, type TokenInfo } from '../lib/dexscreener-client'
import type { ChainSlug } from '@/lib/chains'

export function useTokenInfo(tokenAddress: string | undefined, chain: ChainSlug = 'base' as ChainSlug) {
  return useSWR<TokenInfo | null>(
    tokenAddress ? `token-info-${chain}:${tokenAddress}` : null,
    () => fetchTokenInfo(tokenAddress!, chain),
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )
}
