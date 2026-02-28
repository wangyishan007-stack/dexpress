'use client'

import { useState } from 'react'
import clsx from 'clsx'
import type { TimeWindow } from '@dex/shared'
import { TimeRangeDropdown } from './TimeRangeDropdown'
import { RankByDropdown } from './RankByDropdown'
import { ScreenerSettingsModal } from '../ScreenerSettingsModal'
import { FiltersModal } from '../FiltersModal'
import type { FilterValues, TextFilterValues } from '../FiltersModal'
import { DEFAULT_CONFIG } from '../../lib/columnConfig'
import type { ScreenerConfig } from '../../lib/columnConfig'

export type FilterMode = 'trending' | 'new' | 'gainers' | 'top'

interface Props {
  filter:          FilterMode
  dataWindow:      TimeWindow          // controls column display (Txns, Volume, Makers)
  trendingWindow:  TimeWindow          // controls trending/sort time window (pills)
  onFilter:        (f: FilterMode) => void
  onDataWindow:    (w: TimeWindow) => void
  onTrendingWindow:(w: TimeWindow) => void
  sort?:           string
  order?:          'asc' | 'desc'
  onSort?:         (s: string) => void
  onOrder?:        (o: 'asc' | 'desc') => void
  customFilters?:  FilterValues
  textFilters?:    TextFilterValues
  onCustomFiltersChange?: (f: FilterValues, t: TextFilterValues) => void
  onCustomFiltersReset?:  () => void
  screenerConfig?: ScreenerConfig
  onScreenerConfigChange?: (config: ScreenerConfig) => void
}

const WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: '5m',  label: '5M'  },
  { value: '1h',  label: '1H'  },
  { value: '6h',  label: '6H'  },
  { value: '24h', label: '24H' },
]

function IconTrending() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M6.94872 0.34335C5.30072 0.92935 4.47672 2.13835 4.10772 3.46835C3.77072 4.68135 3.81172 5.99835 3.94772 7.04735C3.56372 6.64335 3.25772 6.10535 3.08972 5.74535L3.01872 5.58035L2.98172 5.50735C2.9396 5.43918 2.88302 5.38109 2.81597 5.3372C2.74892 5.29331 2.67305 5.26468 2.59372 5.25335L2.50972 5.24535H2.50472C2.40956 5.24744 2.31666 5.27473 2.2355 5.32445C2.15433 5.37417 2.08781 5.44453 2.04272 5.52835L2.00872 5.60435C1.75114 6.45668 1.63493 7.34545 1.66472 8.23535C1.71672 9.68735 2.20672 11.4484 3.95772 12.6684L3.96272 12.6714C5.05872 13.3464 6.17072 13.6913 7.26872 13.6913H7.27272C8.50872 13.6353 9.55672 13.3194 10.3847 12.6964C11.2147 12.0724 11.8147 11.1473 12.1667 9.89135C12.1857 9.83535 12.2497 9.63435 12.2967 9.32835L12.2987 9.31335V9.31535L12.2967 9.32335L12.3107 9.19935C12.4232 8.20202 12.1845 7.19668 11.6357 6.35635L11.4757 6.12035C10.9427 5.38135 10.6577 4.84335 10.4977 4.41735C10.3986 4.15408 10.3302 3.88027 10.2937 3.60135L10.2637 3.36735L10.2497 3.25535C10.2383 3.15802 10.2004 3.0657 10.14 2.98846C10.0797 2.91122 9.99937 2.85203 9.90772 2.81735C9.82759 2.78723 9.74152 2.77633 9.65641 2.78554C9.57131 2.79474 9.48955 2.82379 9.41772 2.87035L9.35972 2.91535C8.64172 3.54335 8.35472 4.29935 8.22972 4.98135C7.45372 3.12935 7.59972 1.59635 7.66572 0.89935C7.67304 0.820692 7.66294 0.741388 7.63616 0.667071C7.60937 0.592754 7.56654 0.525249 7.51072 0.46935L7.45772 0.42435C7.38616 0.369491 7.30204 0.333353 7.21299 0.319209C7.12393 0.305066 7.03376 0.313363 6.94872 0.34335Z" fill="currentColor"/>
    </svg>
  )
}
function IconTop() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M8.02083 1.75C8.33025 1.75 8.627 1.87292 8.84579 2.09171C9.06458 2.3105 9.1875 2.60725 9.1875 2.91667V5.25H11.5208C11.8303 5.25 12.127 5.37292 12.3458 5.59171C12.5646 5.8105 12.6875 6.10725 12.6875 6.41667V11.9583C12.6876 12.2472 12.5805 12.5258 12.3869 12.7402C12.1934 12.9547 11.9272 13.0897 11.6398 13.1192L11.5208 13.125H2.47917L2.36017 13.1192C2.09328 13.0917 1.844 12.9731 1.65434 12.7833C1.46468 12.5936 1.34622 12.3442 1.31892 12.0773L1.3125 11.9583V8.16667C1.3125 7.85725 1.43542 7.5605 1.65421 7.34171C1.873 7.12292 2.16975 7 2.47917 7H4.8125V2.91667C4.8125 2.60725 4.93542 2.3105 5.15421 2.09171C5.373 1.87292 5.66975 1.75 5.97917 1.75H8.02083Z" fill="currentColor"/>
    </svg>
  )
}
function IconGainers() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M6.75897 1.50391C7.00534 1.48437 7.25005 1.54374 7.45819 1.66992L7.54608 1.72852L7.55878 1.73828L7.57147 1.74902L7.64667 1.8125L7.66229 1.8252L7.67694 1.83984L10.9348 5.08301L10.9357 5.08398C11.1183 5.26686 11.2343 5.50453 11.2678 5.75781L11.2775 5.86719L11.2766 5.97656C11.2621 6.23205 11.1642 6.47809 10.9963 6.67383C10.804 6.8974 10.5337 7.03957 10.2424 7.07324C9.95048 7.10665 9.65418 7.02878 9.4162 6.85449L9.40448 6.8457L9.39178 6.83496L9.31561 6.77148L9.29901 6.75781L9.28339 6.74219L8.02362 5.48633V12.2695C8.02329 12.5638 7.90209 12.8427 7.69159 13.0479L7.68866 13.0508C7.48077 13.2497 7.20865 13.3646 6.92401 13.3799L6.92499 13.3809C6.64399 13.3973 6.35794 13.3167 6.12811 13.1436C6.01128 13.057 5.91224 12.9483 5.83807 12.8242C5.76407 12.7003 5.71441 12.5608 5.69354 12.416L5.69061 12.3965L5.68964 12.377L5.68475 12.3018L5.68378 12.2861V5.53125L4.50507 6.73242C4.2973 6.94381 4.01768 7.0673 3.72479 7.08105C3.43077 7.09475 3.14102 6.99613 2.91522 6.80566C2.68976 6.61507 2.54484 6.34564 2.50897 6.05371C2.47328 5.76104 2.54935 5.46539 2.72186 5.22656L2.74335 5.19922L2.8078 5.12207L2.8205 5.10645L2.83514 5.0918L6.01776 1.84961C6.21523 1.6488 6.47879 1.52638 6.75897 1.50391Z" fill="currentColor"/>
    </svg>
  )
}
function IconNew() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1.18546 3.17539C2.924 2.92714 6.52641 3.47154 7.83975 7.38633C8.01949 7.9223 8.06827 8.49094 8.06827 9.05625V11.3287C8.06805 11.6506 7.8071 11.9115 7.48526 11.9117H7.06339C6.74136 11.9117 6.47962 11.6507 6.4794 11.3287V8.47031L6.30069 8.45859C4.40179 8.30508 0.980345 7.07325 1.18546 3.17539ZM7.00968 4.23398C8.91559 1.48143 11.6857 1.49927 12.8329 1.85215C12.8327 5.02834 10.0473 6.35549 8.45889 6.70859C8.16725 5.25036 7.58329 4.66664 7.00968 4.23398Z" fill="currentColor"/>
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

export function FilterBar({
  filter, dataWindow, trendingWindow, onFilter, onDataWindow, onTrendingWindow,
  sort, order, onSort, onOrder,
  customFilters, textFilters, onCustomFiltersChange, onCustomFiltersReset,
  screenerConfig, onScreenerConfigChange,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const filterCount =
    (customFilters ? Object.values(customFilters).filter(v => v.min !== '' || v.max !== '').length : 0)
    + (textFilters?.labels ? 1 : 0)
    + (textFilters?.addressSuffixes ? 1 : 0)

  /* Build rank label from current sort field */
  const rankLabel = (() => {
    const s = sort ?? 'trending_score'
    if (s === 'trending_score' || s.startsWith('trending_'))  return `Trending ${trendingWindow.toUpperCase()}`
    if (s.startsWith('txns_'))    return `Txns ${s.split('_').pop()?.toUpperCase()}`
    if (s.startsWith('buys_'))    return `Buys ${s.split('_').pop()?.toUpperCase()}`
    if (s.startsWith('sells_'))   return `Sells ${s.split('_').pop()?.toUpperCase()}`
    if (s.startsWith('volume_'))  return `Volume ${s.split('_').pop()?.toUpperCase()}`
    if (s.startsWith('change_'))  return `Gainers ${s.split('_').pop()?.toUpperCase()}`
    if (s === 'liquidity_usd')    return 'Liquidity'
    if (s === 'mcap_usd')         return 'Market Cap'
    if (s === 'created_at')       return 'Created At'
    return s
  })()

  return (
    <div className="flex flex-col gap-2 py-2 md:flex-row md:items-center md:justify-between md:py-3">
      {/* Left group */}
      <div className="flex items-center gap-2 md:gap-4 flex-nowrap overflow-x-auto scrollbar-hide md:overflow-visible">

        {/* Last X hours dropdown — controls data columns */}
        <TimeRangeDropdown window={dataWindow} onWindow={onDataWindow} />

        {/* Trending + time window pills — independent from data window */}
        {filter === 'trending' ? (
          <div className="flex items-center gap-2 bg-border rounded-lg h-[30px] md:h-[36px] px-2.5 flex-shrink-0">
            <button
              onClick={() => onFilter('trending')}
              className="flex items-center gap-2 text-text transition-colors"
            >
              <IconTrending />
              <span className="text-[12px] md:text-[14px] font-medium">Trending</span>
            </button>
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                onClick={() => { onFilter('trending'); onTrendingWindow(w.value); onSort?.(`trending_${w.value}`) }}
                className={clsx(
                  'rounded-lg px-1.5 py-0.5 text-[12px] md:text-[14px] font-medium transition-colors',
                  trendingWindow === w.value
                    ? 'bg-blue text-white'
                    : 'bg-muted text-text hover:text-white'
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        ) : (
          <button
            onClick={() => { onFilter('trending'); onSort?.(`trending_${trendingWindow}`) }}
            className={clsx(BTN, 'bg-border text-text hover:text-white')}
          >
            <IconTrending />
            Trending
          </button>
        )}

        {/* Top + Volume/Txns pills */}
        {filter === 'top' ? (
          <div className="flex items-center gap-2 bg-border rounded-lg h-[30px] md:h-[36px] px-2.5 flex-shrink-0">
            <button
              onClick={() => onFilter('top')}
              className="flex items-center gap-2 text-text transition-colors"
            >
              <IconTop />
              <span className="text-[12px] md:text-[14px] font-medium">Top</span>
            </button>
            <button
              onClick={() => { onFilter('top'); onSort?.(`volume_${dataWindow}`) }}
              className={clsx(
                'rounded-lg px-1.5 py-0.5 text-[12px] md:text-[14px] font-medium transition-colors',
                sort?.startsWith('volume_')
                  ? 'bg-blue text-white'
                  : 'bg-muted text-text hover:text-white'
              )}
            >
              Volume
            </button>
            <button
              onClick={() => { onFilter('top'); onSort?.(`txns_${dataWindow}`) }}
              className={clsx(
                'rounded-lg px-1.5 py-0.5 text-[12px] md:text-[14px] font-medium transition-colors',
                sort?.startsWith('txns_')
                  ? 'bg-blue text-white'
                  : 'bg-muted text-text hover:text-white'
              )}
            >
              Txns
            </button>
          </div>
        ) : (
          <button
            onClick={() => { onFilter('top'); onSort?.(`volume_${dataWindow}`) }}
            className={clsx(BTN, 'bg-border text-text hover:text-white')}
          >
            <IconTop />
            Top
          </button>
        )}

        {/* Gainers + time window pills */}
        {filter === 'gainers' ? (
          <div className="flex items-center gap-2 bg-border rounded-lg h-[30px] md:h-[36px] px-2.5 flex-shrink-0">
            <button
              onClick={() => onFilter('gainers')}
              className="flex items-center gap-2 text-text transition-colors"
            >
              <IconGainers />
              <span className="text-[12px] md:text-[14px] font-medium">Gainers</span>
            </button>
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                onClick={() => { onFilter('gainers'); onTrendingWindow(w.value); onSort?.(`change_${w.value}`) }}
                className={clsx(
                  'rounded-lg px-1.5 py-0.5 text-[12px] md:text-[14px] font-medium transition-colors',
                  trendingWindow === w.value
                    ? 'bg-blue text-white'
                    : 'bg-muted text-text hover:text-white'
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        ) : (
          <button
            onClick={() => { onFilter('gainers'); onSort?.(`change_${trendingWindow}`) }}
            className={clsx(BTN, 'bg-border text-text hover:text-white')}
          >
            <IconGainers />
            Gainers
          </button>
        )}

        {/* New Pairs */}
        <button
          onClick={() => { onFilter('new'); onSort?.('created_at') }}
          className={clsx(BTN, filter === 'new' ? 'bg-blue text-white' : 'bg-border text-text hover:text-white')}
        >
          <IconNew />
          New Pairs
        </button>

      </div>

      {/* Right group — single bordered container */}
      <div className="flex items-center border border-border rounded-lg h-[30px] md:h-[36px] flex-shrink-0">
        {/* Rank by */}
        <RankByDropdown
          sort={sort ?? 'trending_score'}
          order={order ?? 'desc'}
          onSort={onSort ?? (() => {})}
          onOrder={onOrder ?? (() => {})}
          rankLabel={rankLabel}
        />

        {/* Filters */}
        <button
          onClick={() => setFiltersOpen(true)}
          className="flex items-center gap-2 h-full px-3 md:px-4 border-r border-border text-sub hover:text-white transition-colors"
        >
          <IconFilter />
          <span className="hidden md:inline text-[14px]">Filters</span>
          {filterCount > 0 && (
            <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue text-white text-[11px] font-bold leading-none">
              {filterCount}
            </span>
          )}
        </button>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center justify-center h-full px-3 text-sub hover:text-white transition-colors"
        >
          <IconSettings />
        </button>
      </div>

      {screenerConfig && onScreenerConfigChange ? (
        <ScreenerSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          config={screenerConfig}
          onApply={onScreenerConfigChange}
        />
      ) : (
        <ScreenerSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          config={DEFAULT_CONFIG}
          onApply={() => {}}
        />
      )}
      <FiltersModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        initialFilters={customFilters}
        initialTextFilters={textFilters}
        onApply={onCustomFiltersChange}
        onReset={onCustomFiltersReset}
      />
    </div>
  )
}
