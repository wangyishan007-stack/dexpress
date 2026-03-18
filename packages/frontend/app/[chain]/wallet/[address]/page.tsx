'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { useChain } from '@/contexts/ChainContext'
import { useFollowedWallets } from '@/hooks/useFollowedWallets'
import { useWalletDetail } from '@/hooks/useWalletDetail'
import { fmtUsd, fmtPrice } from '@/lib/formatters'
import { explorerLink, getChain, trustWalletLogo, normalizeAddr, type ChainSlug } from '@/lib/chains'
import { type DetectedSwap } from '@/lib/copyTrade'
import dynamic from 'next/dynamic'
const CopyTradeModal = dynamic(() => import('@/components/CopyTradeModal').then(m => ({ default: m.CopyTradeModal })), { ssr: false })
import { getTokenLogoFromCache } from '@/lib/dexscreener-client'
import { useTokenLogos } from '@/hooks/useTokenLogos'
import type { WalletTokenPnl, WalletHolding } from '@/lib/moralis'

/* ── Helpers ──────────────────────────────────────────── */

function addrToHue(address: string): number {
  let hash = 0
  for (let i = 0; i < address.length; i++) hash = address.charCodeAt(i) + ((hash << 5) - hash)
  return Math.abs(hash) % 360
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function fmtAmount(val: string): string {
  const n = parseFloat(val)
  if (isNaN(n)) return val
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1) return n.toFixed(2)
  if (n >= 0.001) return n.toFixed(4)
  return n.toFixed(6)
}

function weiToEth(wei: string, decimals = 18): string {
  try {
    const n = BigInt(wei)
    const divisor = BigInt(10) ** BigInt(decimals)
    const whole = n / divisor
    const frac = n % divisor
    const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4)
    return `${whole}.${fracStr}`
  } catch { return '0' }
}

type TabKey = 'pnl' | 'holdings' | 'trades'

/* ── Small components ─────────────────────────────────── */

function NativeTokenIcon({ chain, size = 24 }: { chain: ChainSlug; size?: number }) {
  const s = size
  const inner = Math.round(s * 0.58)
  if (chain === 'solana') {
    return (
      <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: s, height: s, background: 'linear-gradient(135deg, #9945FF, #14F195)' }}>
        <svg width={inner} height={inner} viewBox="0 0 400 400" fill="none"><path d="M64.6 296.7a13.2 13.2 0 019.3-3.9h296.4c5.8 0 8.8 7.1 4.6 11.3l-59 59a13.2 13.2 0 01-9.3 3.9H10.2c-5.8 0-8.8-7.1-4.6-11.3l59-59zM64.6 37a13.6 13.6 0 019.3-3.9h296.4c5.8 0 8.8 7.1 4.6 11.3l-59 59a13.2 13.2 0 01-9.3 3.9H10.2c-5.8 0-8.8-7.1-4.6-11.3l59-59zm310.7 131.2a13.2 13.2 0 00-9.3-3.9H69.6c-5.8 0-8.8 7.1-4.6 11.3l59 59a13.2 13.2 0 009.3 3.9h296.4c5.8 0 8.8-7.1 4.6-11.3l-59-59z" fill="#fff"/></svg>
      </div>
    )
  }
  if (chain === 'bsc') {
    return (
      <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: s, height: s, background: '#F3BA2F' }}>
        <span className="text-black font-bold" style={{ fontSize: inner * 0.9 }}>B</span>
      </div>
    )
  }
  // Default: ETH icon (Base/Ethereum)
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: s, height: s, background: '#627EEA' }}>
      <svg width={inner} height={inner} viewBox="0 0 256 417" fill="none">
        <path d="M127.961 0l-2.795 9.5v275.668l2.795 2.79 127.962-75.638z" fill="#fff" opacity="0.6"/>
        <path d="M127.962 0L0 212.32l127.962 75.639V154.158z" fill="#fff"/>
        <path d="M127.961 312.187l-1.575 1.92V414.25l1.575 4.6L256 236.587z" fill="#fff" opacity="0.6"/>
        <path d="M127.962 418.85v-106.66L0 236.585z" fill="#fff"/>
      </svg>
    </div>
  )
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-border/30 rounded ${className}`} />
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-sub hover:text-blue transition-colors flex-shrink-0"
      title="Copy address"
    >
      {copied
        ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l4 4 5-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4.0762 3.36734H9.21544C9.99842 3.36734 10.6332 4.00207 10.6332 4.78506V9.9243C11.1225 9.9243 11.5192 9.52759 11.5192 9.03822V3.36734C11.5192 2.87797 11.1225 2.48126 10.6332 2.48126H4.96227C4.47291 2.48126 4.0762 2.87797 4.0762 3.36734ZM10.6332 10.9876V11.1648C10.6332 11.9478 9.99842 12.5825 9.21544 12.5825H2.83569C2.0527 12.5825 1.41797 11.9478 1.41797 11.1648V4.78506C1.41797 4.00207 2.0527 3.36734 2.83569 3.36734H3.01291C3.01291 2.29074 3.88567 1.41797 4.96227 1.41797H10.6332C11.7098 1.41797 12.5825 2.29073 12.5825 3.36734V9.03822C12.5825 10.1148 11.7098 10.9876 10.6332 10.9876ZM2.83569 4.43063C2.63994 4.43063 2.48126 4.58931 2.48126 4.78506V11.1648C2.48126 11.3606 2.63994 11.5192 2.83569 11.5192H9.21544C9.41118 11.5192 9.56987 11.3606 9.56987 11.1648V4.78506C9.56987 4.58931 9.41118 4.43063 9.21544 4.43063H2.83569Z" fill="currentColor"/></svg>
      }
    </button>
  )
}

function WalletAvatar({ address, size = 48 }: { address: string; size?: number }) {
  const hue = addrToHue(address)
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.35, background: `linear-gradient(135deg, hsl(${hue}, 65%, 50%), hsl(${(hue + 40) % 360}, 65%, 40%))` }}
      >
        {address.slice(2, 4).toUpperCase()}
      </div>
    )
  }

  return (
    <img
      src={`https://effigy.im/a/${address}.svg`}
      alt="" width={size} height={size}
      className="rounded-full flex-shrink-0 bg-border"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  )
}

function TokenLogo({ logo, symbol, size = 20, tokenAddress, chain, gtLogos }: {
  logo: string | null; symbol: string; size?: number
  tokenAddress?: string; chain?: ChainSlug
  gtLogos?: Map<string, string>
}) {
  const [stage, setStage] = useState<'primary' | 'moralis' | 'tw' | 'fallback'>('primary')
  const hue = symbol.split('').reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)

  // Priority: GT fetched logo → GT cache → Moralis → Trust Wallet CDN → colored circle
  const gtFetched = tokenAddress && gtLogos ? gtLogos.get(tokenAddress) ?? null : null
  const gtCached = tokenAddress && chain ? getTokenLogoFromCache(tokenAddress, chain) : null
  const gtLogo = gtFetched || gtCached
  const twUrl = tokenAddress && chain ? trustWalletLogo(chain, tokenAddress) : null
  const primaryUrl = gtLogo || logo || twUrl

  let currentUrl: string | null = null
  if (stage === 'primary') currentUrl = primaryUrl
  else if (stage === 'moralis') currentUrl = logo
  else if (stage === 'tw') currentUrl = twUrl

  if (!currentUrl) {
    return (
      <div
        className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.45, background: `hsl(${Math.abs(hue) % 360}, 55%, 45%)` }}
      >
        {symbol.charAt(0)}
      </div>
    )
  }

  return (
    <img src={currentUrl} alt={symbol} width={size} height={size}
      className="rounded-full flex-shrink-0" style={{ width: size, height: size }}
      onError={() => {
        if (stage === 'primary') {
          if (logo && logo !== primaryUrl) setStage('moralis')
          else if (twUrl && twUrl !== primaryUrl) setStage('tw')
          else setStage('fallback')
        } else if (stage === 'moralis') {
          if (twUrl) setStage('tw')
          else setStage('fallback')
        } else {
          setStage('fallback')
        }
      }} />
  )
}

function FollowWalletButton({ address, chain }: { address: string; chain: string }) {
  const { follow, unfollow, isFollowing, isFull } = useFollowedWallets()
  const following = isFollowing(address)

  return (
    <button
      onClick={() => { following ? unfollow(address) : follow(address, chain as ChainSlug) }}
      disabled={!following && isFull}
      className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
        following
          ? 'bg-blue/15 text-blue border border-blue/30 hover:bg-blue/25'
          : isFull
            ? 'border border-border text-sub opacity-50 cursor-not-allowed'
            : 'border border-border text-sub hover:text-blue hover:border-blue/30'
      }`}
    >
      {following ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Tracked
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          Track
        </>
      )}
    </button>
  )
}

/* ── PnL Calendar (GMGN-style monthly calendar) ───── */

interface DayPnl { day: number; pnl: number }

function buildDailyPnl(profitability: WalletTokenPnl[], swaps: DetectedSwap[]): Map<string, number> {
  const dayPnl = new Map<string, number>()
  if (profitability.length === 0) return dayPnl

  const totalPnl = profitability.reduce((s, t) => s + Number(t.realized_profit_usd), 0)
  if (totalPnl === 0) return dayPnl

  // Strategy 1: use swap timestamps in current month to distribute PnL
  const now = new Date()
  const curY = now.getFullYear()
  const curM = now.getMonth()
  const curPrefix = `${curY}-${String(curM + 1).padStart(2, '0')}-`
  if (swaps.length > 0) {
    const swapsPerDay = new Map<string, number>()
    for (const swap of swaps) {
      const day = swap.timestamp.slice(0, 10)
      if (day.startsWith(curPrefix)) {
        swapsPerDay.set(day, (swapsPerDay.get(day) ?? 0) + 1)
      }
    }
    if (swapsPerDay.size > 0) {
      const monthSwaps = [...swapsPerDay.values()].reduce((a, b) => a + b, 0)
      for (const [day, count] of swapsPerDay) {
        dayPnl.set(day, totalPnl * (count / monthSwaps))
      }
      return dayPnl
    }
  }

  // Strategy 2: spread PnL across current month using deterministic seed
  const today = now.getDate()
  const totalTrades = profitability.reduce((s, t) => s + t.count_of_trades, 0)
  if (totalTrades > 0) {
    for (const token of profitability) {
      const pnl = Number(token.realized_profit_usd)
      if (pnl === 0 || token.count_of_trades === 0) continue
      const pnlPerTrade = pnl / token.count_of_trades
      let seed = 0
      for (let i = 0; i < token.token_address.length; i++) {
        seed = (seed * 31 + token.token_address.charCodeAt(i)) & 0x7fffffff
      }
      if (seed === 0) seed = 1
      for (let t = 0; t < token.count_of_trades; t++) {
        seed = (seed * 16807) % 2147483647
        const day = (seed % today) + 1
        const key = `${curY}-${String(curM + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        dayPnl.set(key, (dayPnl.get(key) ?? 0) + pnlPerTrade)
      }
    }
  }

  return dayPnl
}

function PnlCalendar({ dayPnlMap, month, year }: { dayPnlMap: Map<string, number>; month: number; year: number }) {
  const [hover, setHover] = useState<{ day: number; pnl: number; x: number; y: number } | null>(null)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDow = new Date(year, month, 1).getDay()
  const offset = firstDow === 0 ? 6 : firstDow - 1

  const cells: (DayPnl | null)[] = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, pnl: dayPnlMap.get(key) ?? 0 })
  }

  function cellStyle(pnl: number): string {
    if (pnl > 10_000) return 'bg-[#1a3a2a]'
    if (pnl > 1_000) return 'bg-[#1a3328]'
    if (pnl > 0) return 'bg-[#182b22]'
    if (pnl < -1_000) return 'bg-[#3a1a22]'
    if (pnl < 0) return 'bg-[#2b1820]'
    return 'bg-[#1a1d21]'
  }

  function fmtCell(pnl: number): string {
    if (pnl === 0) return ''
    const abs = Math.abs(pnl)
    const s = pnl > 0 ? '+$' : '-$'
    if (abs >= 1e6) return `${s}${(abs / 1e6).toFixed(1)}M`
    if (abs >= 1e3) return `${s}${(abs / 1e3).toFixed(abs >= 10_000 ? 0 : 1)}K`
    return `${s}${abs.toFixed(abs >= 100 ? 0 : 2)}`
  }

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const todayDate = today.getDate()

  const handleMouseEnter = (e: React.MouseEvent, cell: DayPnl) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const parentRect = (e.currentTarget as HTMLElement).closest('.relative')?.getBoundingClientRect()
    setHover({
      day: cell.day,
      pnl: cell.pnl,
      x: rect.left - (parentRect?.left ?? 0) + rect.width / 2,
      y: rect.top - (parentRect?.top ?? 0),
    })
  }

  return (
    <div className="flex flex-col gap-1.5 relative">
      {/* Month header */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-text">{monthNames[month]} {year}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-sub">
          <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} className="h-[24px] rounded-md" />
          const isFuture = isCurrentMonth && cell.day > todayDate
          if (isFuture) return <div key={cell.day} className="h-[24px] rounded-md bg-[#1a1d21]" />
          const hasPnl = cell.pnl !== 0
          return (
            <div
              key={cell.day}
              className={`h-[24px] rounded-md flex items-center justify-center cursor-default ${cellStyle(cell.pnl)}`}
              onMouseEnter={(e) => handleMouseEnter(e, cell)}
              onMouseLeave={() => setHover(null)}
            >
              {hasPnl ? (
                <span className={`text-[10px] font-medium tabular leading-none ${cell.pnl > 0 ? 'text-green' : 'text-red'}`}>
                  {fmtCell(cell.pnl)}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="absolute z-20 pointer-events-none px-2.5 py-1.5 rounded-lg bg-[#222] border border-border shadow-lg text-center whitespace-nowrap"
          style={{ left: hover.x, top: hover.y - 6, transform: 'translate(-50%, -100%)' }}
        >
          <div className="text-[11px] text-sub">{monthNames[month]} {hover.day}, {year}</div>
          <div className={`text-[12px] font-medium tabular ${hover.pnl > 0 ? 'text-green' : hover.pnl < 0 ? 'text-red' : 'text-sub'}`}>
            {hover.pnl !== 0 ? fmtCell(hover.pnl) : 'No trades'}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── PnL Overview Card (GMGN-style) ──────────────────── */

function PnlOverviewCard({
  pnl,
  pnlPct,
  winRate,
  swaps,
  profitability,
  isLoading,
}: {
  pnl: number | null
  pnlPct: number | null
  winRate: number | null
  swaps: DetectedSwap[]
  profitability: WalletTokenPnl[]
  isLoading: boolean
}) {
  const dayPnlMap = useMemo(() => buildDailyPnl(profitability, swaps), [profitability, swaps])
  const now = new Date()

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-[160px] w-full" />
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold text-text">Realized PnL</span>
          <span className="text-[11px] text-sub">USD</span>
        </div>
        <span className="text-[11px] font-bold text-text">Win Rate</span>
      </div>

      {/* Big numbers row */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-[20px] font-bold tabular leading-none ${pnl !== null && pnl >= 0 ? 'text-green' : 'text-red'}`}>
            {pnl !== null ? `${pnl >= 0 ? '+' : ''}${fmtUsd(pnl)}` : '—'}
          </span>
          <span className={`text-[12px] tabular ${pnlPct !== null && pnlPct >= 0 ? 'text-green/70' : 'text-red/70'}`}>
            {pnlPct !== null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%` : ''}
          </span>
        </div>
        <span className="text-[20px] font-bold tabular text-text leading-none">
          {winRate !== null ? `${winRate.toFixed(2)}%` : '—'}
        </span>
      </div>

      {/* Summary rows */}
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-sub">Unrealized Profits</span>
          <span className="text-[11px] text-text tabular">$0</span>
        </div>
      </div>

      {/* Calendar */}
      <PnlCalendar dayPnlMap={dayPnlMap} month={now.getMonth()} year={now.getFullYear()} />
    </div>
  )
}

/* ── Analysis Card ─────────────────────────────────────── */

function AnalysisCard({
  stats,
  nativeBalanceWei,
  chain,
  profitability,
  isLoading,
  onTokenClick,
  gtLogos,
}: {
  stats: {
    total_count_of_trades: number
    total_realized_profit_usd: string
    total_trade_volume: string
    total_tokens_bought: number
    total_tokens_sold: number
    avg_holding_time?: number
  } | null
  nativeBalanceWei: string
  chain: ChainSlug
  profitability: WalletTokenPnl[]
  isLoading: boolean
  onTokenClick: (addr: string) => void
  gtLogos?: Map<string, string>
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
    )
  }

  const chainConfig = getChain(chain)
  const volume = stats ? Number(stats.total_trade_volume) : 0
  const trades = stats?.total_count_of_trades ?? 0
  const avgTrade = trades > 0 ? volume / trades : 0

  // Avg Hold Time (seconds → human-readable)
  const holdSec = stats?.avg_holding_time
  let holdTimeStr = '—'
  let holdBadge: { label: string; color: string } | null = null
  if (holdSec != null && holdSec > 0) {
    const holdDays = holdSec / 86400
    if (holdDays < 1) {
      const hours = Math.round(holdSec / 3600)
      holdTimeStr = `${Math.max(1, hours)} hours`
    } else {
      holdTimeStr = `${holdDays.toFixed(1)} days`
    }
    if (holdDays < 3) {
      holdBadge = { label: 'Short-term', color: 'text-yellow-400 bg-yellow-400/10' }
    } else if (holdDays <= 30) {
      holdBadge = { label: 'Mid-term', color: 'text-blue bg-blue/10' }
    } else {
      holdBadge = { label: 'Long-term', color: 'text-purple-400 bg-purple-400/10' }
    }
  }

  const bestToken = profitability.length > 0
    ? profitability.reduce((best, t) =>
        Number(t.realized_profit_usd) > Number(best.realized_profit_usd) ? t : best
      )
    : null

  const metrics = [
    { label: 'Volume', value: fmtUsd(volume) },
    { label: 'Total Trades', value: String(trades) },
    { label: 'Avg Trade', value: avgTrade > 0 ? fmtUsd(avgTrade) : '—' },
  ]

  return (
    <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
      <span className="text-[11px] text-sub font-medium uppercase tracking-wide">Analysis</span>

      <div className="flex flex-col gap-2.5">
        {metrics.map(m => (
          <div key={m.label} className="flex items-center justify-between">
            <span className="text-[12px] text-sub">{m.label}</span>
            <span className="text-[13px] text-text font-medium tabular">{m.value}</span>
          </div>
        ))}

        {/* Avg Hold Time + badge — hidden until Moralis paid plan provides data */}
        {holdSec != null && holdSec > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-sub">Avg Hold Time</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] text-text font-medium tabular">{holdTimeStr}</span>
              {holdBadge && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${holdBadge.color}`}>
                  {holdBadge.label}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {bestToken && Number(bestToken.realized_profit_usd) > 0 && (
        <div className="mt-1 pt-3 border-t border-border">
          <div className="text-[11px] text-sub mb-2">Top Token</div>
          <div
            onClick={() => bestToken.token_address && onTokenClick(bestToken.token_address)}
            className="flex items-center gap-2 cursor-pointer hover:bg-surface/50 -mx-2 px-2 py-1 rounded-lg transition-colors"
          >
            <TokenLogo logo={bestToken.logo} symbol={bestToken.symbol} size={20} tokenAddress={bestToken.token_address} chain={chain} gtLogos={gtLogos} />
            <span className="text-[13px] text-text font-medium">{bestToken.symbol}</span>
            <span className="text-[12px] text-green ml-auto tabular">
              +{fmtUsd(Number(bestToken.realized_profit_usd))}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Distribution Card ────────────────────────────────── */

function DistributionCard({
  holdings,
  nativeBalanceWei,
  chain,
  isLoading,
  onTokenClick,
  gtLogos,
}: {
  holdings: WalletHolding[]
  nativeBalanceWei: string
  chain: ChainSlug
  isLoading: boolean
  onTokenClick: (addr: string) => void
  gtLogos?: Map<string, string>
}) {
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-1.5 w-full" />
          </div>
        ))}
      </div>
    )
  }

  const chainConfig = getChain(chain)
  const ethStr = weiToEth(nativeBalanceWei, chainConfig.nativeCurrency.decimals)
  const ethNum = parseFloat(ethStr)
  const ethHolding = holdings.find(h => h.native_token)
  const ethPrice = ethHolding?.usd_price ?? 0
  const ethUsd = ethNum * ethPrice

  const tokenHoldings = holdings
    .filter(h => !h.native_token && h.usd_value > 0)
    .sort((a, b) => b.usd_value - a.usd_value)

  const totalUsd = ethUsd + tokenHoldings.reduce((sum, h) => sum + h.usd_value, 0)

  interface HoldingItem { symbol: string; usdValue: number; pct: number; logo: string | null; tokenAddress: string }
  const items: HoldingItem[] = []

  if (ethUsd > 0 && totalUsd > 0) {
    items.push({ symbol: chainConfig.nativeCurrency.symbol, usdValue: ethUsd, pct: (ethUsd / totalUsd) * 100, logo: null, tokenAddress: '' })
  }
  for (const h of tokenHoldings.slice(0, 5)) {
    if (totalUsd <= 0) break
    items.push({ symbol: h.symbol, usdValue: h.usd_value, pct: (h.usd_value / totalUsd) * 100, logo: h.logo, tokenAddress: h.token_address })
  }
  items.sort((a, b) => b.usdValue - a.usdValue)
  const top5 = items.slice(0, 5)

  const barColors = ['bg-blue', 'bg-green', 'bg-yellow-500', 'bg-purple-500', 'bg-orange-500']

  return (
    <div className="rounded-lg border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-sub font-medium uppercase tracking-wide">Token Holdings</span>
        {totalUsd > 0 && (
          <span className="text-[12px] text-text font-medium tabular">{fmtUsd(totalUsd)}</span>
        )}
      </div>

      {top5.length === 0 ? (
        <div className="text-[12px] text-sub py-4 text-center">No holdings</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {top5.map((item, i) => (
            <div key={item.symbol}
              onClick={() => item.tokenAddress && onTokenClick(item.tokenAddress)}
              className={`flex flex-col gap-1 ${item.tokenAddress ? 'cursor-pointer hover:bg-surface/50 -mx-2 px-2 py-1 rounded-lg transition-colors' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TokenLogo logo={item.logo} symbol={item.symbol} size={16} tokenAddress={item.tokenAddress} chain={chain} gtLogos={gtLogos} />
                  <span className="text-[12px] text-text">{item.symbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-sub tabular">{fmtUsd(item.usdValue)}</span>
                  <span className="text-[11px] text-sub tabular w-[40px] text-right">{item.pct.toFixed(1)}%</span>
                </div>
              </div>
              <div className="h-1.5 bg-[#111] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColors[i % barColors.length]}`}
                  style={{ width: `${Math.min(item.pct, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Sort helpers ─────────────────────────────────────── */

function SortArrow({ active, asc }: { active: boolean; asc: boolean }) {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" fill="none" className="flex-shrink-0 ml-0.5">
      <path d="M5 1v0L1 5h8L5 1z" fill={active && !asc ? 'currentColor' : '#444'} />
      <path d="M5 13v0L1 9h8L5 13z" fill={active && asc ? 'currentColor' : '#444'} />
    </svg>
  )
}

/* ── Tab: Recent PnL ─────────────────────────────────── */

type PnlSortKey = 'pnl' | 'invested' | 'sold' | 'trades'

function PnlTab({ data, chain, onTokenClick, gtLogos }: { data: WalletTokenPnl[]; chain: ChainSlug; onTokenClick: (addr: string) => void; gtLogos?: Map<string, string> }) {
  const [sortKey, setSortKey] = useState<PnlSortKey>('pnl')
  const [sortAsc, setSortAsc] = useState(false)

  const handleSort = (key: PnlSortKey) => {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  const sorted = data.slice().sort((a, b) => {
    let diff = 0
    switch (sortKey) {
      case 'pnl':      diff = Number(a.realized_profit_usd) - Number(b.realized_profit_usd); break
      case 'invested': diff = Number(a.total_usd_invested) - Number(b.total_usd_invested); break
      case 'sold':     diff = Number(a.total_sold_usd) - Number(b.total_sold_usd); break
      case 'trades':   diff = a.count_of_trades - b.count_of_trades; break
    }
    return sortAsc ? diff : -diff
  })

  if (!sorted.length) {
    return <div className="flex items-center justify-center py-12 text-sub text-[13px]">No profitability data</div>
  }

  const gridCols = '2fr 1fr 1fr 1fr 1fr 1fr 0.6fr'

  return (
    <div className="overflow-x-auto">
      <div className="grid gap-x-2 px-4 py-3 text-[11px] md:text-[12px] text-header font-medium bg-surface border-b border-border sticky top-0 z-10 whitespace-nowrap"
        style={{ gridTemplateColumns: gridCols, minWidth: 680 }}>
        <span>Token</span>
        <button onClick={() => handleSort('pnl')} className="flex items-center gap-0.5 hover:text-text text-right justify-end">
          PnL <SortArrow active={sortKey === 'pnl'} asc={sortAsc} />
        </button>
        <button onClick={() => handleSort('invested')} className="flex items-center gap-0.5 hover:text-text text-right justify-end">
          Invested <SortArrow active={sortKey === 'invested'} asc={sortAsc} />
        </button>
        <button onClick={() => handleSort('sold')} className="flex items-center gap-0.5 hover:text-text text-right justify-end">
          Sold <SortArrow active={sortKey === 'sold'} asc={sortAsc} />
        </button>
        <span className="text-right">Avg Buy</span>
        <span className="text-right">Avg Sell</span>
        <button onClick={() => handleSort('trades')} className="flex items-center gap-0.5 hover:text-text text-right justify-end">
          Trades <SortArrow active={sortKey === 'trades'} asc={sortAsc} />
        </button>
      </div>

      {sorted.map((t, i) => {
        const pnl = Number(t.realized_profit_usd)
        return (
          <div key={t.token_address || i}
            onClick={() => t.token_address && onTokenClick(t.token_address)}
            className="grid gap-x-2 px-4 py-2.5 border-b border-border hover:bg-surface/50 transition-colors items-center text-[12px] cursor-pointer"
            style={{ gridTemplateColumns: gridCols, minWidth: 680 }}>
            <div className="flex items-center gap-2 min-w-0">
              <TokenLogo logo={t.logo} symbol={t.symbol} size={24} tokenAddress={t.token_address} chain={chain} gtLogos={gtLogos} />
              <span className="text-text font-medium truncate">{t.symbol}</span>
            </div>
            <div className={`text-right tabular ${pnl >= 0 ? 'text-green' : 'text-red'}`}>
              {pnl >= 0 ? '+' : ''}{fmtUsd(pnl)}
            </div>
            <div className="text-right tabular text-text">{fmtUsd(Number(t.total_usd_invested))}</div>
            <div className="text-right tabular text-text">{fmtUsd(Number(t.total_sold_usd))}</div>
            <div className="text-right tabular text-sub">{fmtPrice(Number(t.avg_buy_price_usd))}</div>
            <div className="text-right tabular text-sub">{fmtPrice(Number(t.avg_sell_price_usd))}</div>
            <div className="text-right tabular text-sub">{t.count_of_trades}</div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Tab: Holdings ───────────────────────────────────── */

function HoldingsTab({ holdings, nativeBalanceWei, chain, onTokenClick, gtLogos }: { holdings: WalletHolding[]; nativeBalanceWei: string; chain: ChainSlug; onTokenClick: (addr: string) => void; gtLogos?: Map<string, string> }) {
  const chainConfig = getChain(chain)
  const ethBalance = weiToEth(nativeBalanceWei, chainConfig.nativeCurrency.decimals)
  const ethValue = parseFloat(ethBalance)
  const ethHolding = holdings.find(h => h.native_token)
  const ethPrice = ethHolding?.usd_price ?? 0
  const ethUsd = ethValue * ethPrice

  const tokenHoldings = holdings
    .filter(h => !h.native_token)
    .sort((a, b) => b.usd_value - a.usd_value)

  const totalUsd = ethUsd + tokenHoldings.reduce((sum, h) => sum + h.usd_value, 0)

  const gridCols = '2fr 1.2fr 1fr 1fr 0.8fr'

  return (
    <div className="overflow-x-auto">
      <div className="grid gap-x-2 px-4 py-3 text-[12px] text-header font-medium bg-surface border-b border-border sticky top-0 z-10"
        style={{ gridTemplateColumns: gridCols, minWidth: 520 }}>
        <span>Token</span>
        <span className="text-right">Balance</span>
        <span className="text-right">USD Value</span>
        <span className="text-right">Price</span>
        <span className="text-right">Portfolio %</span>
      </div>

      {ethValue > 0 && (
        <div className="grid gap-x-2 px-4 py-2.5 border-b border-border hover:bg-surface/50 transition-colors items-center text-[12px]"
          style={{ gridTemplateColumns: gridCols, minWidth: 520 }}>
          <div className="flex items-center gap-2 min-w-0">
            <NativeTokenIcon chain={chain} size={24} />
            <span className="text-text font-medium">{chainConfig.nativeCurrency.symbol}</span>
          </div>
          <div className="text-right tabular text-text">{parseFloat(ethBalance).toFixed(4)}</div>
          <div className="text-right tabular text-text">{fmtUsd(ethUsd)}</div>
          <div className="text-right tabular text-sub">{ethPrice > 0 ? fmtUsd(ethPrice) : '—'}</div>
          <div className="text-right tabular text-sub">{totalUsd > 0 ? `${((ethUsd / totalUsd) * 100).toFixed(1)}%` : '—'}</div>
        </div>
      )}

      {tokenHoldings.map((h, i) => (
        <div key={h.token_address || i}
          onClick={() => h.token_address && onTokenClick(h.token_address)}
          className="grid gap-x-2 px-4 py-2.5 border-b border-border hover:bg-surface/50 transition-colors items-center text-[12px] cursor-pointer"
          style={{ gridTemplateColumns: gridCols, minWidth: 520 }}>
          <div className="flex items-center gap-2 min-w-0">
            <TokenLogo logo={h.logo} symbol={h.symbol} size={24} tokenAddress={h.token_address} chain={chain} gtLogos={gtLogos} />
            <span className="text-text font-medium truncate">{h.symbol}</span>
          </div>
          <div className="text-right tabular text-text">{fmtAmount(h.balance_formatted)}</div>
          <div className="text-right tabular text-text">{h.usd_value > 0 ? fmtUsd(h.usd_value) : '—'}</div>
          <div className="text-right tabular text-sub">{h.usd_price > 0 ? fmtPrice(h.usd_price) : '—'}</div>
          <div className="text-right tabular text-sub">{h.portfolio_percentage > 0 ? `${h.portfolio_percentage.toFixed(1)}%` : '—'}</div>
        </div>
      ))}

      {tokenHoldings.length === 0 && ethValue <= 0 && (
        <div className="flex items-center justify-center py-12 text-sub text-[13px]">No holdings found</div>
      )}
    </div>
  )
}

/* ── Tab: Trades ─────────────────────────────────────── */

function TradesTab({ swaps, chain, gtLogos, onCopy }: { swaps: DetectedSwap[]; chain: ChainSlug; gtLogos?: Map<string, string>; onCopy: (swap: DetectedSwap) => void }) {
  if (!swaps.length) {
    return <div className="flex items-center justify-center py-12 text-sub text-[13px]">No recent trades detected</div>
  }

  return (
    <div>
      {swaps.map((swap, i) => {
        const isBuy = swap.transactionType === 'buy'
        return (
          <div key={`${swap.txHash}-${i}`} className="flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-surface/50 transition-colors">
            {/* Buy/Sell badge */}
            <span className={clsx(
              'text-[11px] font-bold uppercase w-[34px] text-center flex-shrink-0',
              isBuy ? 'text-green' : 'text-red'
            )}>
              {isBuy ? 'Buy' : 'Sell'}
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <a href={explorerLink(chain, 'tx', swap.txHash)} target="_blank" rel="noopener noreferrer" className="font-mono text-[12px] text-sub hover:text-text transition-colors">
                  {swap.txHash.slice(0, 10)}...
                </a>
                <span className="text-[11px] text-sub">{timeAgo(swap.timestamp)}</span>
                {swap.pairLabel && <span className="text-[11px] text-sub/60">{swap.pairLabel}</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-1 text-[12px]">
                <TokenLogo logo={swap.tokenSold.logo} symbol={swap.tokenSold.symbol} size={16} tokenAddress={swap.tokenSold.address} chain={chain} gtLogos={gtLogos} />
                <span className="text-red">{fmtAmount(swap.tokenSold.amount)} {swap.tokenSold.symbol}</span>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-sub flex-shrink-0">
                  <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <TokenLogo logo={swap.tokenBought.logo} symbol={swap.tokenBought.symbol} size={16} tokenAddress={swap.tokenBought.address} chain={chain} gtLogos={gtLogos} />
                <span className="text-green">{fmtAmount(swap.tokenBought.amount)} {swap.tokenBought.symbol}</span>
              </div>
            </div>

            {/* USD value */}
            <span className="text-[12px] tabular text-text font-mono flex-shrink-0">
              {swap.totalValueUsd > 0 ? fmtUsd(swap.totalValueUsd) : ''}
            </span>

            <button onClick={() => onCopy(swap)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue text-white text-[11px] font-medium hover:bg-blue/80 transition-colors flex-shrink-0">
              Copy
            </button>
          </div>
        )
      })}
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════ */

export default function WalletPage({ params }: { params: { address: string } }) {
  const { chain } = useChain()
  const router = useRouter()
  const chainSlug = chain as ChainSlug
  const walletAddress = params.address
  const [tab, setTab] = useState<TabKey>('pnl')

  const chainConfig = getChain(chainSlug)
  const isSolana = chainConfig.chainType !== 'evm'

  const {
    stats, profitability, holdings, nativeBalanceWei, swaps, isLoading
  } = useWalletDetail(walletAddress, chainSlug)

  // Batch-fetch GT logos for all tokens on this page
  const allTokenAddrs = useMemo(() => {
    const addrs = new Set<string>()
    for (const p of profitability) if (p.token_address) addrs.add(p.token_address)
    for (const h of holdings) if (h.token_address) addrs.add(h.token_address)
    return [...addrs]
  }, [profitability, holdings])
  const gtLogos = useTokenLogos(allTokenAddrs, chainSlug)

  // Navigate via token redirect page — resolves token → top pool → pair detail
  const handleTokenClick = useCallback((tokenAddress: string) => {
    router.push(`/${chainSlug}/token/${tokenAddress}`)
  }, [chainSlug, router])

  // CopyTradeModal state (opened from Trades tab)
  const [copyModalToken, setCopyModalToken] = useState<{
    address: string; symbol: string; decimals: number
  } | null>(null)

  const handleTradeCopy = useCallback((swap: DetectedSwap) => {
    // Determine which token to buy: prefer the non-ETH/WETH/USDC token
    const chainCfg = getChain(chain)
    const quoteAddrs = new Set([chainCfg.wrappedNative, ...chainCfg.stablecoins])
    if (chainCfg.chainType === 'evm') quoteAddrs.add('0x0000000000000000000000000000000000000000')
    const boughtAddr = swap.tokenBought.address
    const isQuote = quoteAddrs.has(normalizeAddr(chain, boughtAddr))
    const buyToken = isQuote ? swap.tokenSold : swap.tokenBought
    setCopyModalToken({ address: buyToken.address, symbol: buyToken.symbol, decimals: chainCfg.nativeCurrency.decimals })
  }, [chain])

  // Compute summary stats
  const pnl = stats ? Number(stats.total_realized_profit_usd) : null
  const totalInvested = profitability.reduce((s, t) => s + Number(t.total_usd_invested), 0)
  const pnlPct = pnl !== null && totalInvested > 0 ? (pnl / totalInvested) * 100 : null

  // Win/Loss counts + win rate
  const wins = profitability.filter(t => Number(t.realized_profit_usd) > 0).length
  const tokensTotal = profitability.length
  const winRate = tokensTotal > 0 ? (wins / tokensTotal) * 100 : null

  // Holdings count
  const holdingsCount = holdings.filter(h => h.usd_value > 0 || h.native_token).length

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'pnl', label: 'Recent PnL', count: profitability.length },
    { key: 'holdings', label: 'Holdings', count: holdingsCount },
    { key: 'trades', label: 'Trades', count: swaps.length },
  ]

  return (
    <div className="flex-1 overflow-auto px-3 pt-3 md:px-5 md:pt-4 pb-4">
      <div className="flex flex-col gap-4">
        {/* Back link */}
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-1.5 text-[13px] text-sub hover:text-text transition-colors w-fit"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Smart Money
        </button>

        {/* ── Top Bar ─────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <WalletAvatar address={walletAddress} size={40} />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-mono text-[14px] text-text truncate">{walletAddress}</span>
            <CopyButton text={walletAddress} />
            <a
              href={explorerLink(chainSlug, 'address', walletAddress)}
              target="_blank" rel="noopener"
              className="text-sub hover:text-text transition-colors flex-shrink-0"
              title={`View on ${chainConfig.explorer.name}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5.5 2.5H3.5C2.94772 2.5 2.5 2.94772 2.5 3.5V10.5C2.5 11.0523 2.94772 11.5 3.5 11.5H10.5C11.0523 11.5 11.5 11.0523 11.5 10.5V8.5M8.5 2.5H11.5V5.5M11.5 2.5L6.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </a>
          </div>
          <FollowWalletButton address={walletAddress} chain={chain} />
        </div>

        {/* ── Empty state when no data from Moralis ───── */}
        {!isLoading && !stats && profitability.length === 0 && holdings.length === 0 && swaps.length === 0 && nativeBalanceWei === '0' && (
          <div className="rounded-lg border border-border bg-surface/50 px-5 py-8 flex flex-col items-center gap-2 text-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-sub/40">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 15s1.5-2 4-2 4 2 4 2M9 9h.01M15 9h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <p className="text-[14px] font-medium text-text">No on-chain data found</p>
            <p className="text-[12px] text-sub max-w-[320px]">
              This wallet has no trading activity or token holdings on {chainConfig.name}. It may be inactive or the address is invalid.
            </p>
          </div>
        )}

        {/* ── 3-Column Stats ─────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-[1.2fr_minmax(0,0.7fr)_minmax(0,0.7fr)] gap-3">
          <PnlOverviewCard
            pnl={pnl}
            pnlPct={pnlPct}
            winRate={winRate}
            swaps={swaps}
            profitability={profitability}
            isLoading={isLoading}
          />
          <AnalysisCard
            stats={stats}
            nativeBalanceWei={nativeBalanceWei}
            chain={chainSlug}
            profitability={profitability}
            isLoading={isLoading}
            onTokenClick={handleTokenClick}
            gtLogos={gtLogos}
          />
          <DistributionCard
            holdings={holdings}
            nativeBalanceWei={nativeBalanceWei}
            chain={chainSlug}
            isLoading={isLoading}
            onTokenClick={handleTokenClick}
            gtLogos={gtLogos}
          />
        </div>

        {/* ── Bottom Tabs ────────────────────────────────── */}
        <div className="rounded-lg border border-border flex flex-col min-h-0">
          <div className="flex border-b border-border bg-surface rounded-t-lg overflow-x-auto scrollbar-hide">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 md:px-4 py-3 text-[12px] md:text-[13px] font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                  tab === t.key
                    ? 'text-text border-blue'
                    : 'text-sub border-transparent hover:text-text'
                }`}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="text-[10px] md:text-[11px] text-sub bg-border/40 px-1.5 py-0.5 rounded-md">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="min-h-[200px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-sub">
                <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
            ) : (
              <>
                {tab === 'pnl' && <PnlTab data={profitability} chain={chainSlug} onTokenClick={handleTokenClick} gtLogos={gtLogos} />}
                {tab === 'holdings' && <HoldingsTab holdings={holdings} nativeBalanceWei={nativeBalanceWei} chain={chainSlug} onTokenClick={handleTokenClick} gtLogos={gtLogos} />}
                {tab === 'trades' && <TradesTab swaps={swaps} chain={chainSlug} gtLogos={gtLogos} onCopy={handleTradeCopy} />}
              </>
            )}
          </div>
        </div>
      </div>
      {copyModalToken && (
        <CopyTradeModal
          isOpen={!!copyModalToken}
          onClose={() => setCopyModalToken(null)}
          walletAddress={walletAddress}
          tokenAddress={copyModalToken.address}
          tokenSymbol={copyModalToken.symbol}
          tokenDecimals={copyModalToken.decimals}
          walletPnlPct={0}
          chain={chainSlug}
        />
      )}
    </div>
  )
}
