'use client'

import { usePairs, useLivePrices } from '../../hooks/usePairs'
import { usePairWebSocket }        from '../../hooks/useWebSocket'
import { PairList }                from '../../components/PairList'

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export default function NewPairsPage() {
  const { pairs, hasMore, isLoading, isValidating, loadMore } = usePairs({
    sort:   'created_at',
    filter: 'new',
    order:  'desc',
  })

  const { prices, flashing, handlePriceUpdate } = useLivePrices(pairs)
  usePairWebSocket(pairs.map(p => p.address), handlePriceUpdate)

  return (
    <div className="flex flex-col h-full px-5 pt-4 pb-0">
      <div className="mb-4">
        <div className="flex items-center gap-8 border-b border-border pb-0">
          <div className="border-b-2 border-blue pb-3">
            <span className="text-[16px] font-bold text-text">New Pairs</span>
          </div>
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
          No new pairs in the last 24 hours.
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
