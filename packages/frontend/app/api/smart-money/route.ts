import { NextRequest, NextResponse } from 'next/server'

const MORALIS_BASE = 'https://deep-index.moralis.io/api/v2.2'
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || ''
const GT_BASE = 'https://api.geckoterminal.com/api/v2'

/** Proxy-aware fetch — uses PROXY_URL env if set (for GT etc.) */
async function proxyFetch(url: string, opts: { headers?: Record<string, string>; timeout?: number } = {}): Promise<Response> {
  const proxyUrl = process.env.PROXY_URL
  const timeout = opts.timeout ?? 10_000
  if (proxyUrl) {
    const { ProxyAgent, fetch: uFetch } = await import('undici')
    const agent = new ProxyAgent(proxyUrl)
    return await uFetch(url, {
      dispatcher: agent,
      headers: opts.headers,
      signal: AbortSignal.timeout(timeout),
    }) as unknown as Response
  }
  return await fetch(url, {
    headers: opts.headers,
    signal: AbortSignal.timeout(timeout),
  })
}

/** GT network slug → Moralis chain name */
const CHAIN_MAP: Record<string, { gt: string; moralis: string; supported: boolean }> = {
  base:   { gt: 'base',   moralis: 'base',   supported: true },
  bsc:    { gt: 'bsc',    moralis: 'bsc',    supported: false },
  solana: { gt: 'solana', moralis: 'solana', supported: false },
}

/** Build GT URLs per period — different token discovery strategies */
function buildGtUrls(network: string, period: string): string[] {
  const base = `${GT_BASE}/networks/${network}`
  switch (period) {
    case '1d':
      // Short-term: hottest tokens right now + brand new pools
      return [
        `${base}/trending_pools?duration=5m&page=1`,
        `${base}/trending_pools?duration=1h&page=1`,
        `${base}/new_pools?page=1`,
      ]
    case '30d':
      // Long-term: broader coverage — top volume + trending across pages
      return [
        `${base}/pools?sort=h24_volume_usd_desc&page=1`,
        `${base}/pools?sort=h24_volume_usd_desc&page=2`,
        `${base}/trending_pools?page=1`,
      ]
    default: // '7d'
      // Mid-term: trending 24h + top volume (original behavior)
      return [
        `${base}/trending_pools?page=1`,
        `${base}/trending_pools?page=2`,
        `${base}/pools?sort=h24_volume_usd_desc&page=1`,
      ]
  }
}

export interface SmartWallet {
  address: string
  realized_profit_usd: number
  realized_profit_percentage: number
  count_of_trades: number
  count_of_buys: number
  count_of_sells: number
  total_usd_invested: string
  total_sold_usd: string
  token_address: string
  token_symbol: string
  native_balance_wei: string
}

/* ── In-memory cache ─────────────────────────────────── */
const _cache = new Map<string, { data: SmartWallet[]; ts: number }>()
const CACHE_TTL = 3_600_000 // 1 hour — Moralis free plan: 40K CU/day, each req ~250 CU

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

/** Fetch a GT pool list and extract unique tokens */
async function fetchGtPools(url: string): Promise<any[]> {
  try {
    const res = await proxyFetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data?.data) ? data.data : []
  } catch { return [] }
}

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
].map(a => a.toLowerCase()))

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
 * Estimate buys/sells from trade count and volume.
 *
 * Moralis top-gainers response fields (confirmed):
 *   address, count_of_trades, realized_profit_usd, realized_profit_percentage,
 *   total_usd_invested, total_sold_usd, total_tokens_bought, total_tokens_sold,
 *   avg_buy_price_usd, avg_sell_price_usd, avg_cost_of_quantity_sold
 *
 * NOT available: count_of_buys, count_of_sells, win_rate, win_trades
 *
 * Approximation: buys ≈ trades * (invested / totalVol), sells = trades - buys.
 */
function estimateBuySell(trades: number, invested: number, sold: number): { buys: number; sells: number } {
  if (trades <= 0) return { buys: 0, sells: 0 }
  const total = invested + sold
  if (total <= 0) return { buys: Math.ceil(trades / 2), sells: Math.floor(trades / 2) }
  const buyRatio = invested / total
  const buys = Math.max(1, Math.round(trades * buyRatio))
  const sells = Math.max(0, trades - buys)
  return { buys, sells }
}

export async function GET(req: NextRequest) {
  const chain = req.nextUrl.searchParams.get('chain') || 'base'
  const period = req.nextUrl.searchParams.get('period') || '7d'
  const tokensParam = req.nextUrl.searchParams.get('tokens') || '' // comma-separated addr:symbol pairs from client
  const chainInfo = CHAIN_MAP[chain]

  if (!chainInfo) {
    return NextResponse.json({ error: `Unsupported chain: ${chain}` }, { status: 400 })
  }

  if (!chainInfo.supported) {
    return NextResponse.json({ wallets: [], chain, unsupported: true })
  }

  if (!MORALIS_API_KEY) {
    return NextResponse.json({ error: 'Moralis API key not configured' }, { status: 500 })
  }

  // Check cache (keyed by chain only — Moralis top-gainers has no time range filter,
  // so all periods return the same data; sharing cache avoids redundant API calls)
  const cacheKey = chain
  const cached = _cache.get(cacheKey)
  if (cached && cached.data.length > 0 && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ wallets: cached.data, chain })
  }
  // Keep stale reference — serve as fallback if Moralis quota exhausted
  const staleCache = cached && cached.data.length > 0 ? cached : null

  try {
    // 1) Always start with hardcoded blue-chip tokens (reliable Moralis data)
    const seen = new Set<string>()
    const tokensToQuery: { address: string; symbol: string }[] = []
    for (const t of (FALLBACK_TOKENS[chain] ?? [])) {
      const key = t.address.toLowerCase()
      if (!seen.has(key)) { seen.add(key); tokensToQuery.push(t) }
    }

    // 2) Supplement with client-supplied GT tokens (if any)
    if (tokensParam) {
      for (const pair of tokensParam.split(',')) {
        if (tokensToQuery.length >= 8) break
        const [address, symbol] = pair.split(':')
        if (!address) continue
        const key = address.toLowerCase()
        if (seen.has(key) || SKIP_TOKENS.has(key)) continue
        seen.add(key)
        tokensToQuery.push({ address, symbol: symbol || 'Unknown' })
      }
    }

    // 3) Fetch top traders for each token in parallel (batch of 5 to avoid rate limits)
    //    NOTE: Moralis top-gainers does NOT support time range filtering.
    //    The `days` param returns 0 results. So we fetch all-time data and
    //    rely on GT's trending duration to vary which tokens appear per period.
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
          } catch {
            return []
          }
        })
      )
      for (const r of results) {
        if (r.status === 'fulfilled') allTraders.push(...r.value)
      }
    }

    // 4) Aggregate: merge wallets, keep best PnL entry per address
    //    Filter out garbage data from Moralis (meme tokens return absurd values)
    const MAX_PNL_USD = 10_000_000   // $10M cap
    const MAX_PCT = 100_000          // 100,000% cap
    const MAX_VOL = 100_000_000      // $100M cap

    const walletMap = new Map<string, SmartWallet>()
    for (const t of allTraders) {
      const addr = (t.address || '').toLowerCase()
      if (!addr) continue
      const pnl = Number(t.realized_profit_usd || 0)
      const pct = Number(t.realized_profit_percentage || 0)
      const invested = Number(t.total_usd_invested || 0)
      const sold = Number(t.total_sold_usd || 0)

      // Skip unreasonable values
      if (!isFinite(pnl) || !isFinite(pct) || !isFinite(invested) || !isFinite(sold)) continue
      if (Math.abs(pnl) > MAX_PNL_USD || Math.abs(pct) > MAX_PCT) continue
      if (invested > MAX_VOL || sold > MAX_VOL) continue
      if (pnl <= 0) continue // only profitable wallets

      const trades = t.count_of_trades ?? 0
      const { buys, sells } = estimateBuySell(trades, invested, sold)

      const existing = walletMap.get(addr)
      if (!existing || pnl > existing.realized_profit_usd) {
        walletMap.set(addr, {
          address: t.address,
          realized_profit_usd: pnl,
          realized_profit_percentage: pct,
          count_of_trades: trades,
          count_of_buys: buys,
          count_of_sells: sells,
          total_usd_invested: String(invested),
          total_sold_usd: String(sold),
          token_address: t._token_address,
          token_symbol: t._token_symbol,
          native_balance_wei: '0', // filled below
        })
      }
    }

    // 5) Sort by realized_profit_usd desc, take top 100
    const wallets = Array.from(walletMap.values())
      .sort((a, b) => b.realized_profit_usd - a.realized_profit_usd)
      .slice(0, 100)

    // NOTE: native balance queries removed to save Moralis CU quota.
    // native_balance_wei stays '0' — front-end handles gracefully.

    // Only cache non-empty results — avoids caching rate-limit/quota failures for 20min
    if (wallets.length > 0) {
      _cache.set(cacheKey, { data: wallets, ts: Date.now() })
      return NextResponse.json({ wallets, chain })
    }
    // Empty result — Moralis quota likely exhausted; serve stale data if available
    if (staleCache) {
      return NextResponse.json({ wallets: staleCache.data, chain, stale: true })
    }
    return NextResponse.json({ wallets: [], chain, quota_exhausted: true })
  } catch (e) {
    console.error('[/api/smart-money] error:', e)
    if (staleCache) {
      return NextResponse.json({ wallets: staleCache.data, chain, stale: true })
    }
    return NextResponse.json({ wallets: [], chain, error: 'Failed to fetch data' })
  }
}
