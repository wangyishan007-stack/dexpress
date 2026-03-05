/**
 * Moralis API client — Top Traders (top-gainers) endpoint
 * Free tier: 40K CU/day
 */

const MORALIS_BASE = 'https://deep-index.moralis.io/api/v2.2'
const MORALIS_API_KEY = process.env.NEXT_PUBLIC_MORALIS_API_KEY || ''

export interface MoralisTrader {
  address: string
  avg_buy_price_usd: string
  avg_sell_price_usd: string
  total_tokens_bought: string
  total_usd_invested: string
  total_tokens_sold: string
  total_sold_usd: string
  count_of_trades: number
  realized_profit_usd: string
  realized_profit_percentage: number
}

const _tradersCache = new Map<string, { data: MoralisTrader[]; ts: number }>()
const TRADERS_CACHE_TTL = 300_000 // 5min

/* ── Token Holders ─────────────────────────────────────── */

export interface MoralisHolder {
  owner_address: string
  balance_formatted: string
  usd_value: string
  percentage_relative_to_total_supply: number
  is_contract: boolean
}

export interface MoralisHoldersResult {
  holders: MoralisHolder[]
  totalSupply: string
}

const _holdersCache = new Map<string, { data: MoralisHoldersResult; ts: number }>()

export async function fetchTokenHolders(tokenAddress: string, limit = 50): Promise<MoralisHoldersResult> {
  const empty: MoralisHoldersResult = { holders: [], totalSupply: '0' }
  if (!MORALIS_API_KEY) return empty

  const addrLower = tokenAddress.toLowerCase()
  const cached = _holdersCache.get(addrLower)
  if (cached && Date.now() - cached.ts < TRADERS_CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `${MORALIS_BASE}/erc20/${tokenAddress}/owners?chain=base&order=DESC&limit=${limit}`,
      {
        headers: { 'x-api-key': MORALIS_API_KEY },
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) return empty
    const data = await res.json()
    const result: MoralisHoldersResult = {
      holders: Array.isArray(data?.result) ? data.result.map((r: any) => ({
        owner_address: r.owner_address,
        balance_formatted: r.balance_formatted,
        usd_value: r.usd_value || '0',
        percentage_relative_to_total_supply: r.percentage_relative_to_total_supply || 0,
        is_contract: r.is_contract ?? false,
      })) : [],
      totalSupply: data?.totalSupply || '0',
    }
    _holdersCache.set(addrLower, { data: result, ts: Date.now() })
    return result
  } catch (e) {
    console.error('[Moralis] fetchTokenHolders error:', e)
    return empty
  }
}

/* ── Top Traders ──────────────────────────────────────── */

export async function fetchTopTraders(tokenAddress: string): Promise<MoralisTrader[]> {
  if (!MORALIS_API_KEY) return []

  const addrLower = tokenAddress.toLowerCase()
  const cached = _tradersCache.get(addrLower)
  if (cached && Date.now() - cached.ts < TRADERS_CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `${MORALIS_BASE}/erc20/${tokenAddress}/top-gainers?chain=base`,
      {
        headers: { 'x-api-key': MORALIS_API_KEY },
        signal: AbortSignal.timeout(15_000),
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const result: MoralisTrader[] = Array.isArray(data?.result) ? data.result : []
    _tradersCache.set(addrLower, { data: result, ts: Date.now() })
    return result
  } catch (e) {
    console.error('[Moralis] fetchTopTraders error:', e)
    return []
  }
}
