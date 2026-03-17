import { NextRequest, NextResponse } from 'next/server'

const MORALIS_BASE = 'https://deep-index.moralis.io/api/v2.2'
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || ''
const GT_BASE = 'https://api.geckoterminal.com/api/v2'

/** Race proxy vs direct — whoever responds first wins.
 *  Handles: proxy working, proxy broken, direct blocked (GFW), all combinations. */
async function proxyFetch(url: string, opts: { headers?: Record<string, string>; timeout?: number } = {}): Promise<Response> {
  const proxyUrl = process.env.PROXY_URL
  const timeout = opts.timeout ?? 10_000

  if (!proxyUrl) {
    return fetch(url, { headers: opts.headers, signal: AbortSignal.timeout(timeout) })
  }

  // Race: proxy vs direct — first OK response wins
  const directPromise = fetch(url, {
    headers: opts.headers,
    signal: AbortSignal.timeout(timeout),
  }).then(res => {
    if (!res.ok) throw new Error(`direct ${res.status}`)
    return res
  })

  const proxyPromise = (async () => {
    const { ProxyAgent, fetch: uFetch } = await import('undici')
    const agent = new ProxyAgent(proxyUrl)
    return await uFetch(url, {
      dispatcher: agent,
      headers: opts.headers,
      signal: AbortSignal.timeout(timeout),
    }) as unknown as Response
  })()

  try {
    return await Promise.any([directPromise, proxyPromise])
  } catch {
    // Both failed — return proxy result (even if non-OK, for 429 retry handling)
    return proxyPromise.catch(() => {
      throw new Error(`Both direct and proxy failed for ${url}`)
    })
  }
}

/** Chain config — Base uses Moralis, BSC/Solana use GT trades aggregation */
const CHAIN_MAP: Record<string, { gt: string; moralis: string; supported: boolean; source: 'moralis' | 'gt_trades' }> = {
  base:   { gt: 'base',   moralis: 'base',   supported: true,  source: 'moralis' },
  bsc:    { gt: 'bsc',    moralis: 'bsc',    supported: true,  source: 'gt_trades' },
  solana: { gt: 'solana', moralis: 'solana', supported: true,  source: 'gt_trades' },
}

/** Build GT URLs — trending for diversity, volume for larger trades */
function buildGtUrls(network: string, _period: string): string[] {
  const base = `${GT_BASE}/networks/${network}`
  return [
    `${base}/trending_pools?page=1`,
    `${base}/pools?sort=h24_volume_usd_desc&page=1`,
    `${base}/pools?sort=h24_volume_usd_desc&page=2`,
  ]
}

export interface SmartWallet {
  address: string
  realized_profit_usd: number
  realized_profit_percentage: number
  count_of_trades: number
  count_of_buys: number   // win token count (tokens with profit)
  count_of_sells: number  // loss token count (tokens with loss)
  win_rate: number        // win% = wins / (wins + losses) * 100
  total_usd_invested: string
  total_sold_usd: string
  token_address: string
  token_symbol: string
  native_balance_wei: string
}

/* ── In-memory cache ─────────────────────────────────── */
const _cache = new Map<string, { data: SmartWallet[]; ts: number }>()
const CACHE_TTL = 3_600_000 // 1 hour — fresh data window
const STALE_TTL = 24 * 3_600_000 // 24 hours — serve stale if fresh fetch fails

/** Parse token address from GT pool relationships */
function extractBaseTokenAddress(pool: any): string | null {
  try {
    const id = pool?.relationships?.base_token?.data?.id
    if (!id) return null
    const parts = id.split('_')
    return parts.length >= 2 ? parts.slice(1).join('_') : null
  } catch { return null }
}

/** Parse pool name like "MEME / WETH" → "MEME" */
function parseBaseSymbol(name: string): string {
  const parts = name.split('/')
  return (parts[0] || '').trim() || 'Unknown'
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Fetch GT URL with retry on 429 */
async function fetchGtWithRetry(url: string, retries = 1): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(1500)
    try {
      const res = await proxyFetch(url, { timeout: 8_000 })
      if (res.ok || res.status !== 429) return res
      console.warn(`[smart-money] GT 429 on attempt ${attempt + 1}`)
    } catch (e) {
      if (attempt === retries) throw e
    }
  }
  return new Response(JSON.stringify({}), { status: 429 })
}

/** Fetch GT URLs sequentially with delay to respect 30 req/min rate limit */
async function fetchGtSequential<T>(
  items: T[],
  fn: (item: T) => Promise<any[]>,
  delayMs = 2_200, // ~27 req/min, safely under 30
): Promise<any[]> {
  const results: any[] = []
  for (let i = 0; i < items.length; i++) {
    if (i > 0) await sleep(delayMs)
    try {
      const r = await fn(items[i])
      results.push(...r)
    } catch { /* skip failed item */ }
  }
  return results
}

/** Fetch a GT pool list and extract pool data */
async function fetchGtPools(url: string): Promise<any[]> {
  try {
    const res = await fetchGtWithRetry(url)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.data) ? data.data : []
  } catch { return [] }
}

/** Common infrastructure / quote tokens — skip for top-gainer queries */
const SKIP_TOKENS = new Set([
  '0x4200000000000000000000000000000000000006', // WETH (Base)
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC (Base)
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI (Base)
  '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', // cbBTC (Base)
  '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', // cbETH (Base)
  '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', // WBNB (BSC)
  '0x55d398326f99059ff775485246999027b3197955', // USDT (BSC)
  '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', // USDC (BSC)
  '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD (BSC)
  'So11111111111111111111111111111111111111112',  // Wrapped SOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC (Solana)
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT (Solana)
].map(a => a.toLowerCase()))

/** Hardcoded popular tokens — last-resort fallback when GT is unreachable */
const FALLBACK_TOKENS: Record<string, { address: string; symbol: string }[]> = {
  base: [
    { address: '0x532f27101965dd16442E59d40670FaF5eBB142E4', symbol: 'BRETT' },
    { address: '0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed', symbol: 'DEGEN' },
    { address: '0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4', symbol: 'TOSHI' },
    { address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', symbol: 'VIRTUAL' },
    { address: '0xBC45647eA894030a4E9801Ec03479739FA2485F0', symbol: 'AERO' },
    { address: '0x22aF33FE49fD1Fa80c7149773dDe5A6C3C8DD480', symbol: 'MORPHO' },
    { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO' },
    { address: '0xfA980cEd6895AC314E7dE34Ef1bFAE90a5AdD21b', symbol: 'PRIME' },
  ],
  bsc: [
    { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'ETH' },
    { address: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c', symbol: 'BTCB' },
    { address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'CAKE' },
    { address: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE', symbol: 'XRP' },
    { address: '0xBf5140A22578168FD562DCcF235E5D43A02ce9B1', symbol: 'UNI' },
  ],
  solana: [
    { address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', symbol: 'JUP' },
    { address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK' },
    { address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', symbol: 'WIF' },
    { address: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', symbol: 'POPCAT' },
    { address: 'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', symbol: 'MEW' },
  ],
}

/** Deduplicate tokens by address, skip infrastructure tokens */
function dedupeTokens(pools: any[]): { address: string; symbol: string }[] {
  const seen = new Set<string>()
  const tokens: { address: string; symbol: string }[] = []
  for (const pool of pools) {
    const addr = extractBaseTokenAddress(pool)
    if (!addr) continue
    const key = addr.toLowerCase()
    if (seen.has(key) || SKIP_TOKENS.has(key)) continue
    seen.add(key)
    tokens.push({ address: addr, symbol: parseBaseSymbol(pool?.attributes?.name || '') })
  }
  return tokens
}

/**
 * Estimate buys/sells from trade count.
 * Moralis top-gainers only gives total count, not split.
 * A trader must buy before selling, so counts are roughly balanced.
 * Profitable traders often sell in multiple lots → slightly more sells.
 */
function estimateBuySell(trades: number): { buys: number; sells: number } {
  if (trades <= 0) return { buys: 0, sells: 0 }
  if (trades === 1) return { buys: 1, sells: 0 }
  // ~45% buys, ~55% sells (profitable traders tend to DCA out)
  const buys = Math.max(1, Math.round(trades * 0.45))
  const sells = Math.max(1, trades - buys)
  return { buys, sells }
}

/* ═══════════════════════════════════════════════════════
   Path A: Moralis top-gainers (Base chain only)
   ═══════════════════════════════════════════════════════ */

async function fetchViaMoralis(
  chain: string,
  chainInfo: typeof CHAIN_MAP[string],
  period: string,
  tokensParam: string,
): Promise<SmartWallet[]> {
  if (!MORALIS_API_KEY) return []

  const seen = new Set<string>()
  const tokensToQuery: { address: string; symbol: string }[] = []

  // 1) Start with fallback + user tokens immediately (no network wait)
  for (const t of (FALLBACK_TOKENS[chain] ?? [])) {
    const key = t.address.toLowerCase()
    if (!seen.has(key)) { seen.add(key); tokensToQuery.push(t) }
  }
  if (tokensParam) {
    for (const pair of tokensParam.split(',')) {
      if (tokensToQuery.length >= 15) break
      const [address, symbol] = pair.split(':')
      if (!address) continue
      const key = address.toLowerCase()
      if (seen.has(key) || SKIP_TOKENS.has(key)) continue
      seen.add(key)
      tokensToQuery.push({ address, symbol: symbol || 'Unknown' })
    }
  }

  // 2) GT discovery in background (5s timeout) — merge results if fast enough
  const gtPromise = (async () => {
    try {
      const gtUrls = buildGtUrls(chainInfo.gt, period)
      const allPools = await fetchGtSequential(gtUrls, (url) => fetchGtPools(url))
      return dedupeTokens(allPools).slice(0, 10)
    } catch { return [] }
  })()
  const gtTokens = await Promise.race([
    gtPromise,
    sleep(5_000).then(() => [] as { address: string; symbol: string }[]),
  ])
  for (const t of gtTokens) {
    const key = t.address.toLowerCase()
    if (!seen.has(key)) { seen.add(key); tokensToQuery.push(t) }
  }

  // 4) Query Moralis top-gainers for each token
  const allTraders: any[] = []
  const BATCH_SIZE = 5
  for (let i = 0; i < tokensToQuery.length; i += BATCH_SIZE) {
    const batch = tokensToQuery.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (token) => {
        const url = `${MORALIS_BASE}/erc20/${token.address}/top-gainers?chain=${chainInfo.moralis}`
        try {
          const res = await proxyFetch(url, {
            headers: { 'x-api-key': MORALIS_API_KEY },
          })
          if (!res.ok) return []
          const data = await res.json()
          const traders: any[] = Array.isArray(data?.result) ? data.result : []
          return traders.map((t: any) => ({
            ...t,
            _token_address: token.address,
            _token_symbol: token.symbol,
          }))
        } catch { return [] }
      })
    )
    for (const r of results) {
      if (r.status === 'fulfilled') allTraders.push(...r.value)
    }
  }

  const MAX_PNL_USD = 10_000_000
  const MAX_PCT = 100_000
  const MAX_VOL = 100_000_000

  const walletMap = new Map<string, SmartWallet>()
  for (const t of allTraders) {
    const addr = (t.address || '').toLowerCase()
    if (!addr) continue
    const pnl = Number(t.realized_profit_usd || 0)
    const pct = Number(t.realized_profit_percentage || 0)
    const invested = Number(t.total_usd_invested || 0)
    const sold = Number(t.total_sold_usd || 0)

    if (!isFinite(pnl) || !isFinite(pct) || !isFinite(invested) || !isFinite(sold)) continue
    if (Math.abs(pnl) > MAX_PNL_USD || Math.abs(pct) > MAX_PCT) continue
    if (invested > MAX_VOL || sold > MAX_VOL) continue
    if (pnl <= 0) continue

    const trades = t.count_of_trades ?? 0
    const { buys, sells } = estimateBuySell(trades)

    const existing = walletMap.get(addr)
    if (!existing || pnl > existing.realized_profit_usd) {
      walletMap.set(addr, {
        address: t.address,
        realized_profit_usd: pnl,
        realized_profit_percentage: pct,
        count_of_trades: trades,
        count_of_buys: buys,
        count_of_sells: sells,
        win_rate: 0, // Moralis doesn't provide win/loss per token
        total_usd_invested: String(invested),
        total_sold_usd: String(sold),
        token_address: t._token_address,
        token_symbol: t._token_symbol,
        native_balance_wei: '0',
      })
    }
  }

  return Array.from(walletMap.values())
    .sort((a, b) => b.realized_profit_usd - a.realized_profit_usd)
    .slice(0, 100)
}

/* ═══════════════════════════════════════════════════════
   Path B: GeckoTerminal trades aggregation (BSC, Solana)
   ═══════════════════════════════════════════════════════ */

interface PoolTradeInfo {
  poolAddress: string
  tokenAddress: string
  tokenSymbol: string
}

/** Extract pool addresses + token info from GT pool data */
function extractPoolInfos(pools: any[], limit: number): PoolTradeInfo[] {
  const seenTokens = new Set<string>()
  const result: PoolTradeInfo[] = []
  for (const pool of pools) {
    if (result.length >= limit) break
    const poolAddr = pool?.attributes?.address
    const tokenAddr = extractBaseTokenAddress(pool)
    if (!poolAddr || !tokenAddr) continue
    const tokenKey = tokenAddr.toLowerCase()
    if (seenTokens.has(tokenKey) || SKIP_TOKENS.has(tokenKey)) continue
    seenTokens.add(tokenKey)
    result.push({
      poolAddress: poolAddr,
      tokenAddress: tokenAddr,
      tokenSymbol: parseBaseSymbol(pool?.attributes?.name || ''),
    })
  }
  return result
}

/** Fetch recent trades for a single GT pool */
async function fetchGtPoolTrades(network: string, poolAddress: string): Promise<any[]> {
  try {
    const url = `${GT_BASE}/networks/${network}/pools/${poolAddress}/trades`
    const res = await fetchGtWithRetry(url)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.data) ? data.data : []
  } catch { return [] }
}

/** Aggregate GT trades into SmartWallet leaderboard */
async function fetchViaGtTrades(
  chain: string,
  chainInfo: typeof CHAIN_MAP[string],
  period: string,
): Promise<SmartWallet[]> {
  const network = chainInfo.gt

  // 1) Discover pools via GT — sequential to respect 30 req/min limit
  const gtUrls = buildGtUrls(network, period)
  const allPools = await fetchGtSequential(gtUrls, (url) => fetchGtPools(url))

  // 2) Extract unique pools (max 5 — balance between coverage and rate limits)
  let poolInfos = extractPoolInfos(allPools, 5)

  if (poolInfos.length === 0) {
    console.warn(`[smart-money] GT pool discovery returned 0 for ${chain}`)
    return []
  }

  // 3) Fetch trades — sequential to respect 30 req/min rate limit
  const allTradeEntries: { attr: any; pool: PoolTradeInfo }[] = []
  const tradeResults = await fetchGtSequential(
    poolInfos,
    async (pool) => {
      const trades = await fetchGtPoolTrades(network, pool.poolAddress)
      return trades.map(t => ({ attr: t.attributes || t, pool }))
    },
  )
  allTradeEntries.push(...tradeResults)

  // 4) Aggregate by wallet address
  const walletMap = new Map<string, {
    address: string
    bought_usd: number
    sold_usd: number
    buy_count: number
    sell_count: number
    tokens: Map<string, { symbol: string; bought: number; sold: number }>
  }>()

  // Filter trades by period
  const periodMs: Record<string, number> = { '1d': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000 }
  const cutoff = Date.now() - (periodMs[period] ?? 7 * 86_400_000)

  for (const { attr, pool } of allTradeEntries) {
    const wallet = attr.tx_from_address
    if (!wallet) continue

    // Time filter
    const ts = attr.block_timestamp ? new Date(attr.block_timestamp).getTime() : 0
    if (ts && ts < cutoff) continue

    const vol = Number(attr.volume_in_usd) || 0
    if (vol <= 0) continue

    const w = walletMap.get(wallet) || {
      address: wallet,
      bought_usd: 0,
      sold_usd: 0,
      buy_count: 0,
      sell_count: 0,
      tokens: new Map(),
    }

    if (attr.kind === 'buy') {
      w.bought_usd += vol
      w.buy_count += 1
    } else if (attr.kind === 'sell') {
      w.sold_usd += vol
      w.sell_count += 1
    }

    // Track per-token
    const tk = w.tokens.get(pool.tokenAddress) || { symbol: pool.tokenSymbol, bought: 0, sold: 0 }
    if (attr.kind === 'buy') tk.bought += vol
    else tk.sold += vol
    w.tokens.set(pool.tokenAddress, tk)

    walletMap.set(wallet, w)
  }

  // 5) Convert to SmartWallet[], filter profitable wallets
  const MAX_PNL_USD = 10_000_000
  const MAX_VOL = 100_000_000

  const wallets: SmartWallet[] = []
  for (const w of walletMap.values()) {
    const pnl = w.sold_usd - w.bought_usd
    if (pnl <= 0) continue // only profitable wallets (realized more than invested)

    const totalVol = w.bought_usd + w.sold_usd
    if (Math.abs(pnl) > MAX_PNL_USD || totalVol > MAX_VOL) continue
    if (w.buy_count + w.sell_count < 2) continue // at least 2 trades

    // Find best-performing token for this wallet
    let bestTokenAddr = ''
    let bestTokenSym = ''
    let bestPnl = -Infinity
    for (const [addr, tk] of w.tokens) {
      const tkPnl = tk.sold - tk.bought
      if (tkPnl > bestPnl) {
        bestPnl = tkPnl
        bestTokenAddr = addr
        bestTokenSym = tk.symbol
      }
    }

    // If wallet only sold (bought before our trade window), we know they profited
    // but can't calculate exact %. Use conservative 100% estimate.
    const pctEstimate = w.bought_usd > 0 ? (pnl / w.bought_usd) * 100 : 100

    // Count win/loss tokens
    let winTokens = 0, lossTokens = 0
    for (const [, tk] of w.tokens) {
      const tkPnl = tk.sold - tk.bought
      if (tk.bought > 0 && tk.sold > 0) {
        if (tkPnl > 0) winTokens++
        else if (tkPnl < 0) lossTokens++
      }
    }
    const totalTokens = winTokens + lossTokens

    wallets.push({
      address: w.address,
      realized_profit_usd: pnl,
      realized_profit_percentage: pctEstimate,
      count_of_trades: w.buy_count + w.sell_count,
      count_of_buys: winTokens,
      count_of_sells: lossTokens,
      win_rate: totalTokens > 0 ? Math.round((winTokens / totalTokens) * 100) : 0,
      total_usd_invested: String(w.bought_usd),
      total_sold_usd: String(w.sold_usd),
      token_address: bestTokenAddr,
      token_symbol: bestTokenSym,
      native_balance_wei: '0',
    })
  }

  return wallets
    .sort((a, b) => b.realized_profit_usd - a.realized_profit_usd)
    .slice(0, 100)
}

/** Background cache refresh for GT trades (runs without blocking the response) */
const _refreshing = new Set<string>()
async function refreshGtCache(chain: string, chainInfo: typeof CHAIN_MAP[string], period: string, cacheKey: string) {
  if (_refreshing.has(cacheKey)) return // already refreshing
  _refreshing.add(cacheKey)
  try {
    const wallets = await fetchViaGtTrades(chain, chainInfo, period)
    if (wallets.length > 0) {
      _cache.set(cacheKey, { data: wallets, ts: Date.now() })
    }
  } finally {
    _refreshing.delete(cacheKey)
  }
}

/* ═══════════════════════════════════════════════════════
   Route handler
   ═══════════════════════════════════════════════════════ */

export async function GET(req: NextRequest) {
  const chain = req.nextUrl.searchParams.get('chain') || 'base'
  const period = req.nextUrl.searchParams.get('period') || '7d'
  const tokensParam = req.nextUrl.searchParams.get('tokens') || ''
  const chainInfo = CHAIN_MAP[chain]

  if (!chainInfo) {
    return NextResponse.json({ error: `Unsupported chain: ${chain}` }, { status: 400 })
  }

  if (!chainInfo.supported) {
    return NextResponse.json({ wallets: [], chain, unsupported: true })
  }

  // ── Try self-hosted backend first (wallet_pnl table) ──────
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL
  if (backendUrl) {
    try {
      const res = await fetch(
        `${backendUrl}/api/smart-money?chain=${chain}&period=${period}&limit=100`,
        { signal: AbortSignal.timeout(8_000) }
      )
      if (res.ok) {
        const data = await res.json() as { wallets: SmartWallet[]; chain: string }
        if (Array.isArray(data.wallets) && data.wallets.length > 0) {
          return NextResponse.json({ wallets: data.wallets, chain, source: 'indexer' })
        }
      }
    } catch {
      // Backend not available — fall through to Moralis/GT
    }
  }

  // Check cache
  const cacheKey = `${chain}-${period}`
  const cached = _cache.get(cacheKey)
  const hasFreshCache = cached && cached.data.length > 0 && Date.now() - cached.ts < CACHE_TTL
  const hasStaleCache = cached && cached.data.length > 0 && Date.now() - cached.ts < STALE_TTL

  // Fresh cache → return immediately
  if (hasFreshCache) {
    return NextResponse.json({ wallets: cached!.data, chain })
  }

  // Stale cache → return immediately + background refresh
  if (hasStaleCache) {
    if (chainInfo.source === 'moralis') {
      // Moralis is fast enough to refresh in background
      fetchViaMoralis(chain, chainInfo, period, tokensParam)
        .then(w => { if (w.length > 0) _cache.set(cacheKey, { data: w, ts: Date.now() }) })
        .catch(() => {})
    } else {
      refreshGtCache(chain, chainInfo, period, cacheKey).catch(() => {})
    }
    return NextResponse.json({ wallets: cached!.data, chain, stale: true })
  }

  // No cache at all → must fetch fresh
  try {
    let wallets: SmartWallet[]

    if (chainInfo.source === 'moralis') {
      wallets = await fetchViaMoralis(chain, chainInfo, period, tokensParam)
    } else {
      wallets = await fetchViaGtTrades(chain, chainInfo, period)
    }

    if (wallets.length > 0) {
      _cache.set(cacheKey, { data: wallets, ts: Date.now() })
      return NextResponse.json({ wallets, chain })
    }

    return NextResponse.json({ wallets: [], chain })
  } catch (e) {
    console.error('[/api/smart-money] error:', e)
    return NextResponse.json({ wallets: [], chain, error: 'Failed to fetch data' })
  }
}
