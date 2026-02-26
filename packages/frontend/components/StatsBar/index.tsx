'use client'

import { useStats } from '../../hooks/useStats'
import { fmtUsd } from '../../lib/formatters'
import { useEffect, useState } from 'react'

function fmtCompact(n: number): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return fmtUsd(n)
}

function fmtTxns(n: number): string {
  if (!n) return '0'
  return n.toLocaleString('en-US')
}

function timeAgo(ts: string | null): string {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60)  return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export function StatsBar() {
  const stats = useStats()
  const [tick, setTick] = useState(0)

  // Re-render every second to update "ago" label
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const vol = stats.volume_24h
  const volStr = vol >= 1_000_000
    ? `$${(vol / 1_000_000).toFixed(1)}M`
    : vol >= 1_000 ? `$${(vol / 1_000).toFixed(1)}K` : fmtUsd(vol)

  return (
    <div className="flex gap-2 mb-3 md:gap-3 md:mb-4">
      <StatCard label="24H Volume"    value={volStr} />
      <StatCard label="24H Txns"      value={fmtTxns(stats.txns_24h)} />
      <StatCard
        label="Latest Block"
        value={stats.latest_block ? stats.latest_block.toLocaleString('en-US') : '—'}
        sub={timeAgo(stats.block_ts)}
      />
    </div>
  )
}

function StatCard({
  label, value, sub,
}: {
  label: string; value: string; sub?: string
}) {
  return (
    <div className="flex-1 flex items-center px-3 md:px-4 border border-border rounded-[6px] md:rounded-[8px] h-[40px] md:h-[50px]">
      <div>
        <div className="text-[10px] md:text-[12px] text-sub mb-0.5">{label}</div>
        <div className="flex items-baseline gap-2">
          <span className="text-[12px] md:text-[14px] font-medium text-text">{value}</span>
          {sub && <span className="text-[10px] md:text-[12px] text-sub">{sub}</span>}
        </div>
      </div>
    </div>
  )
}
