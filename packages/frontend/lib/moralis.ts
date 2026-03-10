/**
 * Moralis API client — proxied through /api/moralis (server-side)
 * The actual API key lives in MORALIS_API_KEY (server env only).
 * This file is safe to bundle in browser JS — no secrets here.
 */

import { getChain, DEFAULT_CHAIN, type ChainSlug } from './chains'

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
const CACHE_TTL = 300_000 // 5min

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

export async function fetchTokenHolders(tokenAddress: string, chain: ChainSlug = DEFAULT_CHAIN, limit = 50): Promise<MoralisHoldersResult> {
  const empty: MoralisHoldersResult = { holders: [], totalSupply: '0' }
  const moralisChain = getChain(chain).moralisChain
  const addrLower = tokenAddress.toLowerCase()

  const cached = _holdersCache.get(`${chain}:${addrLower}`)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `/api/moralis?type=holders&address=${tokenAddress}&chain=${moralisChain}&limit=${limit}`,
      { signal: AbortSignal.timeout(15_000) }
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
    _holdersCache.set(`${chain}:${addrLower}`, { data: result, ts: Date.now() })
    return result
  } catch (e) {
    console.error('[Moralis] fetchTokenHolders error:', e)
    return empty
  }
}

/* ── Top Traders ──────────────────────────────────────── */

export async function fetchTopTraders(tokenAddress: string, chain: ChainSlug = DEFAULT_CHAIN): Promise<MoralisTrader[]> {
  const moralisChain = getChain(chain).moralisChain
  const addrLower = tokenAddress.toLowerCase()

  const cached = _tradersCache.get(`${chain}:${addrLower}`)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `/api/moralis?type=traders&address=${tokenAddress}&chain=${moralisChain}`,
      { signal: AbortSignal.timeout(15_000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    const result: MoralisTrader[] = Array.isArray(data?.result) ? data.result : []
    _tradersCache.set(`${chain}:${addrLower}`, { data: result, ts: Date.now() })
    return result
  } catch (e) {
    console.error('[Moralis] fetchTopTraders error:', e)
    return []
  }
}
