'use client'

import clsx from 'clsx'
import type { TimeWindow } from '@dex/shared'

export type FilterMode = 'trending' | 'new' | 'gainers' | 'top'

interface Props {
  filter:   FilterMode
  window:   TimeWindow
  onFilter: (f: FilterMode) => void
  onWindow: (w: TimeWindow) => void
}

const WINDOWS: { value: TimeWindow; label: string }[] = [
  { value: '5m',  label: '5M'  },
  { value: '1h',  label: '1H'  },
  { value: '6h',  label: '6H'  },
  { value: '24h', label: '24H' },
]

function IconTrending() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1 8L4 5L6.5 7.5L11 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 2H11V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconTop() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 3.5V8.5M3.5 6H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
function IconGainers() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1 9L4.5 5.5L7 8L11 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconNew() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M6 1L7.35 4.22L11 4.22L8.03 6.38L9.38 9.6L6 7.44L2.62 9.6L3.97 6.38L1 4.22L4.65 4.22L6 1Z" fill="currentColor" opacity="0.8"/>
    </svg>
  )
}
function IconClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}
function IconChevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}
function IconFilter() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1 3h10M3 6h6M5 9h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M7 1.5V3M7 11V12.5M1.5 7H3M11 7H12.5M2.93 2.93L4 4M10 10L11.07 11.07M2.93 11.07L4 10M10 4L11.07 2.93" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}
function IconRank() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 9L5 5.5L7.5 8L10.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const BTN_BASE = 'flex items-center gap-1.5 h-[36px] rounded-[8px] px-3 text-[14px] font-medium transition-colors'
const BTN_ACTIVE = 'bg-blue text-white'
const BTN_INACTIVE = 'bg-[#222] text-sub hover:text-white'

export function FilterBar({ filter, window, onFilter, onWindow }: Props) {
  const rankLabel =
    filter === 'gainers' ? `Gainers ${window.toUpperCase()}` :
    filter === 'top'     ? 'Liquidity' :
    filter === 'new'     ? 'Created At' :
    `Trending ${window.toUpperCase()}`

  return (
    <div className="flex items-center justify-between gap-2 py-3 border-b border-border">
      {/* Left group */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Last 24 hours dropdown */}
        <button className={clsx(BTN_BASE, 'bg-[#222] text-blue hover:text-blue/80')}>
          <span><IconClock /></span>
          Last 24 hours
          <IconChevron />
        </button>

        {/* Trending */}
        <button
          onClick={() => onFilter('trending')}
          className={clsx(BTN_BASE, filter === 'trending' ? BTN_ACTIVE : BTN_INACTIVE)}
        >
          <IconTrending />
          Trending
        </button>

        {/* Time window pills */}
        <div className="flex gap-1.5">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => { onFilter('trending'); onWindow(w.value) }}
              className={clsx(
                'h-[36px] rounded-[8px] px-3 text-[14px] font-medium transition-colors',
                filter === 'trending' && window === w.value
                  ? BTN_ACTIVE
                  : BTN_INACTIVE
              )}
            >
              {w.label}
            </button>
          ))}
        </div>

        {/* Top */}
        <button
          onClick={() => onFilter('top')}
          className={clsx(BTN_BASE, filter === 'top' ? BTN_ACTIVE : BTN_INACTIVE)}
        >
          <IconTop />
          Top
        </button>

        {/* Gainers */}
        <button
          onClick={() => onFilter('gainers')}
          className={clsx(BTN_BASE, filter === 'gainers' ? BTN_ACTIVE : BTN_INACTIVE)}
        >
          <IconGainers />
          Gainers
        </button>

        {/* New Pairs */}
        <button
          onClick={() => onFilter('new')}
          className={clsx(BTN_BASE, filter === 'new' ? BTN_ACTIVE : BTN_INACTIVE)}
        >
          <IconNew />
          New Pairs
        </button>
      </div>

      {/* Right group */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Rank by dropdown */}
        <button className={clsx(BTN_BASE, 'bg-[#222] text-sub hover:text-white')}>
          <IconRank />
          <span className="text-sub">Rank by:</span>
          <span className="text-text font-medium">{rankLabel}</span>
          <IconChevron />
        </button>

        {/* Filters */}
        <button className={clsx(BTN_BASE, 'bg-[#222] text-sub hover:text-white')}>
          <IconFilter />
          Filters
        </button>

        {/* Settings */}
        <button className="flex h-[36px] w-[36px] items-center justify-center rounded-[8px] bg-[#222] text-sub hover:text-white transition-colors">
          <IconSettings />
        </button>
      </div>
    </div>
  )
}
