import { NextRequest, NextResponse } from 'next/server'
import { fetchDexScreenerPairs } from '@/lib/dexscreener'

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
): Promise<NextResponse> {
  try {
    const { address } = params
    const pools = await fetchDexScreenerPairs('base')
    const pool = pools.find(p => p.address.toLowerCase() === address.toLowerCase())

    if (!pool) {
      return NextResponse.json({ error: 'Pair not found' }, { status: 404 })
    }

    // Add empty recent_swaps for compatibility
    return NextResponse.json({ ...pool, recent_swaps: [] })
  } catch (err) {
    console.error('[GET /api/pairs/[address]]', err)
    return NextResponse.json(
      { error: 'Failed to fetch pair' },
      { status: 502 }
    )
  }
}
