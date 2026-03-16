/**
 * Moralis API client — proxied through /api/moralis (server-side)
 * The actual API key lives in MORALIS_API_KEY (server env only).
 * This file is safe to bundle in browser JS — no secrets here.
 */

import { getChain, DEFAULT_CHAIN, type ChainSlug } from './chains'
import {
  fetchSolanaTopTraders,
  fetchSolanaWalletHoldings,
  fetchSolanaWalletSwaps,
  fetchSolanaWalletStats,
  fetchSolanaWalletProfitability,
} from './birdeye'

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
  // Moralis EVM API does not support Solana
  if (getChain(chain).chainType !== 'evm') return empty
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

/* ── Wallet Stats (profitability summary) ────────────── */

export interface MoralisWalletStats {
  total_count_of_trades: number
  total_realized_profit_usd: string
  total_trade_volume: string
  total_tokens_bought: number
  total_tokens_sold: number
  avg_holding_time?: number // seconds, from Moralis if available
}

const _walletStatsCache = new Map<string, { data: MoralisWalletStats | null; ts: number }>()

export async function fetchWalletStats(walletAddress: string, chain: ChainSlug = DEFAULT_CHAIN): Promise<MoralisWalletStats | null> {
  if (getChain(chain).chainType !== 'evm') return fetchSolanaWalletStats(walletAddress)
  const moralisChain = getChain(chain).moralisChain
  const addrLower = walletAddress.toLowerCase()

  const cached = _walletStatsCache.get(`${chain}:${addrLower}`)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `/api/moralis?type=wallet_stats&address=${walletAddress}&chain=${moralisChain}`,
      { signal: AbortSignal.timeout(15_000) }
    )
    if (!res.ok) {
      // Moralis profitability API doesn't support all chains (e.g. BSC).
      // Fall back to synthesizing stats from swaps data.
      return synthesizeStatsFromSwaps(walletAddress, chain)
    }
    const data = await res.json()
    // Moralis may return avg_holding_time or avg_holding_time_days
    const holdSec = data.avg_holding_time ?? (data.avg_holding_time_days != null ? data.avg_holding_time_days * 86400 : undefined)
    const result: MoralisWalletStats = {
      total_count_of_trades: data.total_count_of_trades ?? 0,
      total_realized_profit_usd: data.total_realized_profit_usd ?? '0',
      total_trade_volume: data.total_trade_volume ?? '0',
      total_tokens_bought: data.total_tokens_bought ?? 0,
      total_tokens_sold: data.total_tokens_sold ?? 0,
      avg_holding_time: holdSec != null ? Number(holdSec) : undefined,
    }
    _walletStatsCache.set(`${chain}:${addrLower}`, { data: result, ts: Date.now() })
    return result
  } catch (e) {
    console.error('[Moralis] fetchWalletStats error:', e)
    return null
  }
}

/** Synthesize wallet stats from swap history when Moralis profitability API is unavailable (BSC etc.) */
async function synthesizeStatsFromSwaps(walletAddress: string, chain: ChainSlug): Promise<MoralisWalletStats | null> {
  try {
    const swaps = await fetchWalletSwaps(walletAddress, chain, 50)
    if (swaps.length === 0) return null

    const QUOTE_SYMS = new Set(['WBNB', 'BNB', 'WETH', 'ETH', 'USDC', 'USDT', 'BUSD', 'DAI'])

    let totalVolume = 0
    let totalBought = 0
    let totalSold = 0
    let buys = 0
    let sells = 0

    for (const s of swaps) {
      const vol = s.totalValueUsd || Math.max(s.tokenSold.usdAmount, s.tokenBought.usdAmount) || 0
      totalVolume += vol
      // Determine buy/sell: buying a non-quote token = "buy"
      const isBuy = QUOTE_SYMS.has(s.tokenSold.symbol?.toUpperCase())
      if (isBuy) { buys++; totalBought += vol }
      else { sells++; totalSold += vol }
    }

    return {
      total_count_of_trades: swaps.length,
      total_realized_profit_usd: String(totalSold - totalBought),
      total_trade_volume: String(totalVolume),
      total_tokens_bought: buys,
      total_tokens_sold: sells,
    }
  } catch {
    return null
  }
}

/* ── Wallet ERC20 Transfers ───────────────────────────── */

import type { MoralisErc20Transfer } from './copyTrade'

const _transfersCache = new Map<string, { data: MoralisErc20Transfer[]; ts: number }>()

export async function fetchWalletTransfers(
  addresses: string[],
  chain: ChainSlug = DEFAULT_CHAIN,
  limit = 50,
): Promise<MoralisErc20Transfer[]> {
  if (getChain(chain).chainType !== 'evm') return []
  const moralisChain = getChain(chain).moralisChain
  const allTransfers: MoralisErc20Transfer[] = []

  const BATCH = 3
  for (let i = 0; i < addresses.length; i += BATCH) {
    const batch = addresses.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (addr) => {
        const key = `${chain}:${addr.toLowerCase()}`
        const cached = _transfersCache.get(key)
        if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

        const res = await fetch(
          `/api/moralis?type=wallet_transfers&address=${addr}&chain=${moralisChain}&limit=${limit}`,
          { signal: AbortSignal.timeout(15_000) }
        )
        if (!res.ok) return []
        const data = await res.json()
        const transfers: MoralisErc20Transfer[] = Array.isArray(data?.result) ? data.result : []
        _transfersCache.set(key, { data: transfers, ts: Date.now() })
        return transfers
      })
    )
    for (const r of results) {
      if (r.status === 'fulfilled') allTransfers.push(...r.value)
    }
  }

  return allTransfers
}

/* ── Wallet Swaps (Moralis decoded swap transactions) ── */

import type { DetectedSwap } from './copyTrade'

const _swapsCache = new Map<string, { data: DetectedSwap[]; ts: number }>()

export async function fetchWalletSwaps(
  address: string,
  chain: ChainSlug = DEFAULT_CHAIN,
  limit = 30,
): Promise<DetectedSwap[]> {
  if (getChain(chain).chainType !== 'evm') return fetchSolanaWalletSwaps(address, limit)
  const moralisChain = getChain(chain).moralisChain
  const key = `swaps:${chain}:${address.toLowerCase()}`
  const cached = _swapsCache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `/api/moralis?type=wallet_swaps&address=${address}&chain=${moralisChain}&limit=${limit}`,
      { signal: AbortSignal.timeout(15_000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    const results: any[] = Array.isArray(data?.result) ? data.result : []

    const swaps: DetectedSwap[] = results.map(r => ({
      txHash: r.transactionHash,
      walletAddress: r.walletAddress || address,
      timestamp: r.blockTimestamp,
      blockNumber: String(r.blockNumber),
      transactionType: r.transactionType || '',
      tokenSold: {
        address: r.sold?.address || '',
        symbol: r.sold?.symbol || '???',
        name: r.sold?.name || '',
        amount: r.sold?.amount ? String(Math.abs(parseFloat(r.sold.amount))) : '0',
        usdAmount: Math.abs(r.sold?.usdAmount || 0),
        logo: r.sold?.logo || null,
      },
      tokenBought: {
        address: r.bought?.address || '',
        symbol: r.bought?.symbol || '???',
        name: r.bought?.name || '',
        amount: r.bought?.amount ? String(parseFloat(r.bought.amount)) : '0',
        usdAmount: r.bought?.usdAmount || 0,
        logo: r.bought?.logo || null,
      },
      totalValueUsd: r.totalValueUsd || 0,
      pairLabel: r.pairLabel || '',
      exchangeLogo: r.exchangeLogo || null,
      chain,
    }))

    _swapsCache.set(key, { data: swaps, ts: Date.now() })
    return swaps
  } catch (e) {
    console.error('[Moralis] fetchWalletSwaps error:', e)
    return []
  }
}

/* ── Wallet Per-Token Profitability ───────────────────── */

export interface WalletTokenPnl {
  token_address: string
  symbol: string
  name: string
  logo: string | null
  realized_profit_usd: string
  total_usd_invested: string
  total_sold_usd: string
  avg_buy_price_usd: string
  avg_sell_price_usd: string
  count_of_trades: number
}

const _profitabilityCache = new Map<string, { data: WalletTokenPnl[]; ts: number }>()

export async function fetchWalletProfitability(walletAddress: string, chain: ChainSlug = DEFAULT_CHAIN): Promise<WalletTokenPnl[]> {
  if (getChain(chain).chainType !== 'evm') return fetchSolanaWalletProfitability(walletAddress)
  const moralisChain = getChain(chain).moralisChain
  const addrLower = walletAddress.toLowerCase()
  const key = `${chain}:${addrLower}`

  const cached = _profitabilityCache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `/api/moralis?type=wallet_profitability&address=${walletAddress}&chain=${moralisChain}`,
      { signal: AbortSignal.timeout(15_000) }
    )
    if (!res.ok) {
      // Moralis profitability API doesn't support all chains — synthesize from holdings
      return synthesizeProfitabilityFromHoldings(walletAddress, chain)
    }
    const data = await res.json()
    const result: WalletTokenPnl[] = Array.isArray(data?.result) ? data.result.map((r: any) => ({
      token_address: r.token_address || '',
      symbol: r.symbol || '???',
      name: r.name || '',
      logo: r.logo || null,
      realized_profit_usd: r.realized_profit_usd ?? '0',
      total_usd_invested: r.total_usd_invested ?? '0',
      total_sold_usd: r.total_sold_usd ?? '0',
      avg_buy_price_usd: r.avg_buy_price_usd ?? '0',
      avg_sell_price_usd: r.avg_sell_price_usd ?? '0',
      count_of_trades: r.count_of_trades ?? 0,
    })) : []
    _profitabilityCache.set(key, { data: result, ts: Date.now() })
    return result
  } catch (e) {
    console.error('[Moralis] fetchWalletProfitability error:', e)
    return []
  }
}

/* ── Wallet Token Holdings ───────────────────────────── */

export interface WalletHolding {
  token_address: string
  symbol: string
  name: string
  logo: string | null
  balance_formatted: string
  usd_value: number
  usd_price: number
  portfolio_percentage: number
  native_token: boolean
}

const _holdingCache = new Map<string, { data: WalletHolding[]; ts: number }>()

export async function fetchWalletHoldings(walletAddress: string, chain: ChainSlug = DEFAULT_CHAIN): Promise<WalletHolding[]> {
  if (getChain(chain).chainType !== 'evm') return fetchSolanaWalletHoldings(walletAddress)
  const moralisChain = getChain(chain).moralisChain
  const addrLower = walletAddress.toLowerCase()
  const key = `${chain}:${addrLower}`

  const cached = _holdingCache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `/api/moralis?type=wallet_tokens&address=${walletAddress}&chain=${moralisChain}`,
      { signal: AbortSignal.timeout(15_000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    const result: WalletHolding[] = Array.isArray(data?.result) ? data.result.map((r: any) => ({
      token_address: r.token_address || '',
      symbol: r.symbol || '???',
      name: r.name || '',
      logo: r.logo || r.thumbnail || null,
      balance_formatted: r.balance_formatted ?? '0',
      usd_value: Number(r.usd_value) || 0,
      usd_price: Number(r.usd_price) || 0,
      portfolio_percentage: Number(r.portfolio_percentage) || 0,
      native_token: r.native_token ?? false,
    })) : []
    _holdingCache.set(key, { data: result, ts: Date.now() })
    return result
  } catch (e) {
    console.error('[Moralis] fetchWalletHoldings error:', e)
    return []
  }
}

/* ── Native Balance ──────────────────────────────────── */

const _nativeBalanceCache = new Map<string, { data: string; ts: number }>()

export async function fetchNativeBalance(walletAddress: string, chain: ChainSlug = DEFAULT_CHAIN): Promise<string> {
  if (getChain(chain).chainType !== 'evm') {
    // Solana: get SOL balance from holdings data (already fetched via birdeye/RPC)
    try {
      const holdings = await fetchSolanaWalletHoldings(walletAddress)
      const sol = holdings.find(h => h.native_token)
      // Return lamports as string (matching EVM wei format)
      return sol ? String(BigInt(Math.floor(Number(sol.balance_formatted) * 1e9))) : '0'
    } catch { return '0' }
  }
  const moralisChain = getChain(chain).moralisChain
  const addrLower = walletAddress.toLowerCase()
  const key = `${chain}:${addrLower}`

  const cached = _nativeBalanceCache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `/api/moralis?type=native_balance&address=${walletAddress}&chain=${moralisChain}`,
      { signal: AbortSignal.timeout(15_000) }
    )
    if (!res.ok) return '0'
    const data = await res.json()
    const balance = data?.balance ?? '0'
    _nativeBalanceCache.set(key, { data: balance, ts: Date.now() })
    return balance
  } catch (e) {
    console.error('[Moralis] fetchNativeBalance error:', e)
    return '0'
  }
}

/* ── Top Traders ──────────────────────────────────────── */

export async function fetchTopTraders(tokenAddress: string, chain: ChainSlug = DEFAULT_CHAIN): Promise<MoralisTrader[]> {
  // Solana → Birdeye
  if (getChain(chain).chainType !== 'evm') return fetchSolanaTopTraders(tokenAddress)
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

/** Synthesize per-token profitability from swaps + holdings when Moralis profitability API is unavailable (BSC etc.) */
async function synthesizeProfitabilityFromHoldings(walletAddress: string, chain: ChainSlug): Promise<WalletTokenPnl[]> {
  try {
    const QUOTE_SYMS = new Set(['WBNB', 'BNB', 'WETH', 'ETH', 'USDC', 'USDT', 'BUSD', 'DAI'])

    const [holdings, swaps] = await Promise.all([
      fetchWalletHoldings(walletAddress, chain),
      fetchWalletSwaps(walletAddress, chain, 50),
    ])

    // Aggregate swaps by token address
    const tokenStats = new Map<string, {
      symbol: string; name: string; logo: string | null
      bought_usd: number; sold_usd: number; buy_count: number; sell_count: number
    }>()

    for (const swap of swaps) {
      // Determine which token is the "interesting" one (not quote token)
      const isBuying = QUOTE_SYMS.has(swap.tokenSold.symbol?.toUpperCase())
      const token = isBuying ? swap.tokenBought : swap.tokenSold
      const usdVal = swap.totalValueUsd || Math.max(swap.tokenSold.usdAmount, swap.tokenBought.usdAmount) || 0

      if (!token.address || QUOTE_SYMS.has(token.symbol?.toUpperCase())) continue

      const existing = tokenStats.get(token.address.toLowerCase()) || {
        symbol: token.symbol, name: token.name, logo: token.logo,
        bought_usd: 0, sold_usd: 0, buy_count: 0, sell_count: 0,
      }

      if (isBuying) { existing.bought_usd += usdVal; existing.buy_count++ }
      else { existing.sold_usd += usdVal; existing.sell_count++ }

      if (token.symbol && token.symbol !== '???' && (!existing.symbol || existing.symbol === '???'))
        existing.symbol = token.symbol
      if (token.logo && !existing.logo) existing.logo = token.logo

      tokenStats.set(token.address.toLowerCase(), existing)
    }

    // Merge holdings data
    const holdingsMap = new Map<string, WalletHolding>()
    for (const h of holdings) {
      if (!h.native_token) holdingsMap.set(h.token_address.toLowerCase(), h)
    }

    // Build result
    const result: WalletTokenPnl[] = []
    const seen = new Set<string>()

    // Tokens with swap history
    for (const [addr, stats] of tokenStats) {
      seen.add(addr)
      const holding = holdingsMap.get(addr)
      const realizedPnl = stats.sold_usd - stats.bought_usd
      result.push({
        token_address: addr,
        symbol: holding?.symbol || stats.symbol || '???',
        name: holding?.name || stats.name || '',
        logo: holding?.logo || stats.logo,
        realized_profit_usd: String(realizedPnl),
        total_usd_invested: String(stats.bought_usd),
        total_sold_usd: String(stats.sold_usd),
        avg_buy_price_usd: stats.buy_count > 0 ? String(stats.bought_usd / stats.buy_count) : '0',
        avg_sell_price_usd: stats.sell_count > 0 ? String(stats.sold_usd / stats.sell_count) : '0',
        count_of_trades: stats.buy_count + stats.sell_count,
      })
    }

    // Tokens only in holdings (no swap history in our window)
    for (const h of holdings) {
      if (h.native_token || seen.has(h.token_address.toLowerCase()) || h.usd_value < 0.01) continue
      result.push({
        token_address: h.token_address,
        symbol: h.symbol,
        name: h.name,
        logo: h.logo,
        realized_profit_usd: '0',
        total_usd_invested: String(h.usd_value),
        total_sold_usd: '0',
        avg_buy_price_usd: String(h.usd_price),
        avg_sell_price_usd: '0',
        count_of_trades: 0,
      })
    }

    // Sort by absolute PnL descending
    result.sort((a, b) => {
      const pnlDiff = Math.abs(Number(b.realized_profit_usd)) - Math.abs(Number(a.realized_profit_usd))
      if (pnlDiff !== 0) return pnlDiff
      return Number(b.total_usd_invested) - Number(a.total_usd_invested)
    })

    return result
  } catch {
    return []
  }
}
