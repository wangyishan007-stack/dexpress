'use client'

import { useState, useMemo } from 'react'
import clsx from 'clsx'
import { fmtUsd, shortAddr } from '../../lib/formatters'
import { MOCK_TOP_TRADERS } from '../../lib/mockPairDetailData'

type SortKey = 'bought' | 'sold' | 'pnl' | 'unrealized'
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

export function TopTradersTable() {
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

  const sorted = useMemo(() => {
    if (!sortKey) return MOCK_TOP_TRADERS
    return [...MOCK_TOP_TRADERS].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal
    })
  }, [sortKey, sortDir])

  return (
    <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
      {/* Column header */}
      <div className="grid grid-cols-[32px_1fr_1fr_1fr] md:grid-cols-[32px_120px_1fr_1fr_1fr_1fr_1fr_48px_32px] gap-x-2 md:gap-x-3 px-3 md:px-5 py-2 text-[14px] text-header border-b border-border sticky top-0 bg-surface z-10">
        <span>#</span>
        <span>Maker</span>
        <SortableHeader label="Bought" sortKey="bought" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
        <SortableHeader label="Sold" sortKey="sold" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="justify-end" />
        <SortableHeader label="PnL" sortKey="pnl" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden md:flex justify-end" />
        <SortableHeader label="Unrealized" sortKey="unrealized" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} className="hidden md:flex justify-end" />
        <span className="hidden md:block text-right">Balance</span>
        <span className="hidden md:block text-right">Txns</span>
        <span className="hidden md:block text-center">Exp</span>
      </div>

      {sorted.map((t, i) => (
        <div
          key={t.rank}
          className="grid grid-cols-[32px_1fr_1fr_1fr] md:grid-cols-[32px_120px_1fr_1fr_1fr_1fr_1fr_48px_32px] gap-x-2 md:gap-x-3 px-3 md:px-5 py-2 text-[14px] border-b border-muted hover:bg-border/20 transition-colors"
        >
          <span className="text-sub tabular">{sortKey ? i + 1 : t.rank}</span>
          <a
            href={`https://basescan.org/address/${t.maker}`}
            target="_blank"
            rel="noopener"
            className="font-mono text-sub hover:text-blue truncate"
          >
            {shortAddr(t.maker)}
          </a>
          <span className="tabular text-right text-green font-mono">{fmtUsd(t.bought)}</span>
          <span className="tabular text-right text-red font-mono">{fmtUsd(t.sold)}</span>
          <span className={clsx(
            'hidden md:block tabular text-right font-mono',
            t.pnl >= 0 ? 'text-green' : 'text-red'
          )}>
            {t.pnl >= 0 ? '+' : ''}{fmtUsd(t.pnl)}
          </span>
          <span className="hidden md:block tabular text-right text-sub font-mono">
            {t.unrealized > 0 ? fmtUsd(t.unrealized) : '-'}
          </span>
          <span className="hidden md:block tabular text-right text-text font-mono">
            {t.balance > 0 ? fmtUsd(t.balance) : '-'}
          </span>
          <span className="hidden md:block tabular text-right text-sub">{t.txns}</span>
          <a
            href={`https://basescan.org/address/${t.maker}`}
            target="_blank"
            rel="noopener"
            className="hidden md:flex items-center justify-center text-sub hover:text-blue"
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
