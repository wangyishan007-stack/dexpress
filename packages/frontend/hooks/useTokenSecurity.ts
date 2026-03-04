import useSWR from 'swr'
import { fetchTokenSecurity, type GoPlusResult } from '../lib/goplus'

export function useTokenSecurity(tokenAddress: string | undefined) {
  return useSWR<GoPlusResult | null>(
    tokenAddress ? `goplus-${tokenAddress}` : null,
    () => fetchTokenSecurity(tokenAddress!),
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  )
}
