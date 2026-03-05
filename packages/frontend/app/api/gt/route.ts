import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOST = 'api.geckoterminal.com'
const GT_HEADERS = { Accept: 'application/json;version=20230302' }

// ─── Per-URL cache ──────────────────────────────────────────
const urlCache = new Map<string, { body: string; status: number; ts: number }>()
const FRESH_TTL    = 30_000   // 30s — return cached instantly
const FALLBACK_TTL = 300_000  // 5min — fallback on fetch failure only

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

  const cached = urlCache.get(url)

  // Fresh cache — return instantly
  if (cached && Date.now() - cached.ts < FRESH_TTL) {
    return new NextResponse(cached.body, {
      status: cached.status,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
    })
  }

  // Not fresh — fetch and wait (stale data used as fallback on failure)
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
        signal: AbortSignal.timeout(8_000),
      })
      body = await res.text()
      status = res.status
    } else {
      const res = await fetch(url, {
        headers: GT_HEADERS,
        signal: AbortSignal.timeout(8_000),
      })
      body = await res.text()
      status = res.status
    }

    if (status === 200) {
      urlCache.set(url, { body, status, ts: Date.now() })
    }

    // On non-200 (e.g. 429), fall back to stale cached data if available
    if (status !== 200) {
      const fallback = urlCache.get(url)
      if (fallback && Date.now() - fallback.ts < FALLBACK_TTL) {
        return new NextResponse(fallback.body, {
          status: fallback.status,
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'FALLBACK' },
        })
      }
    }

    return new NextResponse(body, {
      status,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    })
  } catch (err: any) {
    console.error('[/api/gt] proxy error:', err.message)
    const fallback = urlCache.get(url)
    if (fallback && Date.now() - fallback.ts < FALLBACK_TTL) {
      return new NextResponse(fallback.body, {
        status: fallback.status,
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'ERROR-FALLBACK' },
      })
    }
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
