'use client'

import type { Pool } from '@dex/shared'
import { fmtUsd } from '../../lib/formatters'
import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { useTranslations } from 'next-intl'

const BASE_RPC = 'https://mainnet.base.org'

async function fetchLatestBlock(): Promise<{ block: number; ts: string }> {
  try {
    const res = await fetch(BASE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
    })
    const data = await res.json()
    return { block: parseInt(data.result, 16), ts: new Date().toISOString() }
  } catch {
    return { block: 0, ts: null as unknown as string }
  }
}

function fmtVolume(n: number): string {
  if (!n) return '$0'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
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

interface Props {
  /** Pass the current page's pairs to compute page-specific stats */
  pairs?: Pool[]
  showBlock?: boolean
}

export function StatsBar({ pairs, showBlock = true }: Props) {
  const [agoStr, setAgoStr] = useState('')
  const t = useTranslations('stats')

  const { data: blockData } = useSWR(
    showBlock ? 'base-latest-block' : null,
    fetchLatestBlock,
    { refreshInterval: 12_000, revalidateOnFocus: false }
  )

  useEffect(() => {
    if (!showBlock) return
    function update() { setAgoStr(timeAgo(blockData?.ts ?? null)) }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [blockData?.ts, showBlock])

  const { volume, txns } = useMemo(() => {
    if (!pairs || pairs.length === 0) return { volume: 0, txns: 0 }
    return {
      volume: pairs.reduce((sum, p) => sum + (p.volume_24h || 0), 0),
      txns:   pairs.reduce((sum, p) => sum + (p.txns_24h || 0), 0),
    }
  }, [pairs])

  return (
    <div className="flex gap-2 mb-3 md:gap-3 md:mb-4">
      <StatCard label={t('volume24h')}    value={fmtVolume(volume)} />
      <StatCard label={t('txns24h')}      value={fmtTxns(txns)} />
      {showBlock && (
        <StatCard
          label={t('latestBlock')}
          value={blockData?.block ? blockData.block.toLocaleString('en-US') : '—'}
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
