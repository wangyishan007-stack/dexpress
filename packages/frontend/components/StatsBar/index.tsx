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

export function StatsBar({ showBlock = true }: { showBlock?: boolean }) {
  const stats = useStats()
  const [agoStr, setAgoStr] = useState('')

  // Compute timeAgo only on the client to avoid hydration mismatch
  useEffect(() => {
    function update() { setAgoStr(timeAgo(stats.block_ts)) }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [stats.block_ts])

  const vol = stats.volume_24h
  const volStr = vol >= 1_000_000
    ? `$${(vol / 1_000_000).toFixed(1)}M`
    : vol >= 1_000 ? `$${(vol / 1_000).toFixed(1)}K` : fmtUsd(vol)

  return (
    <div className="flex gap-2 mb-3 md:gap-3 md:mb-4">
      <StatCard label="24H Volume"    value={volStr} />
      <StatCard label="24H Txns"      value={fmtTxns(stats.txns_24h)} />
      {showBlock && (
        <StatCard
          label="Latest Block"
          value={stats.latest_block ? stats.latest_block.toLocaleString('en-US') : '—'}
          sub={agoStr}
        />
      )}
    </div>
  )
}

function StatCard({
  label, value, sub,
}: {
  label: string; value: string; sub?: string
}) {
  return (
    <div className="flex-1 flex flex-col items-start justify-center px-3 md:flex-row md:items-center md:justify-center md:px-4 border border-border rounded-md md:rounded-lg h-[56px] md:h-[50px]">
      <span className="text-[11px] text-sub md:hidden">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="hidden md:inline text-[12px] text-sub">{label}:</span>
        <span className="text-[16px] font-bold text-text md:text-[14px] md:font-medium">{value}</span>
        {sub && <span className="text-[10px] md:text-[12px] text-sub">{sub}</span>}
      </div>
    </div>
  )
}
