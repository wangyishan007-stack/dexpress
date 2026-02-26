'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import type { Pool } from '@dex/shared'
import { fmtPrice, fmtUsd, fmtAge, fmtNum, fmtPct, shortAddr } from '../../../lib/formatters'
import { usePairWebSocket } from '../../../hooks/useWebSocket'
import clsx from 'clsx'

type LWC = typeof import('lightweight-charts')
type Resolution = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
const RESOLUTIONS: Resolution[] = ['1m', '5m', '15m', '1h', '4h', '1d']

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

type PairDetail = Pool & { recent_swaps: RecentSwap[] }

interface Props { address: string }

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

const fetcher = (url: string) =>
  fetch(BASE_URL + url).then(r => { if (!r.ok) throw new Error('API error'); return r.json() })

async function loadCandlesIntoChart(address: string, resolution: string, series: any, chart: any) {
  const to   = Math.floor(Date.now() / 1000)
  const from = to - 60 * 60 * 24 * 7
  try {
    const data = await fetch(
      `${BASE_URL}/api/pairs/${address}/candles?resolution=${resolution}&from=${from}&to=${to}`
    ).then(r => r.json())
    if (Array.isArray(data) && data.length > 0) {
      series.setData(data)
      chart.timeScale().fitContent()
    }
  } catch (e) {
    console.error('[Chart] candle load failed:', e)
  }
}

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
        : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="1" width="7" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M7 4H3a1 1 0 00-1 1v6h6V5a1 1 0 00-1-1z" stroke="currentColor" strokeWidth="1.2"/></svg>
      }
    </button>
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
  const { data: pair, error, isLoading } = useSWR<PairDetail>(
    `/api/pairs/${address}`,
    fetcher,
    { refreshInterval: 10_000 }
  )

  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [flash,     setFlash]     = useState<'up' | 'down' | null>(null)
  const [resolution, setResolution] = useState<Resolution>('5m')

  // Swaps
  const [swaps,       setSwaps]       = useState<RecentSwap[]>([])
  const [swapCursor,  setSwapCursor]  = useState<string | null>(null)
  const [swapHasMore, setSwapHasMore] = useState(true)
  const [swapLoading, setSwapLoading] = useState(false)
  const seededRef = useRef('')

  useEffect(() => {
    if (pair && address !== seededRef.current) {
      seededRef.current = address
      const initial = pair.recent_swaps ?? []
      setSwaps(initial)
      setSwapCursor(initial.at(-1)?.timestamp ?? null)
      setSwapHasMore(initial.length >= 50)
    }
  }, [pair, address])

  // Chart
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef          = useRef<any>(null)
  const seriesRef         = useRef<any>(null)
  const resolutionRef     = useRef(resolution)
  useEffect(() => { resolutionRef.current = resolution }, [resolution])

  useEffect(() => {
    let cleanup: (() => void) | undefined
    import('lightweight-charts').then((lwc) => {
      if (!chartContainerRef.current) return
      const chart = lwc.createChart(chartContainerRef.current, {
        width:  chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight || 380,
        layout: { background: { color: '#0a0a0a' }, textColor: '#666' },
        grid:   { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
        crosshair:       { mode: lwc.CrosshairMode.Normal },
        rightPriceScale: { borderColor: '#222' },
        timeScale:       { borderColor: '#222', timeVisible: true },
      })
      const series = chart.addCandlestickSeries({
        upColor:        '#00d97e', downColor:       '#ff3b5c',
        borderUpColor:  '#00d97e', borderDownColor: '#ff3b5c',
        wickUpColor:    '#00d97e', wickDownColor:   '#ff3b5c',
      })
      chartRef.current  = chart
      seriesRef.current = series
      loadCandlesIntoChart(address, resolutionRef.current, series, chart)
      const ro = new ResizeObserver(() => {
        if (!chartContainerRef.current) return
        chart.resize(chartContainerRef.current.clientWidth, chartContainerRef.current.clientHeight || 380)
      })
      ro.observe(chartContainerRef.current)
      cleanup = () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null }
    })
    return () => cleanup?.()
  }, [address])

  useEffect(() => {
    if (seriesRef.current && chartRef.current) {
      loadCandlesIntoChart(address, resolution, seriesRef.current, chartRef.current)
    }
  }, [resolution, address])

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

  const loadMoreSwaps = useCallback(async () => {
    if (swapLoading || !swapHasMore) return
    setSwapLoading(true)
    try {
      const qs   = swapCursor ? `?limit=50&before=${encodeURIComponent(swapCursor)}` : '?limit=50'
      const data: RecentSwap[] = await fetch(`${BASE_URL}/api/pairs/${address}/swaps${qs}`).then(r => r.json())
      setSwaps(s => [...s, ...data])
      setSwapCursor(data.at(-1)?.timestamp ?? null)
      setSwapHasMore(data.length >= 50)
    } finally {
      setSwapLoading(false)
    }
  }, [address, swapCursor, swapHasMore, swapLoading])

  /* ── Loading / error ─────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-2 text-sub text-sm">
        <Spinner /> Loading pair…
      </div>
    )
  }
  if (error || !pair) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <p className="text-sub text-sm">Failed to load pair data.</p>
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
    <div className="flex flex-col h-full bg-bg overflow-hidden">

      {/* ── Two-column layout ─────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 gap-5 p-5">

        {/* ── LEFT COLUMN: Chart + Transactions ───────────────── */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 gap-5">

        {/* ── Chart Card ──────────────────────────────────────── */}
        <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">

          {/* Chart header: token identity + live price */}
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border flex-shrink-0">

            {/* Left: name + meta */}
            <div className="min-w-0">
              {/* Token pair + DEX badge + age + fee */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <h1 className="text-[18px] font-bold text-text leading-none">
                  {base.symbol}
                  <span className="text-sub font-normal text-[15px]"> / {quote.symbol}</span>
                </h1>
                {/* DEX badge */}
                <span className="inline-flex items-center rounded-md bg-blue/10 border border-blue/20 px-2 py-0.5 text-[11px] font-semibold text-blue">
                  {dexLabel}
                </span>
                {/* Fee */}
                {feeLabel && (
                  <span className="inline-flex items-center rounded-md bg-border/60 px-2 py-0.5 text-[11px] text-sub">
                    {feeLabel} fee
                  </span>
                )}
                {/* Age */}
                <span className="text-[12px] text-sub">
                  {pair.created_at ? `${fmtAge(pair.created_at)} old` : '—'}
                </span>
              </div>
              {/* Addresses */}
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase text-sub/50 font-medium tracking-wide">Base</span>
                  <span className="font-mono text-[12px] text-sub">{shortAddr(base.address)}</span>
                  <CopyButton text={base.address} />
                  <a href={`https://basescan.org/token/${base.address}`} target="_blank" rel="noopener"
                    className="text-sub hover:text-blue text-[11px]">↗</a>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase text-sub/50 font-medium tracking-wide">Quote</span>
                  <span className="font-mono text-[12px] text-sub">{shortAddr(quote.address)}</span>
                  <CopyButton text={quote.address} />
                  <a href={`https://basescan.org/token/${quote.address}`} target="_blank" rel="noopener"
                    className="text-sub hover:text-blue text-[11px]">↗</a>
                </div>
              </div>
            </div>

            {/* Right: live price */}
            <div className="text-right flex-shrink-0">
              <div className={clsx(
                'font-mono text-[26px] font-bold tabular leading-none transition-colors',
                flash === 'up'   ? 'text-green' :
                flash === 'down' ? 'text-red'   : 'text-text'
              )}>
                {fmtPrice(price)}
              </div>
              <div className="mt-1.5 flex items-center justify-end gap-1.5">
                <span className={clsx(
                  'text-[13px] font-semibold tabular',
                  change24h > 0 ? 'text-green' : change24h < 0 ? 'text-red' : 'text-sub'
                )}>
                  {Number.isFinite(change24h) ? `${change24h > 0 ? '+' : ''}${change24h.toFixed(2)}%` : '—'}
                </span>
                <span className="text-[11px] text-sub">24H</span>
              </div>
            </div>
          </div>

          {/* Resolution tabs */}
          <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border flex-shrink-0 bg-black/20">
            {RESOLUTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setResolution(r)}
                className={clsx(
                  'px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors',
                  resolution === r
                    ? 'bg-green/15 text-green'
                    : 'text-sub hover:text-text hover:bg-border/50'
                )}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Chart canvas */}
          <div ref={chartContainerRef} className="flex-1 w-full min-h-0" style={{ minHeight: 300 }} />
        </Card>

        {/* ── Transactions (left column, below chart) ─────────── */}
        <Card className="flex-shrink-0 overflow-hidden" style={{ maxHeight: 300 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-black/20 flex-shrink-0">
            <span className="text-[13px] font-semibold text-text">Transactions</span>
            <span className="text-[12px] text-sub">{swaps.length} shown</span>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: 248 }}>
            {/* Column header */}
            <div className="grid grid-cols-[96px_56px_1fr_1fr_1fr_96px] gap-x-3 px-5 py-2 text-[11px] text-header border-b border-border sticky top-0 bg-surface z-10">
              <span>Time</span>
              <span>Type</span>
              <span className="text-right">USD</span>
              <span className="text-right">Token</span>
              <span className="text-right">Price</span>
              <span className="text-right">Wallet</span>
            </div>

            {swaps.length === 0 && (
              <div className="flex items-center justify-center py-8 text-sub text-[13px]">
                No transactions yet.
              </div>
            )}

            {swaps.map((s) => (
              <div
                key={s.id}
                className={clsx(
                  'grid grid-cols-[96px_56px_1fr_1fr_1fr_96px] gap-x-3 px-5 py-2 text-[12px] border-b border-muted',
                  s.is_buy ? 'hover:bg-green/5' : 'hover:bg-red/5'
                )}
              >
                <span className="text-sub tabular">
                  {new Date(s.timestamp).toLocaleTimeString()}
                </span>
                <span className={clsx('font-semibold', s.is_buy ? 'text-green' : 'text-red')}>
                  {s.is_buy ? 'BUY' : 'SELL'}
                </span>
                <span className={clsx('tabular text-right font-mono', s.is_buy ? 'text-green' : 'text-red')}>
                  {fmtUsd(s.amount_usd)}
                </span>
                <span className="tabular text-right text-text">
                  {Math.abs(Number(s.is_buy ? s.amount0 : s.amount1)).toFixed(4)}
                </span>
                <span className="tabular text-right text-sub font-mono">
                  {fmtPrice(s.price_usd)}
                </span>
                <a
                  href={`https://basescan.org/tx/${s.tx_hash}`}
                  target="_blank"
                  rel="noopener"
                  className="font-mono text-right text-sub hover:text-blue truncate"
                >
                  {shortAddr(s.sender ?? '')}
                </a>
              </div>
            ))}

            {swapHasMore && (
              <div className="flex justify-center py-3">
                <button
                  onClick={loadMoreSwaps}
                  disabled={swapLoading}
                  className="flex items-center gap-1.5 text-[12px] text-sub hover:text-text transition-colors disabled:opacity-50"
                >
                  {swapLoading && <Spinner size={3} />}
                  {swapLoading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        </Card>

        </div>{/* end LEFT COLUMN */}

        {/* ── RIGHT COLUMN ────────────────────────────────────── */}
        <div className="w-[340px] flex-shrink-0 flex flex-col gap-0 overflow-y-auto border border-border rounded-xl bg-surface">

          {/* ── 1. Token Header ──────────────────────────────────── */}
          <div className="flex items-start gap-3 px-4 py-4 border-b border-border">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-text truncate">{base.name || base.symbol}</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[13px] text-sub">${base.symbol}</span>
                <span className="text-[13px] text-sub">/</span>
                <span className="text-[13px] text-sub">{quote.symbol}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="inline-flex items-center rounded bg-blue/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue">Base</span>
                <span className="inline-flex items-center rounded bg-blue/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue">{dexLabel}</span>
                {feeLabel && <span className="text-[10px] text-sub">{feeLabel}</span>}
              </div>
            </div>
          </div>

          {/* ── 2. Social Links (placeholder) ────────────────────── */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
            <button className="flex-1 flex items-center justify-center gap-1 rounded-md bg-border/40 py-1.5 text-[11px] text-sub hover:text-text transition-colors">Website</button>
            <button className="flex-1 flex items-center justify-center gap-1 rounded-md bg-border/40 py-1.5 text-[11px] text-sub hover:text-text transition-colors">Twitter</button>
            <button className="flex-1 flex items-center justify-center gap-1 rounded-md bg-border/40 py-1.5 text-[11px] text-sub hover:text-text transition-colors">Telegram</button>
          </div>

          {/* ── 3. Price USD / Price ETH ─────────────────────────── */}
          <div className="grid grid-cols-2 border-b border-border">
            <div className="px-4 py-3 border-r border-border">
              <div className="text-[10px] text-sub mb-1">Price USD</div>
              <div className={clsx('text-[14px] font-bold tabular', flash === 'up' ? 'text-green' : flash === 'down' ? 'text-red' : 'text-text')}>
                {fmtPrice(price)}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] text-sub mb-1">Price</div>
              <div className="text-[14px] font-bold tabular text-text">—</div>
            </div>
          </div>

          {/* ── 4. Liquidity / FDV / Market Cap ──────────────────── */}
          <div className="grid grid-cols-3 border-b border-border">
            <div className="px-4 py-3 border-r border-border">
              <div className="text-[10px] text-sub mb-1">Liquidity</div>
              <div className="text-[13px] font-bold tabular text-text">{fmtUsd(pair.liquidity_usd)}</div>
            </div>
            <div className="px-4 py-3 border-r border-border">
              <div className="text-[10px] text-sub mb-1">FDV</div>
              <div className="text-[13px] font-bold tabular text-text">{Number(pair.mcap_usd) > 0 ? fmtUsd(pair.mcap_usd) : '—'}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] text-sub mb-1">Market Cap</div>
              <div className="text-[13px] font-bold tabular text-text">{Number(pair.mcap_usd) > 0 ? fmtUsd(pair.mcap_usd) : '—'}</div>
            </div>
          </div>

          {/* ── 5. Top 10 / DEV / Holders / Snipers ──────────────── */}
          <div className="grid grid-cols-4 border-b border-border">
            <div className="px-3 py-3 border-r border-border">
              <div className="text-[10px] text-sub mb-1">Top 10</div>
              <div className="text-[12px] text-sub">—</div>
            </div>
            <div className="px-3 py-3 border-r border-border">
              <div className="text-[10px] text-sub mb-1">DEV</div>
              <div className="text-[12px] text-sub">—</div>
            </div>
            <div className="px-3 py-3 border-r border-border">
              <div className="text-[10px] text-sub mb-1">Holders</div>
              <div className="text-[12px] font-semibold text-text">{pair.holder_count ? fmtNum(pair.holder_count) : '—'}</div>
            </div>
            <div className="px-3 py-3">
              <div className="text-[10px] text-sub mb-1">Snipers</div>
              <div className="text-[12px] text-sub">—</div>
            </div>
          </div>

          {/* ── 6. Insiders / Phishing / Dex Paid / NoHoneypot ───── */}
          <div className="grid grid-cols-4 border-b border-border">
            <div className="px-3 py-3 border-r border-border">
              <div className="text-[10px] text-sub mb-1">Insiders</div>
              <div className="text-[12px] text-sub">—</div>
            </div>
            <div className="px-3 py-3 border-r border-border">
              <div className="text-[10px] text-sub mb-1">Phishing</div>
              <div className="text-[12px] text-sub">—</div>
            </div>
            <div className="px-3 py-3 border-r border-border">
              <div className="text-[10px] text-sub mb-1">Dex Paid</div>
              <div className="text-[12px] text-sub">—</div>
            </div>
            <div className="px-3 py-3">
              <div className="text-[10px] text-sub mb-1">NoHoneypot</div>
              <div className="text-[12px] text-sub">—</div>
            </div>
          </div>

          {/* ── 7. Verified / Renounced / Locked ─────────────────── */}
          <div className="grid grid-cols-3 border-b border-border">
            <div className="px-4 py-3 border-r border-border">
              <div className="text-[10px] text-sub mb-1">Verified</div>
              <div className="text-[12px] text-sub">—</div>
            </div>
            <div className="px-4 py-3 border-r border-border">
              <div className="text-[10px] text-sub mb-1">Renounced</div>
              <div className="text-[12px] text-sub">—</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] text-sub mb-1">Locked</div>
              <div className="text-[12px] text-sub">—</div>
            </div>
          </div>

          {/* ── 8. Price Change (5M / 1H / 6H / 24H) ────────────── */}
          <div className="grid grid-cols-4 border-b border-border">
            {([['5M', pair.change_5m], ['1H', pair.change_1h], ['6H', pair.change_6h], ['24H', pair.change_24h]] as [string, unknown][]).map(([label, val], i) => {
              const n = Number(val)
              const isPos = Number.isFinite(n) && n > 0
              const isNeg = Number.isFinite(n) && n < 0
              return (
                <div key={label} className={clsx('px-3 py-3 text-center', i < 3 && 'border-r border-border')}>
                  <div className="text-[10px] text-sub mb-1">{label}</div>
                  <div className={clsx('text-[12px] font-semibold tabular', isPos ? 'text-green' : isNeg ? 'text-red' : 'text-sub')}>
                    {Number.isFinite(n) ? `${isPos ? '+' : ''}${n.toFixed(2)}%` : '—'}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── 9. Trading Stats: Txns / Volume / Makers ─────────── */}
          <div className="border-b border-border">
            {/* Txns row */}
            <div className="grid grid-cols-[1fr_1fr_1fr] px-4 py-2.5 border-b border-border/50">
              <div>
                <div className="text-[10px] text-sub">Txns</div>
                <div className="text-[13px] font-bold tabular text-text">{fmtNum(pair.txns_24h)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-sub">Buys</div>
                <div className="text-[13px] font-bold tabular text-green">—</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-sub">Sells</div>
                <div className="text-[13px] font-bold tabular text-red">—</div>
              </div>
            </div>
            {/* Volume row */}
            <div className="grid grid-cols-[1fr_1fr_1fr] px-4 py-2.5 border-b border-border/50">
              <div>
                <div className="text-[10px] text-sub">Volume</div>
                <div className="text-[13px] font-bold tabular text-text">{fmtUsd(pair.volume_24h)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-sub">Buy Vol</div>
                <div className="text-[13px] font-bold tabular text-green">—</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-sub">Sell Vol</div>
                <div className="text-[13px] font-bold tabular text-red">—</div>
              </div>
            </div>
            {/* Makers row */}
            <div className="grid grid-cols-[1fr_1fr_1fr] px-4 py-2.5">
              <div>
                <div className="text-[10px] text-sub">Makers</div>
                <div className="text-[13px] font-bold tabular text-text">{pair.holder_count ? fmtNum(pair.holder_count) : '—'}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-sub">Buyers</div>
                <div className="text-[13px] font-bold tabular text-green">—</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-sub">Sellers</div>
                <div className="text-[13px] font-bold tabular text-red">—</div>
              </div>
            </div>
          </div>

          {/* ── 10. Action Buttons ────────────────────────────────── */}
          <div className="px-4 py-3 border-b border-border flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <button className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-[12px] text-sub hover:text-text transition-colors">
                Add to watchlist
              </button>
              <button className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-[12px] text-sub hover:text-text transition-colors">
                Alerts
              </button>
            </div>
            <a
              href={`https://app.uniswap.org/swap?chain=base&inputCurrency=ETH&outputCurrency=${base.address}`}
              target="_blank"
              rel="noopener"
              className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-[12px] text-sub hover:text-text transition-colors"
            >
              Trade on Uniswap <span className="text-[10px]">↗</span>
            </a>
          </div>

          {/* ── 11. Pool Info ─────────────────────────────────────── */}
          <div className="px-4 py-3 border-b border-border flex flex-col gap-0">
            {/* Pair created */}
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-[12px] text-sub">Pair created</span>
              <span className="text-[12px] text-text">{pair.created_at ? `${fmtAge(pair.created_at)} ago` : '—'}</span>
            </div>
            {/* Pooled base token */}
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-[12px] text-sub">Pooled {base.symbol}</span>
              <span className="text-[12px] text-sub">—</span>
            </div>
            {/* Pooled quote token */}
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-[12px] text-sub">Pooled {quote.symbol}</span>
              <span className="text-[12px] text-sub">—</span>
            </div>
            {/* Pair address */}
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-[12px] text-sub">Pair</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[12px] text-text">{shortAddr(pair.address)}</span>
                <CopyButton text={pair.address} />
                <a href={`https://basescan.org/address/${pair.address}`} target="_blank" rel="noopener" className="text-sub hover:text-blue text-[11px]">EXP ↗</a>
              </div>
            </div>
            {/* Base token address */}
            <div className="flex items-center justify-between py-2 border-b border-border/50">
              <span className="text-[12px] text-sub">{base.symbol}</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[12px] text-text">{shortAddr(base.address)}</span>
                <CopyButton text={base.address} />
                <a href={`https://basescan.org/token/${base.address}`} target="_blank" rel="noopener" className="text-sub hover:text-blue text-[11px]">EXP ↗</a>
              </div>
            </div>
            {/* Quote token address */}
            <div className="flex items-center justify-between py-2">
              <span className="text-[12px] text-sub">{quote.symbol}</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[12px] text-text">{shortAddr(quote.address)}</span>
                <CopyButton text={quote.address} />
                <a href={`https://basescan.org/token/${quote.address}`} target="_blank" rel="noopener" className="text-sub hover:text-blue text-[11px]">EXP ↗</a>
              </div>
            </div>
          </div>

          {/* ── 12. External Search ──────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 px-4 py-3 border-b border-border">
            <a href={`https://twitter.com/search?q=${base.symbol}`} target="_blank" rel="noopener"
              className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-[11px] text-sub hover:text-text transition-colors">
              Search on Twitter
            </a>
            <button className="flex items-center justify-center gap-1 rounded-lg border border-border py-2 text-[11px] text-sub hover:text-text transition-colors">
              Other pairs
            </button>
          </div>

          {/* ── 13. Security Audits (placeholders) ───────────────── */}
          <div className="px-4 py-3 flex flex-col gap-0">
            {(['Go+ Security', 'Quick Intel', 'Token Sniffer', 'Honeypot.is'] as const).map((name, i, arr) => (
              <div key={name} className={clsx('flex items-center justify-between py-2.5', i < arr.length - 1 && 'border-b border-border/50')}>
                <span className="text-[12px] text-sub">{name}</span>
                <span className="text-[12px] text-sub">—</span>
              </div>
            ))}
            <p className="text-[10px] text-sub/50 mt-2">Warning! Audits may not be 100% accurate!</p>
          </div>

        </div>
      </div>

    </div>
  )
}
