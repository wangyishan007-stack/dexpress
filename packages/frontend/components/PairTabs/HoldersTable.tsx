'use client'

import { fmtUsd, fmtNum, shortAddr } from '../../lib/formatters'
import { MOCK_HOLDERS } from '../../lib/mockPairDetailData'

// Total supply for progress bar (sum of all holder amounts as approximation)
const TOTAL_SUPPLY = 1_000_000_000

export function HoldersTable() {
  return (
    <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
      {/* Column header */}
      <div className="grid grid-cols-[32px_1fr_60px_80px] md:grid-cols-[1fr_1fr_1fr_220px_1fr_1fr_1fr] gap-x-2 md:gap-x-3 px-3 md:px-5 py-2 text-[14px] text-header border-b border-border sticky top-0 bg-surface z-10">
        <span>#</span>
        <span>Address</span>
        <span className="text-right">%</span>
        <span className="hidden md:block text-center">Amount</span>
        <span className="text-right">Value</span>
        <span className="hidden md:block text-right">Txns</span>
        <span className="hidden md:block text-center">Exp</span>
      </div>

      {MOCK_HOLDERS.map((h) => (
        <div
          key={h.rank}
          className="grid grid-cols-[32px_1fr_60px_80px] md:grid-cols-[1fr_1fr_1fr_220px_1fr_1fr_1fr] gap-x-2 md:gap-x-3 px-3 md:px-5 py-2 text-[14px] border-b border-muted hover:bg-border/20 transition-colors"
        >
          <span className="text-sub tabular">{h.rank}</span>
          <a
            href={`https://basescan.org/address/${h.address}`}
            target="_blank"
            rel="noopener"
            className="font-mono text-sub hover:text-blue truncate"
          >
            {shortAddr(h.address)}
          </a>
          <span className="tabular text-right text-text">{h.percentage.toFixed(2)}%</span>
          {/* Amount: value + progress bar + total */}
          <div className="hidden md:flex items-center gap-2 min-w-0">
            <span className="text-sub tabular text-[14px] flex-shrink-0">{fmtNum(h.amount)}</span>
            <div className="flex-1 h-1.5 rounded-full bg-border/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-sub/50"
                style={{ width: `${(h.amount / TOTAL_SUPPLY) * 100}%` }}
              />
            </div>
            <span className="text-sub tabular text-[14px] flex-shrink-0">{fmtNum(TOTAL_SUPPLY)}</span>
          </div>
          <span className="tabular text-right text-text font-mono">{fmtUsd(h.value)}</span>
          <span className="hidden md:block tabular text-right text-sub">{h.txns}</span>
          <a
            href={`https://basescan.org/address/${h.address}`}
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
