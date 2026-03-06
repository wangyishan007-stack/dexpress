'use client'

import { fmtUsd, shortAddr } from '../../lib/formatters'
import type { GoPlusLpHolder } from '../../lib/goplus'
import type { LPProvidersResult } from '../../lib/uniswap-subgraph'

interface Props {
  lpHolders?: GoPlusLpHolder[]
  subgraphData?: LPProvidersResult
}

export function LiquidityTable({ lpHolders, subgraphData }: Props) {
  // Prefer Subgraph data (up to 50), fall back to GoPlus (top 10)
  const useSubgraph = subgraphData && subgraphData.providers.length > 0

  if (!useSubgraph && (!lpHolders || lpHolders.length === 0)) {
    return (
      <div className="flex items-center justify-center py-12 text-sub text-[14px]">
        {lpHolders === undefined && !subgraphData ? 'Loading LP data...' : 'No LP data available'}
      </div>
    )
  }

  if (useSubgraph) {
    const { providers, totalValueLockedUSD } = subgraphData
    return (
      <div className="overflow-auto" style={{ maxHeight: 400 }}>
        <div className="grid grid-cols-[40px_1fr_70px_200px_60px_40px] gap-x-3 px-3 md:px-5 py-2 text-[14px] text-header border-b border-border sticky top-0 bg-surface z-10" style={{ minWidth: 540 }}>
          <span>#</span>
          <span>Address</span>
          <span className="text-right">%</span>
          <span className="text-center">Value</span>
          <span className="text-center">Pos</span>
          <span className="text-center">Exp</span>
        </div>

        {providers.map((lp, i) => (
          <div
            key={lp.owner_address}
            className="grid grid-cols-[40px_1fr_70px_200px_60px_40px] gap-x-3 px-3 md:px-5 py-2 text-[14px] border-b border-muted hover:bg-border/20 transition-colors"
            style={{ minWidth: 540 }}
          >
            <span className="text-sub tabular">{i + 1}</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <a
                href={`https://basescan.org/address/${lp.owner_address}`}
                target="_blank"
                rel="noopener"
                className="font-mono text-sub hover:text-blue truncate"
              >
                {shortAddr(lp.owner_address)}
              </a>
            </div>
            <span className="tabular text-right text-text">{lp.liquidity_pct.toFixed(2)}%</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sub tabular text-[13px] flex-shrink-0">{fmtUsd(lp.value_usd)}</span>
              {totalValueLockedUSD > 0 && (
                <div className="flex-1 h-1.5 rounded-full bg-border/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sub/50"
                    style={{ width: `${Math.min(lp.liquidity_pct, 100)}%` }}
                  />
                </div>
              )}
            </div>
            <span className="tabular text-center text-sub">{lp.position_count}</span>
            <a
              href={`https://basescan.org/address/${lp.owner_address}`}
              target="_blank"
              rel="noopener"
              className="flex items-center justify-center text-sub hover:text-blue"
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

  // Fallback: GoPlus data
  const totalValue = lpHolders!.reduce((sum, lp) => sum + parseFloat(lp.value || '0'), 0)

  return (
    <div className="overflow-auto" style={{ maxHeight: 400 }}>
      <div className="grid grid-cols-[40px_1fr_70px_200px_40px] gap-x-3 px-3 md:px-5 py-2 text-[14px] text-header border-b border-border sticky top-0 bg-surface z-10" style={{ minWidth: 500 }}>
        <span>#</span>
        <span>Address</span>
        <span className="text-right">%</span>
        <span className="text-center">Value</span>
        <span className="text-center">Exp</span>
      </div>

      {lpHolders!.map((lp, i) => {
        const pct = parseFloat(lp.percent) * 100
        const value = parseFloat(lp.value || '0')

        return (
          <div
            key={lp.address}
            className="grid grid-cols-[40px_1fr_70px_200px_40px] gap-x-3 px-3 md:px-5 py-2 text-[14px] border-b border-muted hover:bg-border/20 transition-colors"
            style={{ minWidth: 500 }}
          >
            <span className="text-sub tabular">{i + 1}</span>
            <div className="flex items-center gap-1.5 min-w-0">
              <a
                href={`https://basescan.org/address/${lp.address}`}
                target="_blank"
                rel="noopener"
                className="font-mono text-sub hover:text-blue truncate"
              >
                {shortAddr(lp.address)}
              </a>
              {lp.is_contract === 1 && <span className="text-[11px] text-sub bg-border/40 rounded px-1 flex-shrink-0">Contract</span>}
              {lp.is_locked === 1 && <span className="text-[11px] text-green bg-green/10 rounded px-1 flex-shrink-0">Locked</span>}
            </div>
            <span className="tabular text-right text-text">{pct.toFixed(2)}%</span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sub tabular text-[13px] flex-shrink-0">{fmtUsd(value)}</span>
              {totalValue > 0 && (
                <div className="flex-1 h-1.5 rounded-full bg-border/60 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sub/50"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              )}
            </div>
            <a
              href={`https://basescan.org/address/${lp.address}`}
              target="_blank"
              rel="noopener"
              className="flex items-center justify-center text-sub hover:text-blue"
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
