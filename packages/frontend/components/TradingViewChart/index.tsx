'use client'

import { useEffect, useRef, useCallback } from 'react'
import {
  createChart,
  CandlestickSeries,
  applyVolume,
  ColorType,
  CrosshairMode,
} from '@pipsend/charts'

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

const RESOLUTION_API_MAP: Record<string, string> = {
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '60': '1h',
  '240': '4h',
  '1D': '1d',
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

async function fetchCandles(address: string, resolution: string) {
  const apiRes = RESOLUTION_API_MAP[resolution] || '5m'
  const to = Math.floor(Date.now() / 1000)
  const from = to - 60 * 60 * 24 * 7
  try {
    const data = await fetch(
      `${BASE_URL}/api/pairs/${address}/candles?resolution=${apiRes}&from=${from}&to=${to}`
    ).then((r) => r.json())
    if (!Array.isArray(data) || data.length === 0) return []
    return data.map((d: any) => ({
      time: d.time as number,
      open: Number(d.open),
      high: Number(d.high),
      low: Number(d.low),
      close: Number(d.close),
      volume: Number(d.volume || 0),
    }))
  } catch {
    return []
  }
}

export function TradingViewChart({ pairAddress, symbol }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const seriesRef = useRef<any>(null)
  const resRef = useRef<Resolution>('5')

  const loadData = useCallback(
    async (res: Resolution) => {
      const bars = await fetchCandles(pairAddress, res)
      if (seriesRef.current && bars.length > 0) {
        seriesRef.current.setData(bars)
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
        background: { type: ColorType.Solid, color: '#0a0a0a' },
        textColor: '#666',
        fontSize: 12,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#222',
      },
      timeScale: {
        borderColor: '#222',
        timeVisible: true,
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    })

    // Volume indicator
    try {
      applyVolume(series, chart, {
        colorUp: 'rgba(38,166,154,0.3)',
        colorDown: 'rgba(239,83,80,0.3)',
      })
    } catch {}

    chartRef.current = chart
    seriesRef.current = series

    loadData(resRef.current)

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [pairAddress, loadData])

  const handleResolution = (res: Resolution) => {
    resRef.current = res
    loadData(res)
    // Update active button styling
    const buttons = containerRef.current?.parentElement?.querySelectorAll('[data-res]')
    buttons?.forEach((btn) => {
      const el = btn as HTMLElement
      if (el.dataset.res === res) {
        el.className = 'px-2.5 py-1 rounded-md text-[12px] font-medium bg-blue/15 text-blue transition-colors'
      } else {
        el.className = 'px-2.5 py-1 rounded-md text-[12px] font-medium text-sub hover:text-text hover:bg-border/50 transition-colors'
      }
    })
  }

  return (
    <div className="flex flex-col w-full h-full">
      {/* Resolution toolbar */}
      <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border flex-shrink-0 bg-[#0a0a0a]">
        {RESOLUTIONS.map((r) => (
          <button
            key={r.value}
            data-res={r.value}
            onClick={() => handleResolution(r.value)}
            className={
              r.value === '5'
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
