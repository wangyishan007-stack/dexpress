/**
 * Uniswap V3 Subgraph — LP positions via /api/subgraph proxy
 */

import { getChain, DEFAULT_CHAIN, type ChainSlug } from './chains'

export interface LPProvider {
  owner_address: string
  liquidity_pct: number
  value_usd: number
  position_count: number
}

export interface LPProvidersResult {
  providers: LPProvider[]
  totalValueLockedUSD: number
}

const _lpCache = new Map<string, { data: LPProvidersResult; ts: number }>()
const LP_CACHE_TTL = 300_000 // 5min

export async function fetchLiquidityProviders(poolAddress: string, chain: ChainSlug = DEFAULT_CHAIN): Promise<LPProvidersResult> {
  const empty: LPProvidersResult = { providers: [], totalValueLockedUSD: 0 }
  const chainConfig = getChain(chain)
  if (!chainConfig.subgraphId) return empty

  const poolId = poolAddress.toLowerCase()
  const cacheKey = `${chain}:${poolId}`
  const cached = _lpCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < LP_CACHE_TTL) return cached.data

  try {
    const query = `{
      pool(id: "${poolId}") {
        totalValueLockedUSD
        liquidity
      }
      positions(
        first: 1000
        where: { pool: "${poolId}", liquidity_gt: "0" }
        orderBy: liquidity
        orderDirection: desc
      ) {
        owner
        liquidity
      }
    }`

    const res = await fetch('/api/subgraph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, subgraphId: chainConfig.subgraphId }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) return empty
    const json = await res.json()
    if (json.errors || !json.data?.pool) return empty

    const pool = json.data.pool
    const positions: { owner: string; liquidity: string }[] = json.data.positions || []
    const tvlUsd = parseFloat(pool.totalValueLockedUSD) || 0

    // Aggregate by owner
    const ownerMap = new Map<string, number>()
    let totalLiquidity = 0
    for (const p of positions) {
      const liq = parseFloat(p.liquidity) || 0
      ownerMap.set(p.owner, (ownerMap.get(p.owner) || 0) + liq)
      totalLiquidity += liq
    }

    if (totalLiquidity === 0) return empty

    // Sort by liquidity descending, take top 50
    const sorted = Array.from(ownerMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)

    const providers: LPProvider[] = sorted.map(([owner, liq]) => {
      const pct = (liq / totalLiquidity) * 100
      return {
        owner_address: owner,
        liquidity_pct: pct,
        value_usd: tvlUsd * (pct / 100),
        position_count: positions.filter(p => p.owner === owner).length,
      }
    })

    const result: LPProvidersResult = { providers, totalValueLockedUSD: tvlUsd }
    _lpCache.set(cacheKey, { data: result, ts: Date.now() })
    return result
  } catch (e) {
    console.error('[Subgraph] fetchLiquidityProviders error:', e)
    return empty
  }
}
