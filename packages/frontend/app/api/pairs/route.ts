import { NextRequest, NextResponse } from 'next/server'
import { fetchDexScreenerPairs } from '@/lib/dexscreener'
import type { Pool, PairsResponse } from '@dex/shared'

const PAGE_SIZE = 50

const FILTER_KEY_MAP: Record<string, string> = {
  liquidity: 'liquidity_usd',
  mcap:      'mcap_usd',
  fdv:       'mcap_usd',
}

function filterPools(pools: Pool[], filter?: string | null): Pool[] {
  if (!filter || filter === 'trending' || filter === 'top') return pools
  const dayAgo = Date.now() - 24 * 3600_000
  if (filter === 'new')     return pools.filter(p => new Date(p.created_at).getTime() > dayAgo)
  if (filter === 'gainers') return pools.filter(p => p.change_24h > 0)
  if (filter === 'losers')  return pools.filter(p => p.change_24h < 0)
  return pools
}

function sortPools(pools: Pool[], sort: string, order: 'asc' | 'desc'): Pool[] {
  const field = FILTER_KEY_MAP[sort] ?? sort
  return [...pools].sort((a, b) => {
    const aVal = (a as unknown as Record<string, unknown>)[field] ?? 0
    const bVal = (b as unknown as Record<string, unknown>)[field] ?? 0
    const aNum = typeof aVal === 'string' ? new Date(aVal).getTime() : Number(aVal)
    const bNum = typeof bVal === 'string' ? new Date(bVal).getTime() : Number(bVal)
    return order === 'desc' ? bNum - aNum : aNum - bNum
  })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const sp     = req.nextUrl.searchParams
    const sort   = sp.get('sort')   ?? 'trending_score'
    const order  = (sp.get('order') ?? 'desc') as 'asc' | 'desc'
    const filter = sp.get('filter') ?? undefined
    const search = sp.get('search') ?? undefined
    const offset = parseInt(sp.get('offset') ?? '0',            10)
    const limit  = parseInt(sp.get('limit')  ?? String(PAGE_SIZE), 10)

    let pools = await fetchDexScreenerPairs('base')

    // Defensive: ensure pools is an array
    if (!Array.isArray(pools)) {
      console.warn('[GET /api/pairs] pools is not an array:', typeof pools)
      pools = []
    }

    // Text search on token symbol / name / address
    if (search) {
      const q = search.toLowerCase()
      pools = pools.filter(p =>
        p.token1.symbol.toLowerCase().includes(q) ||
        p.token1.name.toLowerCase().includes(q)   ||
        p.address.toLowerCase().includes(q)
      )
    }

    pools = filterPools(pools, filter)
    pools = sortPools(pools, sort, order)

    const total  = pools.length
    const sliced = pools.slice(offset, offset + limit)

    const body: PairsResponse = { pairs: sliced, total, limit, offset }
    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    })
  } catch (err) {
    console.error('[GET /api/pairs]', err)
    return NextResponse.json(
      { error: 'Failed to fetch pairs from DexScreener' },
      { status: 502 }
    )
  }
}
