'use client'

import { useState, useEffect } from 'react'
import clsx from 'clsx'
import type { TimeWindow, SortField } from '@dex/shared'
import { useMockPairs, useLivePrices } from '../../hooks/useMockPairs'
import { usePairWebSocket }        from '../../hooks/useWebSocket'
import { PairList }                from '../../components/PairList'
import { StatsBar }                from '../../components/StatsBar'
import { TimeRangeDropdown }       from '../../components/FilterBar/TimeRangeDropdown'
import { ScreenerSettingsModal }   from '../../components/ScreenerSettingsModal'
import { FiltersModal }            from '../../components/FiltersModal'
import { loadConfig, saveConfig, DEFAULT_CONFIG }  from '../../lib/columnConfig'
import type { ScreenerConfig }     from '../../lib/columnConfig'

type Tab = 'gainers' | 'losers'
type SortBy = 'change' | 'volume' | 'liquidity'

function IconGainersHead() {
  return (
    <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
      <path d="M6.75897 1.50391C7.00534 1.48437 7.25005 1.54374 7.45819 1.66992L7.54608 1.72852L7.55878 1.73828L7.57147 1.74902L7.64667 1.8125L7.66229 1.8252L7.67694 1.83984L10.9348 5.08301L10.9357 5.08398C11.1183 5.26686 11.2343 5.50453 11.2678 5.75781L11.2775 5.86719L11.2766 5.97656C11.2621 6.23205 11.1642 6.47809 10.9963 6.67383C10.804 6.8974 10.5337 7.03957 10.2424 7.07324C9.95048 7.10665 9.65418 7.02878 9.4162 6.85449L9.40448 6.8457L9.39178 6.83496L9.31561 6.77148L9.29901 6.75781L9.28339 6.74219L8.02362 5.48633V12.2695C8.02329 12.5638 7.90209 12.8427 7.69159 13.0479L7.68866 13.0508C7.48077 13.2497 7.20865 13.3646 6.92401 13.3799L6.92499 13.3809C6.64399 13.3973 6.35794 13.3167 6.12811 13.1436C6.01128 13.057 5.91224 12.9483 5.83807 12.8242C5.76407 12.7003 5.71441 12.5608 5.69354 12.416L5.69061 12.3965L5.68964 12.377L5.68475 12.3018L5.68378 12.2861V5.53125L4.50507 6.73242C4.2973 6.94381 4.01768 7.0673 3.72479 7.08105C3.43077 7.09475 3.14102 6.99613 2.91522 6.80566C2.68976 6.61507 2.54484 6.34564 2.50897 6.05371C2.47328 5.76104 2.54935 5.46539 2.72186 5.22656L2.74335 5.19922L2.8078 5.12207L2.8205 5.10645L2.83514 5.0918L6.01776 1.84961C6.21523 1.6488 6.47879 1.52638 6.75897 1.50391Z" fill="currentColor"/>
    </svg>
  )
}
function IconUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M6.75897 1.50391C7.00534 1.48437 7.25005 1.54374 7.45819 1.66992L7.54608 1.72852L7.55878 1.73828L7.57147 1.74902L7.64667 1.8125L7.66229 1.8252L7.67694 1.83984L10.9348 5.08301L10.9357 5.08398C11.1183 5.26686 11.2343 5.50453 11.2678 5.75781L11.2775 5.86719L11.2766 5.97656C11.2621 6.23205 11.1642 6.47809 10.9963 6.67383C10.804 6.8974 10.5337 7.03957 10.2424 7.07324C9.95048 7.10665 9.65418 7.02878 9.4162 6.85449L9.40448 6.8457L9.39178 6.83496L9.31561 6.77148L9.29901 6.75781L9.28339 6.74219L8.02362 5.48633V12.2695C8.02329 12.5638 7.90209 12.8427 7.69159 13.0479L7.68866 13.0508C7.48077 13.2497 7.20865 13.3646 6.92401 13.3799L6.92499 13.3809C6.64399 13.3973 6.35794 13.3167 6.12811 13.1436C6.01128 13.057 5.91224 12.9483 5.83807 12.8242C5.76407 12.7003 5.71441 12.5608 5.69354 12.416L5.69061 12.3965L5.68964 12.377L5.68475 12.3018L5.68378 12.2861V5.53125L4.50507 6.73242C4.2973 6.94381 4.01768 7.0673 3.72479 7.08105C3.43077 7.09475 3.14102 6.99613 2.91522 6.80566C2.68976 6.61507 2.54484 6.34564 2.50897 6.05371C2.47328 5.76104 2.54935 5.46539 2.72186 5.22656L2.74335 5.19922L2.8078 5.12207L2.8205 5.10645L2.83514 5.0918L6.01776 1.84961C6.21523 1.6488 6.47879 1.52638 6.75897 1.50391Z" fill="currentColor"/>
    </svg>
  )
}
function IconDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="rotate-180">
      <path d="M6.75897 1.50391C7.00534 1.48437 7.25005 1.54374 7.45819 1.66992L7.54608 1.72852L7.55878 1.73828L7.57147 1.74902L7.64667 1.8125L7.66229 1.8252L7.67694 1.83984L10.9348 5.08301L10.9357 5.08398C11.1183 5.26686 11.2343 5.50453 11.2678 5.75781L11.2775 5.86719L11.2766 5.97656C11.2621 6.23205 11.1642 6.47809 10.9963 6.67383C10.804 6.8974 10.5337 7.03957 10.2424 7.07324C9.95048 7.10665 9.65418 7.02878 9.4162 6.85449L9.40448 6.8457L9.39178 6.83496L9.31561 6.77148L9.29901 6.75781L9.28339 6.74219L8.02362 5.48633V12.2695C8.02329 12.5638 7.90209 12.8427 7.69159 13.0479L7.68866 13.0508C7.48077 13.2497 7.20865 13.3646 6.92401 13.3799L6.92499 13.3809C6.64399 13.3973 6.35794 13.3167 6.12811 13.1436C6.01128 13.057 5.91224 12.9483 5.83807 12.8242C5.76407 12.7003 5.71441 12.5608 5.69354 12.416L5.69061 12.3965L5.68964 12.377L5.68475 12.3018L5.68378 12.2861V5.53125L4.50507 6.73242C4.2973 6.94381 4.01768 7.0673 3.72479 7.08105C3.43077 7.09475 3.14102 6.99613 2.91522 6.80566C2.68976 6.61507 2.54484 6.34564 2.50897 6.05371C2.47328 5.76104 2.54935 5.46539 2.72186 5.22656L2.74335 5.19922L2.8078 5.12207L2.8205 5.10645L2.83514 5.0918L6.01776 1.84961C6.21523 1.6488 6.47879 1.52638 6.75897 1.50391Z" fill="currentColor"/>
    </svg>
  )
}
function IconFilter() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M6.15597 12.2664C6.06831 12.2664 5.98063 12.2226 5.9368 12.2226C5.8053 12.1349 5.71762 11.9596 5.71762 11.8281V8.01445L1.86017 2.44745C1.77251 2.31596 1.72867 2.14061 1.81634 1.96527C1.90402 1.83377 2.03551 1.74609 2.21086 1.74609H11.8545C12.0298 1.74609 12.1613 1.83376 12.249 1.96527C12.3367 2.09677 12.2928 2.27211 12.2051 2.40362L8.34771 8.01445V10.9514C8.34771 11.1267 8.26003 11.2582 8.08471 11.3459L6.33132 12.2226C6.28748 12.2664 6.24365 12.2664 6.15597 12.2664Z" fill="currentColor"/>
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M12.8515 8.14844L11.8125 7.36094C11.8234 7.25156 11.8344 7.13125 11.8344 7C11.8344 6.86875 11.8234 6.74844 11.8125 6.63906L12.8515 5.85156C13.1359 5.63281 13.2125 5.25 13.0265 4.92188L11.8672 2.96406C11.7359 2.73438 11.4844 2.59219 11.2219 2.59219C11.1344 2.59219 11.0578 2.60313 10.9703 2.63594L9.73436 3.11719C9.52655 2.975 9.3078 2.85469 9.08905 2.75625L8.90311 1.49844C8.84842 1.1375 8.54217 0.875 8.1703 0.875H5.82967C5.4578 0.875 5.15155 1.1375 5.09686 1.4875L4.92186 2.75625C4.70311 2.85469 4.4953 2.975 4.27655 3.11719L3.04061 2.63594C2.95311 2.60313 2.86561 2.59219 2.77811 2.59219C2.51561 2.59219 2.26405 2.72344 2.14374 2.95312L0.973424 4.92188C0.787487 5.22812 0.864049 5.63281 1.14842 5.85156L2.18749 6.63906C2.17655 6.77031 2.16561 6.89062 2.16561 7C2.16561 7.10938 2.16561 7.22969 2.18749 7.36094L1.14842 8.14844C0.864049 8.36719 0.787487 8.75 0.973424 9.07812L2.1328 11.0359C2.26405 11.2656 2.51561 11.4078 2.77811 11.4078C2.86561 11.4078 2.94217 11.3969 3.02967 11.3641L4.26561 10.8828C4.47342 11.025 4.69217 11.1453 4.91092 11.2438L5.09686 12.5016C5.14061 12.8516 5.4578 13.125 5.82967 13.125H8.1703C8.54217 13.125 8.84842 12.8625 8.90311 12.5125L9.08905 11.2438C9.3078 11.1453 9.51561 11.025 9.73436 10.8828L10.9703 11.3641C11.0578 11.3969 11.1453 11.4078 11.2328 11.4078C11.4953 11.4078 11.7469 11.2766 11.8672 11.0469L13.0375 9.06719C13.2125 8.75 13.1359 8.36719 12.8515 8.14844ZM9.62499 7C9.62499 8.44375 8.44374 9.625 6.99999 9.625C5.55624 9.625 4.37499 8.44375 4.37499 7C4.37499 5.55625 5.55624 4.375 6.99999 4.375C8.44374 4.375 9.62499 5.55625 9.62499 7Z" fill="currentColor"/>
    </svg>
  )
}

const BTN = 'flex items-center gap-2 rounded-lg font-medium transition-colors flex-shrink-0 h-[30px] px-2.5 text-[12px] md:h-[36px] md:px-2.5 md:text-[14px]'

export default function GainersPage() {
  const [tab, setTab] = useState<Tab>('gainers')
  const [window, setWindow] = useState<TimeWindow>('24h')
  const [sortBy, setSortBy] = useState<SortBy>('change')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [screenerConfig, setScreenerConfig] = useState<ScreenerConfig>(DEFAULT_CONFIG)
  useEffect(() => { setScreenerConfig(loadConfig('gainers')) }, [])

  const handleScreenerConfigChange = (config: ScreenerConfig) => {
    setScreenerConfig(config)
    saveConfig(config, 'gainers')
  }

  const sortField = (
    sortBy === 'volume'    ? `volume_${window}` :
    sortBy === 'liquidity' ? 'liquidity_usd'    :
                             `change_${window}`
  ) as SortField

  const { pairs, hasMore, isLoading, isValidating, loadMore } = useMockPairs({
    sort:   sortField,
    filter: 'trending',
    order:  tab === 'gainers' ? 'desc' : 'asc',
  })

  const { prices, flashing, handlePriceUpdate } = useLivePrices(pairs)
  usePairWebSocket(pairs.map(p => p.address), handlePriceUpdate)

  return (
    <div className="flex flex-col h-full px-3 pt-3 md:px-5 md:pt-4 pb-0">
      {/* Page heading — desktop only (mobile uses tab nav) */}
      <div className="hidden md:block mb-4">
        <div className="flex items-center gap-8 border-b border-border pb-0">
          <div className="border-b-2 border-blue pb-3">
            <span className="text-[16px] font-bold text-text">Gainers &amp; Losers</span>
          </div>
        </div>
      </div>

      {/* Stats bar — no Latest Block */}
      <StatsBar showBlock={false} />

      {/* Filter bar */}
      <div className="flex flex-col gap-2 py-2 md:flex-row md:items-center md:justify-between md:py-3">
        {/* Left group */}
        <div className="flex items-center gap-2 md:gap-4 flex-nowrap overflow-x-auto scrollbar-hide md:overflow-visible">
          <TimeRangeDropdown window={window} onWindow={setWindow} />

          <button
            onClick={() => { setTab('gainers'); setSortBy('change') }}
            className={clsx(BTN, tab === 'gainers' ? 'bg-blue text-white' : 'bg-border text-text hover:text-white')}
          >
            <IconUp />
            Gainers
          </button>

          <button
            onClick={() => { setTab('losers'); setSortBy('change') }}
            className={clsx(BTN, tab === 'losers' ? 'bg-blue text-white' : 'bg-border text-text hover:text-white')}
          >
            <IconDown />
            Losers
          </button>

        </div>

        {/* Right group */}
        <div className="flex items-center border border-border rounded-lg h-[30px] md:h-[36px] flex-shrink-0">
          <button
            onClick={() => setFiltersOpen(true)}
            className="flex items-center gap-2 h-full px-3 md:px-4 border-r border-border text-sub hover:text-white transition-colors"
          >
            <IconFilter />
            <span className="hidden md:inline text-[14px]">Filters</span>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex items-center justify-center h-full px-3 text-sub hover:text-white transition-colors"
          >
            <IconSettings />
          </button>
        </div>
      </div>

      <ScreenerSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} config={screenerConfig} onApply={handleScreenerConfigChange} />
      <FiltersModal open={filtersOpen} onClose={() => setFiltersOpen(false)} />

      {/* Pair list */}
      <PairList
        pairs={pairs}
        hasMore={hasMore}
        onLoadMore={loadMore}
        isValidating={isValidating}
        livePrices={prices}
        flashing={flashing}
        timeWindow={window}
        loading={isLoading}
        columnConfig={screenerConfig}
      />
    </div>
  )
}
