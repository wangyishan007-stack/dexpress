import useSWR from 'swr'
import { fetchTokenHolders, type MoralisHoldersResult } from '../lib/moralis'

export function useTokenHolders(tokenAddress: string | undefined) {
  return useSWR<MoralisHoldersResult>(
    tokenAddress ? `holders-${tokenAddress}` : null,
    () => fetchTokenHolders(tokenAddress!),
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )
}
