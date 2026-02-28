'use client'

import { useState, useEffect, useCallback } from 'react'

export interface FilterValues {
  [key: string]: { min: string; max: string }
}

export interface TextFilterValues {
  labels: string
  addressSuffixes: string
}

const DOLLAR_FILTERS = [
  { key: 'liquidity',  label: 'Liquidity' },
  { key: 'mcap',       label: 'Market Cap' },
  { key: 'fdv',        label: 'FDV' },
  { key: 'volume_24h', label: '24H Volume' },
  { key: 'volume_6h',  label: '6H Volume' },
  { key: 'volume_1h',  label: '1H Volume' },
  { key: 'volume_5m',  label: '5M Volume' },
]

const HOUR_FILTERS = [
  { key: 'pair_age', label: 'Pair Age' },
]

const PERCENT_FILTERS = [
  { key: 'change_24h', label: '24H Change' },
  { key: 'change_6h',  label: '6H Change' },
  { key: 'change_1h',  label: '1H Change' },
  { key: 'change_5m',  label: '5M Change' },
]

const NUMBER_FILTERS = [
  { key: 'txns_24h',  label: '24H Txns' },
  { key: 'buys_24h',  label: '24H Buys' },
  { key: 'sells_24h', label: '24H Sells' },
  { key: 'txns_6h',   label: '6H Txns' },
  { key: 'buys_6h',   label: '6H Buys' },
  { key: 'sells_6h',  label: '6H Sells' },
  { key: 'txns_1h',   label: '1H Txns' },
  { key: 'sells_1h',  label: '1H Sells' },
  { key: 'txns_5m',   label: '5M Txns' },
  { key: 'buys_5m',   label: '5M Buys' },
  { key: 'sells_5m',  label: '5M Sells' },
]

function IconClose() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export function buildInitialFilters(): FilterValues {
  const all = [...DOLLAR_FILTERS, ...HOUR_FILTERS, ...PERCENT_FILTERS, ...NUMBER_FILTERS]
  const map: FilterValues = {}
  all.forEach(f => { map[f.key] = { min: '', max: '' } })
  return map
}

interface Props {
  open: boolean
  onClose: () => void
  initialFilters?: FilterValues
  initialTextFilters?: TextFilterValues
  onApply?: (filters: FilterValues, textFilters: TextFilterValues) => void
  onReset?: () => void
}

export function FiltersModal({ open, onClose, initialFilters, initialTextFilters, onApply, onReset }: Props) {
  const [filters, setFilters] = useState<FilterValues>(() => initialFilters ?? buildInitialFilters())
  const [textFilters, setTextFilters] = useState<TextFilterValues>(() => initialTextFilters ?? { labels: '', addressSuffixes: '' })

  // Sync with external state when modal opens
  useEffect(() => {
    if (open) {
      if (initialFilters) setFilters(initialFilters)
      if (initialTextFilters) setTextFilters(initialTextFilters)
    }
  }, [open, initialFilters, initialTextFilters])

  const updateFilter = useCallback((key: string, field: 'min' | 'max', value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }, [])

  const handleReset = useCallback(() => {
    const empty = buildInitialFilters()
    const emptyText = { labels: '', addressSuffixes: '' }
    setFilters(empty)
    setTextFilters(emptyText)
    onReset?.()
    onApply?.(empty, emptyText)
  }, [onReset, onApply])

  const handleApply = useCallback(() => {
    onApply?.(filters, textFilters)
    onClose()
  }, [onClose, onApply, filters, textFilters])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative rounded-xl border border-border bg-[#111] shadow-2xl w-[600px] max-w-[90vw] flex flex-col p-6"
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <h2 className="text-[24px] font-bold text-text">Customize Filters</h2>
          <button onClick={onClose} className="text-sub hover:text-text transition-colors">
            <IconClose />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">

          {/* Dollar-prefixed filters */}
          <Section title="Value Filters">
            {DOLLAR_FILTERS.map(f => (
              <MinMaxRow
                key={f.key}
                label={f.label}
                prefix="$"
                min={filters[f.key].min}
                max={filters[f.key].max}
                onMin={v => updateFilter(f.key, 'min', v)}
                onMax={v => updateFilter(f.key, 'max', v)}
              />
            ))}
          </Section>

          {/* Hour filters */}
          <Section title="Age">
            {HOUR_FILTERS.map(f => (
              <MinMaxRow
                key={f.key}
                label={f.label}
                suffix="hours"
                min={filters[f.key].min}
                max={filters[f.key].max}
                onMin={v => updateFilter(f.key, 'min', v)}
                onMax={v => updateFilter(f.key, 'max', v)}
              />
            ))}
          </Section>

          {/* Percent filters */}
          <Section title="Price Change">
            {PERCENT_FILTERS.map(f => (
              <MinMaxRow
                key={f.key}
                label={f.label}
                suffix="%"
                min={filters[f.key].min}
                max={filters[f.key].max}
                onMin={v => updateFilter(f.key, 'min', v)}
                onMax={v => updateFilter(f.key, 'max', v)}
              />
            ))}
          </Section>

          {/* Number filters */}
          <Section title="Transaction Counts">
            {NUMBER_FILTERS.map(f => (
              <MinMaxRow
                key={f.key}
                label={f.label}
                min={filters[f.key].min}
                max={filters[f.key].max}
                onMin={v => updateFilter(f.key, 'min', v)}
                onMax={v => updateFilter(f.key, 'max', v)}
              />
            ))}
          </Section>

          {/* Text filters */}
          <Section title="Other Filters">
            <div className="space-y-3">
              <div>
                <label className="text-[12px] text-sub mb-1 block">Labels (comma separated)</label>
                <input
                  type="text"
                  value={textFilters.labels}
                  onChange={e => setTextFilters(prev => ({ ...prev, labels: e.target.value }))}
                  placeholder="e.g. v3, v4"
                  className="w-full h-[36px] rounded-[8px] px-3 text-[13px] text-text placeholder-sub outline-none"
                  style={{ border: '1px solid #333333' }}
                />
              </div>
              <div>
                <label className="text-[12px] text-sub mb-1 block">Base Token Address Suffixes (comma separated)</label>
                <input
                  type="text"
                  value={textFilters.addressSuffixes}
                  onChange={e => setTextFilters(prev => ({ ...prev, addressSuffixes: e.target.value }))}
                  placeholder="e.g. pump, moon"
                  className="w-full h-[36px] rounded-[8px] px-3 text-[13px] text-text placeholder-sub outline-none"
                  style={{ border: '1px solid #333333' }}
                />
              </div>
            </div>
          </Section>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center gap-3 mt-5 flex-shrink-0">
          <button
            onClick={handleApply}
            className="flex-1 h-[44px] rounded-[10px] text-[14px] font-bold text-white transition-colors"
            style={{ backgroundColor: '#2744FF' }}
          >
            Apply
          </button>
          <button
            onClick={handleReset}
            className="flex-1 h-[44px] rounded-[10px] text-[14px] font-bold text-text transition-colors"
            style={{ backgroundColor: '#333333' }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[14px] font-bold text-text mb-3">{title}</h3>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  )
}

function MinMaxRow({
  label,
  prefix,
  suffix,
  min,
  max,
  onMin,
  onMax,
}: {
  label: string
  prefix?: string
  suffix?: string
  min: string
  max: string
  onMin: (v: string) => void
  onMax: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] text-sub w-[100px] flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-1">
        <div
          className="flex items-center flex-1 h-[36px] rounded-[8px] px-3"
          style={{ border: '1px solid #333333' }}
        >
          {prefix && <span className="text-[13px] text-sub mr-1">{prefix}</span>}
          <input
            type="text"
            value={min}
            onChange={e => onMin(e.target.value)}
            placeholder="Min"
            className="flex-1 bg-transparent text-[13px] text-text placeholder-sub outline-none w-0"
          />
          {suffix && <span className="text-[13px] text-sub ml-1">{suffix}</span>}
        </div>
        <span className="text-[12px] text-sub">—</span>
        <div
          className="flex items-center flex-1 h-[36px] rounded-[8px] px-3"
          style={{ border: '1px solid #333333' }}
        >
          {prefix && <span className="text-[13px] text-sub mr-1">{prefix}</span>}
          <input
            type="text"
            value={max}
            onChange={e => onMax(e.target.value)}
            placeholder="Max"
            className="flex-1 bg-transparent text-[13px] text-text placeholder-sub outline-none w-0"
          />
          {suffix && <span className="text-[13px] text-sub ml-1">{suffix}</span>}
        </div>
      </div>
    </div>
  )
}
