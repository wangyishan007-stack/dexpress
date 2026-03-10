import useSWR from 'swr'
import { fetchTokenHolders, type MoralisHoldersResult } from '../lib/moralis'
import type { ChainSlug } from '../lib/chains'

export function useTokenHolders(tokenAddress: string | undefined, chain: ChainSlug = 'base' as ChainSlug) {
  return useSWR<MoralisHoldersResult>(
    tokenAddress ? `holders-${chain}:${tokenAddress}` : null,
    () => fetchTokenHolders(tokenAddress!, chain),
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )
}
