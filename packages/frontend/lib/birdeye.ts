/**
 * Birdeye / Solana RPC client for Solana wallet data.
 * Routes through /api/birdeye which uses Birdeye API (if key exists)
 * or falls back to Solana RPC + GeckoTerminal.
 */

import type { MoralisTrader } from './moralis'
import type { WalletTokenPnl, MoralisWalletStats, WalletHolding } from './moralis'
import type { DetectedSwap } from './copyTrade'
import type { ChainSlug } from './chains'

const CACHE_TTL = 300_000 // 5min

/* ── Top Traders for a token ─────────────────────────── */

const _topTradersCache = new Map<string, { data: MoralisTrader[]; ts: number }>()

export async function fetchSolanaTopTraders(tokenAddress: string): Promise<MoralisTrader[]> {
  const key = `sol:traders:${tokenAddress}`
  const cached = _topTradersCache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `/api/birdeye?type=top_traders&address=${tokenAddress}&sort_by=PnL&sort_type=desc&limit=20`,
      { signal: AbortSignal.timeout(15_000) },
    )
    if (!res.ok) return []
    const json = await res.json()
    const items: any[] = json?.data?.items || []

    const traders: MoralisTrader[] = items.map((t: any) => ({
      address: t.owner || t.wallet || '',
      avg_buy_price_usd: String(t.avg_buy_price || '0'),
      avg_sell_price_usd: String(t.avg_sell_price || '0'),
      total_tokens_bought: String(t.total_buy_amount || '0'),
      total_usd_invested: String(t.total_buy_usd || t.total_cost || '0'),
      total_tokens_sold: String(t.total_sell_amount || '0'),
      total_sold_usd: String(t.total_sell_usd || t.total_revenue || '0'),
      count_of_trades: (t.buy_tx_count || 0) + (t.sell_tx_count || 0),
      realized_profit_usd: String(t.pnl || t.realized_pnl || '0'),
      realized_profit_percentage: Number(t.pnl_percentage || 0) * 100,
    }))

    _topTradersCache.set(key, { data: traders, ts: Date.now() })
    return traders
  } catch (e) {
    console.error('[Birdeye] fetchSolanaTopTraders error:', e)
    return []
  }
}

/* ── Wallet Holdings (token_list) ──────────────────────── */

const _holdingsCache = new Map<string, { data: WalletHolding[]; ts: number }>()

export async function fetchSolanaWalletHoldings(walletAddress: string): Promise<WalletHolding[]> {
  const key = `sol:holdings:${walletAddress}`
  const cached = _holdingsCache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `/api/birdeye?type=wallet_portfolio&wallet=${walletAddress}`,
      { signal: AbortSignal.timeout(20_000) },
    )
    if (!res.ok) return []
    const json = await res.json()
    const items: any[] = json?.data?.items || []

    const totalValue = items.reduce((s: number, t: any) => s + (Number(t.valueUsd) || 0), 0)
    const holdings: WalletHolding[] = items.map((t: any) => ({
      token_address: t.address || '',
      symbol: t.symbol || '???',
      name: t.name || '',
      logo: t.logoURI || t.icon || null,
      balance_formatted: String(t.uiAmount || '0'),
      usd_value: Number(t.valueUsd) || 0,
      usd_price: Number(t.priceUsd) || 0,
      portfolio_percentage: totalValue > 0 ? ((Number(t.valueUsd) || 0) / totalValue) * 100 : 0,
      native_token: t.address === 'So11111111111111111111111111111111111111112',
    }))

    _holdingsCache.set(key, { data: holdings, ts: Date.now() })
    return holdings
  } catch (e) {
    console.error('[Birdeye] fetchSolanaWalletHoldings error:', e)
    return []
  }
}

/* ── Wallet Swaps (tx_list) ────────────────────────────── */

const _swapsCache = new Map<string, { data: DetectedSwap[]; ts: number }>()

export async function fetchSolanaWalletSwaps(walletAddress: string, limit = 30): Promise<DetectedSwap[]> {
  const key = `sol:swaps:${walletAddress}`
  const cached = _swapsCache.get(key)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data

  try {
    const res = await fetch(
      `/api/birdeye?type=wallet_tx&wallet=${walletAddress}&limit=${limit}`,
      { signal: AbortSignal.timeout(25_000) },
    )
    if (!res.ok) return []
    const json = await res.json()
    const txs: any[] = json?.data?.items || json?.data?.solana || []

    // Get holdings to resolve token symbols (RPC swap data only has mint addresses)
    let holdings: WalletHolding[] = []
    try {
      holdings = await fetchSolanaWalletHoldings(walletAddress)
    } catch { /* ignore */ }
    const symbolMap = new Map<string, { symbol: string; logo: string | null }>()
    symbolMap.set('So11111111111111111111111111111111111111112', { symbol: 'SOL', logo: null })
    for (const h of holdings) {
      if (h.token_address) symbolMap.set(h.token_address, { symbol: h.symbol, logo: h.logo })
    }

    const resolveMeta = (addr: string) => {
      const meta = symbolMap.get(addr)
      return { symbol: meta?.symbol || addr.slice(0, 4) + '...' + addr.slice(-4), logo: meta?.logo || null }
    }

    const swaps: DetectedSwap[] = txs
      .filter((tx: any) => tx.txType === 'swap' || tx.type === 'swap')
      .map((tx: any) => {
        const fromAddr = tx.from?.address || tx.sourceToken?.address || ''
        const toAddr = tx.to?.address || tx.destToken?.address || ''
        const fromMeta = resolveMeta(fromAddr)
        const toMeta = resolveMeta(toAddr)

        // Infer buy/sell: if selling SOL/USDC for a token → "buy", otherwise → "sell"
        const STABLE_MINTS = new Set(['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'])
        const isBuy = STABLE_MINTS.has(fromAddr) && !STABLE_MINTS.has(toAddr)

        return {
          txHash: tx.txHash || tx.signature || '',
          walletAddress,
          timestamp: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : '',
          blockNumber: String(tx.slot || '0'),
          transactionType: isBuy ? 'buy' : 'sell',
          tokenSold: {
            address: fromAddr,
            symbol: tx.from?.symbol || fromMeta.symbol,
            name: tx.from?.name || '',
            amount: String(tx.from?.uiAmount || tx.sourceToken?.uiAmount || '0'),
            usdAmount: Number(tx.from?.nearestPrice || 0) * Number(tx.from?.uiAmount || 0),
            logo: tx.from?.icon || fromMeta.logo,
          },
          tokenBought: {
            address: toAddr,
            symbol: tx.to?.symbol || toMeta.symbol,
            name: tx.to?.name || '',
            amount: String(tx.to?.uiAmount || tx.destToken?.uiAmount || '0'),
            usdAmount: Number(tx.to?.nearestPrice || 0) * Number(tx.to?.uiAmount || 0),
            logo: tx.to?.icon || toMeta.logo,
          },
          totalValueUsd: Number(tx.volumeUSD || 0),
          pairLabel: '',
          exchangeLogo: null,
          chain: 'solana' as ChainSlug,
        }
      })

    _swapsCache.set(key, { data: swaps, ts: Date.now() })
    return swaps
  } catch (e) {
    console.error('[Birdeye] fetchSolanaWalletSwaps error:', e)
    return []
  }
}

/* ── Wallet Stats (aggregated from holdings) ────────── */

export async function fetchSolanaWalletStats(walletAddress: string): Promise<MoralisWalletStats | null> {
  try {
    const STABLE_MINTS = new Set(['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'])
    const [holdings, swaps] = await Promise.all([
      fetchSolanaWalletHoldings(walletAddress),
      fetchSolanaWalletSwaps(walletAddress, 50),
    ])
    if (holdings.length === 0 && swaps.length === 0) return null

    let totalVolume = 0
    let totalBought = 0
    let totalSold = 0
    let buys = 0
    let sells = 0
    for (const s of swaps) {
      const vol = s.totalValueUsd || s.tokenSold.usdAmount || s.tokenBought.usdAmount || 0
      totalVolume += vol
      const isBuy = STABLE_MINTS.has(s.tokenSold.address)
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

/* ── Wallet Per-Token Profitability ──────────────────── */

export async function fetchSolanaWalletProfitability(walletAddress: string): Promise<WalletTokenPnl[]> {
  // Combine holdings + swap history for more accurate per-token PnL
  try {
    const [holdings, swaps] = await Promise.all([
      fetchSolanaWalletHoldings(walletAddress),
      fetchSolanaWalletSwaps(walletAddress, 50),
    ])

    // Aggregate swaps by token address
    const STABLE_MINTS = new Set(['So11111111111111111111111111111111111111112', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'])
    const tokenStats = new Map<string, {
      symbol: string; name: string; logo: string | null
      bought_usd: number; sold_usd: number; buy_count: number; sell_count: number
    }>()

    for (const swap of swaps) {
      // Determine which token is the "interesting" one (not SOL/USDC)
      const isBuying = STABLE_MINTS.has(swap.tokenSold.address)
      const token = isBuying ? swap.tokenBought : swap.tokenSold
      const usdVal = swap.totalValueUsd || (isBuying ? swap.tokenSold.usdAmount : swap.tokenBought.usdAmount) || 0

      if (!token.address || STABLE_MINTS.has(token.address)) continue

      const existing = tokenStats.get(token.address) || {
        symbol: token.symbol, name: token.name, logo: token.logo,
        bought_usd: 0, sold_usd: 0, buy_count: 0, sell_count: 0,
      }

      if (isBuying) {
        existing.bought_usd += usdVal
        existing.buy_count++
      } else {
        existing.sold_usd += usdVal
        existing.sell_count++
      }
      // Update symbol/logo if better data available
      if (token.symbol && token.symbol.length > 3 && (!existing.symbol || existing.symbol.includes('...'))) {
        existing.symbol = token.symbol
      }
      if (token.logo && !existing.logo) existing.logo = token.logo

      tokenStats.set(token.address, existing)
    }

    // Merge holdings data (current positions)
    const holdingsMap = new Map<string, WalletHolding>()
    for (const h of holdings) {
      if (!h.native_token) holdingsMap.set(h.token_address, h)
    }

    // Build result: tokens from swaps + tokens only in holdings
    const result: WalletTokenPnl[] = []
    const seen = new Set<string>()

    // First: tokens with swap history
    for (const [addr, stats] of tokenStats) {
      seen.add(addr)
      const holding = holdingsMap.get(addr)
      const currentValue = holding?.usd_value ?? 0
      // Realized PnL = sold - bought, unrealized = current holdings value
      const realizedPnl = stats.sold_usd - stats.bought_usd
      result.push({
        token_address: addr,
        symbol: holding?.symbol || stats.symbol || addr.slice(0, 4) + '...' + addr.slice(-4),
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

    // Then: tokens only in holdings (no swap history in our window)
    for (const h of holdings) {
      if (h.native_token || seen.has(h.token_address) || h.usd_value < 0.01) continue
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

    // Sort by absolute PnL descending, then by invested value
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
