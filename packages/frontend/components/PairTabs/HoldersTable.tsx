'use client'

import { fmtUsd, fmtNum, shortAddr } from '../../lib/formatters'
import type { MoralisHoldersResult } from '../../lib/moralis'

interface Props {
  holdersData?: MoralisHoldersResult
}

export function HoldersTable({ holdersData }: Props) {
  if (!holdersData) {
    return (
      <div className="flex items-center justify-center py-12 text-sub text-[14px]">
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          Loading holders...
        </span>
      </div>
    )
  }

  const { holders, totalSupply } = holdersData
  if (holders.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sub text-[14px]">
        No holder data available
      </div>
    )
  }

  const supply = parseFloat(totalSupply || '0')

  return (
    <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
      {/* Column header */}
      <div className="grid grid-cols-[32px_1fr_60px_80px] md:grid-cols-[40px_1fr_70px_200px_90px_40px] gap-x-2 md:gap-x-3 px-3 md:px-5 py-2 text-[14px] text-header border-b border-border sticky top-0 bg-surface z-10">
        <span>#</span>
        <span>Address</span>
        <span className="text-right">%</span>
        <span className="hidden md:block text-center">Amount</span>
        <span className="text-right">Value</span>
        <span className="hidden md:block text-center">Exp</span>
      </div>

      {holders.map((h, i) => {
        const pct = h.percentage_relative_to_total_supply
        const balance = parseFloat(h.balance_formatted)
        const value = parseFloat(h.usd_value)
        const isNullAddr = h.owner_address === '0x0000000000000000000000000000000000000000'

        return (
          <div
            key={h.owner_address}
            className="grid grid-cols-[32px_1fr_60px_80px] md:grid-cols-[40px_1fr_70px_200px_90px_40px] gap-x-2 md:gap-x-3 px-3 md:px-5 py-2 text-[14px] border-b border-muted hover:bg-border/20 transition-colors"
          >
            <span className="text-sub tabular">{i + 1}</span>
            <div className="flex items-center gap-1.5 min-w-0">
              {isNullAddr ? (
                <span className="text-sub">Null Address (Burn)</span>
              ) : (
                <>
                  <a
                    href={`https://basescan.org/address/${h.owner_address}`}
                    target="_blank"
                    rel="noopener"
                    className="font-mono text-sub hover:text-blue truncate"
                  >
                    {shortAddr(h.owner_address)}
                  </a>
                  {h.is_contract && <span className="text-[11px] text-sub bg-border/40 rounded px-1 flex-shrink-0">Contract</span>}
                </>
              )}
            </div>
            <span className="tabular text-right text-text">{pct.toFixed(2)}%</span>
            {/* Amount + progress bar */}
            <div className="hidden md:flex items-center gap-2 min-w-0">
              <span className="text-sub tabular text-[13px] flex-shrink-0">{fmtNum(balance)}</span>
              {supply > 0 && (
                <div className="flex-1 h-1.5 rounded-full bg-border/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sub/50"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              )}
            </div>
            <span className="tabular text-right text-text font-mono">{fmtUsd(value)}</span>
            <a
              href={`https://basescan.org/address/${h.owner_address}`}
              target="_blank"
              rel="noopener"
              className="hidden md:flex items-center justify-center text-sub hover:text-blue"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4 1h7v7M11 1L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
        )
      })}
    </div>
  )
}
