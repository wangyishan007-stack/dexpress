'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { fmtUsd, fmtPrice, shortAddr } from '../../lib/formatters'

interface RecentSwap {
  id: string
  tx_hash: string
  timestamp: string
  is_buy: boolean
  amount_usd: number
  amount0: number
  amount1: number
  price_usd: number
  sender: string | null
}

interface Props {
  swaps: RecentSwap[]
  swapHasMore: boolean
  swapLoading: boolean
  onLoadMore: () => void
}

type TypeFilterValue = 'all' | 'buy_sell' | 'buy' | 'sell' | 'add_remove' | 'add' | 'remove'

interface Filters {
  dateFrom: string
  dateTo: string
  type: TypeFilterValue
  usdMin: string
  usdMax: string
  ethMin: string
  ethMax: string
  maker: string
}

const EMPTY_FILTERS: Filters = {
  dateFrom: '', dateTo: '',
  type: 'all',
  usdMin: '', usdMax: '',
  ethMin: '', ethMax: '',
  maker: '',
}

type FilterKey = 'date' | 'type' | 'usd' | 'eth' | 'maker'

/* ── Icons ──────────────────────────────────────────────── */

function Spinner({ size = 3 }: { size?: number }) {
  return (
    <svg className={`animate-spin h-${size} w-${size}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
      <path d="M7.96333 7.24511C7.96333 6.98711 8.05133 6.73711 8.21233 6.53511L10.7053 3.41811C10.7424 3.37151 10.7625 3.31367 10.7623 3.25411V2.80011C10.7625 2.76562 10.7558 2.73144 10.7427 2.69954C10.7296 2.66764 10.7103 2.63864 10.6859 2.6142C10.6616 2.58977 10.6327 2.57038 10.6008 2.55715C10.569 2.54392 10.5348 2.53711 10.5003 2.53711H3.50033C3.43075 2.53737 3.36411 2.5652 3.31501 2.61449C3.2659 2.66379 3.23833 2.73053 3.23833 2.80011V3.25511C3.23833 3.31411 3.25833 3.37211 3.29533 3.41811L5.78933 6.53511C5.95033 6.73711 6.03933 6.98711 6.03933 7.24511V10.7671C6.03933 10.8671 6.09433 10.9571 6.18333 11.0021L7.96333 11.8921V7.24511ZM3.50033 1.66311H10.5003C11.1283 1.66311 11.6373 2.17311 11.6373 2.80111V3.25611C11.6373 3.51311 11.5493 3.76411 11.3883 3.96611L8.89533 7.08211C8.85845 7.12844 8.83836 7.1859 8.83833 7.24511V12.0331C8.83833 12.1674 8.80401 12.2994 8.73864 12.4167C8.67326 12.534 8.579 12.6327 8.46479 12.7033C8.35059 12.7739 8.22023 12.8142 8.08608 12.8203C7.95194 12.8264 7.81847 12.7981 7.69833 12.7381L5.79133 11.7841C5.60263 11.6895 5.44396 11.5443 5.33306 11.3647C5.22215 11.1851 5.16339 10.9782 5.16333 10.7671V7.24611C5.16333 7.18611 5.14333 7.12911 5.10533 7.08311L2.61133 3.96511C2.4498 3.76369 2.36163 3.5133 2.36133 3.25511V2.80011C2.36133 2.17211 2.87133 1.66211 3.49933 1.66211L3.50033 1.66311Z" fill={active ? 'currentColor' : '#999999'}/>
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-sub">
      <rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function IconSwap() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-sub">
      <path d="M4 5h8M12 5l-2-2M12 5l-2 2M12 11H4M4 11l2-2M4 11l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 7l3 3 5-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconToggle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
      <path d="M3 4.5h8M11 4.5L9 2.5M11 4.5L9 6.5M11 9.5H3M3 9.5l2-2M3 9.5l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* ── Header cell with filter icon ───────────────────────── */

function HeaderCell({ label, filterKey, activeFilters, onOpen, className }: {
  label: string
  filterKey: FilterKey
  activeFilters: Set<FilterKey>
  onOpen: (key: FilterKey) => void
  className?: string
}) {
  return (
    <button
      onClick={() => onOpen(filterKey)}
      className={clsx('flex items-center gap-1 hover:text-text transition-colors', className)}
    >
      <span>{label}</span>
      <FilterIcon active={activeFilters.has(filterKey)} />
    </button>
  )
}

/* ── Filter Modal wrapper ───────────────────────────────── */

function FilterModal({ title, open, onClose, children, onApply, onClear }: {
  title: string
  open: boolean
  onClose: () => void
  children: React.ReactNode
  onApply: () => void
  onClear: () => void
}) {
  const backdropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="w-full max-w-[480px] mx-4 rounded-xl border border-border bg-[#111] shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[16px] font-bold text-text">{title}</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-[28px] h-[28px] rounded-md text-sub hover:text-text hover:bg-border/40 transition-colors"
          >
            <IconClose />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5">
          {children}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onApply}
            className="flex items-center gap-1.5 h-[40px] px-6 rounded-lg bg-blue text-[14px] text-white hover:bg-blue/90 transition-colors"
          >
            <IconCheck />
            Apply
          </button>
          <button
            onClick={onClear}
            className="h-[40px] px-6 rounded-lg border border-border text-[14px] text-sub hover:text-text transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Date Filter ────────────────────────────────────────── */

function DateFilter({ from, to, onFromChange, onToChange }: {
  from: string; to: string
  onFromChange: (v: string) => void; onToChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* From */}
      <div className="flex items-center w-full h-[48px] rounded-lg border border-border overflow-hidden">
        <span className="flex items-center justify-center w-[72px] h-full bg-[#1a1a1a] text-[14px] text-sub border-r border-border flex-shrink-0">From</span>
        <input
          type="datetime-local"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          placeholder="YYYY/MM/DD --:--"
          className="flex-1 h-full bg-transparent px-3 text-[14px] text-text placeholder:text-[#555] outline-none"
        />
        <span className="flex items-center justify-center w-[48px] h-full flex-shrink-0">
          <IconCalendar />
        </span>
      </div>

      {/* Swap icon */}
      <IconSwap />

      {/* To */}
      <div className="flex items-center w-full h-[48px] rounded-lg border border-border overflow-hidden">
        <span className="flex items-center justify-center w-[72px] h-full bg-[#1a1a1a] text-[14px] text-sub border-r border-border flex-shrink-0">To</span>
        <input
          type="datetime-local"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          placeholder="YYYY/MM/DD --:--"
          className="flex-1 h-full bg-transparent px-3 text-[14px] text-text placeholder:text-[#555] outline-none"
        />
        <span className="flex items-center justify-center w-[48px] h-full flex-shrink-0">
          <IconCalendar />
        </span>
      </div>
    </div>
  )
}

/* ── Type Dropdown ──────────────────────────────────────── */

const TYPE_OPTIONS: { key: TypeFilterValue; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'buy_sell',   label: 'Buy / Sell' },
  { key: 'buy',        label: 'Buy' },
  { key: 'sell',       label: 'Sell' },
  { key: 'add_remove', label: 'Add / Remove' },
  { key: 'add',        label: 'Add' },
  { key: 'remove',     label: 'Remove' },
]

function TypeDropdown({ value, onChange, onClose }: {
  value: TypeFilterValue
  onChange: (v: TypeFilterValue) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 min-w-[180px] rounded-xl border border-border bg-[#111] shadow-2xl py-1 overflow-hidden"
    >
      {TYPE_OPTIONS.map((o, i) => (
        <button
          key={o.key}
          onClick={() => { onChange(o.key); onClose() }}
          className={clsx(
            'flex items-center gap-2 w-full px-4 h-[40px] text-[14px] transition-colors text-left',
            value === o.key ? 'text-text' : 'text-sub hover:text-text hover:bg-white/5',
            i === 0 && 'border-b border-border'
          )}
        >
          {value === o.key ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0">
              <path d="M2.5 7l3 3 6-6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <span className="w-[14px] flex-shrink-0" />
          )}
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ── Range Filter (USD / ETH / Price) ───────────────────── */

function RangeFilter({ min, max, onMinChange, onMaxChange, prefix, suffix }: {
  min: string; max: string
  onMinChange: (v: string) => void; onMaxChange: (v: string) => void
  prefix?: string; suffix?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center flex-1 h-[48px] rounded-lg border border-border overflow-hidden">
        <span className="flex items-center justify-center w-[56px] h-full bg-[#1a1a1a] text-[14px] text-sub border-r border-border flex-shrink-0">Min</span>
        {prefix && <span className="text-[14px] text-sub pl-3">{prefix}</span>}
        <input
          type="text"
          value={min}
          onChange={(e) => onMinChange(e.target.value)}
          placeholder="0"
          className="flex-1 h-full bg-transparent px-3 text-[14px] text-text placeholder:text-[#555] outline-none"
        />
        {suffix && <span className="text-[14px] text-sub pr-3">{suffix}</span>}
      </div>
      <span className="text-sub text-[14px]">—</span>
      <div className="flex items-center flex-1 h-[48px] rounded-lg border border-border overflow-hidden">
        <span className="flex items-center justify-center w-[56px] h-full bg-[#1a1a1a] text-[14px] text-sub border-r border-border flex-shrink-0">Max</span>
        {prefix && <span className="text-[14px] text-sub pl-3">{prefix}</span>}
        <input
          type="text"
          value={max}
          onChange={(e) => onMaxChange(e.target.value)}
          placeholder="∞"
          className="flex-1 h-full bg-transparent px-3 text-[14px] text-text placeholder:text-[#555] outline-none"
        />
        {suffix && <span className="text-[14px] text-sub pr-3">{suffix}</span>}
      </div>
    </div>
  )
}

/* ── Maker Filter ───────────────────────────────────────── */

function MakerFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center h-[48px] rounded-lg border border-border overflow-hidden">
      <span className="flex items-center justify-center w-[72px] h-full bg-[#1a1a1a] text-[14px] text-sub border-r border-border flex-shrink-0">Address</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0x..."
        className="flex-1 h-full bg-transparent px-3 text-[14px] text-text font-mono placeholder:text-[#555] outline-none"
      />
    </div>
  )
}

/* ── Main component ─────────────────────────────────────── */

export function TransactionsTable({ swaps, swapHasMore, swapLoading, onLoadMore }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS)
  const [openFilter, setOpenFilter] = useState<FilterKey | null>(null)

  const [priceInUsd, setPriceInUsd] = useState(true)

  const activeFilters = useMemo(() => {
    const set = new Set<FilterKey>()
    if (filters.dateFrom || filters.dateTo) set.add('date')
    if (filters.type !== 'all') set.add('type')
    if (filters.usdMin || filters.usdMax) set.add('usd')
    if (filters.ethMin || filters.ethMax) set.add('eth')
    if (filters.maker) set.add('maker')
    return set
  }, [filters])

  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false)

  const handleOpen = (key: FilterKey) => {
    if (key === 'type') {
      setTypeDropdownOpen((v) => !v)
      return
    }
    setDraft({ ...filters })
    setOpenFilter(key)
  }

  const handleApply = () => {
    setFilters({ ...draft })
    setOpenFilter(null)
  }

  const handleClear = () => {
    const cleared = { ...draft }
    switch (openFilter) {
      case 'date':  cleared.dateFrom = ''; cleared.dateTo = ''; break
      case 'type':  cleared.type = 'all'; break
      case 'usd':   cleared.usdMin = ''; cleared.usdMax = ''; break
      case 'eth':   cleared.ethMin = ''; cleared.ethMax = ''; break
      case 'maker': cleared.maker = ''; break
    }
    setDraft(cleared)
    setFilters(cleared)
    setOpenFilter(null)
  }

  const filtered = useMemo(() => {
    return swaps.filter((s) => {
      if (filters.dateFrom) {
        const from = new Date(filters.dateFrom).getTime()
        if (new Date(s.timestamp).getTime() < from) return false
      }
      if (filters.dateTo) {
        const to = new Date(filters.dateTo).getTime()
        if (new Date(s.timestamp).getTime() > to) return false
      }
      if (filters.type === 'buy' && !s.is_buy) return false
      if (filters.type === 'sell' && s.is_buy) return false
      if (filters.type === 'buy_sell') { /* show both buy & sell — no filter */ }
      if (filters.type === 'add_remove') return false
      if (filters.type === 'add') return false
      if (filters.type === 'remove') return false
      if (filters.usdMin && s.amount_usd < Number(filters.usdMin)) return false
      if (filters.usdMax && s.amount_usd > Number(filters.usdMax)) return false
      const ethAmt = Math.abs(Number(s.is_buy ? s.amount0 : s.amount1))
      if (filters.ethMin && ethAmt < Number(filters.ethMin)) return false
      if (filters.ethMax && ethAmt > Number(filters.ethMax)) return false
      if (filters.maker && s.sender && !s.sender.toLowerCase().includes(filters.maker.toLowerCase())) return false
      return true
    })
  }, [swaps, filters])

  return (
    <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
      {/* Column header */}
      <div className="grid grid-cols-[80px_48px_1fr_80px] md:grid-cols-[96px_56px_1fr_1fr_1fr_96px_40px] gap-x-2 md:gap-x-3 px-3 md:px-5 py-2 text-[14px] text-header border-b border-border sticky top-0 bg-surface z-10">
        <HeaderCell label="Date"  filterKey="date"  activeFilters={activeFilters} onOpen={handleOpen} />
        <div className="relative">
          <HeaderCell label="Type"  filterKey="type"  activeFilters={activeFilters} onOpen={handleOpen} />
          {typeDropdownOpen && (
            <TypeDropdown
              value={filters.type}
              onChange={(v) => setFilters((f) => ({ ...f, type: v }))}
              onClose={() => setTypeDropdownOpen(false)}
            />
          )}
        </div>
        <HeaderCell label="USD"   filterKey="usd"   activeFilters={activeFilters} onOpen={handleOpen} className="justify-end" />
        <HeaderCell label="ETH"   filterKey="eth"   activeFilters={activeFilters} onOpen={handleOpen} className="hidden md:flex justify-end" />
        <button
          onClick={() => setPriceInUsd(v => !v)}
          className="hidden md:flex items-center gap-1 justify-end hover:text-text transition-colors"
        >
          <span>Price</span>
          <IconToggle />
        </button>
        <HeaderCell label="Maker" filterKey="maker"  activeFilters={activeFilters} onOpen={handleOpen} className="justify-end" />
        <span className="hidden md:block text-center">TXN</span>
      </div>

      {filtered.length === 0 && (
        <div className="flex items-center justify-center py-8 text-sub text-[13px]">
          No transactions yet.
        </div>
      )}

      {filtered.map((s) => (
        <div
          key={s.id}
          className={clsx(
            'grid grid-cols-[80px_48px_1fr_80px] md:grid-cols-[96px_56px_1fr_1fr_1fr_96px_40px] gap-x-2 md:gap-x-3 px-3 md:px-5 py-2 text-[14px] border-b border-muted',
            s.is_buy ? 'hover:bg-green/5' : 'hover:bg-red/5'
          )}
        >
          <span className="text-sub tabular">
            {new Date(s.timestamp).toLocaleTimeString()}
          </span>
          <span className={clsx(s.is_buy ? 'text-green' : 'text-red')}>
            {s.is_buy ? 'BUY' : 'SELL'}
          </span>
          <span className={clsx('tabular text-right font-mono', s.is_buy ? 'text-green' : 'text-red')}>
            {fmtUsd(s.amount_usd)}
          </span>
          <span className="hidden md:block tabular text-right text-text">
            {Math.abs(Number(s.is_buy ? s.amount0 : s.amount1)).toFixed(4)}
          </span>
          <span className="hidden md:block tabular text-right text-sub font-mono">
            {priceInUsd ? fmtPrice(s.price_usd) : Math.abs(Number(s.is_buy ? s.amount0 : s.amount1)).toFixed(6)}
          </span>
          <span className="font-mono text-right text-sub truncate">
            {shortAddr(s.sender ?? '')}
          </span>
          <a
            href={`https://basescan.org/tx/${s.tx_hash}`}
            target="_blank"
            rel="noopener"
            className="hidden md:flex items-center justify-center text-sub hover:text-text transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5.5 2.5H3.5C2.94772 2.5 2.5 2.94772 2.5 3.5V10.5C2.5 11.0523 2.94772 11.5 3.5 11.5H10.5C11.0523 11.5 11.5 11.0523 11.5 10.5V8.5M8.5 2.5H11.5V5.5M11.5 2.5L6.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      ))}

      {swapHasMore && (
        <div className="flex justify-center py-3">
          <button
            onClick={onLoadMore}
            disabled={swapLoading}
            className="flex items-center gap-1.5 text-[12px] text-sub hover:text-text transition-colors disabled:opacity-50"
          >
            {swapLoading && <Spinner />}
            {swapLoading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      {/* ── Filter Modals ──────────────────────────────────── */}

      {/* Date */}
      <FilterModal
        title="Filter by Date"
        open={openFilter === 'date'}
        onClose={() => setOpenFilter(null)}
        onApply={handleApply}
        onClear={handleClear}
      >
        <DateFilter
          from={draft.dateFrom}
          to={draft.dateTo}
          onFromChange={(v) => setDraft(d => ({ ...d, dateFrom: v }))}
          onToChange={(v) => setDraft(d => ({ ...d, dateTo: v }))}
        />
      </FilterModal>

      {/* USD */}
      <FilterModal
        title="Filter by USD"
        open={openFilter === 'usd'}
        onClose={() => setOpenFilter(null)}
        onApply={handleApply}
        onClear={handleClear}
      >
        <RangeFilter
          min={draft.usdMin}
          max={draft.usdMax}
          onMinChange={(v) => setDraft(d => ({ ...d, usdMin: v }))}
          onMaxChange={(v) => setDraft(d => ({ ...d, usdMax: v }))}
          prefix="$"
        />
      </FilterModal>

      {/* ETH */}
      <FilterModal
        title="Filter by ETH"
        open={openFilter === 'eth'}
        onClose={() => setOpenFilter(null)}
        onApply={handleApply}
        onClear={handleClear}
      >
        <RangeFilter
          min={draft.ethMin}
          max={draft.ethMax}
          onMinChange={(v) => setDraft(d => ({ ...d, ethMin: v }))}
          onMaxChange={(v) => setDraft(d => ({ ...d, ethMax: v }))}
        />
      </FilterModal>

      {/* Maker */}
      <FilterModal
        title="Filter by Maker"
        open={openFilter === 'maker'}
        onClose={() => setOpenFilter(null)}
        onApply={handleApply}
        onClear={handleClear}
      >
        <MakerFilter
          value={draft.maker}
          onChange={(v) => setDraft(d => ({ ...d, maker: v }))}
        />
      </FilterModal>
    </div>
  )
}
