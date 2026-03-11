'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts'
import clsx from 'clsx'

interface Props {
  pairAddress: string
  symbol: string
  chain?: string
}

type Resolution = '1' | '5' | '15' | '60' | '240' | '1D'
type ChartType = 'candles' | 'line' | 'area'

const RESOLUTIONS: { label: string; value: Resolution }[] = [
  { label: '1m', value: '1' },
  { label: '5m', value: '5' },
  { label: '15m', value: '15' },
  { label: '1H', value: '60' },
  { label: '4H', value: '240' },
  { label: '1D', value: '1D' },
]

const RESOLUTION_SECONDS: Record<Resolution, number> = {
  '1': 60,
  '5': 300,
  '15': 900,
  '60': 3600,
  '240': 14400,
  '1D': 86400,
}

const RESOLUTION_API_MAP: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
  '1D': '1d',
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

/* ── Seeded PRNG for deterministic mock data per address ────── */
function seedHash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

/* ── Generate mock candle data ─────────────────────────────── */
function generateMockCandles(address: string, resolution: Resolution) {
  const seed = seedHash(address + resolution)
  const rand = seededRandom(seed)

  const intervalSec = RESOLUTION_SECONDS[resolution]
  const barCount = resolution === '1D' ? 180 : resolution === '240' ? 200 : 300
  const now = Math.floor(Date.now() / 1000)
  const startTime = now - barCount * intervalSec

  // Base price derived from address
  const priceRange = rand()
  let basePrice = priceRange < 0.3
    ? 0.00001 + rand() * 0.001      // micro cap
    : priceRange < 0.6
    ? 0.001 + rand() * 0.5          // small cap
    : 0.5 + rand() * 50             // mid cap

  const bars: any[] = []
  let price = basePrice

  // Generate a trend pattern
  const trendPhases = Math.floor(3 + rand() * 5)
  const phaseLength = Math.floor(barCount / trendPhases)

  for (let i = 0; i < barCount; i++) {
    const phase = Math.floor(i / phaseLength)
    const trendDir = (seedHash(address + String(phase)) % 3) - 1 // -1, 0, 1
    const volatility = 0.005 + rand() * 0.03
    const drift = trendDir * 0.001

    const change = (rand() - 0.5) * 2 * volatility + drift
    price = price * (1 + change)
    if (price < basePrice * 0.05) price = basePrice * 0.05
    if (price > basePrice * 20) price = basePrice * 20

    const open = price
    const wickUp = rand() * volatility * price
    const wickDown = rand() * volatility * price
    const bodySize = (rand() - 0.5) * volatility * price

    const close = open + bodySize
    const high = Math.max(open, close) + wickUp
    const low = Math.min(open, close) - wickDown

    const time = startTime + i * intervalSec
    const volume = (5000 + rand() * 200000) * (0.5 + rand())

    bars.push({
      time,
      open: Math.max(open, 0.0000001),
      high: Math.max(high, 0.0000001),
      low: Math.max(low, 0.0000001),
      close: Math.max(close, 0.0000001),
      volume,
    })

    price = close > 0 ? close : price
  }

  return bars
}

/* ── GT OHLCV timeframe mapping ─────────────────────────────── */
const GT_TIMEFRAME_MAP: Record<string, { timeframe: string; aggregate: string }> = {
  '1':   { timeframe: 'minute', aggregate: '1' },
  '5':   { timeframe: 'minute', aggregate: '5' },
  '15':  { timeframe: 'minute', aggregate: '15' },
  '60':  { timeframe: 'hour',   aggregate: '1' },
  '240': { timeframe: 'hour',   aggregate: '4' },
  '1D':  { timeframe: 'day',    aggregate: '1' },
}

/* ── Fetch real candles ─────────────────────────────────────── */
async function fetchCandles(address: string, resolution: Resolution, chainSlug?: string): Promise<{ bars: any[]; isMock: boolean }> {
  // 1) Try GeckoTerminal OHLCV (works for all chains)
  try {
    const { getChain } = await import('@/lib/chains')
    const network = chainSlug ? getChain(chainSlug as import('@/lib/chains').ChainSlug).geckoTerminalSlug : 'base'
    const gt = GT_TIMEFRAME_MAP[resolution] || GT_TIMEFRAME_MAP['5']
    const before = Math.floor(Date.now() / 1000)
    const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${address}/ohlcv/${gt.timeframe}?aggregate=${gt.aggregate}&before_timestamp=${before}&limit=300&currency=usd`
    const res = await fetch(url)
    if (res.ok) {
      const json = await res.json()
      const list = json?.data?.attributes?.ohlcv_list
      if (Array.isArray(list) && list.length > 0) {
        // GT returns [timestamp_sec, open, high, low, close, volume] sorted newest-first
        const bars = list
          .map((c: number[]) => ({
            time: c[0],
            open: c[1],
            high: c[2],
            low: c[3],
            close: c[4],
            volume: c[5],
          }))
          .sort((a: any, b: any) => a.time - b.time)
        return { bars, isMock: false }
      }
    }
  } catch {}

  // 2) Fallback: backend API (Base chain only)
  if (BASE_URL) {
    const apiRes = RESOLUTION_API_MAP[resolution] || '5m'
    const to = Math.floor(Date.now() / 1000)
    const from = to - 60 * 60 * 24 * 7
    try {
      const data = await fetch(
        `${BASE_URL}/api/pairs/${address}/candles?resolution=${apiRes}&from=${from}&to=${to}`
      ).then((r) => r.json())
      if (Array.isArray(data) && data.length > 0) {
        return {
          bars: data.map((d: any) => ({
            time: d.time as number,
            open: Number(d.open),
            high: Number(d.high),
            low: Number(d.low),
            close: Number(d.close),
            volume: Number(d.volume || 0),
          })),
          isMock: false,
        }
      }
    } catch {}
  }

  // 3) Fallback: generate mock candles
  return { bars: generateMockCandles(address, resolution), isMock: true }
}

/* ── Calculate Moving Average ──────────────────────────────── */
function calcMA(bars: { time: number; close: number }[], period: number) {
  const result: { time: number; value: number }[] = []
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += bars[j].close
    result.push({ time: bars[i].time, value: sum / period })
  }
  return result
}

/* ── Icons ─────────────────────────────────────────────────── */
function IconCandle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="3" width="3" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="3.5" y1="1" x2="3.5" y2="3" stroke="currentColor" strokeWidth="1.2" />
      <line x1="3.5" y1="11" x2="3.5" y2="13" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="5" width="3" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10.5" y1="2" x2="10.5" y2="5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10.5" y1="11" x2="10.5" y2="13" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function IconLine() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 10l3-4 3 2 3-5 3 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconArea() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 10l3-4 3 2 3-5 3 1V13H1z" fill="currentColor" opacity="0.2" />
      <path d="M1 10l3-4 3 2 3-5 3 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconIndicator() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 12l2-3 2 1.5 2-4 2 2 2-5 2 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1 10l2-1.5 2 1 2-2.5 2 1 2-3 2 2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" strokeDasharray="2 2" />
    </svg>
  )
}

function IconFullscreen() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" />
    </svg>
  )
}

function IconExitFullscreen() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 1v4H1M9 5h4V1M9 13V9h4M1 9h4v4" />
    </svg>
  )
}

function IconScreenshot() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="12" height="9" rx="1.5" />
      <circle cx="7" cy="7.5" r="2" />
      <path d="M4 3V2a1 1 0 011-1h4a1 1 0 011 1v1" />
    </svg>
  )
}

/* ── Toolbar dropdown ──────────────────────────────────────── */
function ToolbarDropdown({ label, icon, open, onToggle, children }: {
  label: string; icon: React.ReactNode; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onToggle])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={onToggle}
        className={clsx(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-[12px] font-medium transition-colors',
          open ? 'bg-blue/15 text-blue' : 'text-sub hover:text-text hover:bg-border/50'
        )}
      >
        {icon}
        <span className="hidden md:inline">{label}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-lg py-1 z-50 min-w-[140px] shadow-xl">
          {children}
        </div>
      )}
    </div>
  )
}

function DropdownItem({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'w-full text-left px-3 py-1.5 text-[12px] transition-colors',
        active ? 'text-blue bg-blue/10' : 'text-sub hover:text-text hover:bg-border/30'
      )}
    >
      {children}
    </button>
  )
}

/* ── Chart component ───────────────────────────────────────── */
export function TradingViewChart({ pairAddress, symbol, chain: chainProp }: Props) {
  const t = useTranslations('chart')
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const candleSeriesRef = useRef<any>(null)
  const lineSeriesRef = useRef<any>(null)
  const volumeSeriesRef = useRef<any>(null)
  const maSeriesRefs = useRef<any[]>([])
  const barsRef = useRef<any[]>([])

  const [activeRes, setActiveRes] = useState<Resolution>('5')
  const [chartType, setChartType] = useState<ChartType>('candles')
  const [showMA, setShowMA] = useState(false)
  const [logScale, setLogScale] = useState(false)
  const [isMockData, setIsMockData] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [chartTypeOpen, setChartTypeOpen] = useState(false)
  const [indicatorOpen, setIndicatorOpen] = useState(false)

  // Apply MA overlay
  const applyMA = useCallback((bars: any[], show: boolean) => {
    // Remove existing MA lines
    for (const s of maSeriesRefs.current) {
      try { chartRef.current?.removeSeries(s) } catch {}
    }
    maSeriesRefs.current = []

    if (!show || !chartRef.current || bars.length < 7) return

    const MA_CONFIGS = [
      { period: 7, color: '#f5c542' },
      { period: 25, color: '#42a5f5' },
      { period: 99, color: '#ab47bc' },
    ]

    for (const cfg of MA_CONFIGS) {
      if (bars.length < cfg.period) continue
      const series = chartRef.current.addLineSeries({
        color: cfg.color,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      series.setData(calcMA(bars, cfg.period))
      maSeriesRefs.current.push(series)
    }
  }, [])

  const loadData = useCallback(
    async (res: Resolution, type: ChartType, showMaOverlay: boolean) => {
      const { bars, isMock } = await fetchCandles(pairAddress, res, chainProp)
      barsRef.current = bars
      setIsMockData(isMock)
      if (!chartRef.current || bars.length === 0) return

      // Clear previous series
      if (candleSeriesRef.current) {
        try { chartRef.current.removeSeries(candleSeriesRef.current) } catch {}
        candleSeriesRef.current = null
      }
      if (lineSeriesRef.current) {
        try { chartRef.current.removeSeries(lineSeriesRef.current) } catch {}
        lineSeriesRef.current = null
      }

      if (type === 'candles') {
        const series = chartRef.current.addCandlestickSeries({
          upColor: '#26a69a',
          downColor: '#ef5350',
          borderUpColor: '#26a69a',
          borderDownColor: '#ef5350',
          wickUpColor: '#26a69a',
          wickDownColor: '#ef5350',
          priceFormat: { type: 'price', minMove: 0.00000001, precision: 8 },
        })
        series.setData(bars.map((b: any) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })))
        candleSeriesRef.current = series
      } else if (type === 'line') {
        const series = chartRef.current.addLineSeries({
          color: '#2962FF',
          lineWidth: 2,
          priceFormat: { type: 'price', minMove: 0.00000001, precision: 8 },
        })
        series.setData(bars.map((b: any) => ({ time: b.time, value: b.close })))
        lineSeriesRef.current = series
      } else {
        // area
        const series = chartRef.current.addAreaSeries({
          topColor: 'rgba(41, 98, 255, 0.3)',
          bottomColor: 'rgba(41, 98, 255, 0.02)',
          lineColor: '#2962FF',
          lineWidth: 2,
          priceFormat: { type: 'price', minMove: 0.00000001, precision: 8 },
        })
        series.setData(bars.map((b: any) => ({ time: b.time, value: b.close })))
        lineSeriesRef.current = series
      }

      // Volume
      if (volumeSeriesRef.current) {
        volumeSeriesRef.current.setData(
          bars.map((b: any) => ({
            time: b.time,
            value: b.volume,
            color: b.close >= b.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
          }))
        )
      }

      // MA overlay
      applyMA(bars, showMaOverlay)

      chartRef.current?.timeScale().fitContent()
    },
    [pairAddress, chainProp, applyMA]
  )

  // Create chart
  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#000000' },
        textColor: '#787b86',
        fontSize: 12,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#758696', width: 1, style: 3, labelBackgroundColor: '#2a2e39' },
        horzLine: { color: '#758696', width: 1, style: 3, labelBackgroundColor: '#2a2e39' },
      },
      rightPriceScale: {
        borderColor: '#2a2e39',
        autoScale: true,
      },
      timeScale: {
        borderColor: '#2a2e39',
        timeVisible: true,
        secondsVisible: false,
      },
    })

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
    })

    chartRef.current = chart
    volumeSeriesRef.current = volumeSeries

    loadData(activeRes, chartType, showMA)

    return () => {
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      lineSeriesRef.current = null
      volumeSeriesRef.current = null
      maSeriesRefs.current = []
    }
  }, [pairAddress]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle resolution change
  const handleResolution = (res: Resolution) => {
    setActiveRes(res)
    loadData(res, chartType, showMA)
  }

  // Handle chart type change
  const handleChartType = (type: ChartType) => {
    setChartType(type)
    setChartTypeOpen(false)
    loadData(activeRes, type, showMA)
  }

  // Handle MA toggle
  const handleToggleMA = () => {
    const next = !showMA
    setShowMA(next)
    setIndicatorOpen(false)
    applyMA(barsRef.current, next)
  }

  // Handle log scale toggle
  const handleLogScale = () => {
    const next = !logScale
    setLogScale(next)
    chartRef.current?.priceScale('right').applyOptions({ mode: next ? 1 : 0 })
  }

  // Fullscreen
  const toggleFullscreen = () => {
    if (!wrapperRef.current) return
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Screenshot
  const handleScreenshot = () => {
    if (!containerRef.current) return
    const canvas = containerRef.current.querySelector('canvas')
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `${symbol}_chart.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div ref={wrapperRef} className={clsx('flex flex-col w-full', isFullscreen ? 'h-screen bg-black' : 'h-full')}>
      {/* ── Top Toolbar ──────────────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-2 md:px-3 py-1.5 border-b border-border flex-shrink-0 bg-black overflow-x-auto scrollbar-hide">
        {/* Resolution buttons */}
        {RESOLUTIONS.map((r) => (
          <button
            key={r.value}
            onClick={() => handleResolution(r.value)}
            className={clsx(
              'px-2 py-1 rounded-md text-[12px] font-medium whitespace-nowrap transition-colors',
              r.value === activeRes
                ? 'bg-blue/15 text-blue'
                : 'text-sub hover:text-text hover:bg-border/50'
            )}
          >
            {r.label}
          </button>
        ))}

        {/* Separator */}
        <div className="w-px h-4 bg-border mx-1 flex-shrink-0" />

        {/* Chart type dropdown */}
        <ToolbarDropdown
          label={chartType === 'candles' ? t('candles') : chartType === 'line' ? t('line') : t('area')}
          icon={chartType === 'candles' ? <IconCandle /> : chartType === 'line' ? <IconLine /> : <IconArea />}
          open={chartTypeOpen}
          onToggle={() => { setChartTypeOpen(v => !v); setIndicatorOpen(false) }}
        >
          <DropdownItem active={chartType === 'candles'} onClick={() => handleChartType('candles')}>
            <span className="flex items-center gap-2"><IconCandle /> {t('candles')}</span>
          </DropdownItem>
          <DropdownItem active={chartType === 'line'} onClick={() => handleChartType('line')}>
            <span className="flex items-center gap-2"><IconLine /> {t('line')}</span>
          </DropdownItem>
          <DropdownItem active={chartType === 'area'} onClick={() => handleChartType('area')}>
            <span className="flex items-center gap-2"><IconArea /> {t('area')}</span>
          </DropdownItem>
        </ToolbarDropdown>

        {/* Indicators dropdown */}
        <ToolbarDropdown
          label={t('indicators')}
          icon={<IconIndicator />}
          open={indicatorOpen}
          onToggle={() => { setIndicatorOpen(v => !v); setChartTypeOpen(false) }}
        >
          <DropdownItem active={showMA} onClick={handleToggleMA}>
            <span className="flex items-center gap-2">
              {showMA ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#2962FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg> : <span className="w-3" />}
              {t('ma')}
            </span>
          </DropdownItem>
        </ToolbarDropdown>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right-side buttons */}
        <button
          onClick={handleLogScale}
          className={clsx(
            'px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors',
            logScale ? 'bg-blue/15 text-blue' : 'text-sub hover:text-text hover:bg-border/50'
          )}
          title={t('logScale')}
        >
          {t('logScale')}
        </button>

        <button
          onClick={handleScreenshot}
          className="p-1.5 rounded-md text-sub hover:text-text hover:bg-border/50 transition-colors"
          title={t('screenshot')}
        >
          <IconScreenshot />
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-md text-sub hover:text-text hover:bg-border/50 transition-colors"
          title={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
        >
          {isFullscreen ? <IconExitFullscreen /> : <IconFullscreen />}
        </button>
      </div>

      {/* ── Chart ────────────────────────────────────────────── */}
      {/* Fix 3: MA legend inside the relative chart div so it's always positioned correctly */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="absolute inset-0" />
        {showMA && (
          <div className="absolute top-2 left-3 flex items-center gap-3 text-[11px] z-10 pointer-events-none">
            <span style={{ color: '#f5c542' }}>MA7</span>
            <span style={{ color: '#42a5f5' }}>MA25</span>
            <span style={{ color: '#ab47bc' }}>MA99</span>
          </div>
        )}
      </div>
    </div>
  )
}
