'use client'

import { useEffect, useRef, useState, memo, useCallback } from 'react'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from 'lightweight-charts'
import { CHAINS, type ChainSlug } from '@/lib/chains'

interface Props {
  pairAddress: string
  symbol: string
  chain?: ChainSlug
  price?: number
  dex?: string
}

interface OhlcInfo {
  open: number
  high: number
  low: number
  close: number
  change: number
  changePct: number
}

/** Resolution label for display */
const RES_LABEL: Record<string, string> = {
  '1': '1', '5': '5', '15': '15', '60': '60', '240': '240', '1D': 'D',
}

/** Format price with dynamic precision */
function fmtP(price: number, precision: number): string {
  return price.toFixed(precision)
}

const RESOLUTIONS = [
  { label: '1m',  value: '1' },
  { label: '5m',  value: '5' },
  { label: '15m', value: '15' },
  { label: '1h',  value: '60' },
  { label: '4h',  value: '240' },
  { label: '1D',  value: '1D' },
]

const GT_BASE = 'https://api.geckoterminal.com/api/v2'

const GT_TIMEFRAME_MAP: Record<string, { timeframe: string; aggregate: string }> = {
  '1':   { timeframe: 'minute', aggregate: '1' },
  '5':   { timeframe: 'minute', aggregate: '5' },
  '15':  { timeframe: 'minute', aggregate: '15' },
  '60':  { timeframe: 'hour',   aggregate: '1' },
  '240': { timeframe: 'hour',   aggregate: '4' },
  '1D':  { timeframe: 'day',    aggregate: '1' },
}

/** Calculate decimal precision based on price magnitude */
function calcPrecision(price: number): number {
  if (!price || price <= 0) return 8
  if (price >= 1000) return 2
  if (price >= 1) return 4
  const s = price.toFixed(20)
  const match = s.match(/^0\.(0*)/)
  const zeros = match ? match[1].length : 0
  return Math.min(zeros + 4, 16)
}

/** 客户端缓存 — stale-while-revalidate */
const _barCache = new Map<string, { bars: CandlestickData<Time>[]; ts: number }>()
const BAR_CACHE_FRESH = 30_000  // 30s 内直接返回
const BAR_CACHE_STALE = 120_000 // 2min 内先返回旧数据，后台刷新

function parseBars(list: number[][]): CandlestickData<Time>[] {
  const sorted = list
    .map(c => ({ time: c[0] as Time, open: c[1], high: c[2], low: c[3], close: c[4] }))
    .sort((a, b) => (a.time as number) - (b.time as number))
  // 去重：相同时间戳只保留最后一条
  return sorted.filter((bar, i) => i === sorted.length - 1 || bar.time !== sorted[i + 1].time)
}

async function doFetchBars(pool: string, resolution: string, network: string): Promise<CandlestickData<Time>[]> {
  const gt = GT_TIMEFRAME_MAP[resolution] ?? GT_TIMEFRAME_MAP['5']
  const to = Math.floor(Date.now() / 1000)

  const proxyParams = new URLSearchParams({
    network, pool, timeframe: gt.timeframe, aggregate: gt.aggregate,
    before: String(to), limit: '300',
  })
  const proxyUrl = `/api/gt/ohlcv?${proxyParams}`
  const directUrl = `${GT_BASE}/networks/${network}/pools/${pool}/ohlcv/${gt.timeframe}?aggregate=${gt.aggregate}&before_timestamp=${to}&limit=300&currency=usd`

  // 用 AbortController 确保超时时真正取消请求，释放浏览器连接池
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4_000)

  const doFetch = async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { headers, signal: controller.signal })
    if (!res.ok) throw new Error(`${res.status}`)
    const json = await res.json()
    const list = json?.data?.attributes?.ohlcv_list
    if (!Array.isArray(list) || list.length === 0) throw new Error('empty')
    return parseBars(list as number[][])
  }

  try {
    const bars = await Promise.any([
      doFetch(proxyUrl, {}),
      doFetch(directUrl, { Accept: 'application/json;version=20230302' }),
    ])
    clearTimeout(timer)
    controller.abort() // 取消另一个还在跑的请求
    return bars
  } catch {
    clearTimeout(timer)
    throw new Error('all failed')
  }
}

/**
 * fetchBars — stale-while-revalidate 策略:
 * - < 30s: 直接返回缓存
 * - 30s ~ 2min: 先返回旧缓存（立即展示），后台刷新
 * - > 2min 或无缓存: 等待网络请求
 */
async function fetchBars(
  pool: string, resolution: string, network: string,
  onUpdate?: (bars: CandlestickData<Time>[]) => void,
): Promise<CandlestickData<Time>[]> {
  const cacheKey = `${network}:${pool}:${resolution}`
  const cached = _barCache.get(cacheKey)
  const age = cached ? Date.now() - cached.ts : Infinity

  // 新鲜缓存 — 直接返回
  if (cached && age < BAR_CACHE_FRESH) return cached.bars

  // 旧缓存 — 先返回，后台刷新
  if (cached && age < BAR_CACHE_STALE) {
    doFetchBars(pool, resolution, network).then(bars => {
      if (bars.length > 0) {
        _barCache.set(cacheKey, { bars, ts: Date.now() })
        onUpdate?.(bars)
      }
    }).catch(() => {})
    return cached.bars
  }

  // 无缓存 — 等待请求，失败重试一次
  try {
    const bars = await doFetchBars(pool, resolution, network)
    if (bars.length > 0) _barCache.set(cacheKey, { bars, ts: Date.now() })
    return bars
  } catch {
    // 重试一次
    try {
      const bars = await doFetchBars(pool, resolution, network)
      if (bars.length > 0) _barCache.set(cacheKey, { bars, ts: Date.now() })
      return bars
    } catch {
      return cached?.bars ?? []
    }
  }
}

function TVChartInner({ pairAddress, symbol, chain = 'base', price, dex }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const seriesRef    = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const priceLineRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']> | null>(null)
  const barsRef      = useRef<CandlestickData<Time>[]>([])
  const [resolution, setResolution] = useState('5')
  const [loading, setLoading]       = useState(true)
  const [ohlc, setOhlc]             = useState<OhlcInfo | null>(null)
  const network = CHAINS[chain]?.geckoTerminalSlug ?? chain

  /** 把 bars 渲染到图表 + 更新 OHLC */
  const applyBars = useCallback((bars: CandlestickData<Time>[]) => {
    if (!seriesRef.current || bars.length === 0) return
    barsRef.current = bars
    seriesRef.current.setData(bars)
    chartRef.current?.timeScale().fitContent()

    const last = bars[bars.length - 1]
    if (priceLineRef.current) seriesRef.current.removePriceLine(priceLineRef.current)
    priceLineRef.current = seriesRef.current.createPriceLine({
      price: last.close, color: '#2962FF', lineWidth: 1, lineStyle: 2,
      axisLabelVisible: true, title: '',
    })

    const change = last.close - last.open
    const changePct = last.open !== 0 ? (change / last.open) * 100 : 0
    setOhlc({ open: last.open, high: last.high, low: last.low, close: last.close, change, changePct })
  }, [])

  const loadBars = useCallback(async (res: string) => {
    if (!seriesRef.current) return
    setLoading(true)
    const bars = await fetchBars(pairAddress, res, network, applyBars)
    if (!seriesRef.current) return
    applyBars(bars)
    setLoading(false)
  }, [pairAddress, network, applyBars])

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#000000' } as { color: string },
        textColor: '#787b86',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      crosshair: {
        vertLine: { labelBackgroundColor: '#222' },
        horzLine: { labelBackgroundColor: '#222' },
      },
      rightPriceScale: { borderColor: '#2a2e39' },
      timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false },
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight || 400,
    })

    const precision = calcPrecision(price ?? 0)
    const series = chart.addCandlestickSeries({
      upColor:         '#26a69a',
      downColor:       '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#26a69a',
      wickDownColor:   '#ef5350',
      priceFormat: { type: 'price', precision, minMove: 1 / Math.pow(10, precision) },
    })

    chartRef.current  = chart
    seriesRef.current = series

    // Crosshair → OHLC legend
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.has(series)) {
        // Mouse left chart → show last bar
        const bars = barsRef.current
        if (bars.length > 0) {
          const last = bars[bars.length - 1]
          const change = last.close - last.open
          const changePct = last.open !== 0 ? (change / last.open) * 100 : 0
          setOhlc({ open: last.open, high: last.high, low: last.low, close: last.close, change, changePct })
        }
        return
      }
      const bar = param.seriesData.get(series) as CandlestickData<Time>
      if (bar) {
        const change = bar.close - bar.open
        const changePct = bar.open !== 0 ? (change / bar.open) * 100 : 0
        setOhlc({ open: bar.open, high: bar.high, low: bar.low, close: bar.close, change, changePct })
      }
    })

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 400,
        })
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      if (intervalRef.current) clearInterval(intervalRef.current)
      chart.remove()
      chartRef.current   = null
      seriesRef.current  = null
      priceLineRef.current = null
    }
  }, [pairAddress, chain])

  useEffect(() => {
    loadBars(resolution)
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => loadBars(resolution), 15_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [resolution, loadBars])

  const prec = calcPrecision(ohlc?.close ?? price ?? 0)
  const resLabel = RES_LABEL[resolution] || resolution
  const isUp = ohlc ? ohlc.close >= ohlc.open : true

  return (
    <div className="relative w-full h-full flex flex-col" style={{ minHeight: 300 }}>
      {/* Resolution buttons */}
      <div className="flex gap-1 px-2 pt-2 pb-1">
        {RESOLUTIONS.map(r => (
          <button
            key={r.value}
            onClick={() => setResolution(r.value)}
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              resolution === r.value
                ? 'bg-white/10 text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* OHLC legend overlay */}
      <div className="absolute left-2 top-9 z-10 pointer-events-none flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-gray-400 font-medium">{symbol}</span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-500">{resLabel}</span>
          {dex && <>
            <span className="text-gray-500">·</span>
            <span className="text-gray-500">{dex}</span>
          </>}
        </div>
        {ohlc && (
          <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
            <span className="text-gray-500">O</span>
            <span className={isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{fmtP(ohlc.open, prec)}</span>
            <span className="text-gray-500">H</span>
            <span className={isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{fmtP(ohlc.high, prec)}</span>
            <span className="text-gray-500">L</span>
            <span className={isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{fmtP(ohlc.low, prec)}</span>
            <span className="text-gray-500">C</span>
            <span className={isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>{fmtP(ohlc.close, prec)}</span>
            <span className={isUp ? 'text-[#26a69a]' : 'text-[#ef5350]'}>
              {ohlc.change >= 0 ? '+' : ''}{fmtP(ohlc.change, prec)} ({ohlc.changePct >= 0 ? '+' : ''}{ohlc.changePct.toFixed(2)}%)
            </span>
          </div>
        )}
      </div>

      <div ref={containerRef} className="flex-1 w-full" />
      {loading && (
        <div className="absolute inset-0 top-8 flex items-center justify-center bg-black/60 pointer-events-none">
          <div className="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

export const TVChart = memo(TVChartInner)
