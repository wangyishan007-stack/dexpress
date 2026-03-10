'use client'

import { useState, useCallback, useEffect } from 'react'
import type { SortField, TimeWindow } from '@dex/shared'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('page')
  const [filter, setFilter]               = useState<FilterMode>('trending')
  const [dataWindow, setDataWindow]       = useState<TimeWindow>('24h')
  const [trendingWindow, setTrendingWindow] = useState<TimeWindow>('6h')
  const [sort, setSort]                   = useState<SortField>('trending_6h')
  const [order, setOrder]                 = useState<'asc' | 'desc'>('desc')
  const [customFilters, setCustomFilters] = useState<FilterValues>(() => {
    try {
      const saved = localStorage.getItem('custom_filters_allcoins')
      return saved ? JSON.parse(saved) : buildInitialFilters()
    } catch { return buildInitialFilters() }
  })
  const [textFilters, setTextFilters] = useState<TextFilterValues>(() => {
    try {
      const saved = localStorage.getItem('text_filters_allcoins')
      return saved ? JSON.parse(saved) : { labels: '', addressSuffixes: '' }
    } catch { return { labels: '', addressSuffixes: '' } }
  })
  const [screenerConfig, setScreenerConfig] = useState<ScreenerConfig>(DEFAULT_CONFIG)
  useEffect(() => { setScreenerConfig(loadConfig('allcoins')) }, [])

  const handleScreenerConfigChange = useCallback((config: ScreenerConfig) => {
    setScreenerConfig(config)
    saveConfig(config, 'allcoins')
  }, [])

  const handleFiltersChange = useCallback((f: FilterValues, t: TextFilterValues) => {
    setCustomFilters(f)
    setTextFilters(t)
    try { localStorage.setItem('custom_filters_allcoins', JSON.stringify(f)) } catch {}
    try { localStorage.setItem('text_filters_allcoins', JSON.stringify(t)) } catch {}
  }, [])

  const handleFiltersReset = useCallback(() => {
    const empty = buildInitialFilters()
    const emptyText = { labels: '', addressSuffixes: '' }
    setCustomFilters(empty)
    setTextFilters(emptyText)
    try { localStorage.removeItem('custom_filters_allcoins') } catch {}
    try { localStorage.removeItem('text_filters_allcoins') } catch {}
  }, [])

  // Fix 1: when dataWindow changes, keep dynamic sort fields in sync
  // e.g. if sort='volume_24h' and user switches to 1h, update to 'volume_1h'
  const handleDataWindow = useCallback((w: TimeWindow) => {
    setDataWindow(w)
    setSort(prev => {
      const DYNAMIC_PREFIXES = ['volume_', 'txns_', 'buys_', 'sells_']
      const isDynamic = DYNAMIC_PREFIXES.some(p => prev.startsWith(p))
      if (!isDynamic) return prev
      const prefix = DYNAMIC_PREFIXES.find(p => prev.startsWith(p))!
      return `${prefix}${w}` as SortField
    })
  }, [])

  const sortField: SortField =
    filter === 'new' ? 'created_at' : sort

  const { pairs, allPairs, hasMore, isLoading, isValidating, loadMore, mutate, error } = useMockPairs({
    sort:   sortField,
    filter,
    window: dataWindow,
    order,
    customFilters,
    textFilters,
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
    <div className="flex flex-col flex-1 min-h-0 px-3 pt-3 md:px-5 md:pt-4 pb-0">
      {/* Page heading — desktop only (mobile uses tab nav) */}
      <div className="hidden md:block mb-4">
        <div className="flex items-center gap-8 border-b border-border pb-0">
          <div className="border-b-2 border-blue pb-3">
            <span className="text-[16px] font-bold text-text">{t('allCoins')}</span>
          </div>
        </div>
      </div>

      <StatsBar pairs={allPairs} />

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
