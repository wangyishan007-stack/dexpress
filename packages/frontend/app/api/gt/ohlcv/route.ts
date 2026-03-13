import { NextRequest, NextResponse } from 'next/server'

const GT_BASE = 'https://api.geckoterminal.com/api/v2'
const GT_HEADERS = { Accept: 'application/json;version=20230302' }

// ── Server-side cache ──────────────────────────────────
const cache = new Map<string, { data: unknown; ts: number }>()
const CACHE_TTL = 60_000 // 60s

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const network   = searchParams.get('network')   || 'base'
  const pool      = searchParams.get('pool')
  const timeframe = searchParams.get('timeframe') || 'minute'
  const aggregate = searchParams.get('aggregate') || '5'
  const before    = searchParams.get('before')    || ''
  const limit     = searchParams.get('limit')     || '300'

  if (!pool) return NextResponse.json({ error: 'Missing pool' }, { status: 400 })

  // Round `before` to nearest interval → better cache hit rate
  const intervalSec: Record<string, number> = {
    minute: Number(aggregate) * 60,
    hour:   Number(aggregate) * 3600,
    day:    86400,
  }
  const interval = intervalSec[timeframe] || 300
  const roundedBefore = before ? String(Math.ceil(Number(before) / interval) * interval) : ''

  const cacheKey = `${network}:${pool}:${timeframe}:${aggregate}:${roundedBefore}:${limit}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data)
  }

  const url = `${GT_BASE}/networks/${network}/pools/${pool}/ohlcv/${timeframe}?aggregate=${aggregate}&before_timestamp=${roundedBefore}&limit=${limit}&currency=usd`
  const proxyUrl = process.env.PROXY_URL

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let res: Response
      if (proxyUrl) {
        const { ProxyAgent, fetch: uFetch } = await import('undici')
        const agent = new ProxyAgent(proxyUrl)
        res = await uFetch(url, {
          dispatcher: agent,
          headers: GT_HEADERS,
          signal: AbortSignal.timeout(8_000),
        }) as unknown as Response
      } else {
        res = await fetch(url, {
          headers: GT_HEADERS,
          signal: AbortSignal.timeout(8_000),
        })
      }

      if (res.status === 429 && attempt === 0) {
        await new Promise(r => setTimeout(r, 500))
        continue
      }

      const data = await res.json()
      if (res.ok) cache.set(cacheKey, { data, ts: Date.now() })
      return NextResponse.json(data)
    } catch (err: unknown) {
      if (attempt === 0) continue
      if (cached) return NextResponse.json(cached.data)
      return NextResponse.json({ error: err instanceof Error ? err.message : 'unknown' }, { status: 502 })
    }
  }

  if (cached) return NextResponse.json(cached.data)
  return NextResponse.json({ error: 'Failed' }, { status: 502 })
}
