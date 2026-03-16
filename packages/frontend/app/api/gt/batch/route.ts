import { NextRequest, NextResponse } from 'next/server'
import { createClient, RedisClientType } from 'redis'

const ALLOWED_HOST = 'api.geckoterminal.com'
const GT_HEADERS = { Accept: 'application/json;version=20230302' }

// ─── Standard Redis cache ────────────────────────────────────
const REDIS_TTL_SEC = 55

let redisClient: RedisClientType | null = null
let redisReady = false

function getRedisClient(): RedisClientType | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (redisClient) return redisClient
  try {
    const client = createClient({
      url,
      socket: {
        connectTimeout: 3_000,
        reconnectStrategy: (retries: number) => {
          if (retries > 3) return false
          return Math.min(retries * 500, 2_000)
        },
      },
    }) as RedisClientType
    client.on('ready', () => { redisReady = true })
    client.on('error', () => { redisReady = false })
    client.connect().catch(() => { redisReady = false })
    redisClient = client
    return client
  } catch {
    return null
  }
}

async function redisGet(key: string): Promise<unknown | null> {
  const client = getRedisClient()
  if (!client || !redisReady) return null
  try {
    const val = await Promise.race([
      client.get(key),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1_500)),
    ])
    return val ? JSON.parse(val as string) : null
  } catch { return null }
}

async function redisSet(key: string, value: unknown): Promise<void> {
  const client = getRedisClient()
  if (!client || !redisReady) return
  try {
    await Promise.race([
      client.set(key, JSON.stringify(value), { EX: REDIS_TTL_SEC }),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1_500)),
    ])
  } catch {}
}

const DELAY_MS = 400
const PROXY_CONCURRENCY = 3

// ─── Server-side per-URL in-memory cache ─────────────────────
const urlCache = new Map<string, { data: unknown; ts: number }>()

function setLocalCache(url: string, data: unknown) {
  urlCache.set(url, { data, ts: Date.now() })
}
const FRESH_TTL    = 45_000
const FALLBACK_TTL = 300_000

function getCached(url: string): unknown | null {
  const entry = urlCache.get(url)
  if (entry && Date.now() - entry.ts < FRESH_TTL) return entry.data
  return null
}

function getFallback(url: string): unknown | null {
  const entry = urlCache.get(url)
  if (entry && Date.now() - entry.ts < FALLBACK_TTL) return entry.data
  return null
}

function setCache(url: string, data: unknown) {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    if (d.status && (d.status as Record<string, unknown>)?.error_code) return
    if (Array.isArray(d.data) && (d.data as unknown[]).length === 0) return
  }
  urlCache.set(url, { data, ts: Date.now() })
  redisSet('gt:' + url, data).catch(() => {})
}

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

  const allFresh = urls.every(url => getCached(url) !== null)
  if (allFresh) {
    return NextResponse.json({ results: urls.map(url => ({ status: 200, data: getCached(url)! })) })
  }

  if (pendingBatch) {
    await pendingBatch
    const allCached = urls.every(url => (getCached(url) ?? getFallback(url)) !== null)
    if (allCached) {
      return NextResponse.json({ results: urls.map(url => ({ status: 200, data: (getCached(url) ?? getFallback(url))! })) })
    }
  }

  const promise = fetchBatch(urls)
  pendingBatch = promise
  try {
    return await promise
  } finally {
    pendingBatch = null
  }
}

async function fetchOne(url: string, proxyUrl?: string): Promise<{ status: number; data: unknown }> {
  const redisData = await redisGet('gt:' + url)
  if (redisData !== null) {
    setLocalCache(url, redisData)
    return { status: 200, data: redisData }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let res: Response
      if (proxyUrl) {
        const { ProxyAgent, fetch: uFetch } = await import('undici')
        const agent = new ProxyAgent(proxyUrl)
        res = await uFetch(url, {
          dispatcher: agent,
          headers: GT_HEADERS,
          signal: AbortSignal.timeout(4_000),
        }) as unknown as Response
      } else {
        res = await fetch(url, {
          headers: GT_HEADERS,
          signal: AbortSignal.timeout(4_000),
        })
      }

      if (res.status === 429 && attempt < 1) {
        await new Promise(r => setTimeout(r, 500))
        continue
      }

      const data = await res.json()
      if (res.status === 200) setCache(url, data)

      if (res.status !== 200) {
        const fallback = getFallback(url)
        if (fallback) return { status: 200, data: fallback }
      }
      return { status: res.status, data }
    } catch (err: unknown) {
      if (attempt < 1) {
        await new Promise(r => setTimeout(r, 300))
        continue
      }
      const fallback = getFallback(url)
      if (fallback) return { status: 200, data: fallback }
      return { status: 502, data: { error: err instanceof Error ? err.message : 'unknown' } }
    }
  }
  return { status: 502, data: { error: 'unreachable' } }
}

async function fetchBatch(urls: string[]): Promise<NextResponse> {
  const proxyUrl = process.env.PROXY_URL
  const results: { status: number; data: unknown }[] = new Array(urls.length)

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
    for (let start = 0; start < uncachedIndexes.length; start += PROXY_CONCURRENCY) {
      if (start > 0) await new Promise(r => setTimeout(r, DELAY_MS))
      const chunk = uncachedIndexes.slice(start, start + PROXY_CONCURRENCY)
      await Promise.all(chunk.map(i => fetchOne(urls[i], proxyUrl).then(r => { results[i] = r })))
    }
  } else {
    await Promise.all(uncachedIndexes.map(i => fetchOne(urls[i]).then(r => { results[i] = r })))
  }

  return NextResponse.json({ results })
}
