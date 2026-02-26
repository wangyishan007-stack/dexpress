'use client'

import { useState } from 'react'
import type { TimeWindow } from '@dex/shared'
import { FilterBar }          from '../components/FilterBar'
import type { FilterMode }    from '../components/FilterBar'
import { PairList }           from '../components/PairList'
import { StatsBar }           from '../components/StatsBar'
import { usePairs, useLivePrices } from '../hooks/usePairs'
import { usePairWebSocket }   from '../hooks/useWebSocket'

export default function HomePage() {
  const [filter, setFilter] = useState<FilterMode>('trending')
  const [window, setWindow] = useState<TimeWindow>('6h')

  const sortField =
    filter === 'gainers' ? `change_${window}` as const :
    filter === 'new'     ? 'created_at'        as const :
    filter === 'top'     ? 'liquidity_usd'     as const :
                           'trending_score'    as const

  const { pairs, hasMore, isLoading, isValidating, loadMore } = usePairs({
    sort:   sortField,
    filter,
    window,
    order:  'desc',
  })

  const { prices, flashing, handlePriceUpdate } = useLivePrices(pairs)
  usePairWebSocket(pairs.map(p => p.address), handlePriceUpdate)

  return (
    <div className="flex flex-col h-full px-3 pt-3 md:px-5 md:pt-4 pb-0">
      {/* Page heading */}
      <div className="mb-4">
        <div className="flex items-center gap-8 border-b border-border pb-0">
          <div className="border-b-2 border-blue pb-3">
            <span className="text-[14px] md:text-[16px] font-bold text-text">All Coins</span>
          </div>
        </div>
      </div>

      {/* 24H stats bar */}
      <StatsBar />

      {/* Filter bar */}
      <FilterBar
        filter={filter}
        window={window}
        onFilter={setFilter}
        onWindow={setWindow}
      />

      {/* Pair list */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-sub text-sm">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            Loading pairs…
          </div>
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
