'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import useSWR from 'swr'
import type { Pool } from '@dex/shared'
import { fmtPrice, fmtUsd, fmtAge, fmtNum, fmtPct, shortAddr } from '@/lib/formatters'
import { usePairWebSocket } from '@/hooks/useWebSocket'
import { fetchPoolTrades, getPoolFromCache, type PoolExtended } from '@/lib/dexscreener-client'
import { useTokenSecurity } from '@/hooks/useTokenSecurity'
import { useTokenInfo } from '@/hooks/useTokenInfo'
import { useTopTraders } from '@/hooks/useTopTraders'
import { useTokenHolders } from '@/hooks/useTokenHolders'
import { useLiquidityProviders } from '@/hooks/useLiquidityProviders'
import { PairTabs } from '@/components/PairTabs'
import { TrendingTicker } from '@/components/TrendingTicker'
import { TradingViewChart } from '@/components/TradingViewChart'
import clsx from 'clsx'
import { TokenAvatar, addrToHue } from '@/components/TokenAvatar'
import { PairWatchlistDropdown } from '@/components/PairWatchlistDropdown'
import { OtherPairsModal } from '@/components/OtherPairsModal'
import { useChain } from '@/contexts/ChainContext'
import { isQuoteToken, explorerLink, getDexInfo } from '@/lib/chains'

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
  const px = size * 4
  return (
    <svg className="animate-spin" style={{ width: px, height: px }} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/>
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

/* ── Main ─────────────────────────────────────────────────── */
export function PairDetailClient({ address }: Props) {
  const { chain, chainConfig } = useChain()
  const tDetail = useTranslations('pairDetail')
  const tCommon = useTranslations('common')
  const tSec = useTranslations('security')

  // Instant fallback from list/detail cache — renders page immediately
  const fallback = useMemo(() => {
    const cached = getPoolFromCache(address, chain)
    return cached ? ({ ...cached, recent_swaps: [] } as PairDetail) : undefined
  }, [address, chain])

  // Fetch full pair data from GT API (SWR revalidates in background)
  const { data: pair, error, isLoading, isValidating } = useSWR<PairDetail>(
    `pair-${chain}:${address}`,
    async () => {
      const { fetchPairByAddress } = await import('@/lib/dexscreener-client')
      const result = await fetchPairByAddress(address, chain)
      if (!result) throw new Error('Pool not found')
      return result as PairDetail
    },
    {
      fallbackData: fallback,
      revalidateOnFocus: false,
      refreshInterval: 30_000,
      dedupingInterval: 2000,
      errorRetryCount: 2,
      errorRetryInterval: 3000,
    }
  )

  // GoPlus security data for base token
  const baseTokenAddr = pair?.token0 && pair?.token1
    ? (isQuoteToken(chain, pair.token0.address) ? pair.token1.address : pair.token0.address)
    : undefined
  const { data: security } = useTokenSecurity(baseTokenAddr, chain)
  const { data: tokenInfo } = useTokenInfo(baseTokenAddr, chain)
  const { data: topTraders } = useTopTraders(baseTokenAddr, chain)
  const { data: holdersData } = useTokenHolders(baseTokenAddr, chain)
  const { data: lpProvidersData } = useLiquidityProviders(address, chain)

  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [flash,     setFlash]     = useState<'up' | 'down' | null>(null)
  const [otherPairsOpen, setOtherPairsOpen] = useState(false)
  const [statsPeriod, setStatsPeriod] = useState<'5m' | '1h' | '6h' | '24h'>('6h')
  const [expandedAudit, setExpandedAudit] = useState<string | null>(null)
  const [auditDisclaimer, setAuditDisclaimer] = useState(false)
  const [swapUnit, setSwapUnit] = useState<'USD' | 'NATIVE'>('USD')
  const [swapAmount, setSwapAmount] = useState('1')
  const [embedOpen, setEmbedOpen] = useState(false)
  const [embedCopied, setEmbedCopied] = useState(false)
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => { timersRef.current.forEach(clearTimeout); timersRef.current.clear() }
  }, [])

  // Swaps
  const projectInfoRef = useRef<HTMLDivElement>(null)

  const [chartHeight, setChartHeight]  = useState(440)

  // Adjust chart height for mobile after hydration to avoid SSR mismatch
  useEffect(() => {
    if (window.innerWidth < 768) setChartHeight(300)
  }, [])
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
  const [newSwapIds,  setNewSwapIds]  = useState<Set<string>>(new Set())
  const swapsInitializedRef = useRef(false)

  // Initialize swaps from SWR pair data (trades come bundled with pool data)
  useEffect(() => {
    if (!pair) return
    if (pair.recent_swaps && pair.recent_swaps.length > 0 && !swapsInitializedRef.current) {
      swapsInitializedRef.current = true
      setSwaps(pair.recent_swaps as RecentSwap[])
      setSwapHasMore(pair.recent_swaps.length >= 50)
    }
  }, [pair])

  // Derived: loading while SWR is still fetching and we have no swaps yet
  const swapLoading = swaps.length === 0 && (isLoading || isValidating)

  // Poll trades every 10s, merge new trades to top with animation
  useEffect(() => {
    if (!address) return
    let cancelled = false

    const poll = async () => {
      try {
        const trades = await fetchPoolTrades(address, chain)
        if (cancelled || trades.length === 0) return
        setSwaps(prev => {
          const existingIds = new Set(prev.map(s => s.id))
          const fresh = trades.filter(t => !existingIds.has(t.id))
          if (fresh.length > 0) {
            setNewSwapIds(new Set(fresh.map(t => t.id)))
            const swapT = setTimeout(() => { setNewSwapIds(new Set()); timersRef.current.delete(swapT) }, 700)
            timersRef.current.add(swapT)
          }
          if (prev.length === 0) {
            setSwapHasMore(trades.length >= 50)
            return trades
          }
          if (fresh.length === 0) return prev
          return [...fresh, ...prev]
        })
      } catch {}
    }

    // Start polling after 10s — initial data comes from SWR pair fetch
    const timer = setInterval(poll, 10_000)
    return () => { cancelled = true; clearInterval(timer) }
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
        const flashT = setTimeout(() => { setFlash(null); timersRef.current.delete(flashT) }, 700)
        timersRef.current.add(flashT)
      }
    },
    [address]
  )
  usePairWebSocket([address], handleUpdate)

  const [loadingMore, setLoadingMore] = useState(false)
  const loadMoreSwaps = useCallback(async () => {
    if (loadingMore || swaps.length === 0) return
    setLoadingMore(true)
    try {
      const lastSwap = swaps[swaps.length - 1]
      const trades = await fetchPoolTrades(address, chain, lastSwap.timestamp)
      if (trades.length === 0) {
        setSwapHasMore(false)
        return  // finally block still runs
      }
      setSwaps(prev => {
        const existingIds = new Set(prev.map(s => s.id))
        const fresh = trades.filter(t => !existingIds.has(t.id))
        return [...prev, ...fresh]
      })
      setSwapHasMore(trades.length >= 50)
    } catch {
      // keep going so finally can reset loading state
    } finally {
      // BUG fix: always reset loading state, even when early return or throw
      setLoadingMore(false)
    }
  }, [address, swaps, loadingMore])

  /* ── Loading / error ─────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 gap-2 text-sub text-sm">
        <Spinner /> {tDetail('loadingPair')}
      </div>
    )
  }
  if (error || !pair) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <p className="text-sub text-sm">{isLoading ? tDetail('loadingPair') : tDetail('failedToLoad')}</p>
        {error && <p className="text-sub text-xs font-mono">{String(error?.message ?? error)}</p>}
        <a href={`/${chain}`} className="text-blue text-xs hover:underline mt-2">{tDetail('backToAllCoins')}</a>
      </div>
    )
  }

  const price     = livePrice ?? Number(pair.price_usd)
  const t0IsQuote = isQuoteToken(chain, pair.token0.address)
  const t1IsQuote = isQuoteToken(chain, pair.token1.address)
  const [base, quote] = t0IsQuote && !t1IsQuote ? [pair.token1, pair.token0] : [pair.token0, pair.token1]
  // Use GT token-info image as fallback when pool response has no logo
  const baseLogoUrl = base.logo_url || tokenInfo?.image_url || null
  const dexInfo   = getDexInfo(pair.dex)
  const dexLabel  = dexInfo.label
  const feeLabel  = pair.fee_tier != null ? `${parseFloat((pair.fee_tier / 10000).toFixed(4))}%` : null
  const change24h = Number(pair.change_24h)

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-bg overflow-x-hidden overflow-y-auto md:overflow-hidden scrollbar-hide">

      {/* ── Two-column layout ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-3 md:gap-5 p-3 md:p-5">

        {/* ── LEFT COLUMN: Chart + Transactions ───────────────── */}
        <div className="flex flex-col md:flex-1 min-w-0 gap-5 md:h-[calc(100vh_-_40px)] md:overflow-y-auto scrollbar-hide">

        {/* ── Chart Card ──────────────────────────────────────── */}
        <Card className="flex flex-col overflow-hidden flex-shrink-0">

          {/* Trending ticker — replaces chart header */}
          <TrendingTicker />

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
          swapLoading={swapLoading || loadingMore}
          onLoadMore={loadMoreSwaps}
          tokenAddress={base.address}
          security={security ?? undefined}
          tokenPriceUsd={price}
          traders={topTraders ?? undefined}
          baseTokenSymbol={base.symbol}
          newSwapIds={newSwapIds}
          holdersData={holdersData}
          lpProvidersData={lpProvidersData}
        />

        </div>{/* end LEFT COLUMN */}

        {/* ── RIGHT COLUMN ────────────────────────────────────── */}
        <div className="w-full overflow-x-hidden md:w-[340px] flex-shrink-0 flex flex-col gap-4 md:h-[calc(100vh_-_40px)] md:overflow-y-auto scrollbar-hide bg-surface border border-border rounded-xl px-4 py-2">

          {/* ── 1. Token Header ──────────────────────────────────── */}
          <div className="flex items-center gap-4 py-2">
            <TokenAvatar symbol={base.symbol} logoUrl={baseLogoUrl} address={base.address} size={54} rounded="md" />
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-bold text-text">${base.symbol}</span>
                <CopyButton text={base.address} />
                <span className="text-[14px] text-sub">/ {quote.symbol}</span>
              </div>
              <div className="flex items-center gap-[5px]">
                <div className="flex items-center gap-[2px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={chainConfig.icon} alt={chainConfig.name} width={14} height={14} />
                  <span className="text-[14px] text-sub">{chainConfig.name}</span>
                </div>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-sub"><path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.2"/></svg>
                <div className="flex items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {dexInfo.icon && <img src={dexInfo.icon} alt={dexInfo.label} width={16} height={16} />}
                  <span className="text-[14px] text-sub">{dexInfo.label}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. Social Links (only shown when at least one link exists) ── */}
          {(() => {
            const websiteUrl = tokenInfo?.websites?.[0] || null
            const twitterUrl = tokenInfo?.twitter_handle ? `https://x.com/${tokenInfo.twitter_handle}` : null
            const telegramUrl = tokenInfo?.telegram_handle ? `https://t.me/${tokenInfo.telegram_handle}` : null
            const links = [
              { href: websiteUrl, label: 'Website', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="7" cy="7" r="5"/><path d="M2 7h10M7 2c1.5 1.5 2 3.5 2 5s-.5 3.5-2 5M7 2c-1.5 1.5-2 3.5-2 5s.5 3.5 2 5"/></svg> },
              { href: twitterUrl, label: 'Twitter', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M8.3 6.1L12.7 1h-1L7.8 5.4 4.8 1H1l4.6 6.7L1 13h1l4-4.6 3.2 4.6H13L8.3 6.1zm-1.4 1.6l-.5-.7L2.8 1.9h1.6l3 4.3.5.7 3.8 5.4h-1.6L6.9 7.7z"/></svg> },
              { href: telegramUrl, label: 'Telegram', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M12.4707 2.10583C12.2591 1.88667 11.9702 1.75896 11.6657 1.75C11.5093 1.7503 11.3545 1.78204 11.2107 1.84333L1.52732 6.0375C1.41312 6.08402 1.3166 6.16554 1.25162 6.27035C1.18664 6.37515 1.15655 6.49786 1.16566 6.62083V7C1.1594 7.12794 1.19542 7.25437 1.26816 7.3598C1.34091 7.46523 1.44633 7.54378 1.56816 7.58333L4.08232 8.42334L4.84066 10.9842C4.89163 11.1637 4.99005 11.3261 5.12555 11.4545C5.26105 11.5828 5.42863 11.6722 5.61066 11.7133C5.68039 11.7219 5.75092 11.7219 5.82066 11.7133C6.07939 11.7124 6.32788 11.6122 6.51483 11.4333L7.44233 10.5583L9.23899 11.9758C9.41147 12.1105 9.61835 12.1939 9.83599 12.2166C10.0536 12.2393 10.2733 12.2004 10.4698 12.1042L10.6623 12.005C10.8269 11.9204 10.9699 11.799 11.0801 11.6503C11.1904 11.5016 11.265 11.3296 11.2982 11.1475L12.8323 3.21417C12.8683 3.01393 12.8542 2.80788 12.791 2.61446C12.7279 2.42105 12.6178 2.24629 12.4707 2.10583ZM10.4407 11.0075C10.4311 11.0579 10.4105 11.1055 10.3802 11.1469C10.3499 11.1883 10.3108 11.2224 10.2657 11.2467L10.0732 11.3458C10.0352 11.3651 9.99323 11.3751 9.95066 11.375C9.88854 11.3738 9.82875 11.3512 9.78149 11.3108L7.58816 9.56083C7.53588 9.5145 7.46844 9.48891 7.39858 9.48891C7.32872 9.48891 7.26127 9.5145 7.20899 9.56083L5.91399 10.78C5.89019 10.7975 5.86181 10.8076 5.83233 10.8092V8.75C5.8324 8.70957 5.84072 8.66958 5.85676 8.63247C5.87281 8.59536 5.89625 8.56191 5.92566 8.53417C7.78649 6.78417 8.90066 5.80417 9.56566 5.24417C9.58682 5.22481 9.60391 5.20142 9.61593 5.17538C9.62794 5.14934 9.63465 5.12116 9.63566 5.0925C9.638 5.06446 9.63396 5.03625 9.62386 5.00999C9.61376 4.98372 9.59785 4.96008 9.57733 4.94083C9.54889 4.90512 9.5093 4.87996 9.46489 4.86939C9.42048 4.85882 9.37381 4.86343 9.33233 4.8825L4.92232 7.665C4.88315 7.68366 4.8403 7.69334 4.79691 7.69334C4.75351 7.69334 4.71067 7.68366 4.67149 7.665L2.04066 6.76667L11.5315 2.64833C11.566 2.64015 11.602 2.64015 11.6365 2.64833C11.6787 2.64944 11.7202 2.65935 11.7584 2.67743C11.7966 2.69551 11.8306 2.72136 11.8582 2.75333C11.898 2.79563 11.9272 2.84676 11.9434 2.90253C11.9596 2.9583 11.9624 3.01712 11.9515 3.07417L10.4407 11.0075Z" fill="currentColor"/></svg> },
            ].filter(l => l.href)
            if (links.length === 0) return null
            return (
              <div className="flex items-center bg-surface border border-border rounded">
                {links.map((l, i) => (
                  <a key={l.label} href={l.href!} target="_blank" rel="noopener" className={clsx('flex-1 flex items-center justify-center gap-2 py-2 text-[13px] text-sub hover:text-text transition-colors', i < links.length - 1 && 'border-r border-border')}>
                    {l.icon} {l.label}
                  </a>
                ))}
                <button
                  onClick={() => projectInfoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="flex items-center justify-center w-[20px] flex-shrink-0 hover:text-text text-sub transition-colors"
                >
                  <svg width="8" height="4" viewBox="0 0 8 4" fill="none"><path d="M0 0l4 4 4-4" fill="currentColor"/></svg>
                </button>
              </div>
            )
          })()}

          {/* ── 3. Price USD / Price ─────────────────────────────── */}
          <div className="flex gap-2 w-full">
            <div className="flex-1 border border-border rounded-lg p-2 flex flex-col gap-1 items-center text-center">
              <span className="text-[12px] text-sub">{tDetail('priceUsd')}</span>
              <span className="text-[16px] font-bold tabular text-text">{fmtPrice(price)}</span>
            </div>
            <div className="flex-1 border border-border rounded-lg p-2 flex flex-col gap-1 items-center text-center">
              <span className="text-[12px] text-sub">{tDetail('priceQuote', { symbol: quote.symbol })}</span>
              <span className="text-[16px] font-bold tabular text-text">
                {(() => {
                  const quoteUsd = pair.quote_token_price_usd ?? 0
                  const priceInQuote = quoteUsd > 0 ? price / quoteUsd : 0
                  if (!priceInQuote) return '—'
                  return `${priceInQuote < 0.0001
                    ? priceInQuote.toExponential(4)
                    : priceInQuote < 1
                    ? priceInQuote.toFixed(8)
                    : priceInQuote.toFixed(4)} ${quote.symbol}`
                })()}
              </span>
            </div>
          </div>

          {/* ── 4. Liquidity / FDV / Market Cap ──────────────────── */}
          {(() => {
            const fdv = (pair as any).fdv_usd ?? pair.mcap_usd ?? 0
            return (
              <div className="flex gap-2 w-full">
                <div className="flex-1 border border-border rounded-lg p-2 flex flex-col gap-1 items-center text-center">
                  <span className="text-[12px] text-sub">{tDetail('liquidity')}</span>
                  <span className="text-[16px] font-bold tabular text-text">{fmtUsd(pair.liquidity_usd)}</span>
                </div>
                <Tooltip content={
                  <div className="flex flex-col gap-1">
                    <span className="text-[13px] font-semibold text-text">{tDetail('fdvTooltip')}</span>
                  </div>
                }>
                  <div className="flex-1 border border-border rounded-lg p-2 flex flex-col gap-1 items-center text-center cursor-help">
                    <span className="text-[12px] text-sub underline decoration-dotted">{tDetail('fdv')}</span>
                    <span className="text-[16px] font-bold tabular text-text">{fdv > 0 ? fmtUsd(fdv) : '—'}</span>
                  </div>
                </Tooltip>
                <div className="flex-1 border border-border rounded-lg p-2 flex flex-col gap-1 items-center text-center">
                  <span className="text-[12px] text-sub">{tDetail('marketCap')}</span>
                  <span className="text-[16px] font-bold tabular text-text">{Number(pair.mcap_usd) > 0 ? fmtUsd(pair.mcap_usd) : '—'}</span>
                </div>
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
              <div className="border border-border rounded-lg px-3 py-3">
                <div className="grid grid-cols-3 gap-y-5 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[12px] text-sub">{tDetail('top10')}</span>
                    {top10Pct !== null ? (
                      <div className="flex items-center gap-1">
                        {top10Ok ? <CheckIcon /> : <WarnIcon />}
                        <span className={clsx('text-[14px] tabular', top10Ok ? 'text-green' : 'text-red')}>{top10Pct.toFixed(2)}%</span>
                      </div>
                    ) : <LoadingText />}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[12px] text-sub">{tDetail('dev')}</span>
                    {devPct !== null ? (
                      <div className="flex items-center gap-1">
                        {devOk ? <CheckIcon /> : <WarnIcon />}
                        <span className={clsx('text-[14px] tabular', devOk ? 'text-green' : 'text-red')}>{devPct.toFixed(1)}%</span>
                      </div>
                    ) : <LoadingText />}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[12px] text-sub">{tDetail('holders')}</span>
                    <span className="text-[14px] text-text tabular">{holderCount !== null ? fmtNum(holderCount) : '—'}</span>
                  </div>
                  {/* Row 2 */}
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[12px] text-sub">{tDetail('noHoneypot')}</span>
                    {isHoneypot !== null ? (isHoneypot ? <WarnIcon /> : <CheckIcon />) : <LoadingText />}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[12px] text-sub">{tDetail('verified')}</span>
                    {isVerified !== null ? (isVerified ? <CheckIcon /> : <WarnIcon />) : <LoadingText />}
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-[12px] text-sub">{tDetail('locked')}</span>
                    {lockedPct !== null ? (
                      <span className={clsx('text-[14px] tabular', lockedPct > 50 ? 'text-green' : 'text-red')}>{lockedPct.toFixed(1)}%</span>
                    ) : <LoadingText />}
                  </div>
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
                          'flex-1 min-w-0 flex flex-col gap-1 items-center px-1 py-2 text-center transition-colors',
                          i < periods.length - 1 && 'border-r border-border',
                          selected && 'bg-muted',
                        )}
                      >
                        <span className="text-[12px] text-sub">{p.label}</span>
                        <span className={clsx('text-[14px] font-bold tabular truncate w-full', pos ? 'text-green' : neg ? 'text-red' : 'text-sub')}>
                          {valid ? `${pos ? '+' : ''}${Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toFixed(2)}%` : '—'}
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
                      <span className="text-[12px] text-sub">{tDetail('txns')}</span>
                      <span className="text-[14px] font-bold tabular text-text">{fmtNum(active.txns)}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-1">
                      <span className="text-[12px] text-sub">{tDetail('volume')}</span>
                      <span className="text-[14px] font-bold tabular text-text">{fmtUsd(active.volume)}</span>
                    </div>
                    <div className="flex flex-col gap-1 p-1">
                      <span className="text-[12px] text-sub underline decoration-dotted">{tDetail('makers')}</span>
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

                    // GT transactions provide buyers/sellers (unique wallets) per window
                    const periodMap: Record<string, { buyers: number; sellers: number }> = {
                      '5m':  { buyers: pair.buyers_5m ?? 0,  sellers: pair.sellers_5m ?? 0 },
                      '1h':  { buyers: pair.buyers_1h ?? 0,  sellers: pair.sellers_1h ?? 0 },
                      '6h':  { buyers: pair.buyers_6h ?? 0,  sellers: pair.sellers_6h ?? 0 },
                      '24h': { buyers: pair.buyers_24h ?? 0, sellers: pair.sellers_24h ?? 0 },
                    }
                    const pm = periodMap[active.key] ?? { buyers: 0, sellers: 0 }
                    const totalMakers = pm.buyers + pm.sellers || 1
                    const buyerPct  = Math.max(0.1, (pm.buyers / totalMakers) * 100)
                    const sellerPct = Math.max(0.1, (pm.sellers / totalMakers) * 100)

                    return (
                      <div className="flex-1 flex flex-col gap-2 px-2 py-2">
                        <div className="flex flex-col gap-[5px]">
                          <div className="flex justify-between text-[12px] text-sub"><span>{tDetail('buys')}</span><span>{tDetail('sells')}</span></div>
                          <div className="flex justify-between text-[14px] text-text"><span>{fmtNum(buys)}</span><span>{fmtNum(sells)}</span></div>
                          <div className="flex h-1 gap-[2px]">
                            <div className="rounded-full bg-green" style={{ width: `${buyPct}%` }} />
                            <div className="rounded-full bg-red" style={{ width: `${sellPct}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[5px]">
                          <div className="flex justify-between text-[12px] text-sub"><span>{tDetail('buyVol')}</span><span>{tDetail('sellVol')}</span></div>
                          <div className="flex justify-between text-[14px] text-text"><span>{fmtUsd(buyVol)}</span><span>{fmtUsd(sellVol)}</span></div>
                          <div className="flex h-1 gap-[2px]">
                            <div className="rounded-full bg-green" style={{ width: `${buyVolPct}%` }} />
                            <div className="rounded-full bg-red" style={{ width: `${sellVolPct}%` }} />
                          </div>
                        </div>
                        <div className="flex flex-col gap-[5px]">
                          <div className="flex justify-between text-[12px] text-sub"><span>{tDetail('buyers')}</span><span>{tDetail('sellers')}</span></div>
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
          </div>

          {/* ── 8. Trade on DEX ──────────────────────────────────── */}
          <a
            href={chainConfig.swapUrl(base.address, pair.dex)}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-center gap-2.5 rounded bg-muted text-[13px] text-sub hover:text-text transition-colors py-[10px]"
          >
            {tDetail('tradeOn', { dex: dexInfo.label.split(' ')[0] })}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 1h7v7M11 1L5 7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>

          {/* ── 9. Pool Info ─────────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-col">
              <div className="flex items-center justify-between px-2 py-3 border-b border-border">
                <span className="text-[12px] text-sub">{tDetail('pairCreated')}</span>
                <span className="text-[14px] text-text">{pair.created_at ? `${fmtAge(pair.created_at)} ${tCommon('ago')}` : '—'}</span>
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
                      <span className="text-[12px] text-sub">{tDetail('pooled', { symbol: base.symbol })}</span>
                      <span className="text-[14px] text-text">{basePooled > 0 ? <><span>≈{fmtNum(basePooled)}</span> <span className="text-sub text-[12px]">({fmtUsd(halfLiq)})</span></> : '—'}</span>
                    </div>
                    <div className="flex items-center justify-between px-2 py-3 border-b border-border">
                      <span className="text-[12px] text-sub">{tDetail('pooled', { symbol: quote.symbol })}</span>
                      <span className="text-[14px] text-text">{quotePooled > 0 ? <><span>≈{fmtNum(quotePooled)}</span> <span className="text-sub text-[12px]">({fmtUsd(halfLiq)})</span></> : '—'}</span>
                    </div>
                  </>
                )
              })()}
              <div className="flex items-center justify-between px-2 py-3 border-b border-border">
                <span className="text-[12px] text-sub">{tDetail('pair')}</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-[14px] text-text">{shortAddr(pair.address)}</span>
                    <CopyButton text={pair.address} />
                  </div>
                  <a href={explorerLink(chain, 'address', pair.address)} target="_blank" rel="noopener" className="flex items-center gap-1 text-[12px] text-sub hover:text-blue">
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
                  <a href={explorerLink(chain, 'token', base.address)} target="_blank" rel="noopener" className="flex items-center gap-1 text-[12px] text-sub hover:text-blue">
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
                  <a href={explorerLink(chain, 'token', quote.address)} target="_blank" rel="noopener" className="flex items-center gap-1 text-[12px] text-sub hover:text-blue">
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
                {tDetail('searchOnTwitter')}
              </a>
              <button
                onClick={() => setOtherPairsOpen(true)}
                className="flex-1 flex items-center justify-center gap-1 border border-border rounded-lg py-1.5 text-[12px] text-sub hover:text-text transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="6" cy="6" r="4"/><path d="M9 9l3 3"/></svg>
                {tDetail('otherPairs')}
              </button>
            </div>
          </div>

          {/* ── 10. Security Audits ──────────────────────────────── */}
          <div className="flex flex-col gap-6 items-center w-full">
            {(() => {
              const s = security
              // Build Go+ rows from real data
              const fmtTax = (v: string | undefined) => {
                if (!v || v === '') return { value: tSec('unknown'), status: 'neutral' as const }
                const n = parseFloat(v) * 100
                return { value: `${n.toFixed(1)}%`, status: n > 5 ? 'warn' as const : 'ok' as const }
              }
              const flag = (v: string | undefined, goodVal: string) => {
                if (!v || v === '') return { value: tSec('unknown'), status: 'neutral' as const }
                return v === goodVal
                  ? { value: goodVal === '0' ? tSec('no') : tSec('yes'), status: 'ok' as const }
                  : { value: goodVal === '0' ? tSec('yes') : tSec('no'), status: 'warn' as const }
              }
              const isRenounced = s
                ? (s.owner_address === '0x0000000000000000000000000000000000000000' || s.owner_address === '')
                : null

              const goPlusRows: { label: string; value: string; status: 'ok' | 'warn' | 'neutral' | 'link' }[] = s ? [
                { label: tSec('sellTax'), ...fmtTax(s.sell_tax) },
                { label: tSec('buyTax'), ...fmtTax(s.buy_tax) },
                { label: tSec('taxModifiable'), ...flag(s.slippage_modifiable, '0') },
                { label: tSec('externalCall'), ...flag(s.external_call, '0') },
                { label: tSec('ownershipRenounced'), value: isRenounced ? tSec('yes') : tSec('no'), status: isRenounced ? 'ok' : 'warn' },
                { label: tSec('hiddenOwner'), ...flag(s.hidden_owner, '0') },
                { label: tSec('openSource'), ...flag(s.is_open_source, '1') },
                { label: tSec('honeypot'), ...flag(s.is_honeypot, '0') },
                { label: tSec('proxyContract'), ...flag(s.is_proxy, '0') },
                { label: tSec('mintable'), ...flag(s.is_mintable, '0') },
                { label: tSec('transferPausable'), ...flag(s.transfer_pausable, '0') },
                { label: tSec('tradingCooldown'), ...flag(s.trading_cooldown, '0') },
                { label: tSec('cantSellAll'), ...flag(s.cannot_sell_all, '0') },
                { label: tSec('ownerCanChangeBalance'), ...flag(s.owner_change_balance, '0') },
                { label: tSec('hasBlacklist'), ...flag(s.is_blacklisted, '0') },
                { label: tSec('hasWhitelist'), ...flag(s.is_whitelisted, '0') },
                { label: tSec('isAntiWhale'), ...flag(s.is_anti_whale, '0') },
                { label: tSec('lpHolderCount'), value: s.lp_holder_count || '—', status: 'neutral' },
                { label: tSec('creatorAddress'), value: s.creator_address ? shortAddr(s.creator_address) : '—', status: s.creator_address ? 'link' : 'neutral' },
                { label: tSec('creatorBalance'), value: s.creator_balance ? `${parseFloat(s.creator_balance).toLocaleString()} (${(parseFloat(s.creator_percent || '0') * 100).toFixed(2)}%)` : '—', status: 'neutral' },
                { label: tSec('ownerAddress'), value: s.owner_address ? shortAddr(s.owner_address) : '—', status: s.owner_address ? 'link' : 'neutral' },
                { label: tSec('ownerBalance'), value: s.owner_balance ? `${parseFloat(s.owner_balance).toLocaleString()} (${(parseFloat(s.owner_percent || '0') * 100).toFixed(2)}%)` : '—', status: 'neutral' },
              ] : []

              // Count issues for Go+ summary
              const goPlusIssues = goPlusRows.filter(r => r.status === 'warn').length
              const goPlusSummary = s ? (goPlusIssues === 0 ? tSec('noIssues') : tSec('issueCount', { count: goPlusIssues })) : tCommon('loading')
              const goPlusOk = s ? goPlusIssues === 0 : true

              // Contract Risk — derived from GoPlus data
              const contractRisk = (() => {
                if (!s) return { key: 'loading' as const, level: tCommon('loading'), ok: true, color: '' }
                const isHp = s.is_honeypot === '1'
                const hiddenOwner = s.hidden_owner === '1'
                const sellTax = parseFloat(s.sell_tax || '0') * 100
                const buyTax = parseFloat(s.buy_tax || '0') * 100
                const mintable = s.is_mintable === '1'
                const ownerNotRenounced = s.owner_address !== '0x0000000000000000000000000000000000000000' && s.owner_address !== ''
                const taxModifiable = s.slippage_modifiable === '1'
                const pausable = s.transfer_pausable === '1'
                const canChangeBalance = s.owner_change_balance === '1'

                if (isHp || hiddenOwner || sellTax > 10 || buyTax > 10 || canChangeBalance) {
                  return { key: 'high' as const, level: tSec('high'), ok: false, color: 'text-red' }
                }
                if (mintable || ownerNotRenounced || taxModifiable || pausable) {
                  return { key: 'medium' as const, level: tSec('medium'), ok: true, color: 'text-yellow-400' }
                }
                return { key: 'low' as const, level: tSec('low'), ok: true, color: 'text-green' }
              })()

              const riskDot = contractRisk.key === 'high' ? '#ef5350' : contractRisk.key === 'medium' ? '#facc15' : '#2fe06b'

              const audits = [
                { name: tSec('goPlusSecurity'), result: goPlusSummary, ok: goPlusOk, expandable: true, rows: goPlusRows },
                { name: tSec('contractRisk'), result: contractRisk.level, ok: contractRisk.key !== 'high', expandable: false, rows: [], riskDot },
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
                                {item.result !== 'N/A' && item.result !== tCommon('loading') && (
                                  (item as any).riskDot
                                    ? <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><circle cx="4" cy="4" r="3.5" fill={(item as any).riskDot}/></svg>
                                    : item.ok
                                      ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#2fe06b" strokeWidth="1.5"/><path d="M3.5 6l2 2 3-3" stroke="#2fe06b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                      : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ef5350" strokeWidth="1.5"/><path d="M4 4l4 4M8 4l-4 4" stroke="#ef5350" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                )}
                              </div>
                            </div>
                            {item.expandable && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={clsx('text-sub flex-shrink-0 transition-transform duration-200', isOpen && 'rotate-180')}><path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.2"/></svg>
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
                    {tSec('warning')}{' '}
                    <button
                      onClick={() => setAuditDisclaimer(v => !v)}
                      className="text-sub underline hover:text-text transition-colors"
                    >
                      {auditDisclaimer ? tSec('less') : tSec('more')}
                    </button>
                    {auditDisclaimer && (
                      <span className="block mt-1 text-sub">
                        {tSec('disclaimer')}
                      </span>
                    )}
                  </p>
                </div>
              )
            })()}

            {/* ── 11. Token About Card ──────────────────────────────── */}
            <div ref={projectInfoRef} className="flex flex-col gap-4 items-center">
              <div className="flex flex-col gap-[13px] items-center">
                <TokenAvatar symbol={base.symbol} logoUrl={baseLogoUrl} address={base.address} size={74} rounded="md" />
                <span className="text-[16px] text-text text-center">{base.name || base.symbol}</span>
                {(() => {
                  const websiteUrl = tokenInfo?.websites?.[0] || null
                  const twitterUrl = tokenInfo?.twitter_handle ? `https://x.com/${tokenInfo.twitter_handle}` : null
                  const telegramUrl = tokenInfo?.telegram_handle ? `https://t.me/${tokenInfo.telegram_handle}` : null
                  const links = [
                    { url: websiteUrl, label: 'Website', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="7" cy="7" r="5"/><path d="M2 7h10M7 2c1.5 1.5 2 3.5 2 5s-.5 3.5-2 5M7 2c-1.5 1.5-2 3.5-2 5s.5 3.5 2 5"/></svg> },
                    { url: twitterUrl, label: 'Twitter', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M8.3 6.1L12.7 1h-1L7.8 5.4 4.8 1H1l4.6 6.7L1 13h1l4-4.6 3.2 4.6H13L8.3 6.1zm-1.4 1.6l-.5-.7L2.8 1.9h1.6l3 4.3.5.7 3.8 5.4h-1.6L6.9 7.7z"/></svg> },
                    { url: telegramUrl, label: 'Telegram', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M12.47 2.1c-.21-.22-.5-.35-.8-.35-.16 0-.31.03-.47.09L1.53 6.04a.58.58 0 00-.36.58v.38c0 .26.14.49.4.58l2.51.84.76 2.56a.87.87 0 00.76.73.87.87 0 00.7-.28l.93-.87 1.8 1.42a1.1 1.1 0 001.23-.11l.19-.1a1.1 1.1 0 00.64-1l1.53-7.93a1.1 1.1 0 00-.32-1.12z"/></svg> },
                  ].filter(l => l.url)
                  if (links.length === 0) return null
                  return (
                    <div className="flex items-center justify-center gap-2">
                      {links.map(l => (
                        <a key={l.label} href={l.url!} target="_blank" rel="noopener" className="flex items-center gap-1 bg-muted rounded px-2 py-1 text-[13px] text-text hover:text-blue transition-colors">
                          {l.icon} {l.label}
                        </a>
                      ))}
                    </div>
                  )
                })()}
              </div>
              <p className="text-[14px] text-sub text-center">
                {tokenInfo?.description || `${base.symbol} on ${chainConfig.name} · ${dexLabel}${feeLabel ? ` · ${feeLabel} fee` : ''}`}
              </p>
            </div>
          </div>

          {/* ── 12. Swap Widget ──────────────────────────────────── */}
          <div className="flex flex-col gap-3 items-center">
            <div className="border border-border rounded-lg flex items-center gap-2.5 p-4 w-full">
              <input
                type="text"
                value={swapAmount}
                onChange={(e) => { const v = e.target.value; if (/^\d*\.?\d*$/.test(v)) setSwapAmount(v) }}
                className="flex-1 text-[14px] text-text bg-transparent outline-none min-w-0"
                placeholder="0"
              />
              <span className="text-[14px] text-sub flex-shrink-0">${base.symbol}</span>
            </div>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-sub"><path d="M7 3v8M4 8l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <div className="border border-border rounded-lg flex items-center gap-2.5 p-4 w-full">
              <input
                type="text"
                value={(() => {
                  const amt = parseFloat(swapAmount)
                  if (!amt || price <= 0) return '—'
                  if (swapUnit === 'USD') return fmtPrice(amt * price)
                  const nativePrice = pair.base_token_price_native ?? 0
                  return nativePrice > 0 ? (amt * nativePrice).toFixed(8) : '—'
                })()}
                readOnly
                className="flex-1 text-[14px] text-text bg-transparent outline-none min-w-0"
                placeholder="0"
              />
              <div className="flex items-center rounded-lg overflow-hidden flex-shrink-0">
                <button
                  onClick={() => setSwapUnit('USD')}
                  className={clsx('px-2 py-[7px] text-[14px] flex items-center gap-1.5 transition-colors', swapUnit === 'USD' ? 'bg-muted text-text' : 'bg-muted/40 text-sub')}
                >
                  {swapUnit === 'USD' && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  USD
                </button>
                <button
                  onClick={() => setSwapUnit('NATIVE')}
                  className={clsx('px-2 py-[7px] text-[14px] flex items-center gap-1.5 transition-colors', swapUnit === 'NATIVE' ? 'bg-muted text-text' : 'bg-muted/40 text-sub')}
                >
                  {swapUnit === 'NATIVE' && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  {chainConfig.nativeCurrency.symbol}
                </button>
              </div>
            </div>
            <div className="relative w-full">
              <button
                onClick={() => { setEmbedOpen(!embedOpen); setEmbedCopied(false) }}
                className="border border-border rounded-lg flex items-center justify-center gap-3 p-2 w-full text-[14px] text-text hover:bg-muted transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M2 4h10M2 7h7M2 10h4"/></svg>
                {tDetail('embedChart')}
              </button>
              {embedOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-border bg-[#111] shadow-2xl p-4 flex flex-col gap-3 z-20">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-text">{tDetail('embedCode')}</span>
                    <button onClick={() => setEmbedOpen(false)} className="text-sub hover:text-text">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/pair/${address}?embed=1" width="100%" height="400" frameborder="0"></iframe>`}
                    className="w-full h-[72px] rounded-lg border border-border bg-transparent text-[12px] text-sub font-mono p-2 resize-none outline-none focus:border-blue"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`<iframe src="${typeof window !== 'undefined' ? window.location.origin : ''}/pair/${address}?embed=1" width="100%" height="400" frameborder="0"></iframe>`)
                      setEmbedCopied(true)
                      const embedT = setTimeout(() => { setEmbedCopied(false); timersRef.current.delete(embedT) }, 2000)
                      timersRef.current.add(embedT)
                    }}
                    className="bg-blue text-white hover:bg-blue/90 rounded-lg text-[13px] font-medium py-2 transition-colors"
                  >
                    {embedCopied ? tDetail('copied') : tDetail('copyCode')}
                  </button>
                </div>
              )}
            </div>
            <span className="text-[12px] text-sub">{tDetail('chartsPoweredBy')}</span>
          </div>

        </div>
      </div>

      <OtherPairsModal
        open={otherPairsOpen}
        onClose={() => setOtherPairsOpen(false)}
        currentAddress={address}
        tokenAddress={base.address}
      />

    </div>
  )
}
