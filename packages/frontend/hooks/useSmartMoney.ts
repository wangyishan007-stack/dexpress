import useSWR from 'swr'
import type { SmartWallet } from '../app/api/smart-money/route'
import type { ChainSlug } from '../lib/chains'
import { getCachedPools } from '../lib/dexscreener-client'

interface SmartMoneyResult {
  wallets: SmartWallet[]
  unsupported?: boolean
}

export type SmartMoneyPeriod = '1d' | '7d' | '30d'

/** Extract top token addresses from client-side GT pool cache */
function getTopTokensFromCache(chain: ChainSlug, limit = 5): string {
  try {
    const pools = getCachedPools(chain)
    const seen = new Set<string>()
    const pairs: string[] = []
    for (const p of pools) {
      if (pairs.length >= limit) break
      const addr = p.token0?.address
      const sym = p.token0?.symbol
      if (!addr || seen.has(addr.toLowerCase())) continue
      seen.add(addr.toLowerCase())
      pairs.push(`${addr}:${sym || 'Unknown'}`)
    }
    return pairs.join(',')
  } catch {
    return ''
  }
}

async function fetchSmartMoney(chain: ChainSlug, period: SmartMoneyPeriod): Promise<SmartMoneyResult> {
  // Pass client-cached tokens so API can skip server-side GT call
  const tokens = getTopTokensFromCache(chain)
  const params = new URLSearchParams({ chain, period })
  if (tokens) params.set('tokens', tokens)

  const res = await fetch(`/api/smart-money?${params}`, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Smart money API error: ${res.status}`)
  const data = await res.json()
  return {
    wallets: Array.isArray(data?.wallets) ? data.wallets : [],
    unsupported: data?.unsupported ?? false,
  }
}

export function useSmartMoney(chain: ChainSlug, period: SmartMoneyPeriod = '7d') {
  return useSWR<SmartMoneyResult>(
    `smart-money-${chain}-${period}`,
    () => fetchSmartMoney(chain, period),
    { dedupingInterval: 600_000, revalidateOnFocus: false, errorRetryCount: 3, errorRetryInterval: 10_000 }
  )
}
