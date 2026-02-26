'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { usePairs, useLivePrices } from '../../hooks/usePairs'
import { usePairWebSocket }        from '../../hooks/useWebSocket'
import { PairList }                from '../../components/PairList'

type Tab = 'gainers' | 'losers'

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export default function GainersPage() {
  const [tab, setTab] = useState<Tab>('gainers')

  // Sort-only: gainers = best 24h change first, losers = worst first
  // filter='trending' to exclude stable-to-stable noise
  const { pairs, hasMore, isLoading, isValidating, loadMore } = usePairs({
    sort:   'change_24h',
    filter: 'trending',
    order:  tab === 'gainers' ? 'desc' : 'asc',
  })

  const { prices, flashing, handlePriceUpdate } = useLivePrices(pairs)
  usePairWebSocket(pairs.map(p => p.address), handlePriceUpdate)

  return (
    <div className="flex flex-col h-full px-3 pt-3 md:px-5 md:pt-4 pb-0">
      <div className="mb-4">
        <div className="flex items-center gap-8 border-b border-border pb-0">
          {(['gainers', 'losers'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                'pb-3 text-[14px] md:text-[16px] capitalize transition-colors',
                tab === t
                  ? 'border-b-2 border-blue font-bold text-text'
                  : 'font-medium text-sub hover:text-text'
              )}
            >
              {t === 'gainers' ? 'Gainers' : 'Losers'}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-sub text-sm">
            <Spinner />
            Loading pairs…
          </div>
        </div>
      ) : pairs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sub text-sm">
          No pairs found.
        </div>
      ) : (
        <PairList
          pairs={pairs}
          hasMore={hasMore}
          onLoadMore={loadMore}
          isValidating={isValidating}
          livePrices={prices}
          flashing={flashing}
        />
      )}
    </div>
  )
}
