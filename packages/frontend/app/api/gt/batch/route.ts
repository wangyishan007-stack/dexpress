import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOST = 'api.geckoterminal.com'
const GT_HEADERS = { Accept: 'application/json;version=20230302' }
const DELAY_MS = 400            // Delay between concurrent batches (proxy mode)
const PROXY_CONCURRENCY = 3     // Parallel requests even with proxy

// ─── Server-side per-URL cache with stale-while-revalidate ────
const urlCache = new Map<string, { data: any; ts: number }>()
const FRESH_TTL  = 90_000       // 90s — data considered fresh
const STALE_TTL  = 300_000      // 5min — serve stale, revalidate in background

function getCached(url: string): any | null {
  const entry = urlCache.get(url)
  if (entry && Date.now() - entry.ts < FRESH_TTL) return entry.data
  return null
}

function getStale(url: string): any | null {
  const entry = urlCache.get(url)
  if (entry && Date.now() - entry.ts < STALE_TTL) return entry.data
  return null
}

function setCache(url: string, data: any) {
  urlCache.set(url, { data, ts: Date.now() })
}

// Coalesce simultaneous batch requests
let pendingBatch: Promise<NextResponse> | null = null

export async function POST(req: NextRequest) {
  let body: { urls: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { urls } = body
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > 10) {
    return NextResponse.json({ error: 'Need 1-10 urls' }, { status: 400 })
  }

  for (const url of urls) {
    try {
      if (new URL(url).host !== ALLOWED_HOST) {
        return NextResponse.json({ error: 'Disallowed host' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }
  }

  // Check if all URLs are cached (fresh) — return instantly
  const allFresh = urls.every(url => getCached(url) !== null)
  if (allFresh) {
    const results = urls.map(url => ({ status: 200, data: getCached(url)! }))
    return NextResponse.json({ results })
  }

  // Stale-while-revalidate: if we have stale data for ALL urls, return it
  // immediately and trigger background refresh
  const allStale = urls.every(url => getStale(url) !== null)
  if (allStale) {
    const results = urls.map(url => ({ status: 200, data: getStale(url)! }))
    // Fire-and-forget background refresh (works in dev server, best-effort on serverless)
    if (!pendingBatch) {
      const bgPromise = fetchBatch(urls)
      pendingBatch = bgPromise
      bgPromise.finally(() => { pendingBatch = null })
    }
    return NextResponse.json({ results })
  }

  // Coalesce: if another batch is in progress, wait for it
  if (pendingBatch) {
    await pendingBatch
    // After coalesced batch, try cache again (fresh or stale)
    const results = urls.map(url => {
      const cached = getCached(url) ?? getStale(url)
      return cached ? { status: 200, data: cached } : { status: 502, data: { error: 'miss' } }
    })
    return NextResponse.json({ results })
  }

  const promise = fetchBatch(urls)
  pendingBatch = promise
  const response = await promise
  pendingBatch = null
  return response
}

async function fetchOne(url: string, proxyUrl?: string): Promise<{ status: number; data: any }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let res: any
      if (proxyUrl) {
        const { ProxyAgent, fetch: uFetch } = await import('undici')
        const agent = new ProxyAgent(proxyUrl)
        res = await uFetch(url, {
          dispatcher: agent,
          headers: GT_HEADERS,
          signal: AbortSignal.timeout(15_000),
        })
      } else {
        res = await fetch(url, {
          headers: GT_HEADERS,
          signal: AbortSignal.timeout(15_000),
        })
      }

      if (res.status === 429 && attempt < 1) {
        await new Promise(r => setTimeout(r, 2000))
        continue
      }

      const data = await res.json()
      if (res.status === 200) setCache(url, data)
      return { status: res.status, data }
    } catch (err: any) {
      if (attempt < 1) {
        await new Promise(r => setTimeout(r, 1000))
        continue
      }
      return { status: 502, data: { error: err.message } }
    }
  }
  return { status: 502, data: { error: 'unreachable' } }
}

async function fetchBatch(urls: string[]): Promise<NextResponse> {
  const proxyUrl = process.env.PROXY_URL
  const results: { status: number; data: any }[] = new Array(urls.length)

  // Split into cached and uncached
  const uncachedIndexes: number[] = []
  for (let i = 0; i < urls.length; i++) {
    const cached = getCached(urls[i])
    if (cached) {
      results[i] = { status: 200, data: cached }
    } else {
      uncachedIndexes.push(i)
    }
  }

  if (proxyUrl) {
    // With proxy: parallel in small batches to balance speed vs 429 avoidance
    for (let start = 0; start < uncachedIndexes.length; start += PROXY_CONCURRENCY) {
      if (start > 0) await new Promise(r => setTimeout(r, DELAY_MS))
      const chunk = uncachedIndexes.slice(start, start + PROXY_CONCURRENCY)
      const promises = chunk.map(i =>
        fetchOne(urls[i], proxyUrl).then(r => { results[i] = r })
      )
      await Promise.all(promises)
    }
  } else {
    // No proxy (Vercel): fetch all in parallel
    const promises = uncachedIndexes.map(i =>
      fetchOne(urls[i]).then(r => { results[i] = r })
    )
    await Promise.all(promises)
  }

  return NextResponse.json({ results })
}
