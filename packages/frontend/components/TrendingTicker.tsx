'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { getCachedPools, pairsFetcher } from '../lib/dexscreener-client'
import { TokenAvatar } from './TokenAvatar'
import type { Pool } from '@dex/shared'
import { useChain } from '@/contexts/ChainContext'
import { isQuoteToken } from '@/lib/chains'

function getBase(p: Pool, chain: import('@/lib/chains').ChainSlug) {
  return isQuoteToken(chain, p.token0.address) ? p.token1 : p.token0
}

export function TrendingTicker() {
  const { chain } = useChain()
  // Fix 2: subscribe to the shared SWR cache so Ticker refreshes
  // when the main pair list refreshes (every 45s). Using keepPreviousData
  // so it never flashes empty while revalidating.
  const { data } = useSWR(`pairs:${chain}`, pairsFetcher, {
    dedupingInterval: 10_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
    // Fallback to module-level cache if SWR hasn't loaded yet
    fallbackData: { pairs: getCachedPools(chain), total: 0, limit: 0, offset: 0 },
  })

  const pools = useMemo(() => {
    const allPairs = data?.pairs ?? []
    if (allPairs.length === 0) return null
    return [...allPairs]
      .sort((a, b) => b.trending_score - a.trending_score)
      .slice(0, 20)
  }, [data?.pairs])

  if (!pools || pools.length === 0) return null

  return (
    <div className="flex items-center border-b border-border h-[40px] flex-shrink-0">
      {/* Fire icon — fixed */}
      <div className="flex items-center justify-center w-[40px] flex-shrink-0 border-r border-border h-full">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 1C8 1 3 6 3 10a5 5 0 0010 0C13 6 8 1 8 1z" fill="#f97316"/>
          <path d="M8 7C8 7 6 9 6 11a2 2 0 004 0C10 9 8 7 8 7z" fill="#fbbf24"/>
        </svg>
      </div>

      {/* Scrollable ticker */}
      <div className="flex items-center gap-5 overflow-x-auto scrollbar-hide px-3 h-full flex-1 min-w-0">
        {pools.map((p, i) => {
          const base = getBase(p, chain)
          const change = Number(p.change_24h)
          const isPos = Number.isFinite(change) && change > 0
          const isNeg = Number.isFinite(change) && change < 0

          return (
            <Link
              key={p.address}
              href={`/${chain}/pair/${p.address}`}
              className="flex items-center gap-1.5 flex-shrink-0 hover:bg-border/20 rounded px-1.5 py-1 transition-colors"
            >
              <span className="text-[12px] text-sub tabular">{i + 1}</span>
              <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={20} rounded="md" />
              <span className="text-[13px] font-medium text-text">{base.symbol}</span>
              <span className={`text-[12px] tabular ${isPos ? 'text-green' : isNeg ? 'text-red' : 'text-sub'}`}>
                {Number.isFinite(change) ? `${isPos ? '+' : ''}${change.toFixed(2)}%` : '—'}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
