import useSWR from 'swr'
import { fetchTopTraders, type MoralisTrader } from '../lib/moralis'
import type { ChainSlug } from '../lib/chains'

export function useTopTraders(tokenAddress: string | undefined, chain: ChainSlug = 'base' as ChainSlug) {
  return useSWR<MoralisTrader[]>(
    tokenAddress ? `top-traders-${chain}:${tokenAddress}` : null,
    () => fetchTopTraders(tokenAddress!, chain),
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )
}
