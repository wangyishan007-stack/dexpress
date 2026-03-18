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

/** Build GT URLs — trending for diversity, volume for larger trades, new pools for fresh tokens */
function buildGtUrls(network: string, _period: string): string[] {
  const base = `${GT_BASE}/networks/${network}`
  return [
    `${base}/trending_pools?page=1`,
    `${base}/trending_pools?page=2`,
    `${base}/pools?sort=h24_volume_usd_desc&page=1`,
    `${base}/pools?sort=h24_volume_usd_desc&page=2`,
    `${base}/new_pools?page=1`,
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
  token_count: number     // number of realized tokens traded
  smart_score: number     // 0-100 composite score (winRate 40% + PnL% 40% + diversity 20%)
  native_balance_wei: string
}

/* ── Redis + in-memory cache ──────────────────────────── */
import { createClient, RedisClientType } from 'redis'

const _cache = new Map<string, { data: SmartWallet[]; ts: number }>()
const CACHE_TTL = 3_600_000 // 1 hour — fresh data window
const STALE_TTL = 24 * 3_600_000 // 24 hours — serve stale if fresh fetch fails
const REDIS_KEY_PREFIX = 'sm:'
const REDIS_TTL_SEC = 7200 // 2 hours in Redis

let _redis: RedisClientType | null = null

function getRedis(): RedisClientType | null {
  const url = process.env.REDIS_URL
  if (!url) return null
  if (_redis) return _redis
  try {
    const client = createClient({
      url,
      socket: {
        connectTimeout: 3_000,
        reconnectStrategy: (retries: number) => retries > 3 ? false : Math.min(retries * 500, 2_000),
      },
    }) as RedisClientType
    client.on('error', () => {})
    client.connect().catch(() => {})
    _redis = client
    return client
  } catch { return null }
}

async function cacheGet(key: string): Promise<{ data: SmartWallet[]; ts: number } | null> {
  // 1. In-memory first
  const mem = _cache.get(key)
  if (mem) return mem
  // 2. Redis fallback (redis client queues commands while connecting)
  const client = getRedis()
  if (!client) return null
  try {
    const val = await Promise.race([
      client.get(REDIS_KEY_PREFIX + key),
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3_000)),
    ])
    if (!val) return null
    const parsed = JSON.parse(val as string) as { data: SmartWallet[]; ts: number }
    _cache.set(key, parsed)
    return parsed
  } catch { return null }
}

async function cacheSet(key: string, data: SmartWallet[]): Promise<void> {
  const entry = { data, ts: Date.now() }
  _cache.set(key, entry)
  const client = getRedis()
  if (!client) return
  try {
    await Promise.race([
      client.set(REDIS_KEY_PREFIX + key, JSON.stringify(entry), { EX: REDIS_TTL_SEC }),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error('timeout')), 3_000)),
    ])
  } catch {}
}

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
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', // USDT (Base)
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
    { address: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', symbol: 'AERO' },
    { address: '0x22aF33FE49fD1Fa80c7149773dDe5A6C3C8DD480', symbol: 'MORPHO' },
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

    const trades = t.count_of_trades ?? 0

    const existing = walletMap.get(addr)
    if (existing) {
      // Aggregate across tokens for same wallet
      existing.count_of_trades += trades
      existing.token_count += 1
      if (pnl > 0) existing.count_of_buys += 1 // win token
      else existing.count_of_sells += 1 // loss token
      if (pnl > (existing as any)._bestPnl) {
        (existing as any)._bestPnl = pnl
        existing.token_address = t._token_address
        existing.token_symbol = t._token_symbol
      }
      existing.realized_profit_usd += pnl
      existing.total_usd_invested = String(Number(existing.total_usd_invested) + invested)
      existing.total_sold_usd = String(Number(existing.total_sold_usd) + sold)
    } else {
      walletMap.set(addr, {
        address: t.address,
        realized_profit_usd: pnl,
        realized_profit_percentage: pct,
        count_of_trades: trades,
        count_of_buys: pnl > 0 ? 1 : 0,
        count_of_sells: pnl > 0 ? 0 : 1,
        win_rate: 0,
        total_usd_invested: String(invested),
        total_sold_usd: String(sold),
        token_address: t._token_address,
        token_symbol: t._token_symbol,
        token_count: 1,
        smart_score: 0,
        native_balance_wei: '0',
        _bestPnl: pnl,
      } as any)
    }
  }

  // Compute win_rate, recalculate pnl%, and smart_score for each wallet
  const result: SmartWallet[] = []
  for (const w of walletMap.values()) {
    const wins = w.count_of_buys
    const losses = w.count_of_sells
    const total = wins + losses
    w.win_rate = total > 0 ? Math.round((wins / total) * 100) : 0
    // Recalculate PnL% from aggregated totals (initial value is only from first token)
    const totalInvested = Number(w.total_usd_invested)
    if (totalInvested > 0) {
      w.realized_profit_percentage = (w.realized_profit_usd / totalInvested) * 100
    }
    // Smart score: winRate 40% + PnL% 40% + diversity 20%
    const wrScore = Math.min(w.win_rate, 100) * 0.4
    const pnlPctClamped = Math.min(Math.max(w.realized_profit_percentage, 0), 500)
    const pnlScore = pnlPctClamped / 500 * 40
    const divScore = Math.min(w.token_count, 20) / 20 * 20
    w.smart_score = Math.round(wrScore + pnlScore + divScore)
    // Clean up internal field
    delete (w as any)._bestPnl
    if (w.realized_profit_usd > 0) result.push(w)
  }

  return result
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

  // 2) Extract unique pools (max 15 — 20 total GT requests safely under 30 req/min)
  let poolInfos = extractPoolInfos(allPools, 15)

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

    const winRate = totalTokens > 0 ? Math.round((winTokens / totalTokens) * 100) : 0
    // Compute smart_score for GT trades path
    const wrScore = Math.min(winRate, 100) * 0.4
    const pnlScore = Math.min(Math.max(pctEstimate, 0), 500) / 500 * 40
    const divScore = Math.min(totalTokens, 20) / 20 * 20
    const smartScore = Math.round(wrScore + pnlScore + divScore)

    wallets.push({
      address: w.address,
      realized_profit_usd: pnl,
      realized_profit_percentage: pctEstimate,
      count_of_trades: w.buy_count + w.sell_count,
      count_of_buys: winTokens,
      count_of_sells: lossTokens,
      win_rate: winRate,
      total_usd_invested: String(w.bought_usd),
      total_sold_usd: String(w.sold_usd),
      token_address: bestTokenAddr,
      token_symbol: bestTokenSym,
      token_count: totalTokens,
      smart_score: smartScore,
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
      await cacheSet(cacheKey, wallets)
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
  // Always fetch indexer data and merge with Moralis/GT for maximum coverage
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL
  let indexerWallets: SmartWallet[] | null = null
  if (backendUrl) {
    try {
      const res = await fetch(
        `${backendUrl}/api/smart-money?chain=${chain}&period=${period}&limit=200&sort=pnl`,
        { signal: AbortSignal.timeout(8_000) }
      )
      if (res.ok) {
        const data = await res.json() as { wallets: SmartWallet[]; chain: string }
        if (Array.isArray(data.wallets) && data.wallets.length > 0) {
          indexerWallets = data.wallets
        }
      }
    } catch {
      // Backend not available — fall through to Moralis/GT
    }
  }

  // ── For gt_trades chains (BSC/Solana): return indexer immediately, refresh GT in background ──
  // GT trades path is slow (~15s sequential) and yields few wallets.
  // Return whatever indexer data we have instantly; GT will enrich the cache for next request.
  const cacheKey = `${chain}-${period}`
  const cached = await cacheGet(cacheKey)
  const hasFreshCache = cached && cached.data.length > 0 && Date.now() - cached.ts < CACHE_TTL
  const hasStaleCache = cached && cached.data.length > 0 && Date.now() - cached.ts < STALE_TTL

  if (chainInfo.source === 'gt_trades') {
    // Merge indexer + any cached GT data
    if (hasFreshCache) {
      let wallets = cached!.data
      if (indexerWallets) wallets = mergeWallets(wallets, indexerWallets)
      return NextResponse.json({ wallets, chain })
    }

    // Have indexer data → return immediately + refresh GT in background
    if (indexerWallets && indexerWallets.length > 0) {
      if (!hasFreshCache) {
        refreshGtCache(chain, chainInfo, period, cacheKey).catch(() => {})
      }
      // Merge with stale GT cache if available
      let wallets = indexerWallets
      if (hasStaleCache) {
        wallets = mergeWallets(cached!.data, indexerWallets)
      }
      return NextResponse.json({ wallets, chain, source: 'indexer' })
    }

    // No indexer data — check stale cache
    if (hasStaleCache) {
      refreshGtCache(chain, chainInfo, period, cacheKey).catch(() => {})
      return NextResponse.json({ wallets: cached!.data, chain, stale: true })
    }

    // No cache, no indexer — must wait for GT (slow but only happens once)
    try {
      const wallets = await fetchViaGtTrades(chain, chainInfo, period)
      if (wallets.length > 0) {
        await cacheSet(cacheKey, wallets)
        return NextResponse.json({ wallets, chain })
      }
    } catch (e) {
      console.error(`[/api/smart-money] GT trades error for ${chain}:`, e)
    }
    return NextResponse.json({ wallets: [], chain })
  }

  // ── Moralis path (Base) ──────────────────────────────────

  // Fresh cache → merge with indexer
  if (hasFreshCache) {
    let wallets = cached!.data
    if (indexerWallets && indexerWallets.length > 0) {
      wallets = mergeWallets(wallets, indexerWallets)
    }
    return NextResponse.json({ wallets, chain })
  }

  // Stale cache → merge + background refresh
  if (hasStaleCache) {
    fetchViaMoralis(chain, chainInfo, period, tokensParam)
      .then(async w => { if (w.length > 0) await cacheSet(cacheKey, w) })
      .catch(() => {})
    let wallets = cached!.data
    if (indexerWallets && indexerWallets.length > 0) {
      wallets = mergeWallets(wallets, indexerWallets)
    }
    return NextResponse.json({ wallets, chain, stale: true })
  }

  // No cache → fetch Moralis fresh
  try {
    let wallets = await fetchViaMoralis(chain, chainInfo, period, tokensParam)

    if (indexerWallets && indexerWallets.length > 0) {
      wallets = mergeWallets(wallets, indexerWallets)
    }

    if (wallets.length > 0) {
      await cacheSet(cacheKey, wallets)
      return NextResponse.json({ wallets, chain })
    }

    if (indexerWallets && indexerWallets.length > 0) {
      return NextResponse.json({ wallets: indexerWallets, chain, source: 'indexer' })
    }

    return NextResponse.json({ wallets: [], chain })
  } catch (e) {
    console.error('[/api/smart-money] error:', e)
    if (indexerWallets && indexerWallets.length > 0) {
      return NextResponse.json({ wallets: indexerWallets, chain, source: 'indexer' })
    }
    return NextResponse.json({ wallets: [], chain, error: 'Failed to fetch data' })
  }
}

/** Merge two wallet lists: deduplicate by address, keep the one with higher PnL */
function mergeWallets(primary: SmartWallet[], secondary: SmartWallet[]): SmartWallet[] {
  const map = new Map<string, SmartWallet>()
  // Add primary first
  for (const w of primary) {
    map.set(w.address.toLowerCase(), w)
  }
  // Merge secondary: only add if not present or has higher PnL
  for (const w of secondary) {
    const key = w.address.toLowerCase()
    const existing = map.get(key)
    if (!existing || w.realized_profit_usd > existing.realized_profit_usd) {
      map.set(key, w)
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.realized_profit_usd - a.realized_profit_usd)
    .slice(0, 100)
}
