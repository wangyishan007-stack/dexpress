import useSWR from 'swr'
import { fetchTokenInfo, type TokenInfo } from '../lib/dexscreener-client'

export function useTokenInfo(tokenAddress: string | undefined) {
  return useSWR<TokenInfo | null>(
    tokenAddress ? `token-info-${tokenAddress}` : null,
    () => fetchTokenInfo(tokenAddress!),
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )
}
