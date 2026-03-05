'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import type { Pool } from '@dex/shared'
import { fmtPrice, fmtUsd, fmtAge, fmtNum, fmtPct, shortAddr } from '../../../lib/formatters'
import { usePairWebSocket } from '../../../hooks/useWebSocket'
import { fetchPoolTrades, type PoolExtended } from '../../../lib/dexscreener-client'
import { useTokenSecurity } from '../../../hooks/useTokenSecurity'
import { PairTabs } from '../../../components/PairTabs'
import { TradingViewChart } from '../../../components/TradingViewChart'
import clsx from 'clsx'
import { TokenAvatar, addrToHue } from '../../../components/TokenAvatar'
import { PairWatchlistDropdown } from '../../../components/PairWatchlistDropdown'
import { OtherPairsModal } from '../../../components/OtherPairsModal'

interface RecentSwap {
  id:         string
  tx_hash:    string
  timestamp:  string
  is_buy:     boolean
  amount_usd: number
  amount0:    number
  amount1:    number
  price_usd:  number
  sender:     string | null
}

type PairDetail = Pool & Partial<PoolExtended> & { recent_swaps: RecentSwap[] }

interface Props { address: string }

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

const fetcher = (url: string) =>
  fetch(BASE_URL + url).then(r => { if (!r.ok) throw new Error('API error'); return r.json() })

/* ── Copy button ──────────────────────────────────────────── */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-sub hover:text-blue transition-colors flex-shrink-0"
      title="Copy"
    >
      {copied
        ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4.0762 3.36734H9.21544C9.99842 3.36734 10.6332 4.00207 10.6332 4.78506V9.9243C11.1225 9.9243 11.5192 9.52759 11.5192 9.03822V3.36734C11.5192 2.87797 11.1225 2.48126 10.6332 2.48126H4.96227C4.47291 2.48126 4.0762 2.87797 4.0762 3.36734ZM10.6332 10.9876V11.1648C10.6332 11.9478 9.99842 12.5825 9.21544 12.5825H2.83569C2.0527 12.5825 1.41797 11.9478 1.41797 11.1648V4.78506C1.41797 4.00207 2.0527 3.36734 2.83569 3.36734H3.01291C3.01291 2.29074 3.88567 1.41797 4.96227 1.41797H10.6332C11.7098 1.41797 12.5825 2.29073 12.5825 3.36734V9.03822C12.5825 10.1148 11.7098 10.9876 10.6332 10.9876ZM2.83569 4.43063C2.63994 4.43063 2.48126 4.58931 2.48126 4.78506V11.1648C2.48126 11.3606 2.63994 11.5192 2.83569 11.5192H9.21544C9.41118 11.5192 9.56987 11.3606 9.56987 11.1648V4.78506C9.56987 4.58931 9.41118 4.43063 9.21544 4.43063H2.83569Z" fill="currentColor"/></svg>
      }
    </button>
  )
}

/* ── TokenAvatar imported from components/TokenAvatar ──── */

/* ── Tooltip on hover ─────────────────────────────────────── */
function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  return (
    <div className="relative group">
      {children}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 pointer-events-none">
        <div className="bg-[#111] border border-border rounded-lg px-4 py-3 shadow-xl text-center whitespace-nowrap">
          {content}
        </div>
      </div>
    </div>
  )
}

/* ── Card container ───────────────────────────────────────── */
function Card({ children, className, style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={clsx('rounded-xl border border-border bg-surface', className)} style={style}>
      {children}
    </div>
  )
}

/* ── Section header inside a card ────────────────────────── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold text-header uppercase tracking-widest mb-3">
      {children}
    </div>
  )
}

/* ── Stat card (inner block, darker than card) ────────────── */
function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-black/40 px-3 py-2.5">
      <div className="text-[11px] text-sub mb-1">{label}</div>
      <div className="text-[14px] font-semibold tabular text-text">{value ?? '—'}</div>
    </div>
  )
}

/* ── Change pill (inner block, darker than card) ──────────── */
function ChangePill({ label, value }: { label: string; value: unknown }) {
  const n     = Number(value)
  const isPos = Number.isFinite(n) && n > 0
  const isNeg = Number.isFinite(n) && n < 0
  return (
    <div className="flex flex-col items-center rounded-lg border border-border/50 bg-black/40 px-2 py-3">
      <div className="text-[10px] text-sub uppercase mb-1.5">{label}</div>
      <div className={clsx(
        'text-[13px] font-semibold tabular',
        isPos ? 'text-green' : isNeg ? 'text-red' : 'text-sub'
      )}>
        {Number.isFinite(n) ? `${isPos ? '+' : ''}${n.toFixed(2)}%` : '—'}
      </div>
    </div>
  )
}

/* ── Address row (pool info) ──────────────────────────────── */
function AddrRow({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-border/50 last:border-0">
      <span className="w-24 flex-shrink-0 text-[12px] text-sub">{label}</span>
      <span className="font-mono text-[12px] text-text">{shortAddr(value)}</span>
      <CopyButton text={value} />
      <a href={href} target="_blank" rel="noopener" className="text-sub hover:text-blue text-xs ml-auto">↗</a>
    </div>
  )
}

/* ── Spinner ──────────────────────────────────────────────── */
function Spinner({ size = 4 }: { size?: number }) {
  return (
    <svg className={`animate-spin h-${size} w-${size}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

const QUOTE_ADDRS = new Set([
  '0x4200000000000000000000000000000000000006',
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2',
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
])

/* ── Main ─────────────────────────────────────────────────── */
export function PairDetailClient({ address }: Props) {
  // Fetch pair from DexScreener client-side
  const { data: pair, error, isLoading } = useSWR<PairDetail | null>(
    `pair-${address}`,
    async () => {
      try {
        const { fetchPairByAddress } = await import('../../../lib/dexscreener-client')
        const result = await fetchPairByAddress(address)
        if (!result) console.warn('[PairDetail] fetchPairByAddress returned null for', address)
        return result as PairDetail | null
      } catch (e) {
        console.error('[PairDetail] SWR fetcher error:', e)
        throw e
      }
    },
    { revalidateOnFocus: false }
  )

  // GoPlus security data for base token
  const baseTokenAddr = pair?.token0 && pair?.token1
    ? (QUOTE_ADDRS.has(pair.token0.address.toLowerCase()) ? pair.token1.address : pair.token0.address)
    : undefined
  const { data: security } = useTokenSecurity(baseTokenAddr)

  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [flash,     setFlash]     = useState<'up' | 'down' | null>(null)
  const [otherPairsOpen, setOtherPairsOpen] = useState(false)
  const [statsPeriod, setStatsPeriod] = useState<'5m' | '1h' | '6h' | '24h'>('24h')
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null)
  const [auditDisclaimer, setAuditDisclaimer] = useState(false)
  const [swapUnit, setSwapUnit] = useState<'USD' | 'USDC'>('USD')
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [alertsNotifEnabled, setAlertsNotifEnabled] = useState(false)
  const [alerts, setAlerts] = useState<{ id: string; condition: string; price: string; createdAt: number }[]>([])
  const [alertPriceInput, setAlertPriceInput] = useState('')
  const [alertCondition, setAlertCondition] = useState<'goes over' | 'goes under'>('goes over')
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null)
  const [editAlertCondition, setEditAlertCondition] = useState<'goes over' | 'goes under'>('goes over')
  const [editAlertPrice, setEditAlertPrice] = useState('')

  // Swaps
  const projectInfoRef = useRef<HTMLDivElement>(null)

  const [chartHeight, setChartHeight]  = useState(440)
  const chartDragRef = useRef<{ startY: number; startH: number } | null>(null)

  const onDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    chartDragRef.current = { startY: e.clientY, startH: chartHeight }
    const onMove = (ev: PointerEvent) => {
      if (!chartDragRef.current) return
      const delta = ev.clientY - chartDragRef.current.startY
      setChartHeight(Math.min(900, Math.max(300, chartDragRef.current.startH + delta)))
    }
    const onUp = () => {
      chartDragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [chartHeight])

  const [swaps,       setSwaps]       = useState<RecentSwap[]>([])
  const [swapHasMore, setSwapHasMore] = useState(false)
  const [swapLoading, setSwapLoading] = useState(false)
  const tradesLoadedRef = useRef('')

  useEffect(() => {
    if (!address || address === tradesLoadedRef.current) return
    tradesLoadedRef.current = address
    setSwapLoading(true)
    fetchPoolTrades(address).then(trades => {
      setSwaps(trades)
      setSwapHasMore(false) // GT returns up to 300 trades, no pagination
      setSwapLoading(false)
    }).catch(() => setSwapLoading(false))
  }, [address])

  // Live price
  const prevPrice = useRef(0)
  const handleUpdate = useCallback(
    (evt: { pool_address: string; price_usd: number }) => {
      if (evt.pool_address !== address) return
      const prev = prevPrice.current
      prevPrice.current = evt.price_usd
      setLivePrice(evt.price_usd)
      if (prev > 0 && evt.price_usd !== prev) {
        setFlash(evt.price_usd > prev ? 'up' : 'down')
        setTimeout(() => setFlash(null), 700)
      }
    },
    [address]
  )
  usePairWebSocket([address], handleUpdate)

  const loadMoreSwaps = useCallback(() => {}, [])

  /* ── Loading / error ─────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-2 text-sub text-sm">
        <Spinner /> Loading pair…
      </div>
    )
  }
  if (error || !pair) {
    if (error) console.error('[PairDetail] SWR error state:', error)
    if (!pair && !error) console.warn('[PairDetail] pair is null/undefined, no error')
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <p className="text-sub text-sm">Failed to load pair data.</p>
        {error && <p className="text-red text-xs font-mono">{String(error?.message ?? error)}</p>}
        <a href="/" className="text-blue text-xs hover:underline">← Back to all coins</a>
      </div>
    )
  }

  const price     = livePrice ?? Number(pair.price_usd)
  const t0IsQuote = QUOTE_ADDRS.has(pair.token0.address.toLowerCase())
  const t1IsQuote = QUOTE_ADDRS.has(pair.token1.address.toLowerCase())
  const [base, quote] = t0IsQuote && !t1IsQuote ? [pair.token1, pair.token0] : [pair.token0, pair.token1]
  const dexLabel  = pair.dex === 'uniswap_v3' ? 'Uniswap V3' : pair.dex === 'uniswap_v4' ? 'Uniswap V4' : 'Aerodrome'
  const feeLabel  = pair.fee_tier != null ? `${parseFloat((pair.fee_tier / 10000).toFixed(4))}%` : null
  const change24h = Number(pair.change_24h)

  return (
    <div className="flex flex-col h-full bg-bg overflow-y-auto md:overflow-hidden scrollbar-hide">

      {/* ── Two-column layout ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-3 md:gap-5 p-3 md:p-5">

        {/* ── LEFT COLUMN: Chart + Transactions ───────────────── */}
        <div className="flex flex-col md:flex-1 min-w-0 gap-5 md:h-[calc(100vh_-_40px)] md:overflow-y-auto scrollbar-hide">

        {/* ── Chart Card ──────────────────────────────────────── */}
        <Card className="flex flex-col overflow-hidden flex-shrink-0">

          {/* Chart header: token identity */}
          <div className="flex items-start gap-4 px-5 py-4 border-b border-border flex-shrink-0">
            <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={44} rounded="md" />
            <div className="min-w-0">
              {/* Token pair + DEX badge + age */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h1 className="text-[15px] md:text-[18px] font-bold text-text leading-none">
                  {base.symbol}
                  <span className="text-sub font-normal text-[15px]"> / {quote.symbol}</span>
                </h1>
                {/* DEX badge */}
                <span className="inline-flex items-center rounded-md bg-blue/10 border border-blue/20 px-2 py-0.5 text-[11px] font-semibold text-blue">
                  {dexLabel}
                </span>
                {/* Age */}
                <span className="text-[12px] text-sub">
                  {pair.created_at ? `${fmtAge(pair.created_at)} old` : '—'}
                </span>
              </div>
              {/* CA address */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase text-sub/50 font-medium tracking-wide">CA</span>
                <span className="font-mono text-[12px] text-sub">{shortAddr(base.address)}</span>
                <CopyButton text={base.address} />
                <a href={`https://basescan.org/token/${base.address}`} target="_blank" rel="noopener"
                  className="text-sub hover:text-blue text-[11px]">↗</a>
              </div>
            </div>
          </div>

          {/* TradingView Chart */}
          <div className="w-full" style={{ height: chartHeight }}>
            <TradingViewChart pairAddress={address} symbol={`${base.symbol}/${quote.symbol}`} />
          </div>

          {/* Drag handle to resize chart */}
          <div
            onPointerDown={onDragStart}
            className="flex items-center justify-center h-[20px] cursor-row-resize select-none border-t border-border hover:bg-border/30 transition-colors"
          >
            <svg width="16" height="10" viewBox="0 0 16 10" fill="none" className="text-sub">
              <path d="M5 1l3-3 3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 2)" />
              <path d="M5 1l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 6)" />
            </svg>
          </div>
        </Card>

        {/* ── Tabbed section (Transactions / Top Traders / Holders / Liquidity / Bubblemaps) ── */}
        <PairTabs
          swaps={swaps}
          swapHasMore={swapHasMore}
          swapLoading={swapLoading}
          onLoadMore={loadMoreSwaps}
          tokenAddress={base.address}
        />

        </div>{/* end LEFT COLUMN */}

        {/* ── RIGHT COLUMN ────────────────────────────────────── */}
        <div className="w-full md:w-[340px] flex-shrink-0 flex flex-col gap-4 md:h-[calc(100vh_-_40px)] md:overflow-y-auto scrollbar-hide bg-surface border border-border rounded-xl px-4 py-2">

          {/* ── 1. Token Header ──────────────────────────────────── */}
          <div className="flex flex-col gap-2 items-center">
            <div className="flex items-center justify-between w-full py-2">
              <div className="flex items-center gap-1.5">
                <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={30} rounded="md" />
                <span className="text-[16px] text-text">{base.name || base.symbol}</span>
              </div>
            </div>
            {/* Symbol / Quote */}
            <div className="flex flex-col gap-[5px] items-center">
              <div className="flex items-end gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-[16px] text-text">${base.symbol}</span>
                  <CopyButton text={base.address} />
                </div>
                <span className="text-[14px] text-text">/</span>
                <span className="text-[14px] text-text">{quote.symbol}</span>
              </div>
              <div className="flex items-center gap-[5px]">
                <div className="flex items-center gap-[2px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/branding/base-icon.svg" alt="Base" width={14} height={14} />
                  <span className="text-[14px] text-sub">Base</span>
                </div>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-sub"><path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.2"/></svg>
                <div className="flex items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/branding/uniswap-icon.svg" alt="Uniswap" width={16} height={16} />
                  <span className="text-[14px] text-sub">Uniswap</span>
                </div>
                <span className="border border-border rounded px-1 py-0.5 text-[12px] text-sub">V4</span>
              </div>
            </div>
            {/* Banner: token logo as blurred cover, fallback to gradient */}
            <div className="w-full h-[113px] rounded-lg overflow-hidden relative bg-muted">
              {base.logo_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={base.logo_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover blur-[20px] scale-125 opacity-60"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={base.logo_url}
                    alt={base.symbol}
                    className="absolute inset-0 m-auto w-[56px] h-[56px] rounded-lg object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                  />
                </>
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(135deg, hsl(${addrToHue(base.address)},40%,18%) 0%, hsl(${addrToHue(base.address)},50%,12%) 100%)` }}
                />
              )}
            </div>
          </div>

          {/* ── 2. Social Links ──────────────────────────────────── */}
          <div className="flex items-center bg-surface border border-border rounded">
            <button className="flex-1 flex items-center justify-center gap-2 py-2 border-r border-border text-[13px] text-sub hover:text-text transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="7" cy="7" r="5"/><path d="M2 7h10M7 2c1.5 1.5 2 3.5 2 5s-.5 3.5-2 5M7 2c-1.5 1.5-2 3.5-2 5s.5 3.5 2 5"/></svg>
              Website
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-2 border-r border-border text-[13px] text-sub hover:text-text transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M8.3 6.1L12.7 1h-1L7.8 5.4 4.8 1H1l4.6 6.7L1 13h1l4-4.6 3.2 4.6H13L8.3 6.1zm-1.4 1.6l-.5-.7L2.8 1.9h1.6l3 4.3.5.7 3.8 5.4h-1.6L6.9 7.7z"/></svg>
              Twitter
            </button>
            <button className="flex-1 flex items-center justify-center gap-2 py-2 border-r border-border text-[13px] text-sub hover:text-text transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M12.4707 2.10583C12.2591 1.88667 11.9702 1.75896 11.6657 1.75C11.5093 1.7503 11.3545 1.78204 11.2107 1.84333L1.52732 6.0375C1.41312 6.08402 1.3166 6.16554 1.25162 6.27035C1.18664 6.37515 1.15655 6.49786 1.16566 6.62083V7C1.1594 7.12794 1.19542 7.25437 1.26816 7.3598C1.34091 7.46523 1.44633 7.54378 1.56816 7.58333L4.08232 8.42334L4.84066 10.9842C4.89163 11.1637 4.99005 11.3261 5.12555 11.4545C5.26105 11.5828 5.42863 11.6722 5.61066 11.7133C5.68039 11.7219 5.75092 11.7219 5.82066 11.7133C6.07939 11.7124 6.32788 11.6122 6.51483 11.4333L7.44233 10.5583L9.23899 11.9758C9.41147 12.1105 9.61835 12.1939 9.83599 12.2166C10.0536 12.2393 10.2733 12.2004 10.4698 12.1042L10.6623 12.005C10.8269 11.9204 10.9699 11.799 11.0801 11.6503C11.1904 11.5016 11.265 11.3296 11.2982 11.1475L12.8323 3.21417C12.8683 3.01393 12.8542 2.80788 12.791 2.61446C12.7279 2.42105 12.6178 2.24629 12.4707 2.10583ZM10.4407 11.0075C10.4311 11.0579 10.4105 11.1055 10.3802 11.1469C10.3499 11.1883 10.3108 11.2224 10.2657 11.2467L10.0732 11.3458C10.0352 11.3651 9.99323 11.3751 9.95066 11.375C9.88854 11.3738 9.82875 11.3512 9.78149 11.3108L7.58816 9.56083C7.53588 9.5145 7.46844 9.48891 7.39858 9.48891C7.32872 9.48891 7.26127 9.5145 7.20899 9.56083L5.91399 10.78C5.89019 10.7975 5.86181 10.8076 5.83233 10.8092V8.75C5.8324 8.70957 5.84072 8.66958 5.85676 8.63247C5.87281 8.59536 5.89625 8.56191 5.92566 8.53417C7.78649 6.78417 8.90066 5.80417 9.56566 5.24417C9.58682 5.22481 9.60391 5.20142 9.61593 5.17538C9.62794 5.14934 9.63465 5.12116 9.63566 5.0925C9.638 5.06446 9.63396 5.03625 9.62386 5.00999C9.61376 4.98372 9.59785 4.96008 9.57733 4.94083C9.54889 4.90512 9.5093 4.87996 9.46489 4.86939C9.42048 4.85882 9.37381 4.86343 9.33233 4.8825L4.92232 7.665C4.88315 7.68366 4.8403 7.69334 4.79691 7.69334C4.75351 7.69334 4.71067 7.68366 4.67149 7.665L2.04066 6.76667L11.5315 2.64833C11.566 2.64015 11.602 2.64015 11.6365 2.64833C11.6787 2.64944 11.7202 2.65935 11.7584 2.67743C11.7966 2.69551 11.8306 2.72136 11.8582 2.75333C11.898 2.79563 11.9272 2.84676 11.9434 2.90253C11.9596 2.9583 11.9624 3.01712 11.9515 3.07417L10.4407 11.0075Z" fill="currentColor"/></svg>
              Telegram
            </button>
            <button
              onClick={() => projectInfoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="flex items-center justify-center w-[20px] flex-shrink-0 hover:text-text text-sub transition-colors"
            >
              <svg width="8" height="4" viewBox="0 0 8 4" fill="none"><path d="M0 0l4 4 4-4" fill="currentColor"/></svg>
            </button>
          </div>

          {/* ── 3. Price USD / Price ─────────────────────────────── */}
          <div className="flex gap-2 w-full">
            <div className="flex-1 border border-border rounded-lg p-2 flex flex-col gap-1 items-center text-center">
              <span className="text-[12px] text-sub">Price USD</span>
              <span className="text-[16px] font-bold tabular text-text">{fmtPrice(price)}</span>
            </div>
            <div className="flex-1 border border-border rounded-lg p-2 flex flex-col gap-1 items-center text-center">
              <span className="text-[12px] text-sub">Price ETH</span>
              <span className="text-[16px] font-bold tabular text-text">
                {pair.base_token_price_native
                  ? `${pair.base_token_price_native < 0.0001
                      ? pair.base_token_price_native.toExponential(4)
                      : pair.base_token_price_native < 1
                      ? pair.base_token_price_native.toFixed(8)
                      : pair.base_token_price_native.toFixed(4)} ETH`
                  : '—'}
              </span>
            </div>
          </div>

          {/* ── 4. Liquidity / FDV / Market Cap ──────────────────── */}
          {(() => {
            const rawSupply = BigInt(base.total_supply || '0')
            const totalSupply = Number(rawSupply) / Math.pow(10, base.decimals)
            const fmtSupply = totalSupply > 0
              ? `${totalSupply.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${base.symbol}`
              : '—'
            return (
              <div className="flex gap-2 w-full">
                <div className="flex-1 border border-border rounded-lg p-2 flex flex-col gap-1 items-center text-center">
                  <span className="text-[12px] text-sub">Liquidity</span>
                  <span className="text-[16px] font-bold tabular text-text">{fmtUsd(pair.liquidity_usd)}</span>
                </div>
                <Tooltip content={
                  <div className="flex flex-col gap-1">
                    <span className="text-[13px] font-semibold text-text">Fully diluted valuation:</span>
                    <span className="text-[12px] text-sub font-mono">(total supply − burned supply) * price</span>
                  </div>
                }>
                  <div className="flex-1 border border-border rounded-lg p-2 flex flex-col gap-1 items-center text-center cursor-help">
                    <span className="text-[12px] text-sub underline decoration-dotted">FDV</span>
                    <span className="text-[16px] font-bold tabular text-text">{Number(pair.mcap_usd) > 0 ? fmtUsd(pair.mcap_usd) : '—'}</span>
                  </div>
                </Tooltip>
                <Tooltip content={
                  <div className="flex flex-col gap-2">
                    <div>
                      <span className="text-[12px] text-sub block">Total supply:</span>
                      <span className="text-[13px] font-bold text-text">{fmtSupply}</span>
                    </div>
                    <div>
                      <span className="text-[12px] text-sub block">Self-reported circulating supply:</span>
                      <span className="text-[13px] font-bold text-text">{fmtSupply}</span>
                    </div>
                  </div>
                }>
                  <div className="flex-1 border border-border rounded-lg p-2 flex flex-col gap-1 items-center text-center cursor-help">
                    <span className="text-[12px] text-sub underline decoration-dotted">Market Cap</span>
                    <span className="text-[16px] font-bold tabular text-text">{Number(pair.mcap_usd) > 0 ? fmtUsd(pair.mcap_usd) : '—'}</span>
                  </div>
                </Tooltip>
              </div>
            )
          })()}

          {/* ── 5. Security Info Grid ────────────────────────────── */}
          {(() => {
            const s = security
            const CheckIcon = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#2fe06b" strokeWidth="1.5"/><path d="M4 7l2 2 4-4" stroke="#2fe06b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            const WarnIcon = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#ef5350" strokeWidth="1.5"/><path d="M5 5l4 4M9 5l-4 4" stroke="#ef5350" strokeWidth="1.5" strokeLinecap="round"/></svg>
            const LoadingText = () => <span className="text-[14px] text-sub tabular">—</span>

            // Top 10 holders percentage
            const top10Pct = s?.holders
              ? s.holders.slice(0, 10).reduce((sum, h) => sum + parseFloat(h.percent || '0'), 0) * 100
              : null
            const top10Ok = top10Pct !== null && top10Pct < 50

            // DEV (creator) holding
            const devPct = s ? parseFloat(s.creator_percent || '0') * 100 : null
            const devOk = devPct !== null && devPct < 5

            // Holders count
            const holderCount = s?.holder_count ? parseInt(s.holder_count) : null

            // Is honeypot
            const isHoneypot = s ? s.is_honeypot === '1' : null

            // Verified (open source)
            const isVerified = s ? s.is_open_source === '1' : null

            // Renounced (owner is null address)
            const isRenounced = s ? (s.owner_address === '0x0000000000000000000000000000000000000000' || s.owner_address === '') : null

            // Locked liquidity
            const lockedPct = s?.lp_holders
              ? s.lp_holders.reduce((sum, lp) => sum + (lp.is_locked ? parseFloat(lp.percent || '0') : 0), 0) * 100
              : null

            return (
              <div className="border border-border rounded-lg px-2 py-3 flex flex-col gap-5">
                {/* Row 1: Top 10 / DEV / Holders / Snipers */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-2 w-[67px]">
                    <span className="text-[12px] text-sub">Top 10</span>
                    {top10Pct !== null ? (
                      <div className="flex items-center gap-1">
                        {top10Ok ? <CheckIcon /> : <WarnIcon />}
                        <span className={clsx('text-[14px] tabular', top10Ok ? 'text-green' : 'text-red')}>{top10Pct.toFixed(2)}%</span>
                      </div>
                    ) : <LoadingText />}
                  </div>
                  <div className="flex flex-col gap-2 w-[67px]">
                    <span className="text-[12px] text-sub">DEV</span>
                    {devPct !== null ? (
                      <div className="flex items-center gap-1">
                        {devOk ? <CheckIcon /> : <WarnIcon />}
                        <span className={clsx('text-[14px] tabular', devOk ? 'text-green' : 'text-red')}>{devPct.toFixed(1)}%</span>
                      </div>
                    ) : <LoadingText />}
                  </div>
                  <div className="flex flex-col gap-2 w-[67px]">
                    <span className="text-[12px] text-sub">Holders</span>
                    <span className="text-[14px] text-text tabular">{holderCount !== null ? fmtNum(holderCount) : '—'}</span>
                  </div>
                  <div className="flex flex-col gap-2 w-[67px]">
                    <span className="text-[12px] text-sub">Snipers</span>
                    <span className="text-[14px] text-sub tabular">—</span>
                  </div>
                </div>
                {/* Row 2: Insiders / Phishing / Dex Paid / NoHoneypot */}
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-2 w-[67px]">
                    <span className="text-[12px] text-sub">Insiders</span>
                    <span className="text-[14px] text-sub tabular">—</span>
                  </div>
                  <div className="flex flex-col gap-2 w-[67px]">
                    <span className="text-[12px] text-sub">Phishing</span>
                    <span className="text-[14px] text-sub tabular">—</span>
                  </div>
                  <div className="flex flex-col gap-2 w-[67px]">
                    <span className="text-[12px] text-sub">Dex Paid</span>
                    <span className="text-[14px] text-sub">—</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[12px] text-sub">NoHoneypot</span>
                    {isHoneypot !== null ? (isHoneypot ? <WarnIcon /> : <CheckIcon />) : <LoadingText />}
                  </div>
                </div>
                {/* Row 3: Verified / Renounced / Locked */}
                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-2 w-[67px]">
                    <span className="text-[12px] text-sub">Verified</span>
                    {isVerified !== null ? (isVerified ? <CheckIcon /> : <WarnIcon />) : <LoadingText />}
                  </div>
                  <div className="flex flex-col gap-2 w-[67px]">
                    <span className="text-[12px] text-sub">Renounced</span>
                    {isRenounced !== null ? (isRenounced ? <CheckIcon /> : <WarnIcon />) : <LoadingText />}
                  </div>
                  <div className="flex flex-col gap-2 w-[67px]">
                    <span className="text-[12px] text-sub">Locked</span>
                    {lockedPct !== null ? (
                      <span className={clsx('text-[14px] tabular', lockedPct > 50 ? 'text-green' : 'text-red')}>{lockedPct.toFixed(1)}%</span>
                    ) : <LoadingText />}
                  </div>
                  <div className="w-[67px]" />
                </div>
              </div>
            )
          })()}

          {/* ── 6. Price Change + Trading Stats ──────────────────── */}
          {(() => {
            const periods = [
              { key: '5m' as const, label: '5M', change: pair.change_5m, txns: pair.txns_5m, volume: pair.volume_5m },
              { key: '1h' as const, label: '1H', change: pair.change_1h, txns: pair.txns_1h, volume: pair.volume_1h },
              { key: '6h' as const, label: '6H', change: pair.change_6h, txns: pair.txns_6h, volume: pair.volume_6h },
              { key: '24h' as const, label: '24H', change: pair.change_24h, txns: pair.txns_24h, volume: pair.volume_24h },
            ]
            const active = periods.find(p => p.key === statsPeriod) ?? periods[3]
            return (
              <div className="border border-border rounded-lg">
                {/* Period tabs */}
                <div className="flex border-b border-border">
                  {periods.map((p, i) => {
                    const n = Number(p.change)
                    const valid = Number.isFinite(n)
                    const pos = valid && n > 0
                    const neg = valid && n < 0
                    const selected = p.key === statsPeriod
                    return (
                      <button
                        key={p.key}
                        onClick={() => setStatsPeriod(p.key)}
                        className={clsx(
                          'flex-1 flex flex-col gap-1 items-center px-1 py-2 text-center transition-colors',
                          i < periods.length - 1 && 'border-r border-border',
                          selected && 'bg-muted',
                        )}
                      >
                        <span className="text-[12px] text-sub">{p.label}</span>
                        <span className={clsx('text-[14px] font-bold tabular', pos ? 'text-green' : neg ? 'text-red' : 'text-sub')}>
                          {valid ? `${pos ? '+' : ''}${n.toFixed(2)}%` : '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {/* Trading stats */}
                <div className="flex">
                  {/* Left: Txns / Volume / Makers */}
                  <div className="flex flex-col gap-3 p-2 w-[80px]">
                    <div className="flex flex-col gap-1 p-1">
                      <span className="text-[12px] text-sub">Txns</span>
                      <span className="text-[14px] font-bold tabular text-text">{fmtNum(active.txns)}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-1">
                      <span className="text-[12px] text-sub">Volume</span>
                      <span className="text-[14px] font-bold tabular text-text">{fmtUsd(active.volume)}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-1">
                      <span className="text-[12px] text-sub underline decoration-dotted">Makers</span>
                      <span className="text-[14px] font-bold tabular text-text">{fmtNum((pair as any)[`makers_${active.key}`] ?? 0)}</span>
                    </div>
                  </div>
                  {/* Divider */}
                  <div className="w-px bg-border self-stretch" />
                  {/* Right: Buy/Sell bars */}
                  {(() => {
                    const buys  = (pair as any)[`buys_${active.key}`] ?? 0
                    const sells = (pair as any)[`sells_${active.key}`] ?? 0
                    const totalTxns = buys + sells || 1
                    const buyPct  = Math.max(0.1, (buys / totalTxns) * 100)
                    const sellPct = Math.max(0.1, (sells / totalTxns) * 100)

                    // Estimate buy/sell volume from buys/sells ratio
                    const vol = active.volume ?? 0
                    const buyVol  = vol * (buys / totalTxns)
                    const sellVol = vol * (sells / totalTxns)
                    const buyVolPct  = vol > 0 ? Math.max(0.1, (buyVol / vol) * 100) : 50
                    const sellVolPct = vol > 0 ? Math.max(0.1, (sellVol / vol) * 100) : 50

                    // GT transactions provide buyers/sellers counts per window
                    const t = pair as any
                    const periodMap: Record<string, { buyers: number; sellers: number }> = {
                      '5m':  { buyers: t.buys_5m ?? 0,  sellers: t.sells_5m ?? 0 },
                      '1h':  { buyers: t.buys_1h ?? 0,  sellers: t.sells_1h ?? 0 },
                      '6h':  { buyers: t.buys_6h ?? 0,  sellers: t.sells_6h ?? 0 },
                      '24h': { buyers: t.buys_24h ?? 0, sellers: t.sells_24h ?? 0 },
                    }
                    const pm = periodMap[active.key] ?? { buyers: 0, sellers: 0 }
                    const totalMakers = pm.buyers + pm.sellers || 1
                    const buyerPct  = Math.max(0.1, (pm.buyers / totalMakers) * 100)
                    const sellerPct = Math.max(0.1, (pm.sellers / totalMakers) * 100)

                    return (
                      <div className="flex-1 flex flex-col gap-2 px-2 py-2">
                        <div className="flex flex-col gap-[5px]">
                          <div className="flex justify-between text-[12px] text-sub"><span>Buys</span><span>Sells</span></div>
                          <div className="flex justify-between text-[14px] text-text"><span>{fmtNum(buys)}</span><span>{fmtNum(sells)}</span></div>
                          <div className="flex h-1 gap-[2px]">
                            <div className="rounded-full bg-green" style={{ width: `${buyPct}%` }} />
                            <div className="rounded-full bg-red" style={{ width: `${sellPct}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[5px]">
                          <div className="flex justify-between text-[12px] text-sub"><span>Buy Vol</span><span>Sell Vol</span></div>
                          <div className="flex justify-between text-[14px] text-text"><span>{fmtUsd(buyVol)}</span><span>{fmtUsd(sellVol)}</span></div>
                          <div className="flex h-1 gap-[2px]">
                            <div className="rounded-full bg-green" style={{ width: `${buyVolPct}%` }} />
                            <div className="rounded-full bg-red" style={{ width: `${sellVolPct}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[5px]">
                          <div className="flex justify-between text-[12px] text-sub"><span>Buyers</span><span>Sellers</span></div>
                          <div className="flex justify-between text-[14px] text-text"><span>{fmtNum(pm.buyers)}</span><span>{fmtNum(pm.sellers)}</span></div>
                          <div className="flex h-1 gap-[2px]">
                            <div className="rounded-full bg-green" style={{ width: `${buyerPct}%` }} />
                            <div className="rounded-full bg-red" style={{ width: `${sellerPct}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )
          })()}

          {/* ── 7. Action Buttons ────────────────────────────────── */}
          <div className="flex gap-2">
            <PairWatchlistDropdown pairAddress={pair.address} />
            <button
              onClick={() => setAlertsOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 h-10 rounded bg-muted text-[13px] text-sub hover:text-text transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7.00148 2.91667C5.37398 2.91667 4.06556 4.16267 4.06556 5.83334V7.67667C4.06556 8.0185 4.01248 8.35917 3.90748 8.68409L3.69806 9.33334H10.2839L10.0721 8.67417C9.96937 8.35565 9.91702 8.02303 9.91698 7.68834V5.83334C9.91698 4.2175 8.61731 2.91667 7.00206 2.91667H7.00148ZM2.89889 5.83334C2.89889 3.49534 4.75389 1.75 7.00206 1.75C7.53842 1.74924 8.06967 1.85434 8.56533 2.0593C9.06099 2.26425 9.51132 2.56503 9.89051 2.94438C10.2697 3.32373 10.5703 3.77419 10.775 4.26994C10.9798 4.76569 11.0846 5.29697 11.0836 5.83334V7.68834C11.0836 7.90184 11.1169 8.11359 11.1828 8.316L11.6162 9.66175C11.6472 9.758 11.655 9.8602 11.639 9.96003C11.6229 10.0599 11.5836 10.1545 11.524 10.2362C11.4645 10.3179 11.3865 10.3844 11.2964 10.4302C11.2063 10.4761 11.1066 10.5 11.0055 10.5H2.97298C2.51273 10.5 2.24148 10.0503 2.36631 9.6635L2.79681 8.3265C2.86448 8.11709 2.89889 7.89775 2.89889 7.67609V5.83334ZM5.02106 11.2805C5.07176 11.223 5.13328 11.1761 5.20212 11.1424C5.27096 11.1087 5.34576 11.0889 5.42226 11.0842C5.49875 11.0794 5.57543 11.0897 5.64792 11.1146C5.72041 11.1395 5.78729 11.1784 5.84473 11.2292C6.15389 11.5022 6.55756 11.6667 7.00206 11.6667C7.44598 11.6667 7.85023 11.5022 8.15939 11.2292C8.27543 11.1268 8.42736 11.0748 8.58177 11.0845C8.73618 11.0941 8.88043 11.1648 8.98277 11.2808C9.08511 11.3968 9.13716 11.5488 9.12748 11.7032C9.1178 11.8576 9.04718 12.0018 8.93114 12.1042C8.39879 12.5747 7.71258 12.8341 7.00206 12.8333C6.29134 12.8343 5.6049 12.5749 5.07239 12.1042C5.01492 12.0535 4.96799 11.9919 4.9343 11.9231C4.90061 11.8543 4.88082 11.7795 4.87605 11.703C4.87128 11.6265 4.88164 11.5498 4.90652 11.4773C4.9314 11.4048 4.97032 11.3379 5.02106 11.2805Z" fill="currentColor"/></svg>
              Alerts
            </button>
          </div>

          {/* ── 8. Trade on Uniswap ──────────────────────────────── */}
          <a
            href={`https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=${base.address}`}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-center gap-2.5 rounded bg-muted text-[13px] text-sub hover:text-text transition-colors py-[10px]"
          >
            Trade on Uniswap
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 1h7v7M11 1L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>

          {/* ── 9. Pool Info ─────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-col">
              <div className="flex items-center justify-between px-2 py-3 border-b border-border">
                <span className="text-[12px] text-sub">Pair created</span>
                <span className="text-[14px] text-text">{pair.created_at ? `${fmtAge(pair.created_at)} ago` : '—'}</span>
              </div>
              {(() => {
                const liq = pair.liquidity_usd ?? 0
                const halfLiq = liq / 2
                const basePooled = price > 0 ? halfLiq / price : 0
                const quotePriceUsd = pair.quote_token_price_usd ?? 0
                const quotePooled = quotePriceUsd > 0 ? halfLiq / quotePriceUsd : 0
                return (
                  <>
                    <div className="flex items-center justify-between px-2 py-3 border-b border-border">
                      <span className="text-[12px] text-sub">Pooled {base.symbol}</span>
                      <span className="text-[14px] text-text">{basePooled > 0 ? `${fmtNum(basePooled)}   ${fmtUsd(halfLiq)}` : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-3 border-b border-border">
                      <span className="text-[12px] text-sub">Pooled {quote.symbol}</span>
                      <span className="text-[14px] text-text">{quotePooled > 0 ? `${fmtNum(quotePooled)}   ${fmtUsd(halfLiq)}` : '—'}</span>
                    </div>
                  </>
                )
              })()}
              <div className="flex items-center justify-between px-2 py-3 border-b border-border">
                <span className="text-[12px] text-sub">Pair</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[14px] text-text">{shortAddr(pair.address)}</span>
                    <CopyButton text={pair.address} />
                  </div>
                  <a href={`https://basescan.org/address/${pair.address}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[12px] text-sub hover:text-blue">
                    EXP <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 1h7v7M11 1L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </a>
                </div>
              </div>
              <div className="flex items-center justify-between px-2 py-3 border-b border-border">
                <span className="text-[12px] text-sub">{base.symbol}</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[14px] text-text">{shortAddr(base.address)}</span>
                    <CopyButton text={base.address} />
                  </div>
                  <a href={`https://basescan.org/token/${base.address}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[12px] text-sub hover:text-blue">
                    EXP <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 1h7v7M11 1L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </a>
                </div>
              </div>
              <div className="flex items-center justify-between px-2 py-3">
                <span className="text-[12px] text-sub">{quote.symbol}</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[14px] text-text">{shortAddr(quote.address)}</span>
                    <CopyButton text={quote.address} />
                  </div>
                  <a href={`https://basescan.org/token/${quote.address}`} target="_blank" rel="noopener" className="flex items-center gap-1 text-[12px] text-sub hover:text-blue">
                    EXP <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 1h7v7M11 1L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </a>
                </div>
              </div>
            </div>

            {/* Search buttons */}
            <div className="flex gap-2">
              <a href={`https://twitter.com/search?q=${base.symbol}`} target="_blank" rel="noopener"
                className="flex-1 flex items-center justify-center gap-1 border border-border rounded-lg py-1.5 text-[12px] text-sub hover:text-text transition-colors">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M8.3 6.1L12.7 1h-1L7.8 5.4 4.8 1H1l4.6 6.7L1 13h1l4-4.6 3.2 4.6H13L8.3 6.1zm-1.4 1.6l-.5-.7L2.8 1.9h1.6l3 4.3.5.7 3.8 5.4h-1.6L6.9 7.7z"/></svg>
                Search on Twitter
              </a>
              <button
                onClick={() => setOtherPairsOpen(true)}
                className="flex-1 flex items-center justify-center gap-1 border border-border rounded-lg py-1.5 text-[12px] text-sub hover:text-text transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="4"/><path d="M9 9l3 3"/></svg>
                Other pairs
              </button>
            </div>
          </div>

          {/* ── 10. Security Audits ──────────────────────────────── */}
          <div className="flex flex-col gap-6 items-center w-full">
            {(() => {
              const s = security
              // Build Go+ rows from real data
              const fmtTax = (v: string | undefined) => {
                if (!v || v === '') return { value: 'Unknown', status: 'neutral' as const }
                const n = parseFloat(v) * 100
                return { value: `${n.toFixed(1)}%`, status: n > 5 ? 'warn' as const : 'ok' as const }
              }
              const flag = (v: string | undefined, goodVal: string) => {
                if (!v || v === '') return { value: 'Unknown', status: 'neutral' as const }
                return v === goodVal
                  ? { value: goodVal === '0' ? 'No' : 'Yes', status: 'ok' as const }
                  : { value: goodVal === '0' ? 'Yes' : 'No', status: 'warn' as const }
              }
              const isRenounced = s
                ? (s.owner_address === '0x0000000000000000000000000000000000000000' || s.owner_address === '')
                : null

              const goPlusRows: { label: string; value: string; status: 'ok' | 'warn' | 'neutral' | 'link' }[] = s ? [
                { label: 'Sell tax', ...fmtTax(s.sell_tax) },
                { label: 'Buy tax', ...fmtTax(s.buy_tax) },
                { label: 'Tax modifiable', ...flag(s.slippage_modifiable, '0') },
                { label: 'External call', ...flag(s.external_call, '0') },
                { label: 'Ownership renounced', value: isRenounced ? 'Yes' : 'No', status: isRenounced ? 'ok' : 'warn' },
                { label: 'Hidden owner', ...flag(s.hidden_owner, '0') },
                { label: 'Open source', ...flag(s.is_open_source, '1') },
                { label: 'Honeypot', ...flag(s.is_honeypot, '0') },
                { label: 'Proxy contract', ...flag(s.is_proxy, '0') },
                { label: 'Mintable', ...flag(s.is_mintable, '0') },
                { label: 'Transfer pausable', ...flag(s.transfer_pausable, '0') },
                { label: 'Trading cooldown', ...flag(s.trading_cooldown, '0') },
                { label: "Can't sell all", ...flag(s.cannot_sell_all, '0') },
                { label: 'Owner can change balance', ...flag(s.owner_change_balance, '0') },
                { label: 'Has blacklist', ...flag(s.is_blacklisted, '0') },
                { label: 'Has whitelist', ...flag(s.is_whitelisted, '0') },
                { label: 'Is anti whale', ...flag(s.is_anti_whale, '0') },
                { label: 'LP Holder count', value: s.lp_holder_count || '—', status: 'neutral' },
                { label: 'Creator address', value: s.creator_address ? shortAddr(s.creator_address) : '—', status: s.creator_address ? 'link' : 'neutral' },
                { label: 'Creator balance', value: s.creator_balance ? `${parseFloat(s.creator_balance).toLocaleString()} (${(parseFloat(s.creator_percent || '0') * 100).toFixed(2)}%)` : '—', status: 'neutral' },
                { label: 'Owner address', value: s.owner_address ? shortAddr(s.owner_address) : '—', status: s.owner_address ? 'link' : 'neutral' },
                { label: 'Owner balance', value: s.owner_balance ? `${parseFloat(s.owner_balance).toLocaleString()} (${(parseFloat(s.owner_percent || '0') * 100).toFixed(2)}%)` : '—', status: 'neutral' },
              ] : []

              // Count issues for Go+ summary
              const goPlusIssues = goPlusRows.filter(r => r.status === 'warn').length
              const goPlusSummary = s ? (goPlusIssues === 0 ? 'No issues' : `${goPlusIssues} issue${goPlusIssues > 1 ? 's' : ''}`) : 'Loading...'
              const goPlusOk = s ? goPlusIssues === 0 : true

              const audits = [
                { name: 'Go+ Security', result: goPlusSummary, ok: goPlusOk, expandable: true, rows: goPlusRows },
                { name: 'Quick Intel',  result: 'N/A', ok: true, expandable: false, rows: [] },
                { name: 'Token Sniffer', result: 'N/A', ok: true, expandable: false, rows: [] },
                { name: 'Honeypot.is',  result: 'N/A', ok: true, expandable: false, rows: [] },
              ]

              return (
                <div className="flex flex-col gap-2 w-full">
                  <div className="border border-border rounded-lg">
                    {audits.map((item, i, arr) => {
                      const isOpen = expandedAudit === item.name
                      return (
                        <div key={item.name} className={clsx(i < arr.length - 1 && 'border-b border-border')}>
                          <div
                            className={clsx('flex items-center gap-2 px-2 py-3', item.expandable && 'cursor-pointer')}
                            onClick={() => item.expandable && setExpandedAudit(isOpen ? null : item.name)}
                          >
                            <div className="flex-1 flex items-center justify-between">
                              <span className="text-[12px] text-text font-medium">{item.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[14px] text-text">{item.result}</span>
                                {item.result !== 'N/A' && item.result !== 'Loading...' && (
                                  item.ok
                                    ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#2fe06b" strokeWidth="1.5"/><path d="M3.5 6l2 2 3-3" stroke="#2fe06b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ef5350" strokeWidth="1.5"/><path d="M4 4l4 4M8 4l-4 4" stroke="#ef5350" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                )}
                              </div>
                            </div>
                            {item.expandable ? (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={clsx('text-sub flex-shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}><path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.2"/></svg>
                            ) : (
                              <span className="text-[11px] text-sub flex-shrink-0">—</span>
                            )}
                          </div>
                          {item.expandable && isOpen && item.rows.length > 0 && (
                            <div className="border-t border-border">
                              {item.rows.map((row, ri) => (
                                <div key={row.label} className={clsx('flex items-center justify-between px-3 py-2.5', ri < item.rows.length - 1 && 'border-b border-border/50')}>
                                  <div className="flex items-center gap-1.5">
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-sub flex-shrink-0"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/><path d="M7 4v3M7 9v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                                    <span className="text-[13px] text-text">{row.label}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {row.status === 'link' && (
                                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-sub"><path d="M4 1h7v7M11 1L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    )}
                                    {row.status === 'ok' && (
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#2fe06b" strokeWidth="1.2"/><path d="M3.5 6l2 2 3-3" stroke="#2fe06b" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    )}
                                    {row.status === 'warn' && (
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-yellow-400"><path d="M6 1L1 11h10L6 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M6 5v3M6 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                                    )}
                                    <span className={clsx('text-[13px] font-mono tabular', row.status === 'ok' ? 'text-green' : row.status === 'warn' ? 'text-yellow-400' : 'text-text')}>{row.value}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[12px] text-sub text-center">
                    Warning! Audits may not be 100% accurate!{' '}
                    <button
                      onClick={() => setAuditDisclaimer(v => !v)}
                      className="text-sub underline hover:text-text transition-colors"
                    >
                      {auditDisclaimer ? 'Less' : 'More'}
                    </button>
                    {auditDisclaimer && (
                      <span className="block mt-1 text-sub">
                        Audit results may not be 100% accurate. They are provided for informational purposes only and should not be considered financial or investment advice. Dexpress does not verify or assume responsibility for the accuracy or completeness of data obtained from third-party auditors.
                      </span>
                    )}
                  </p>
                </div>
              )
            })()}

            {/* ── 11. Token About Card ──────────────────────────────── */}
            <div ref={projectInfoRef} className="flex flex-col gap-4 items-center">
              <div className="flex flex-col gap-[13px] items-center">
                <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={74} rounded="md" />
                <span className="text-[16px] text-text text-center">{base.name || base.symbol}</span>
                <div className="flex items-center justify-center gap-2">
                  <span className="flex items-center gap-1 bg-muted rounded px-2 py-1 text-[14px] text-text">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="7" cy="7" r="5"/><path d="M2 7h10M7 2c1.5 1.5 2 3.5 2 5s-.5 3.5-2 5M7 2c-1.5 1.5-2 3.5-2 5s.5 3.5 2 5"/></svg>
                    Website
                  </span>
                  <span className="flex items-center gap-1 bg-muted rounded px-2 py-1 text-[13px] text-text">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M12.4707 2.10583C12.2591 1.88667 11.9702 1.75896 11.6657 1.75C11.5093 1.7503 11.3545 1.78204 11.2107 1.84333L1.52732 6.0375C1.41312 6.08402 1.3166 6.16554 1.25162 6.27035C1.18664 6.37515 1.15655 6.49786 1.16566 6.62083V7C1.1594 7.12794 1.19542 7.25437 1.26816 7.3598C1.34091 7.46523 1.44633 7.54378 1.56816 7.58333L4.08232 8.42334L4.84066 10.9842C4.89163 11.1637 4.99005 11.3261 5.12555 11.4545C5.26105 11.5828 5.42863 11.6722 5.61066 11.7133C5.68039 11.7219 5.75092 11.7219 5.82066 11.7133C6.07939 11.7124 6.32788 11.6122 6.51483 11.4333L7.44233 10.5583L9.23899 11.9758C9.41147 12.1105 9.61835 12.1939 9.83599 12.2166C10.0536 12.2393 10.2733 12.2004 10.4698 12.1042L10.6623 12.005C10.8269 11.9204 10.9699 11.799 11.0801 11.6503C11.1904 11.5016 11.265 11.3296 11.2982 11.1475L12.8323 3.21417C12.8683 3.01393 12.8542 2.80788 12.791 2.61446C12.7279 2.42105 12.6178 2.24629 12.4707 2.10583ZM10.4407 11.0075C10.4311 11.0579 10.4105 11.1055 10.3802 11.1469C10.3499 11.1883 10.3108 11.2224 10.2657 11.2467L10.0732 11.3458C10.0352 11.3651 9.99323 11.3751 9.95066 11.375C9.88854 11.3738 9.82875 11.3512 9.78149 11.3108L7.58816 9.56083C7.53588 9.5145 7.46844 9.48891 7.39858 9.48891C7.32872 9.48891 7.26127 9.5145 7.20899 9.56083L5.91399 10.78C5.89019 10.7975 5.86181 10.8076 5.83233 10.8092V8.75C5.8324 8.70957 5.84072 8.66958 5.85676 8.63247C5.87281 8.59536 5.89625 8.56191 5.92566 8.53417C7.78649 6.78417 8.90066 5.80417 9.56566 5.24417C9.58682 5.22481 9.60391 5.20142 9.61593 5.17538C9.62794 5.14934 9.63465 5.12116 9.63566 5.0925C9.638 5.06446 9.63396 5.03625 9.62386 5.00999C9.61376 4.98372 9.59785 4.96008 9.57733 4.94083C9.54889 4.90512 9.5093 4.87996 9.46489 4.86939C9.42048 4.85882 9.37381 4.86343 9.33233 4.8825L4.92232 7.665C4.88315 7.68366 4.8403 7.69334 4.79691 7.69334C4.75351 7.69334 4.71067 7.68366 4.67149 7.665L2.04066 6.76667L11.5315 2.64833C11.566 2.64015 11.602 2.64015 11.6365 2.64833C11.6787 2.64944 11.7202 2.65935 11.7584 2.67743C11.7966 2.69551 11.8306 2.72136 11.8582 2.75333C11.898 2.79563 11.9272 2.84676 11.9434 2.90253C11.9596 2.9583 11.9624 3.01712 11.9515 3.07417L10.4407 11.0075Z" fill="currentColor"/></svg>
                    Telegram
                  </span>
                  <span className="flex items-center gap-1 bg-muted rounded px-2 py-1 text-[13px] text-text">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M8.3 6.1L12.7 1h-1L7.8 5.4 4.8 1H1l4.6 6.7L1 13h1l4-4.6 3.2 4.6H13L8.3 6.1zm-1.4 1.6l-.5-.7L2.8 1.9h1.6l3 4.3.5.7 3.8 5.4h-1.6L6.9 7.7z"/></svg>
                    Twitter
                  </span>
                </div>
              </div>
              <p className="text-[14px] text-sub text-center">This is a live and tradable layer one token blockdag contract address</p>
            </div>
          </div>

          {/* ── 12. Swap Widget ──────────────────────────────────── */}
          <div className="flex flex-col gap-3 items-center">
            <div className="border border-border rounded-lg flex items-center gap-2.5 p-4 w-full">
              <input
                type="text"
                defaultValue="1"
                className="flex-1 text-[14px] text-text bg-transparent outline-none min-w-0"
                placeholder="0"
              />
              <span className="text-[14px] text-sub flex-shrink-0">${base.symbol}</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-sub"><path d="M7 3v8M4 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <div className="border border-border rounded-lg flex items-center gap-2.5 p-4 w-full">
              <input
                type="text"
                defaultValue="0.09281"
                className="flex-1 text-[14px] text-text bg-transparent outline-none min-w-0"
                placeholder="0"
              />
              <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0">
                <button
                  onClick={() => setSwapUnit('USD')}
                  className={clsx('px-2 py-[7px] text-[14px] flex items-center gap-1.5 transition-colors', swapUnit === 'USD' ? 'bg-muted text-text' : 'bg-muted/50 text-sub')}
                >
                  {swapUnit === 'USD' && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  USD
                </button>
                <button
                  onClick={() => setSwapUnit('USDC')}
                  className={clsx('px-2 py-[7px] text-[14px] flex items-center gap-1.5 transition-colors', swapUnit === 'USDC' ? 'bg-border text-text' : 'bg-border/50 text-sub')}
                >
                  {swapUnit === 'USDC' && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  USDC
                </button>
              </div>
            </div>
            <button className="border border-border rounded-lg flex items-center justify-center gap-3 p-2 w-full text-[14px] text-text hover:bg-muted transition-colors">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 4h10M2 7h7M2 10h4"/></svg>
              Embed this chart
            </button>
            <span className="text-[12px] text-sub">Crypto charts by TradingView</span>
          </div>

        </div>
      </div>

      <OtherPairsModal
        open={otherPairsOpen}
        onClose={() => setOtherPairsOpen(false)}
        currentAddress={address}
        tokenAddress={base.address}
      />

      {/* ── Price Alerts Modal ───────────────────────────────── */}
      {alertsOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setAlertsOpen(false) }}
        >
          <div className="w-full max-w-[560px] mx-4 rounded-xl border border-border bg-[#111] shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-[16px] font-bold text-text">Manage Price Alerts</h2>
              <button
                onClick={() => setAlertsOpen(false)}
                className="flex items-center justify-center w-[28px] h-[28px] rounded-md text-sub hover:text-text hover:bg-border/40 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-8">
              {!alertsNotifEnabled ? (
                /* State 1: Enable notifications */
                <div className="flex flex-col items-center gap-6">
                  <p className="text-[14px] text-text text-center">
                    To set price alerts please enable <span className="underline cursor-pointer text-blue">browser notifications</span> for Dex Express first:
                  </p>
                  <button
                    onClick={() => setAlertsNotifEnabled(true)}
                    className="flex items-center gap-2.5 rounded-lg px-8 py-3 text-[14px] font-medium text-white bg-blue hover:bg-blue/90 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M7.00148 2.91667C5.37398 2.91667 4.06556 4.16267 4.06556 5.83334V7.67667C4.06556 8.0185 4.01248 8.35917 3.90748 8.68409L3.69806 9.33334H10.2839L10.0721 8.67417C9.96937 8.35565 9.91702 8.02303 9.91698 7.68834V5.83334C9.91698 4.2175 8.61731 2.91667 7.00206 2.91667H7.00148ZM2.89889 5.83334C2.89889 3.49534 4.75389 1.75 7.00206 1.75C7.53842 1.74924 8.06967 1.85434 8.56533 2.0593C9.06099 2.26425 9.51132 2.56503 9.89051 2.94438C10.2697 3.32373 10.5703 3.77419 10.775 4.26994C10.9798 4.76569 11.0846 5.29697 11.0836 5.83334V7.68834C11.0836 7.90184 11.1169 8.11359 11.1828 8.316L11.6162 9.66175C11.6472 9.758 11.655 9.8602 11.639 9.96003C11.6229 10.0599 11.5836 10.1545 11.524 10.2362C11.4645 10.3179 11.3865 10.3844 11.2964 10.4302C11.2063 10.4761 11.1066 10.5 11.0055 10.5H2.97298C2.51273 10.5 2.24148 10.0503 2.36631 9.6635L2.79681 8.3265C2.86448 8.11709 2.89889 7.89775 2.89889 7.67609V5.83334ZM5.02106 11.2805C5.07176 11.223 5.13328 11.1761 5.20212 11.1424C5.27096 11.1087 5.34576 11.0889 5.42226 11.0842C5.49875 11.0794 5.57543 11.0897 5.64792 11.1146C5.72041 11.1395 5.78729 11.1784 5.84473 11.2292C6.15389 11.5022 6.55756 11.6667 7.00206 11.6667C7.44598 11.6667 7.85023 11.5022 8.15939 11.2292C8.27543 11.1268 8.42736 11.0748 8.58177 11.0845C8.73618 11.0941 8.88043 11.1648 8.98277 11.2808C9.08511 11.3968 9.13716 11.5488 9.12748 11.7032C9.1178 11.8576 9.04718 12.0018 8.93114 12.1042C8.39879 12.5747 7.71258 12.8341 7.00206 12.8333C6.29134 12.8343 5.6049 12.5749 5.07239 12.1042C5.01492 12.0535 4.96799 11.9919 4.9343 11.9231C4.90061 11.8543 4.88082 11.7795 4.87605 11.703C4.87128 11.6265 4.88164 11.5498 4.90652 11.4773C4.9314 11.4048 4.97032 11.3379 5.02106 11.2805Z" fill="currentColor"/></svg>
                    Enable Notifications
                  </button>
                </div>
              ) : (
                /* State 2: Create alert form + alerts list */
                <div className="flex flex-col gap-5">
                  {/* Row 1: Alert me when + Price in USD */}
                  <div className="flex items-center gap-3">
                    <span className="text-[14px] text-text flex-shrink-0">Alert me when</span>
                    <div className="relative">
                      <select className="appearance-none bg-transparent border border-border rounded-lg px-4 py-2.5 pr-8 text-[13px] text-text cursor-pointer outline-none focus:border-blue transition-colors">
                        <option>Price in USD</option>
                        <option>Price in ETH</option>
                      </select>
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-sub"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.2"/></svg>
                    </div>
                  </div>

                  {/* Row 2: Goes over + $ input + Create Alert */}
                  <div className="flex items-center gap-3">
                    <div className="relative flex-shrink-0">
                      <select
                        value={alertCondition}
                        onChange={(e) => setAlertCondition(e.target.value as 'goes over' | 'goes under')}
                        className="appearance-none bg-transparent border border-border rounded-lg px-4 py-2.5 pr-8 text-[13px] text-text cursor-pointer outline-none w-[160px] focus:border-blue transition-colors"
                      >
                        <option value="goes over">Goes over</option>
                        <option value="goes under">Goes under</option>
                      </select>
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-sub"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.2"/></svg>
                    </div>
                    <div className="flex-1 flex items-center border border-border rounded-lg overflow-hidden focus-within:border-blue transition-colors">
                      <span className="px-3 py-2.5 text-[13px] text-sub border-r border-border">$</span>
                      <input
                        type="text"
                        value={alertPriceInput}
                        onChange={(e) => setAlertPriceInput(e.target.value)}
                        placeholder="0"
                        className="flex-1 px-3 py-2.5 text-[13px] text-text bg-transparent outline-none min-w-0"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (!alertPriceInput.trim()) return
                        setAlerts(prev => [...prev, { id: crypto.randomUUID(), condition: alertCondition, price: alertPriceInput.trim(), createdAt: Date.now() }])
                        setAlertPriceInput('')
                      }}
                      className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-medium text-white bg-blue hover:bg-blue/90 flex-shrink-0 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/><path d="M7 4v6M4 7h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                      Create Alert
                    </button>
                  </div>

                  {/* Row 3: Note */}
                  <div className="flex items-center border border-border rounded-lg px-3 py-2.5 gap-2.5 focus-within:border-blue transition-colors">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-sub flex-shrink-0"><rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h4M5 7h4M5 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    <input
                      type="text"
                      placeholder="Add a note to your alert (optional)"
                      className="flex-1 text-[13px] text-text bg-transparent outline-none placeholder:text-sub/50"
                    />
                  </div>

                  {/* Created alerts list */}
                  {alerts.length > 0 && (
                    <div className="flex flex-col gap-3 mt-1">
                      {alerts.map(a => {
                        const isEditing = editingAlertId === a.id
                        const ago = Math.floor((Date.now() - a.createdAt) / 60000)
                        const agoText = ago < 1 ? 'less than a minute ago' : ago < 60 ? `${ago} minute${ago > 1 ? 's' : ''} ago` : `${Math.floor(ago / 60)} hour${Math.floor(ago / 60) > 1 ? 's' : ''} ago`

                        if (isEditing) {
                          return (
                            <div key={a.id} className="border border-border rounded-lg px-4 py-4 flex flex-col gap-4">
                              {/* ACTIVE header */}
                              <div className="flex items-center gap-1.5">
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7.00148 2.91667C5.37398 2.91667 4.06556 4.16267 4.06556 5.83334V7.67667C4.06556 8.0185 4.01248 8.35917 3.90748 8.68409L3.69806 9.33334H10.2839L10.0721 8.67417C9.96937 8.35565 9.91702 8.02303 9.91698 7.68834V5.83334C9.91698 4.2175 8.61731 2.91667 7.00206 2.91667H7.00148ZM2.89889 5.83334C2.89889 3.49534 4.75389 1.75 7.00206 1.75C7.53842 1.74924 8.06967 1.85434 8.56533 2.0593C9.06099 2.26425 9.51132 2.56503 9.89051 2.94438C10.2697 3.32373 10.5703 3.77419 10.775 4.26994C10.9798 4.76569 11.0846 5.29697 11.0836 5.83334V7.68834C11.0836 7.90184 11.1169 8.11359 11.1828 8.316L11.6162 9.66175C11.6472 9.758 11.655 9.8602 11.639 9.96003C11.6229 10.0599 11.5836 10.1545 11.524 10.2362C11.4645 10.3179 11.3865 10.3844 11.2964 10.4302C11.2063 10.4761 11.1066 10.5 11.0055 10.5H2.97298C2.51273 10.5 2.24148 10.0503 2.36631 9.6635L2.79681 8.3265C2.86448 8.11709 2.89889 7.89775 2.89889 7.67609V5.83334ZM5.02106 11.2805C5.07176 11.223 5.13328 11.1761 5.20212 11.1424C5.27096 11.1087 5.34576 11.0889 5.42226 11.0842C5.49875 11.0794 5.57543 11.0897 5.64792 11.1146C5.72041 11.1395 5.78729 11.1784 5.84473 11.2292C6.15389 11.5022 6.55756 11.6667 7.00206 11.6667C7.44598 11.6667 7.85023 11.5022 8.15939 11.2292C8.27543 11.1268 8.42736 11.0748 8.58177 11.0845C8.73618 11.0941 8.88043 11.1648 8.98277 11.2808C9.08511 11.3968 9.13716 11.5488 9.12748 11.7032C9.1178 11.8576 9.04718 12.0018 8.93114 12.1042C8.39879 12.5747 7.71258 12.8341 7.00206 12.8333C6.29134 12.8343 5.6049 12.5749 5.07239 12.1042C5.01492 12.0535 4.96799 11.9919 4.9343 11.9231C4.90061 11.8543 4.88082 11.7795 4.87605 11.703C4.87128 11.6265 4.88164 11.5498 4.90652 11.4773C4.9314 11.4048 4.97032 11.3379 5.02106 11.2805Z" fill="#2fe06b"/></svg>
                                <span className="text-[13px] font-semibold text-green uppercase tracking-wide">Active</span>
                              </div>

                              {/* Alert me when + Price in USD */}
                              <div className="flex items-center gap-3">
                                <span className="text-[14px] text-text flex-shrink-0">Alert me when</span>
                                <div className="relative">
                                  <select className="appearance-none bg-transparent border border-border rounded-lg px-4 py-2.5 pr-8 text-[13px] text-text cursor-pointer outline-none focus:border-blue transition-colors">
                                    <option>Price in USD</option>
                                    <option>Price in ETH</option>
                                  </select>
                                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-sub"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.2"/></svg>
                                </div>
                              </div>

                              {/* Goes over + $ input */}
                              <div className="flex items-center gap-3">
                                <div className="relative flex-shrink-0">
                                  <select
                                    value={editAlertCondition}
                                    onChange={(e) => setEditAlertCondition(e.target.value as 'goes over' | 'goes under')}
                                    className="appearance-none bg-transparent border border-border rounded-lg px-4 py-2.5 pr-8 text-[13px] text-text cursor-pointer outline-none w-[160px] focus:border-blue transition-colors"
                                  >
                                    <option value="goes over">Goes over</option>
                                    <option value="goes under">Goes under</option>
                                  </select>
                                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-sub"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.2"/></svg>
                                </div>
                                <div className="flex-1 flex items-center border border-border rounded-lg overflow-hidden focus-within:border-blue transition-colors">
                                  <span className="px-3 py-2.5 text-[13px] text-sub border-r border-border">$</span>
                                  <input
                                    type="text"
                                    value={editAlertPrice}
                                    onChange={(e) => setEditAlertPrice(e.target.value)}
                                    className="flex-1 px-3 py-2.5 text-[13px] text-text bg-transparent outline-none min-w-0"
                                  />
                                </div>
                              </div>

                              {/* Note */}
                              <div className="flex items-center border border-border rounded-lg px-3 py-2.5 gap-2.5 focus-within:border-blue transition-colors">
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-sub flex-shrink-0"><rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2"/><path d="M5 5h4M5 7h4M5 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                                <input
                                  type="text"
                                  placeholder="Add a note to your alert (optional)"
                                  className="flex-1 text-[13px] text-text bg-transparent outline-none placeholder:text-sub/50"
                                />
                              </div>

                              {/* Save / Cancel */}
                              <div className="flex items-center justify-end gap-3">
                                <button
                                  onClick={() => {
                                    if (editAlertPrice.trim()) {
                                      setAlerts(prev => prev.map(x => x.id === a.id ? { ...x, condition: editAlertCondition, price: editAlertPrice.trim() } : x))
                                    }
                                    setEditingAlertId(null)
                                  }}
                                  className="flex items-center gap-1.5 rounded-lg px-5 py-2 text-[13px] font-medium text-white bg-blue hover:bg-blue/90 transition-colors"
                                >
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingAlertId(null)}
                                  className="flex items-center gap-1.5 text-[13px] font-medium text-sub hover:text-text transition-colors"
                                >
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div key={a.id} className="border border-border rounded-lg px-4 py-3">
                            <div className="flex items-start justify-between">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7.00148 2.91667C5.37398 2.91667 4.06556 4.16267 4.06556 5.83334V7.67667C4.06556 8.0185 4.01248 8.35917 3.90748 8.68409L3.69806 9.33334H10.2839L10.0721 8.67417C9.96937 8.35565 9.91702 8.02303 9.91698 7.68834V5.83334C9.91698 4.2175 8.61731 2.91667 7.00206 2.91667H7.00148ZM2.89889 5.83334C2.89889 3.49534 4.75389 1.75 7.00206 1.75C7.53842 1.74924 8.06967 1.85434 8.56533 2.0593C9.06099 2.26425 9.51132 2.56503 9.89051 2.94438C10.2697 3.32373 10.5703 3.77419 10.775 4.26994C10.9798 4.76569 11.0846 5.29697 11.0836 5.83334V7.68834C11.0836 7.90184 11.1169 8.11359 11.1828 8.316L11.6162 9.66175C11.6472 9.758 11.655 9.8602 11.639 9.96003C11.6229 10.0599 11.5836 10.1545 11.524 10.2362C11.4645 10.3179 11.3865 10.3844 11.2964 10.4302C11.2063 10.4761 11.1066 10.5 11.0055 10.5H2.97298C2.51273 10.5 2.24148 10.0503 2.36631 9.6635L2.79681 8.3265C2.86448 8.11709 2.89889 7.89775 2.89889 7.67609V5.83334ZM5.02106 11.2805C5.07176 11.223 5.13328 11.1761 5.20212 11.1424C5.27096 11.1087 5.34576 11.0889 5.42226 11.0842C5.49875 11.0794 5.57543 11.0897 5.64792 11.1146C5.72041 11.1395 5.78729 11.1784 5.84473 11.2292C6.15389 11.5022 6.55756 11.6667 7.00206 11.6667C7.44598 11.6667 7.85023 11.5022 8.15939 11.2292C8.27543 11.1268 8.42736 11.0748 8.58177 11.0845C8.73618 11.0941 8.88043 11.1648 8.98277 11.2808C9.08511 11.3968 9.13716 11.5488 9.12748 11.7032C9.1178 11.8576 9.04718 12.0018 8.93114 12.1042C8.39879 12.5747 7.71258 12.8341 7.00206 12.8333C6.29134 12.8343 5.6049 12.5749 5.07239 12.1042C5.01492 12.0535 4.96799 11.9919 4.9343 11.9231C4.90061 11.8543 4.88082 11.7795 4.87605 11.703C4.87128 11.6265 4.88164 11.5498 4.90652 11.4773C4.9314 11.4048 4.97032 11.3379 5.02106 11.2805Z" fill="#2fe06b"/></svg>
                                  <span className="text-[13px] font-semibold text-green uppercase tracking-wide">Active</span>
                                </div>
                                <p className="text-[14px] text-text">
                                  Alert me when price <span className="text-green font-semibold">{a.condition} ${a.price}</span>
                                </p>
                                <span className="text-[12px] text-sub">Created {agoText}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-4 pt-1">
                                <button
                                  onClick={() => { setEditingAlertId(a.id); setEditAlertCondition(a.condition as 'goes over' | 'goes under'); setEditAlertPrice(a.price) }}
                                  className="flex items-center justify-center w-[28px] h-[28px] rounded-md text-sub hover:text-text hover:bg-border/40 transition-colors"
                                >
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9.5 1.5l3 3L5 12H2v-3L9.5 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                                </button>
                                <button
                                  onClick={() => setAlerts(prev => prev.filter(x => x.id !== a.id))}
                                  className="flex items-center justify-center w-[28px] h-[28px] rounded-md text-sub hover:text-red hover:bg-red/10 transition-colors"
                                >
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 4h9M5 4V2.5a1 1 0 011-1h2a1 1 0 011 1V4M6 6.5v3M8 6.5v3M3.5 4l.5 7.5a1 1 0 001 1h4a1 1 0 001-1L10.5 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
