import useSWR from 'swr'
import { fetchTopTraders, type MoralisTrader } from '../lib/moralis'

export function useTopTraders(tokenAddress: string | undefined) {
  return useSWR<MoralisTrader[]>(
    tokenAddress ? `top-traders-${tokenAddress}` : null,
    () => fetchTopTraders(tokenAddress!),
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )
}
