import { NextRequest, NextResponse } from 'next/server'
import { CHAINS, SUPPORTED_CHAINS, type ChainSlug } from '@/lib/chains'

// Cache latest block per chain (12s TTL)
const cache = new Map<string, { block: number; ts: string; at: number }>()
const TTL = 12_000

export async function GET(req: NextRequest) {
  const chain = (req.nextUrl.searchParams.get('chain') || 'base') as ChainSlug
  if (!SUPPORTED_CHAINS.includes(chain)) {
    return NextResponse.json({ error: 'Invalid chain' }, { status: 400 })
  }

  const cached = cache.get(chain)
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json({ block: cached.block, ts: cached.ts })
  }

  const config = CHAINS[chain]
  try {
    const body = config.chainType === 'svm'
      ? JSON.stringify({ jsonrpc: '2.0', method: 'getSlot', params: [{ commitment: 'finalized' }], id: 1 })
      : JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 })

    const res = await fetch(config.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5_000),
    body,
    })
    const data = await res.json()

    const block = config.chainType === 'svm'
      ? (typeof data.result === 'number' ? data.result : 0)
      : parseInt(data.result, 16)

    const ts = new Date().toISOString()
    if (block > 0) {
      cache.set(chain, { block, ts, at: Date.now() })
    }
    return NextResponse.json({ block, ts })
  } catch {
    // Return stale cache if available
    if (cached) {
      return NextResponse.json({ block: cached.block, ts: cached.ts })
    }
    return NextResponse.json({ block: 0, ts: null })
  }
}
