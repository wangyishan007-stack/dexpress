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
  // Each fetch is independent — catch individually so partial data still shows
  const [stats, profitability, holdings, nativeBalanceWei, swaps] = await Promise.all([
    fetchWalletStats(address, chain).catch((e) => { console.warn('[useWalletDetail] stats failed:', e?.message); return null }),
    fetchWalletProfitability(address, chain).catch((e) => { console.warn('[useWalletDetail] profitability failed:', e?.message); return [] as WalletTokenPnl[] }),
    fetchWalletHoldings(address, chain).catch((e) => { console.warn('[useWalletDetail] holdings failed:', e?.message); return [] as WalletHolding[] }),
    fetchNativeBalance(address, chain).catch(() => '0'),
    fetchWalletSwaps(address, chain, 30).catch((e) => { console.warn('[useWalletDetail] swaps failed:', e?.message); return [] as DetectedSwap[] }),
  ])

  return { stats, profitability, holdings, nativeBalanceWei, swaps }
}

export function useWalletDetail(address: string | undefined, chain: ChainSlug) {
  const { data, isLoading, error } = useSWR<WalletDetailData>(
    address ? `wallet-detail-${chain}:${address}` : null,
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
