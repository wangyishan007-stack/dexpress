import useSWR from 'swr'
import {
  fetchWalletStats,
  fetchWalletProfitability,
  fetchWalletHoldings,
  fetchNativeBalance,
  fetchWalletSwaps,
  type MoralisWalletStats,
  type WalletTokenPnl,
  type WalletHolding,
} from '@/lib/moralis'
import type { DetectedSwap } from '@/lib/copyTrade'
import type { ChainSlug } from '@/lib/chains'

interface WalletDetailData {
  stats: MoralisWalletStats | null
  profitability: WalletTokenPnl[]
  holdings: WalletHolding[]
  nativeBalanceWei: string
  swaps: DetectedSwap[]
}

const DEDUP = 300_000 // 5min

async function fetchAll(address: string, chain: ChainSlug): Promise<WalletDetailData> {
  // Fetch in two batches to avoid Moralis rate limits
  // Batch 1: stats + profitability (most important)
  const [stats, profitability] = await Promise.all([
    fetchWalletStats(address, chain),
    fetchWalletProfitability(address, chain),
  ])

  // Batch 2: holdings + balance + swaps (decoded by Moralis)
  const [holdings, nativeBalanceWei, swaps] = await Promise.all([
    fetchWalletHoldings(address, chain),
    fetchNativeBalance(address, chain),
    fetchWalletSwaps(address, chain, 30),
  ])

  return { stats, profitability, holdings, nativeBalanceWei, swaps }
}

export function useWalletDetail(address: string | undefined, chain: ChainSlug) {
  const { data, isLoading, error } = useSWR<WalletDetailData>(
    address ? `wallet-detail-${chain}:${address.toLowerCase()}` : null,
    () => fetchAll(address!, chain),
    { dedupingInterval: DEDUP, revalidateOnFocus: false }
  )

  return {
    stats: data?.stats ?? null,
    profitability: data?.profitability ?? [],
    holdings: data?.holdings ?? [],
    nativeBalanceWei: data?.nativeBalanceWei ?? '0',
    swaps: data?.swaps ?? [],
    isLoading,
    error,
  }
}

