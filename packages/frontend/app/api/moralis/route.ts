import { NextRequest, NextResponse } from 'next/server'
import { createClient, RedisClientType } from 'redis'

const MORALIS_BASE = 'https://deep-index.moralis.io/api/v2.2'
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || ''
const REDIS_TTL_SEC = 3_600 // 1 hour — Moralis quota is precious

// ─── Redis cache ─────────────────────────────────────────────
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
  } catch { return null }
}

// ─── In-memory fallback ───────────────────────────────────────
const memCache = new Map<string, { data: unknown; ts: number }>()
const MEM_TTL = 1_200_000 // 20min

async function cacheGet(key: string): Promise<string | null> {
  const rc = getRedisClient()
  if (rc && redisReady) {
    try { return await rc.get(key) } catch { /* fall through */ }
  }
  const m = memCache.get(key)
  if (m && Date.now() - m.ts < MEM_TTL) return JSON.stringify(m.data)
  return null
}

async function cacheSet(key: string, value: string): Promise<void> {
  const rc = getRedisClient()
  if (rc && redisReady) {
    try { await rc.set(key, value, { EX: REDIS_TTL_SEC }); return } catch { /* fall through */ }
  }
  try { memCache.set(key, { data: JSON.parse(value), ts: Date.now() }) } catch { /* ignore */ }
}

/** Proxy-aware fetch */
async function proxyFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const proxyUrl = process.env.PROXY_URL
  if (proxyUrl) {
    const { ProxyAgent, fetch: uFetch } = await import('undici')
    const agent = new ProxyAgent(proxyUrl)
    return await uFetch(url, {
      dispatcher: agent,
      headers,
      signal: AbortSignal.timeout(15_000),
    }) as unknown as Response
  }
  return await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
}

export async function GET(req: NextRequest) {
  if (!MORALIS_API_KEY) {
    return NextResponse.json({ error: 'Moralis API key not configured' }, { status: 500 })
  }

  const { searchParams } = req.nextUrl
  const type    = searchParams.get('type')
  const address = searchParams.get('address')
  const chain   = searchParams.get('chain') || 'base'

  if (!address || !type) {
    return NextResponse.json({ error: 'Missing required params: type, address' }, { status: 400 })
  }

  let upstreamUrl = ''
  if (type === 'traders') {
    upstreamUrl = `${MORALIS_BASE}/erc20/${address}/top-gainers?chain=${chain}`
  } else if (type === 'holders') {
    const limit = searchParams.get('limit') ?? '50'
    upstreamUrl = `${MORALIS_BASE}/erc20/${address}/owners?chain=${chain}&order=DESC&limit=${limit}`
  } else if (type === 'wallet_stats') {
    upstreamUrl = `${MORALIS_BASE}/wallets/${address}/profitability/summary?chain=${chain}`
  } else if (type === 'wallet_transfers') {
    const limit = searchParams.get('limit') ?? '50'
    upstreamUrl = `${MORALIS_BASE}/${address}/erc20/transfers?chain=${chain}&limit=${limit}&order=DESC`
  } else if (type === 'wallet_profitability') {
    upstreamUrl = `${MORALIS_BASE}/wallets/${address}/profitability?chain=${chain}`
  } else if (type === 'wallet_tokens') {
    upstreamUrl = `${MORALIS_BASE}/wallets/${address}/tokens?chain=${chain}&exclude_spam=true`
  } else if (type === 'native_balance') {
    upstreamUrl = `${MORALIS_BASE}/${address}/balance?chain=${chain}`
  } else if (type === 'wallet_swaps') {
    const limit = searchParams.get('limit') ?? '30'
    upstreamUrl = `${MORALIS_BASE}/wallets/${address}/swaps?chain=${chain}&limit=${limit}&order=DESC`
  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  // ── Cache lookup ──────────────────────────────────────────
  const cacheKey = `moralis:${type}:${chain}:${address}`
  const cached = await cacheGet(cacheKey)
  if (cached) {
    return new NextResponse(cached, {
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
    })
  }

  try {
    // Retry once on 429 (rate limit)
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await proxyFetch(upstreamUrl, { 'x-api-key': MORALIS_API_KEY })

      if (res.status === 429 && attempt === 0) {
        await new Promise(r => setTimeout(r, 1000))
        continue
      }

      if (!res.ok) {
        return NextResponse.json({ error: 'Moralis API error' }, { status: res.status })
      }

      const data = await res.json()
      const body = JSON.stringify(data)
      await cacheSet(cacheKey, body)
      return new NextResponse(body, {
        headers: { 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
      })
    }
    // Quota exhausted — return empty payload so UI degrades gracefully
    return NextResponse.json({ result: [], quota_exhausted: true }, {
      headers: { 'X-Moralis-Quota': 'exhausted' }
    })
  } catch (e) {
    console.error('[/api/moralis] upstream error:', e)
    return NextResponse.json({ error: 'Request failed' }, { status: 502 })
  }
}
