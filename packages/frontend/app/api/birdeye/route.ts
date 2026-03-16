import { NextRequest, NextResponse } from 'next/server'

const BIRDEYE_BASE = 'https://public-api.birdeye.so'
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || ''
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

/* ── In-memory cache ───────────────────────────────────── */
const memCache = new Map<string, { data: unknown; ts: number }>()
const MEM_TTL = 600_000 // 10min

/* ── Proxy-aware fetch ─────────────────────────────────── */

/** Race proxy vs direct — whoever responds first wins */
async function proxyFetch(url: string, init?: RequestInit & { timeout?: number }): Promise<Response> {
  const proxyUrl = process.env.PROXY_URL
  const timeout = init?.timeout ?? 15_000
  const { timeout: _, ...fetchInit } = init ?? {} as any

  if (!proxyUrl) {
    return fetch(url, { ...fetchInit, signal: AbortSignal.timeout(timeout) })
  }

  const directPromise = fetch(url, {
    ...fetchInit,
    signal: AbortSignal.timeout(timeout),
  }).then(res => {
    if (!res.ok) throw new Error(`direct ${res.status}`)
    return res
  })

  const proxyPromise = (async () => {
    const { ProxyAgent, fetch: uFetch } = await import('undici')
    const agent = new ProxyAgent(proxyUrl)
    return await uFetch(url, {
      ...fetchInit,
      dispatcher: agent,
      signal: AbortSignal.timeout(timeout),
    }) as unknown as Response
  })()

  try {
    return await Promise.any([directPromise, proxyPromise])
  } catch {
    return proxyPromise.catch(() => {
      throw new Error(`Both direct and proxy failed for ${url}`)
    })
  }
}

/* ── Solana RPC helper ─────────────────────────────────── */

async function solanaRpc(method: string, params: any[]): Promise<any> {
  const res = await proxyFetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    timeout: 15_000,
  })
  if (!res.ok) throw new Error(`RPC ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.result
}

/* ── Jupiter token list (cached) ──────────────────────── */

let _jupTokenMap: Map<string, { symbol: string; name: string; logoURI: string }> | null = null
let _jupTokenMapTs = 0
const JUP_TOKEN_TTL = 3_600_000 // 1h

// Extra metadata cache for tokens not in Jupiter strict list (pump.fun etc.)
const _extraTokenMeta = new Map<string, { symbol: string; name: string; logoURI: string; ts: number }>()
const EXTRA_META_TTL = 3_600_000 // 1h

async function getJupTokenMap(): Promise<Map<string, { symbol: string; name: string; logoURI: string }>> {
  if (_jupTokenMap && Date.now() - _jupTokenMapTs < JUP_TOKEN_TTL) return _jupTokenMap
  try {
    const res = await proxyFetch('https://token.jup.ag/strict', { timeout: 10_000 })
    if (!res.ok) return _jupTokenMap ?? new Map()
    const list: any[] = await res.json()
    const map = new Map<string, { symbol: string; name: string; logoURI: string }>()
    for (const t of list) {
      map.set(t.address, { symbol: t.symbol, name: t.name, logoURI: t.logoURI || '' })
    }
    _jupTokenMap = map
    _jupTokenMapTs = Date.now()
    return map
  } catch {
    return _jupTokenMap ?? new Map()
  }
}

/** Resolve token metadata for mints not in Jupiter strict list via Jupiter token API */
async function resolveUnknownTokens(
  mints: string[],
  knownMap: Map<string, { symbol: string; name: string; logoURI: string }>,
): Promise<Map<string, { symbol: string; name: string; logoURI: string }>> {
  const unknown = mints.filter(m => !knownMap.has(m))
  if (unknown.length === 0) return knownMap

  // Check extra cache first
  const stillUnknown: string[] = []
  for (const mint of unknown) {
    const cached = _extraTokenMeta.get(mint)
    if (cached && Date.now() - cached.ts < EXTRA_META_TTL) {
      knownMap.set(mint, { symbol: cached.symbol, name: cached.name, logoURI: cached.logoURI })
    } else {
      stillUnknown.push(mint)
    }
  }

  if (stillUnknown.length === 0) return knownMap

  // Jupiter token API: GET /tokens?ids=mint1,mint2,...
  try {
    const ids = stillUnknown.slice(0, 50).join(',') // limit batch size
    const res = await proxyFetch(`https://tokens.jup.ag/tokens?ids=${ids}`, { timeout: 8_000 })
    if (res.ok) {
      const tokens: any[] = await res.json()
      for (const t of tokens) {
        if (t.address && t.symbol) {
          const meta = { symbol: t.symbol, name: t.name || '', logoURI: t.logoURI || '' }
          knownMap.set(t.address, meta)
          _extraTokenMeta.set(t.address, { ...meta, ts: Date.now() })
        }
      }
    }
  } catch (e: any) {
    console.warn('[birdeye] Jupiter tokens API error:', e?.message)
  }

  return knownMap
}

/* ── Token Price Fetching (GeckoTerminal + global cache) ── */

// Global price cache shared across all endpoints (portfolio, tx, etc.)
const _priceCache = new Map<string, { price: number; ts: number }>()
const PRICE_CACHE_TTL = 300_000 // 5min

/** Fetch GT via proxy (same as proxyFetch — GT is blocked direct behind GFW) */
async function fetchGtDirect(url: string, timeout = 12_000): Promise<Response> {
  return proxyFetch(url, { timeout })
}

async function fetchTokenPrices(mints: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {}
  if (mints.length === 0) return prices

  // Check global cache first
  const uncached: string[] = []
  for (const mint of mints) {
    const cached = _priceCache.get(mint)
    if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL) {
      prices[mint] = cached.price
    } else {
      uncached.push(mint)
    }
  }

  if (uncached.length === 0) return prices

  // Fetch from GeckoTerminal (max 30 per batch, retry on 429)
  for (let i = 0; i < uncached.length; i += 30) {
    const chunk = uncached.slice(i, i + 30)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt))
        const addresses = chunk.join('%2C')
        const res = await fetchGtDirect(
          `https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price/${addresses}`,
        )
        if (res.status === 429) {
          console.warn(`[birdeye] GT price 429, attempt ${attempt + 1}/3`)
          continue
        }
        if (!res.ok) break
        const data = await res.json()
        const attrs = data?.data?.attributes?.token_prices ?? {}
        for (const [addr, price] of Object.entries(attrs)) {
          const p = Number(price) || 0
          if (p > 0) {
            prices[addr] = p
            _priceCache.set(addr, { price: p, ts: Date.now() })
          }
        }
        break // success
      } catch {
        if (attempt === 2) console.warn('[birdeye] GT price fetch failed after 3 attempts')
      }
    }
    // Small delay between batches to respect rate limits
    if (i + 30 < uncached.length) await new Promise(r => setTimeout(r, 1500))
  }
  return prices
}

/* ═══════════════════════════════════════════════════════════
   Solana RPC Fallback — wallet_portfolio
   ═══════════════════════════════════════════════════════════ */

async function getHoldingsViaRpc(wallet: string) {
  // 1) SOL balance + token accounts in parallel
  let solLamports = 0
  let accounts: any[] = []

  const balancePromise = solanaRpc('getBalance', [wallet])
  const tokenPromise = solanaRpc('getTokenAccountsByOwner', [
    wallet,
    { programId: TOKEN_PROGRAM },
    { encoding: 'jsonParsed' },
  ]).catch((e: any) => {
    // Large wallets may exceed RPC scan limit — gracefully degrade
    console.warn('[birdeye/rpc] getTokenAccountsByOwner failed:', e?.message)
    return { value: [] }
  })

  const [balanceResult, tokenAccountsResult] = await Promise.all([balancePromise, tokenPromise])
  solLamports = balanceResult?.value ?? 0
  accounts = tokenAccountsResult?.value ?? []

  // 2) Extract non-zero token balances
  const tokenBalances: { mint: string; uiAmount: number; decimals: number }[] = []
  for (const acc of accounts) {
    const info = acc.account?.data?.parsed?.info
    if (!info) continue
    const amount = Number(info.tokenAmount?.uiAmount ?? 0)
    if (amount <= 0) continue
    tokenBalances.push({ mint: info.mint, uiAmount: amount, decimals: info.tokenAmount?.decimals ?? 0 })
  }

  // 3) Get token metadata from Jupiter (strict + extended lookup for unknown tokens)
  let tokenMap = await getJupTokenMap()
  const allTokenMints = tokenBalances.map(t => t.mint)
  tokenMap = await resolveUnknownTokens(allTokenMints, tokenMap)

  // 4) Get token prices (GeckoTerminal with global cache)
  const allMints = ['So11111111111111111111111111111111111111112', ...tokenBalances.map(t => t.mint)]
  const prices = await fetchTokenPrices(allMints)

  // 5) Build items
  const solPrice = prices['So11111111111111111111111111111111111111112'] ?? 0
  const solAmount = solLamports / 1e9

  const items: any[] = [{
    address: 'So11111111111111111111111111111111111111112',
    symbol: 'SOL',
    name: 'Solana',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    uiAmount: solAmount,
    valueUsd: solAmount * solPrice,
    priceUsd: solPrice,
  }]

  for (const tb of tokenBalances) {
    const meta = tokenMap.get(tb.mint)
    const price = prices[tb.mint] ?? 0
    items.push({
      address: tb.mint,
      symbol: meta?.symbol ?? tb.mint.slice(0, 4) + '...' + tb.mint.slice(-4),
      name: meta?.name ?? '',
      logoURI: meta?.logoURI ?? null,
      uiAmount: tb.uiAmount,
      valueUsd: tb.uiAmount * price,
      priceUsd: price,
    })
  }

  // Sort by USD value descending
  items.sort((a, b) => b.valueUsd - a.valueUsd)

  return { data: { items } }
}

/* ═══════════════════════════════════════════════════════════
   Solana RPC Fallback — wallet_tx (swap detection)
   ═══════════════════════════════════════════════════════════ */

async function getTxHistoryViaRpc(wallet: string, limit: number) {
  // 1) Get recent signatures + Jupiter token map in parallel
  const [signatures, baseTokenMap] = await Promise.all([
    solanaRpc('getSignaturesForAddress', [wallet, { limit }]),
    getJupTokenMap(),
  ])
  // We'll resolve unknown tokens after detecting swaps
  let tokenMap = baseTokenMap
  if (!signatures || signatures.length === 0) return { data: { items: [] } }

  const resolveMeta = (mint: string) => {
    if (mint === 'So11111111111111111111111111111111111111112') return { symbol: 'SOL', name: 'Solana', icon: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' }
    const meta = tokenMap.get(mint)
    return meta ? { symbol: meta.symbol, name: meta.name, icon: meta.logoURI || null } : { symbol: '', name: '', icon: null }
  }

  // 2) Fetch parsed transactions (batch 5 at a time to respect rate limits)
  const items: any[] = []
  const sigs = signatures.slice(0, Math.min(limit, 30))

  for (let i = 0; i < sigs.length; i += 5) {
    const batch = sigs.slice(i, i + 5)
    const txPromises = batch.map(async (sig: any) => {
      try {
        const tx = await solanaRpc('getTransaction', [
          sig.signature,
          { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ])
        return { sig, tx }
      } catch { return { sig, tx: null } }
    })
    const results = await Promise.all(txPromises)

    for (const { sig, tx } of results) {
      if (!tx || sig.err) continue

      // Detect swaps via pre/post token balance diffs
      const swap = detectSwapFromTx(tx, wallet, sig, resolveMeta)
      if (swap) items.push(swap)
    }

    // Small delay between batches to avoid rate limits
    if (i + 5 < sigs.length) await new Promise(r => setTimeout(r, 200))
  }

  // 3) Resolve unknown token metadata + enrich with USD prices
  if (items.length > 0) {
    // Collect all mints from swaps and resolve unknown ones
    const swapMints = new Set<string>()
    for (const item of items) {
      if (item.from?.address) swapMints.add(item.from.address)
      if (item.to?.address) swapMints.add(item.to.address)
    }
    // Resolve unknown token names
    tokenMap = await resolveUnknownTokens([...swapMints], tokenMap)
    // Update swap items with resolved metadata
    for (const item of items) {
      if (item.from?.address && !item.from.symbol) {
        const meta = tokenMap.get(item.from.address)
        if (meta) { item.from.symbol = meta.symbol; item.from.name = meta.name; item.from.icon = meta.logoURI || item.from.icon }
      }
      if (item.to?.address && !item.to.symbol) {
        const meta = tokenMap.get(item.to.address)
        if (meta) { item.to.symbol = meta.symbol; item.to.name = meta.name; item.to.icon = meta.logoURI || item.to.icon }
      }
    }

    const prices = await fetchTokenPrices([...swapMints])
    for (const item of items) {
      if (item.from?.address) {
        const p = prices[item.from.address] ?? 0
        item.from.nearestPrice = p
      }
      if (item.to?.address) {
        const p = prices[item.to.address] ?? 0
        item.to.nearestPrice = p
      }
      // Calculate volumeUSD from the sold side
      const soldPrice = item.from?.nearestPrice ?? 0
      const soldAmount = item.from?.uiAmount ?? 0
      const boughtPrice = item.to?.nearestPrice ?? 0
      const boughtAmount = item.to?.uiAmount ?? 0
      item.volumeUSD = Math.max(soldPrice * soldAmount, boughtPrice * boughtAmount)
    }
  }

  return { data: { items } }
}

function detectSwapFromTx(tx: any, wallet: string, sig: any, resolveMeta?: (mint: string) => { symbol: string; name: string; icon: string | null }): any | null {
  const meta = tx.meta
  if (!meta) return null

  const preBalances = meta.preTokenBalances ?? []
  const postBalances = meta.postTokenBalances ?? []

  // Build balance diff map: mint → { pre, post, diff }
  const balanceMap = new Map<string, { pre: number; post: number; mint: string; decimals: number }>()

  for (const b of preBalances) {
    if (b.owner !== wallet) continue
    balanceMap.set(b.mint, {
      mint: b.mint,
      pre: Number(b.uiTokenAmount?.uiAmount ?? 0),
      post: 0,
      decimals: b.uiTokenAmount?.decimals ?? 0,
    })
  }
  for (const b of postBalances) {
    if (b.owner !== wallet) continue
    const existing = balanceMap.get(b.mint)
    if (existing) {
      existing.post = Number(b.uiTokenAmount?.uiAmount ?? 0)
    } else {
      balanceMap.set(b.mint, {
        mint: b.mint,
        pre: 0,
        post: Number(b.uiTokenAmount?.uiAmount ?? 0),
        decimals: b.uiTokenAmount?.decimals ?? 0,
      })
    }
  }

  // Find tokens that decreased (sold) and increased (bought)
  let sold: { mint: string; amount: number } | null = null
  let bought: { mint: string; amount: number } | null = null

  for (const [, entry] of balanceMap) {
    const diff = entry.post - entry.pre
    if (diff < -0.000001 && (!sold || Math.abs(diff) > sold.amount)) {
      sold = { mint: entry.mint, amount: Math.abs(diff) }
    }
    if (diff > 0.000001 && (!bought || diff > bought.amount)) {
      bought = { mint: entry.mint, amount: diff }
    }
  }

  // Also check SOL balance change
  const accountKeys = tx.transaction?.message?.accountKeys ?? []
  const walletIdx = accountKeys.findIndex((k: any) => (k.pubkey || k) === wallet)
  if (walletIdx >= 0 && meta.preBalances && meta.postBalances) {
    const solDiff = (meta.postBalances[walletIdx] - meta.preBalances[walletIdx]) / 1e9
    // Ignore small SOL diffs (gas fees)
    if (solDiff < -0.01 && !sold) {
      sold = { mint: 'So11111111111111111111111111111111111111112', amount: Math.abs(solDiff) }
    }
    if (solDiff > 0.01 && !bought) {
      bought = { mint: 'So11111111111111111111111111111111111111112', amount: solDiff }
    }
  }

  if (!sold || !bought) return null // Not a swap

  const soldMeta = resolveMeta?.(sold.mint) ?? { symbol: '', name: '', icon: null }
  const boughtMeta = resolveMeta?.(bought.mint) ?? { symbol: '', name: '', icon: null }

  return {
    txType: 'swap',
    txHash: sig.signature,
    blockTime: sig.blockTime ?? 0,
    slot: sig.slot,
    from: {
      address: sold.mint,
      symbol: soldMeta.symbol,
      name: soldMeta.name,
      icon: soldMeta.icon,
      uiAmount: sold.amount,
      nearestPrice: 0,
    },
    to: {
      address: bought.mint,
      symbol: boughtMeta.symbol,
      name: boughtMeta.name,
      icon: boughtMeta.icon,
      uiAmount: bought.amount,
      nearestPrice: 0,
    },
    volumeUSD: 0,
  }
}

/* ═══════════════════════════════════════════════════════════
   Route Handler
   ═══════════════════════════════════════════════════════════ */

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const type = searchParams.get('type')

  if (!type) {
    return NextResponse.json({ error: 'Missing required param: type' }, { status: 400 })
  }

  // Cache lookup
  const cacheKey = `birdeye:${type}:${searchParams.toString()}`
  const cached = memCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < MEM_TTL) {
    return NextResponse.json(cached.data, { headers: { 'X-Cache': 'HIT' } })
  }

  // ── Birdeye path (when API key is available) ────────────
  if (BIRDEYE_API_KEY) {
    return handleBirdeye(type, searchParams, cacheKey)
  }

  // ── Solana RPC fallback (no Birdeye key) ────────────────
  return handleRpcFallback(type, searchParams, cacheKey)
}

/* ── Birdeye handler ──────────────────────────────────── */

async function handleBirdeye(type: string, searchParams: URLSearchParams, cacheKey: string) {
  let upstreamUrl = ''
  const headers: Record<string, string> = {
    'X-API-KEY': BIRDEYE_API_KEY,
    'x-chain': 'solana',
  }

  if (type === 'top_traders') {
    const address = searchParams.get('address')
    if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 })
    const sortBy = searchParams.get('sort_by') || 'PnL'
    const sortType = searchParams.get('sort_type') || 'desc'
    const offset = searchParams.get('offset') || '0'
    const limit = searchParams.get('limit') || '20'
    upstreamUrl = `${BIRDEYE_BASE}/defi/v2/tokens/top_traders?address=${address}&sort_by=${sortBy}&sort_type=${sortType}&offset=${offset}&limit=${limit}`
  } else if (type === 'wallet_portfolio') {
    const wallet = searchParams.get('wallet')
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
    upstreamUrl = `${BIRDEYE_BASE}/v1/wallet/token_list?wallet=${wallet}`
  } else if (type === 'wallet_tx') {
    const wallet = searchParams.get('wallet')
    const limit = searchParams.get('limit') || '30'
    if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
    upstreamUrl = `${BIRDEYE_BASE}/v1/wallet/tx_list?wallet=${wallet}&limit=${limit}`
  } else if (type === 'token_overview') {
    const address = searchParams.get('address')
    if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 })
    upstreamUrl = `${BIRDEYE_BASE}/defi/token_overview?address=${address}`
  } else {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  try {
    const res = await proxyFetch(upstreamUrl, { headers, timeout: 15_000 })
    if (!res.ok) {
      console.error(`[/api/birdeye] ${type} error ${res.status}`)
      return NextResponse.json({ error: 'Birdeye API error' }, { status: res.status })
    }
    const data = await res.json()
    memCache.set(cacheKey, { data, ts: Date.now() })
    return NextResponse.json(data, { headers: { 'X-Cache': 'MISS' } })
  } catch (e) {
    console.error('[/api/birdeye] upstream error:', e)
    return NextResponse.json({ error: 'Request failed' }, { status: 502 })
  }
}

/* ── Solana RPC fallback handler ──────────────────────── */

async function handleRpcFallback(type: string, searchParams: URLSearchParams, cacheKey: string) {
  try {
    let data: any

    if (type === 'wallet_portfolio') {
      const wallet = searchParams.get('wallet')
      if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
      data = await getHoldingsViaRpc(wallet)
    } else if (type === 'wallet_tx') {
      const wallet = searchParams.get('wallet')
      const limit = Number(searchParams.get('limit') || '20')
      if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 })
      data = await getTxHistoryViaRpc(wallet, limit)
    } else if (type === 'top_traders' || type === 'token_overview' || type === 'trending') {
      // Not available without Birdeye — return empty
      data = { data: { items: [] } }
    } else {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    // Only cache if data has meaningful content (avoid caching $0 prices from GT failures)
    const items = data?.data?.items ?? []
    const hasValue = items.some((i: any) => (i.valueUsd ?? 0) > 0 || (i.priceUsd ?? 0) > 0)
    if (hasValue || type !== 'wallet_portfolio') {
      memCache.set(cacheKey, { data, ts: Date.now() })
    }
    return NextResponse.json(data, { headers: { 'X-Cache': 'RPC' } })
  } catch (e: any) {
    console.error(`[/api/birdeye] RPC fallback error (${type}):`, e?.message ?? e, e?.cause?.message ?? '')
    return NextResponse.json({ error: `RPC: ${e?.message || 'request failed'}` }, { status: 502 })
  }
}
