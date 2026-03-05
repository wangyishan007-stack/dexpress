import { NextRequest, NextResponse } from 'next/server'

const MORALIS_BASE = 'https://deep-index.moralis.io/api/v2.2'
const MORALIS_API_KEY = process.env.MORALIS_API_KEY || ''

export async function GET(req: NextRequest) {
  if (!MORALIS_API_KEY) {
    return NextResponse.json({ error: 'Moralis API key not configured' }, { status: 500 })
  }

  const { searchParams } = req.nextUrl
  const type    = searchParams.get('type')
  const address = searchParams.get('address')

  if (!address || !type) {
    return NextResponse.json({ error: 'Missing required params: type, address' }, { status: 400 })
  }

  let upstreamUrl = ''
  if (type === 'traders') {
    upstreamUrl = `${MORALIS_BASE}/erc20/${address}/top-gainers?chain=base`
  } else if (type === 'holders') {
    const limit = searchParams.get('limit') ?? '50'
    upstreamUrl = `${MORALIS_BASE}/erc20/${address}/owners?chain=base&order=DESC&limit=${limit}`
  } else {
    return NextResponse.json({ error: 'Invalid type, must be traders or holders' }, { status: 400 })
  }

  try {
    const res = await fetch(upstreamUrl, {
      headers: { 'x-api-key': MORALIS_API_KEY },
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Moralis API error' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    console.error('[/api/moralis] upstream error:', e)
    return NextResponse.json({ error: 'Request failed' }, { status: 502 })
  }
}
