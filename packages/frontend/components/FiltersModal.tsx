'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'

export interface FilterValues {
  [key: string]: { min: string; max: string }
}

export interface TextFilterValues {
  labels: string
  addressSuffixes: string
}

const DOLLAR_FILTERS = [
  { key: 'liquidity',  labelKey: 'liquidity' },
  { key: 'mcap',       labelKey: 'marketCap' },
  { key: 'fdv',        labelKey: 'fdv' },
  { key: 'volume_24h', labelKey: 'volume24h' },
  { key: 'volume_6h',  labelKey: 'volume6h' },
  { key: 'volume_1h',  labelKey: 'volume1h' },
  { key: 'volume_5m',  labelKey: 'volume5m' },
]

const HOUR_FILTERS = [
  { key: 'pair_age', labelKey: 'pairAge' },
]

const PERCENT_FILTERS = [
  { key: 'change_24h', labelKey: 'change24h' },
  { key: 'change_6h',  labelKey: 'change6h' },
  { key: 'change_1h',  labelKey: 'change1h' },
  { key: 'change_5m',  labelKey: 'change5m' },
]

const NUMBER_FILTERS = [
  { key: 'txns_24h',  labelKey: 'txns24h' },
  { key: 'buys_24h',  labelKey: 'buys24h' },
  { key: 'sells_24h', labelKey: 'sells24h' },
  { key: 'txns_6h',   labelKey: 'txns6h' },
  { key: 'buys_6h',   labelKey: 'buys6h' },
  { key: 'sells_6h',  labelKey: 'sells6h' },
  { key: 'txns_1h',   labelKey: 'txns1h' },
  { key: 'buys_1h',   labelKey: 'buys1h' },
  { key: 'sells_1h',  labelKey: 'sells1h' },
  { key: 'txns_5m',   labelKey: 'txns5m' },
  { key: 'buys_5m',   labelKey: 'buys5m' },
  { key: 'sells_5m',  labelKey: 'sells5m' },
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
  const tF = useTranslations('filtersModal')
  const tModal = useTranslations('modals')
  const tCommon = useTranslations('common')
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
          <h2 className="text-[24px] font-bold text-text">{tModal('customizeFilters')}</h2>
          <button onClick={onClose} className="text-sub hover:text-text transition-colors">
            <IconClose />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">

          {/* Dollar-prefixed filters */}
          <Section title={tF('valueFilters')}>
            {DOLLAR_FILTERS.map(f => (
              <MinMaxRow
                key={f.key}
                label={tF(f.labelKey)}
                prefix="$"
                min={filters[f.key].min}
                max={filters[f.key].max}
                onMin={v => updateFilter(f.key, 'min', v)}
                onMax={v => updateFilter(f.key, 'max', v)}
              />
            ))}
          </Section>

          {/* Hour filters */}
          <Section title={tF('age')}>
            {HOUR_FILTERS.map(f => (
              <MinMaxRow
                key={f.key}
                label={tF(f.labelKey)}
                suffix={tF('hours')}
                min={filters[f.key].min}
                max={filters[f.key].max}
                onMin={v => updateFilter(f.key, 'min', v)}
                onMax={v => updateFilter(f.key, 'max', v)}
              />
            ))}
          </Section>

          {/* Percent filters */}
          <Section title={tF('priceChange')}>
            {PERCENT_FILTERS.map(f => (
              <MinMaxRow
                key={f.key}
                label={tF(f.labelKey)}
                suffix="%"
                min={filters[f.key].min}
                max={filters[f.key].max}
                onMin={v => updateFilter(f.key, 'min', v)}
                onMax={v => updateFilter(f.key, 'max', v)}
              />
            ))}
          </Section>

          {/* Number filters */}
          <Section title={tF('transactionCounts')}>
            {NUMBER_FILTERS.map(f => (
              <MinMaxRow
                key={f.key}
                label={tF(f.labelKey)}
                min={filters[f.key].min}
                max={filters[f.key].max}
                onMin={v => updateFilter(f.key, 'min', v)}
                onMax={v => updateFilter(f.key, 'max', v)}
              />
            ))}
          </Section>

          {/* Text filters */}
          <Section title={tF('otherFilters')}>
            <div className="space-y-3">
              <div>
                <label className="text-[12px] text-sub mb-1 block">{tF('labelsLabel')}</label>
                <input
                  type="text"
                  value={textFilters.labels}
                  onChange={e => setTextFilters(prev => ({ ...prev, labels: e.target.value }))}
                  placeholder={tF('labelsPlaceholder')}
                  className="w-full h-[36px] rounded-[8px] px-3 text-[13px] text-text placeholder-sub outline-none"
                  style={{ border: '1px solid #333333' }}
                />
              </div>
              <div>
                <label className="text-[12px] text-sub mb-1 block">{tF('addressSuffixes')}</label>
                <input
                  type="text"
                  value={textFilters.addressSuffixes}
                  onChange={e => setTextFilters(prev => ({ ...prev, addressSuffixes: e.target.value }))}
                  placeholder={tF('addressSuffixesPlaceholder')}
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
            {tCommon('apply')}
          </button>
          <button
            onClick={handleReset}
            className="flex-1 h-[44px] rounded-[10px] text-[14px] font-bold text-text transition-colors"
            style={{ backgroundColor: '#333333' }}
          >
            {tCommon('reset')}
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
  const tCommon = useTranslations('common')
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
            placeholder={tCommon('min')}
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
            placeholder={tCommon('max')}
            className="flex-1 bg-transparent text-[13px] text-text placeholder-sub outline-none w-0"
          />
          {suffix && <span className="text-[13px] text-sub ml-1">{suffix}</span>}
        </div>
      </div>
    </div>
  )
}
