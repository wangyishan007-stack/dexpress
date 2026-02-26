/**
 * tokenEnrichment.ts
 *
 * In-memory token metadata cache.
 * Sources (in order of priority):
 *   1. Hard-coded seed for well-known Base tokens
 *   2. 1inch token list (https://tokens.1inch.io/v1.2/8453), refreshed every 6h
 *
 * Uses a raw HTTP CONNECT tunnel when HTTPS_PROXY / HTTP_PROXY is set,
 * so it works both behind a local proxy (dev) and direct (production).
 */

import http from 'node:http'
import tls  from 'node:tls'

interface TokenMeta {
  logoURI:  string | null
  name:     string | null
  symbol:   string | null
  decimals: number | null
}

// ── Hard-coded seed (always available, no network needed) ──────────────────
const SEED: Record<string, TokenMeta> = {
  '0x4200000000000000000000000000000000000006': {
    logoURI:  'https://tokens-data.1inch.io/images/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2.png',
    name: 'Wrapped Ether', symbol: 'WETH', decimals: 18,
  },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': {
    logoURI:  'https://tokens-data.1inch.io/images/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.png',
    name: 'USD Coin', symbol: 'USDC', decimals: 6,
  },
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2': {
    logoURI:  'https://tokens-data.1inch.io/images/0xdac17f958d2ee523a2206206994597c13d831ec7.png',
    name: 'Tether USD', symbol: 'USDT', decimals: 6,
  },
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb': {
    logoURI:  'https://tokens-data.1inch.io/images/0x6b175474e89094c44da98b954eedeac495271d0f.png',
    name: 'Dai Stablecoin', symbol: 'DAI', decimals: 18,
  },
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': {
    logoURI:  'https://tokens-data.1inch.io/images/0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf.png',
    name: 'Coinbase Wrapped BTC', symbol: 'cbBTC', decimals: 8,
  },
  '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22': {
    logoURI:  'https://tokens-data.1inch.io/images/0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22.png',
    name: 'Coinbase Wrapped Staked ETH', symbol: 'cbETH', decimals: 18,
  },
}

// ── In-memory store ────────────────────────────────────────────────────────
let tokenMap  = new Map<string, TokenMeta>(Object.entries(SEED))
let fetchedAt = 0
const TTL_MS  = 6 * 60 * 60 * 1000   // 6 hours

// ── Proxy-aware HTTPS GET (returns response body text) ────────────────────
function fetchViaProxy(url: string, proxyUrl: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const proxy  = new URL(proxyUrl)
    const timer  = setTimeout(() => { req.destroy(); reject(new Error('CONNECT timeout')) }, timeoutMs)

    const req = http.request({
      host:   proxy.hostname,
      port:   parseInt(proxy.port || '8080'),
      method: 'CONNECT',
      path:   `${target.hostname}:443`,
    })

    req.on('connect', (_res, socket) => {
      if (_res.statusCode !== 200) {
        clearTimeout(timer)
        reject(new Error(`CONNECT ${_res.statusCode}`))
        return
      }
      const tlsSock = tls.connect({ socket, servername: target.hostname }, () => {
        const pathAndQuery = (target.pathname || '/') + (target.search || '')
        tlsSock.write(
          `GET ${pathAndQuery} HTTP/1.1\r\n` +
          `Host: ${target.hostname}\r\n` +
          `User-Agent: dex-screener/1.0\r\n` +
          `Connection: close\r\n\r\n`
        )
      })
      const chunks: Buffer[] = []
      tlsSock.on('data', (d: Buffer) => chunks.push(d))
      tlsSock.on('end', () => {
        clearTimeout(timer)
        const raw  = Buffer.concat(chunks).toString('utf8')
        const idx  = raw.indexOf('\r\n\r\n')
        resolve(idx >= 0 ? raw.slice(idx + 4) : raw)
      })
      tlsSock.on('error', (e: Error) => { clearTimeout(timer); reject(e) })
    })
    req.on('error', (e: Error) => { clearTimeout(timer); reject(e) })
    req.end()
  })
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || ''
  if (proxyUrl) {
    return fetchViaProxy(url, proxyUrl, timeoutMs)
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// ── Refresh from 1inch ─────────────────────────────────────────────────────
async function refresh(): Promise<void> {
  try {
    const text = await fetchText('https://tokens.1inch.io/v1.2/8453')
    const data = JSON.parse(text) as Record<string, {
      logoURI?: string; name?: string; symbol?: string; decimals?: number
    }>

    // Start from seed so hard-coded logos are always present
    const next = new Map<string, TokenMeta>(Object.entries(SEED))
    for (const [addr, info] of Object.entries(data)) {
      next.set(addr.toLowerCase(), {
        logoURI:  info.logoURI  ?? null,
        name:     info.name     ?? null,
        symbol:   info.symbol   ?? null,
        decimals: info.decimals ?? null,
      })
    }
    tokenMap  = next
    fetchedAt = Date.now()
    console.log(`[TokenEnrichment] Loaded ${next.size} tokens from 1inch`)
  } catch (err) {
    console.warn('[TokenEnrichment] 1inch fetch failed:', (err as Error).message, '— using seed only')
  }
}

// ── Public API ─────────────────────────────────────────────────────────────
export interface TokenLike {
  address:  string
  logo_url: string | null
}

/** Fill logo_url when it's null, using the in-memory map. */
export function enrichToken<T extends TokenLike>(token: T): T {
  if (token.logo_url) return token        // already has a logo
  const meta = tokenMap.get(token.address.toLowerCase())
  if (!meta?.logoURI) return token
  return { ...token, logo_url: meta.logoURI }
}

/** Enrich both token0 and token1 on a pair-like object. */
export function enrichPairTokens<T extends { token0: TokenLike; token1: TokenLike }>(pair: T): T {
  const t0 = enrichToken(pair.token0)
  const t1 = enrichToken(pair.token1)
  if (t0 === pair.token0 && t1 === pair.token1) return pair   // nothing changed
  return { ...pair, token0: t0, token1: t1 }
}

/** Call once at server startup. Loads token list and schedules periodic refresh. */
export async function startTokenEnrichment(): Promise<void> {
  await refresh()

  // Re-check every hour; actually refresh only after TTL expires
  const interval = setInterval(async () => {
    if (Date.now() - fetchedAt >= TTL_MS) await refresh()
  }, 60 * 60 * 1000)
  interval.unref()   // don't prevent process exit
}
