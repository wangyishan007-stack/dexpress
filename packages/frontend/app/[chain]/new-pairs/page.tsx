'use client'

import { useState, useCallback, useEffect } from 'react'
import type { SortField, TimeWindow } from '@dex/shared'
import { useMockPairs, useLivePrices } from '@/hooks/useMockPairs'
import { usePairWebSocket }        from '@/hooks/useWebSocket'
import { PairList }                from '@/components/PairList'
import { StatsBar }                from '@/components/StatsBar'
import { FilterBar }               from '@/components/FilterBar'
import type { FilterMode }          from '@/components/FilterBar'
import { buildInitialFilters }     from '@/components/FiltersModal'
import type { FilterValues, TextFilterValues } from '@/components/FiltersModal'
import { loadConfig, saveConfig, DEFAULT_CONFIG }  from '@/lib/columnConfig'
import type { ScreenerConfig }     from '@/lib/columnConfig'
import { useChain } from '@/contexts/ChainContext'
import { ChainTabs } from '@/components/ChainTabs'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'

export default function NewPairsPage() {
  const { chain, isAllChains } = useChain()
  const [filter, setFilter]               = useState<FilterMode>('new')
  const [dataWindow, setDataWindow]       = useState<TimeWindow>('24h')
  const [trendingWindow, setTrendingWindow] = useState<TimeWindow>('6h')
  const [sort, setSort]                   = useState<SortField>('created_at')
  const [order, setOrder]                 = useState<'asc' | 'desc'>('desc')
  const [customFilters, setCustomFilters] = useState<FilterValues>(() => {
    try {
      const saved = localStorage.getItem('custom_filters_new-pairs')
      return saved ? JSON.parse(saved) : buildInitialFilters()
    } catch { return buildInitialFilters() }
  })
  const [textFilters, setTextFilters] = useState<TextFilterValues>(() => {
    try {
      const saved = localStorage.getItem('text_filters_new-pairs')
      return saved ? JSON.parse(saved) : { labels: '', addressSuffixes: '' }
    } catch { return { labels: '', addressSuffixes: '' } }
  })
  const [screenerConfig, setScreenerConfig] = useState<ScreenerConfig>(DEFAULT_CONFIG)
  useEffect(() => { setScreenerConfig(loadConfig('new-pairs')) }, [])

  const handleScreenerConfigChange = useCallback((config: ScreenerConfig) => {
    setScreenerConfig(config)
    saveConfig(config, 'new-pairs')
  }, [])

  const handleFiltersChange = useCallback((f: FilterValues, t: TextFilterValues) => {
    setCustomFilters(f)
    setTextFilters(t)
    try { localStorage.setItem('custom_filters_new-pairs', JSON.stringify(f)) } catch {}
    try { localStorage.setItem('text_filters_new-pairs', JSON.stringify(t)) } catch {}
  }, [])

  const handleFiltersReset = useCallback(() => {
    const empty = buildInitialFilters()
    const emptyText = { labels: '', addressSuffixes: '' }
    setCustomFilters(empty)
    setTextFilters(emptyText)
    try { localStorage.removeItem('custom_filters_new-pairs') } catch {}
    try { localStorage.removeItem('text_filters_new-pairs') } catch {}
  }, [])

  // Keep dynamic sort fields in sync when dataWindow changes
  const handleDataWindow = useCallback((w: TimeWindow) => {
    setDataWindow(w)
    setSort(prev => {
      const DYNAMIC_PREFIXES = ['volume_', 'txns_', 'buys_', 'sells_']
      const prefix = DYNAMIC_PREFIXES.find(p => prev.startsWith(p))
      return prefix ? `${prefix}${w}` as SortField : prev
    })
  }, [])

  // On the New Pairs page, data is ALWAYS filtered to new pairs only.
  // The filter buttons only control sort order, not the data set.
  const sortField: SortField =
    filter === 'new' ? 'created_at' : sort

  const { pairs, allPairs, hasMore, isLoading, isValidating, loadMore } = useMockPairs({
    sort:   sortField,
    filter: 'new',       // always filter to new pairs on this page
    window: dataWindow,
    order,
    customFilters,
    textFilters,
    chain: isAllChains ? 'all' : chain,
  })

  const { prices, flashing, handlePriceUpdate } = useLivePrices(pairs)
  usePairWebSocket(pairs.map(p => p.address), handlePriceUpdate)

  return (
    <div className="flex flex-col flex-1 min-h-0 px-3 pt-3 md:px-5 md:pt-4 pb-0">
      <div className="mb-3 md:mb-4">
        <div className="flex items-center justify-between border-b border-border">
          <ChainTabs />
          <div className="hidden md:block"><LanguageSwitcher /></div>
        </div>
      </div>

      <StatsBar pairs={allPairs} showBlock={false} />

      <FilterBar
        filter={filter}
        dataWindow={dataWindow}
        trendingWindow={trendingWindow}
        onFilter={setFilter}
        onDataWindow={handleDataWindow}
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
