import useSWR from 'swr'
import { fetchLiquidityProviders, type LPProvidersResult } from '../lib/uniswap-subgraph'

export function useLiquidityProviders(poolAddress: string | undefined) {
  return useSWR<LPProvidersResult>(
    poolAddress ? `lp-${poolAddress}` : null,
    () => fetchLiquidityProviders(poolAddress!),
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )
}
