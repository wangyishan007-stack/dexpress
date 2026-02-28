'use client'

import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { useWatchlist } from '../../hooks/useWatchlist'
import { useAuth } from '../../hooks/useAuth'
import { MOCK_POOLS } from '../../lib/mockData'
import { fmtPrice } from '../../lib/formatters'

const QUOTE_TOKEN_ADDRS = new Set([
  '0x4200000000000000000000000000000000000006',
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2',
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
])

const COLLAPSED_COUNT = 2

export function WatchlistPanel() {
  const { ready, authenticated } = useAuth()
  const { activeList, count } = useWatchlist()
  const [expanded, setExpanded] = useState(false)

  // Don't show watchlist data when not logged in
  if (!ready || !authenticated) {
    return null
  }

  const watchedPools = activeList.pairIds
    .map(addr => MOCK_POOLS.find(p => p.address === addr))
    .filter(Boolean) as typeof MOCK_POOLS

  const visiblePools = expanded ? watchedPools : watchedPools.slice(0, COLLAPSED_COUNT)
  const canExpand = watchedPools.length > COLLAPSED_COUNT

  return (
    <div className="border-t border-border flex flex-col">
      {/* Header row */}
      <div className="flex items-center justify-between px-[24px] pt-[16px] pb-[8px]">
        <Link href="/watchlist" className="flex items-center gap-1 group">
          <span className="text-[14px] text-text font-medium">{activeList.name}</span>
          {count > 0 && (
            <span className="text-[11px] text-sub bg-border/60 rounded px-1.5 py-0.5">{count}</span>
          )}
        </Link>
        {canExpand && (
          <button
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
          </button>
        )}
      </div>

      {/* Pool list */}
      <div className={clsx(
        'px-[24px] pb-[16px]',
        expanded && 'overflow-y-auto max-h-[280px]'
      )}>
        {watchedPools.length === 0 ? (
          <p className="text-[12px] text-sub/60">Nothing in this list yet...</p>
        ) : (
          <div className="flex flex-col gap-1">
            {visiblePools.map(pool => {
              const t0IsQuote = QUOTE_TOKEN_ADDRS.has(pool.token0.address.toLowerCase())
              const base = t0IsQuote ? pool.token1 : pool.token0
              return (
                <Link
                  key={pool.address}
                  href={`/pair/${pool.address}`}
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
