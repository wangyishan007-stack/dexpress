import useSWR from 'swr'
import { fetchWalletStats, type MoralisWalletStats } from '../lib/moralis'
import type { ChainSlug } from '../lib/chains'

export function useWalletStats(walletAddress: string | undefined, chain: ChainSlug = 'base' as ChainSlug) {
  return useSWR<MoralisWalletStats | null>(
    walletAddress ? `wallet-stats-${chain}:${walletAddress}` : null,
    () => fetchWalletStats(walletAddress!, chain),
    { dedupingInterval: 300_000, revalidateOnFocus: false }
  )
}
