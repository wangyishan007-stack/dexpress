import useSWR from 'swr'
import { fetchLiquidityProviders, type LPProvidersResult } from '../lib/uniswap-subgraph'
import type { ChainSlug } from '../lib/chains'

export function useLiquidityProviders(poolAddress: string | undefined, chain: ChainSlug = 'base' as ChainSlug) {
  return useSWR<LPProvidersResult>(
    poolAddress ? `lp-${chain}:${poolAddress}` : null,
    () => fetchLiquidityProviders(poolAddress!, chain),
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )
}
