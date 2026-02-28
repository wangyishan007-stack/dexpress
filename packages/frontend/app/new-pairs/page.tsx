'use client'

import { useState, useCallback, useEffect } from 'react'
import type { SortField, TimeWindow } from '@dex/shared'
import { useMockPairs, useLivePrices } from '../../hooks/useMockPairs'
import { usePairWebSocket }        from '../../hooks/useWebSocket'
import { PairList }                from '../../components/PairList'
import { StatsBar }                from '../../components/StatsBar'
import { FilterBar }               from '../../components/FilterBar'
import type { FilterMode }         from '../../components/FilterBar'
import { loadConfig, saveConfig, DEFAULT_CONFIG }  from '../../lib/columnConfig'
import type { ScreenerConfig }     from '../../lib/columnConfig'

export default function NewPairsPage() {
  const [filter, setFilter]               = useState<FilterMode>('new')
  const [dataWindow, setDataWindow]       = useState<TimeWindow>('24h')
  const [trendingWindow, setTrendingWindow] = useState<TimeWindow>('6h')
  const [sort, setSort]                   = useState<SortField>('created_at')
  const [order, setOrder]                 = useState<'asc' | 'desc'>('desc')
  const [screenerConfig, setScreenerConfig] = useState<ScreenerConfig>(DEFAULT_CONFIG)
  useEffect(() => { setScreenerConfig(loadConfig('new-pairs')) }, [])

  const handleScreenerConfigChange = useCallback((config: ScreenerConfig) => {
    setScreenerConfig(config)
    saveConfig(config, 'new-pairs')
  }, [])

  const sortField: SortField =
    filter === 'new' ? 'created_at' : sort

  const { pairs, hasMore, isLoading, isValidating, loadMore } = useMockPairs({
    sort:   sortField,
    filter,
    window: dataWindow,
    order,
  })

  const { prices, flashing, handlePriceUpdate } = useLivePrices(pairs)
  usePairWebSocket(pairs.map(p => p.address), handlePriceUpdate)

  return (
    <div className="flex flex-col h-full px-3 pt-3 md:px-5 md:pt-4 pb-0">
      <div className="hidden md:block mb-4">
        <div className="flex items-center gap-8 border-b border-border pb-0">
          <div className="border-b-2 border-blue pb-3">
            <span className="text-[16px] font-bold text-text">New Pairs</span>
          </div>
        </div>
      </div>

      <StatsBar showBlock={false} />

      <FilterBar
        filter={filter}
        dataWindow={dataWindow}
        trendingWindow={trendingWindow}
        onFilter={setFilter}
        onDataWindow={setDataWindow}
        onTrendingWindow={setTrendingWindow}
        sort={sort}
        order={order}
        onSort={(s) => setSort(s as SortField)}
        onOrder={setOrder}
        screenerConfig={screenerConfig}
        onScreenerConfigChange={handleScreenerConfigChange}
      />

      <PairList
        pairs={pairs}
        hasMore={hasMore}
        onLoadMore={loadMore}
        isValidating={isValidating}
        livePrices={prices}
        flashing={flashing}
        timeWindow={dataWindow}
        loading={isLoading}
        columnConfig={screenerConfig}
      />
    </div>
  )
}
