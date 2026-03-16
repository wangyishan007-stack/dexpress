'use client'

import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { useTranslations } from 'next-intl'
import { useWatchlist } from '../../hooks/useWatchlist'
import { useAuth } from '../../hooks/useAuth'
import { getCachedPools } from '../../lib/dexscreener-client'
import { fmtPrice } from '../../lib/formatters'
import { useChainSlug } from '@/hooks/useChainSlug'
import { isQuoteToken, type ChainSlug } from '@/lib/chains'

const COLLAPSED_COUNT = 2

export function WatchlistPanel() {
  const chain = useChainSlug()
  const { ready, authenticated } = useAuth()
  const { lists } = useWatchlist()
  const [expanded, setExpanded] = useState(false)
  const t = useTranslations('watchlistPanel')

  // Don't show watchlist data when not logged in
  if (!ready || !authenticated) {
    return null
  }

  const allPools = getCachedPools('all')

  // Merge all pairIds from all watchlists, deduplicated
  const allPairIds = [...new Set(lists.flatMap(l => l.pairIds))]
  const watchedPools = allPairIds
    .map(addr => allPools.find(p => {
      // Solana addresses are case-sensitive (base58), EVM are not
      const poolChain = ((p as any)._chain as ChainSlug) || chain
      return poolChain === 'solana'
        ? p.address === addr
        : p.address.toLowerCase() === addr.toLowerCase()
    }))
    .filter(Boolean) as typeof allPools

  const visiblePools = expanded ? watchedPools : watchedPools.slice(0, COLLAPSED_COUNT)
  const canExpand = watchedPools.length > COLLAPSED_COUNT

  return (
    <div className="border-t border-border flex flex-col">
      {/* Header row — always show expand/collapse toggle */}
      <div className="flex items-center justify-between px-[24px] pt-[16px] pb-[8px]">
        <Link href="/watchlist" className="flex items-center gap-1 group">
          <span className="text-[14px] text-text font-medium">{t('title')}</span>
        </Link>
        {canExpand && <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center justify-center w-[24px] h-[24px] text-sub hover:text-text transition-colors"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className={clsx('transition-transform duration-200', expanded && 'rotate-180')}
          >
            <path d="M2 8L6 4L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>}
      </div>

      {/* Pool list */}
      <div className="px-[24px] pb-[16px]">
        {watchedPools.length === 0 ? (
          <p className="text-[12px] text-sub/60">{t('emptyList')}</p>
        ) : (
          <div className={clsx('flex flex-col gap-1', expanded ? 'overflow-y-auto max-h-[168px]' : '')}>
            {visiblePools.map(pool => {
              const poolChain = ((pool as any)._chain as ChainSlug) || chain
              const t0IsQuote = isQuoteToken(poolChain, pool.token0.address)
              const base = t0IsQuote ? pool.token1 : pool.token0
              return (
                <Link
                  key={pool.address}
                  href={`/${poolChain}/pair/${pool.address}`}
                  className="flex items-center justify-between py-1 hover:bg-border/20 rounded px-1 -mx-1 transition-colors"
                >
                  <span className="text-[12px] text-text font-medium">{base.symbol}</span>
                  <span className="text-[12px] text-sub tabular font-mono">{fmtPrice(pool.price_usd)}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
