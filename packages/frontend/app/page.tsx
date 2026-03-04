'use client'

import { useState, useCallback, useEffect } from 'react'
import type { SortField, TimeWindow } from '@dex/shared'
import { FilterBar }          from '../components/FilterBar'
import type { FilterMode }    from '../components/FilterBar'
import { PairList }           from '../components/PairList'
import { StatsBar }           from '../components/StatsBar'
import { RefreshButton }      from '../components/RefreshButton'
import { useMockPairs, useLivePrices } from '../hooks/useMockPairs'
import { usePairWebSocket }   from '../hooks/useWebSocket'
import { buildInitialFilters } from '../components/FiltersModal'
import type { FilterValues, TextFilterValues } from '../components/FiltersModal'
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../lib/columnConfig'
import type { ScreenerConfig } from '../lib/columnConfig'
import { useToast } from '../components/Toast'

export default function HomePage() {
  const [filter, setFilter]               = useState<FilterMode>('trending')
  const [dataWindow, setDataWindow]       = useState<TimeWindow>('24h')
  const [trendingWindow, setTrendingWindow] = useState<TimeWindow>('6h')
  const [sort, setSort]                   = useState<SortField>('trending_6h')
  const [order, setOrder]                 = useState<'asc' | 'desc'>('desc')
  const [customFilters, setCustomFilters] = useState<FilterValues>(buildInitialFilters)
  const [textFilters, setTextFilters]     = useState<TextFilterValues>({ labels: '', addressSuffixes: '' })
  const [screenerConfig, setScreenerConfig] = useState<ScreenerConfig>(DEFAULT_CONFIG)
  useEffect(() => { setScreenerConfig(loadConfig('allcoins')) }, [])

  const handleScreenerConfigChange = useCallback((config: ScreenerConfig) => {
    setScreenerConfig(config)
    saveConfig(config, 'allcoins')
  }, [])

  const handleFiltersChange = useCallback((f: FilterValues, t: TextFilterValues) => {
    setCustomFilters(f)
    setTextFilters(t)
  }, [])

  const handleFiltersReset = useCallback(() => {
    setCustomFilters(buildInitialFilters())
    setTextFilters({ labels: '', addressSuffixes: '' })
  }, [])

  const sortField: SortField =
    filter === 'new' ? 'created_at' : sort

  const { pairs, hasMore, isLoading, isValidating, loadMore, mutate, error } = useMockPairs({
    sort:   sortField,
    filter,
    window: dataWindow,
    order,
    customFilters,
  })

  const { showToast } = useToast()

  const handleRefresh = useCallback(async () => {
    try {
      await mutate()
      showToast('Data refreshed', 'success')
    } catch (err) {
      showToast('Refresh failed, please try again', 'error')
      console.error('[Refresh] error:', err)
    }
  }, [mutate, showToast])

  const { prices, flashing, handlePriceUpdate } = useLivePrices(pairs)
  usePairWebSocket(pairs.map(p => p.address), handlePriceUpdate)

  return (
    <div className="flex flex-col h-full px-3 pt-3 md:px-5 md:pt-4 pb-0">
      {/* Page heading — desktop only (mobile uses tab nav) */}
      <div className="hidden md:block mb-4">
        <div className="flex items-center gap-8 border-b border-border pb-0">
          <div className="border-b-2 border-blue pb-3">
            <span className="text-[16px] font-bold text-text">All Coins</span>
          </div>
        </div>
      </div>

      <StatsBar />

      {/* Filter bar + Refresh button */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
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
            customFilters={customFilters}
            textFilters={textFilters}
            onCustomFiltersChange={handleFiltersChange}
            onCustomFiltersReset={handleFiltersReset}
            screenerConfig={screenerConfig}
            onScreenerConfigChange={handleScreenerConfigChange}
          />
        </div>
        {/* Hidden for now - RefreshButton onClick={handleRefresh} isLoading={isValidating} */}
      </div>

      {/* Pair list — uses dataWindow for column display */}
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
