'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import {
  createChart,
  ColorType,
  CrosshairMode,
} from 'lightweight-charts'

interface Props {
  pairAddress: string
  symbol: string
}

type Resolution = '1' | '5' | '15' | '60' | '240' | '1D'

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

/* ── Fetch real candles, fallback to mock ───────────────────── */
async function fetchCandles(address: string, resolution: Resolution) {
  if (BASE_URL) {
    const apiRes = RESOLUTION_API_MAP[resolution] || '5m'
    const to = Math.floor(Date.now() / 1000)
    const from = to - 60 * 60 * 24 * 7
    try {
      const data = await fetch(
        `${BASE_URL}/api/pairs/${address}/candles?resolution=${apiRes}&from=${from}&to=${to}`
      ).then((r) => r.json())
      if (Array.isArray(data) && data.length > 0) {
        return data.map((d: any) => ({
          time: d.time as number,
          open: Number(d.open),
          high: Number(d.high),
          low: Number(d.low),
          close: Number(d.close),
          volume: Number(d.volume || 0),
        }))
      }
    } catch {}
  }
  // Fallback: generate mock candles
  return generateMockCandles(address, resolution)
}

/* ── Chart component ───────────────────────────────────────── */
export function TradingViewChart({ pairAddress, symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const candleSeriesRef = useRef<any>(null)
  const volumeSeriesRef = useRef<any>(null)
  const [activeRes, setActiveRes] = useState<Resolution>('5')

  const loadData = useCallback(
    async (res: Resolution) => {
      const bars = await fetchCandles(pairAddress, res)
      if (candleSeriesRef.current && bars.length > 0) {
        candleSeriesRef.current.setData(
          bars.map((b: any) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }))
        )
        if (volumeSeriesRef.current) {
          volumeSeriesRef.current.setData(
            bars.map((b: any) => ({
              time: b.time,
              value: b.volume,
              color: b.close >= b.open ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)',
            }))
          )
        }
        chartRef.current?.timeScale().fitContent()
      }
    },
    [pairAddress]
  )

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#787b86',
        fontSize: 12,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' },
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

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: { type: 'price', minMove: 0.00000001, precision: 8 },
    })

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries

    loadData(activeRes)

    return () => {
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [pairAddress, loadData])

  const handleResolution = (res: Resolution) => {
    setActiveRes(res)
    loadData(res)
  }

  return (
    <div className="flex flex-col w-full h-full">
      {/* Resolution toolbar */}
      <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border flex-shrink-0 bg-[#131722]">
        {RESOLUTIONS.map((r) => (
          <button
            key={r.value}
            onClick={() => handleResolution(r.value)}
            className={
              r.value === activeRes
                ? 'px-2.5 py-1 rounded-md text-[12px] font-medium bg-blue/15 text-blue transition-colors'
                : 'px-2.5 py-1 rounded-md text-[12px] font-medium text-sub hover:text-text hover:bg-border/50 transition-colors'
            }
          >
            {r.label}
          </button>
        ))}
      </div>
      {/* Chart */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  )
}
