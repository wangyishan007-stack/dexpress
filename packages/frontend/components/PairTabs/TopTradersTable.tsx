'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import clsx from 'clsx'
import { fmtUsd, shortAddr } from '../../lib/formatters'
import type { MoralisTrader } from '../../lib/moralis'
import { useChain } from '@/contexts/ChainContext'
import { explorerLink } from '@/lib/chains'

type SortKey = 'bought' | 'sold' | 'pnl' | 'trades'
type SortDir = 'asc' | 'desc'

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="flex-shrink-0">
      <path d="M5 1L8.5 5.5H1.5L5 1Z" fill={active && dir === 'asc' ? 'currentColor' : '#444'} />
      <path d="M5 13L1.5 8.5H8.5L5 13Z" fill={active && dir === 'desc' ? 'currentColor' : '#444'} />
    </svg>
  )
}

function SortableHeader({ label, sortKey, currentSort, currentDir, onSort, className }: {
  label: string
  sortKey: SortKey
  currentSort: SortKey | null
  currentDir: SortDir
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = currentSort === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={clsx('flex items-center gap-1 hover:text-text transition-colors', className)}
    >
      <span>{label}</span>
      <SortIcon active={active} dir={active ? currentDir : 'desc'} />
    </button>
  )
}

interface Props {
  traders?: MoralisTrader[]
}

export function TopTradersTable({ traders }: Props) {
  const { chain } = useChain()
  const t = useTranslations('tradersTable')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const rows = useMemo(() => {
    if (!traders || traders.length === 0) return []
    const mapped = traders.map(t => ({
      address: t.address,
      bought: parseFloat(t.total_usd_invested) || 0,
      sold: parseFloat(t.total_sold_usd) || 0,
      pnl: parseFloat(t.realized_profit_usd) || 0,
      trades: t.count_of_trades,
      pnlPct: t.realized_profit_percentage,
    }))
    if (!sortKey) return mapped
    return [...mapped].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal
    })
  }, [traders, sortKey, sortDir])

  if (!traders) {
    return (
      <div className="flex items-center justify-center py-12 text-sub text-[14px]">
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          {t('loadingTraders')}
        </span>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sub text-[14px]">
        {t('noTraders')}
      </div>
    )
  }

  return (
    <div className="overflow-auto" style={{ maxHeight: 400 }}>
      {/* Column header */}
      <div className="grid grid-cols-[40px_1fr_100px_100px_100px_60px_40px] gap-x-3 px-3 md:px-5 py-2 text-[14px] text-header border-b border-border sticky top-0 bg-surface z-10" style={{ minWidth: 580 }}>
        <span>#</span>
        <span>{t('maker')}</span>
        <SortableHeader label={t('bought')} sortKey="bought" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
        <SortableHeader label={t('sold')} sortKey="sold" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
        <SortableHeader label={t('pnl')} sortKey="pnl" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
        <SortableHeader label={t('txns')} sortKey="trades" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
        <span className="text-center">{t('exp')}</span>
      </div>

      {rows.map((row, i) => (
        <div
          key={row.address}
          className="grid grid-cols-[40px_1fr_100px_100px_100px_60px_40px] gap-x-3 px-3 md:px-5 py-2 text-[14px] border-b border-border hover:bg-border/20 transition-colors"
          style={{ minWidth: 580 }}
        >
          <span className="text-sub tabular">{i + 1}</span>
          <a
            href={explorerLink(chain, 'address', row.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-sub hover:text-blue truncate transition-colors"
          >
            {shortAddr(row.address)}
          </a>
          <span className="tabular text-right text-green font-mono truncate">{fmtUsd(row.bought)}</span>
          <span className="tabular text-right text-red font-mono truncate">{fmtUsd(row.sold)}</span>
          <span className={clsx(
            'tabular text-right font-mono truncate',
            row.pnl >= 0 ? 'text-green' : 'text-red'
          )}>
            {row.pnl >= 0 ? '+' : ''}{fmtUsd(row.pnl)}
          </span>
          <span className="tabular text-right text-sub">{row.trades}</span>
          <a
            href={explorerLink(chain, 'address', row.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center text-sub hover:text-blue transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4 1h7v7M11 1L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </div>
      ))}
    </div>
  )
}
