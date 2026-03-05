import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOST = 'api.geckoterminal.com'
const GT_HEADERS = { Accept: 'application/json;version=20230302' }

// ─── Per-URL cache with stale-while-revalidate ─────────────
const urlCache = new Map<string, { body: string; status: number; ts: number }>()
const FRESH_TTL = 30_000    // 30s — return cached instantly
const STALE_TTL = 300_000   // 5min — return stale, refresh in bg

let refreshing = new Set<string>()

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 })
  }

  try {
    const parsed = new URL(url)
    if (parsed.host !== ALLOWED_HOST) {
      return NextResponse.json({ error: 'Disallowed host' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const now = Date.now()
  const cached = urlCache.get(url)

  // Fresh cache — return instantly
  if (cached && now - cached.ts < FRESH_TTL) {
    return new NextResponse(cached.body, {
      status: cached.status,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
    })
  }

  // Stale cache — return immediately, refresh in background
  if (cached && now - cached.ts < STALE_TTL) {
    if (!refreshing.has(url)) {
      refreshing.add(url)
      doFetch(url).finally(() => refreshing.delete(url))
    }
    return new NextResponse(cached.body, {
      status: cached.status,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'STALE' },
    })
  }

  // No cache — fetch and wait
  return doFetch(url)
}

async function doFetch(url: string): Promise<NextResponse> {
  const proxyUrl = process.env.PROXY_URL

  try {
    let body: string
    let status: number

    if (proxyUrl) {
      const { ProxyAgent, fetch: uFetch } = await import('undici')
      const agent = new ProxyAgent(proxyUrl)
      const res = await uFetch(url, {
        dispatcher: agent,
        headers: GT_HEADERS,
        signal: AbortSignal.timeout(15_000),
      })
      body = await res.text()
      status = res.status
    } else {
      const res = await fetch(url, {
        headers: GT_HEADERS,
        signal: AbortSignal.timeout(15_000),
      })
      body = await res.text()
      status = res.status
    }

    // Cache successful responses (and also 429 briefly to avoid hammering)
    if (status === 200) {
      urlCache.set(url, { body, status, ts: Date.now() })
    }

    return new NextResponse(body, {
      status,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    })
  } catch (err: any) {
    console.error('[/api/gt] proxy error:', err.message)
    // If we have stale data, return it on error
    const stale = urlCache.get(url)
    if (stale) {
      return new NextResponse(stale.body, {
        status: stale.status,
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'ERROR-STALE' },
      })
    }
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
