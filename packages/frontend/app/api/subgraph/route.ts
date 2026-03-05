import { NextRequest, NextResponse } from 'next/server'

const GRAPH_API_KEY = process.env.NEXT_PUBLIC_GRAPH_API_KEY || ''
const SUBGRAPH_ID = 'HMuAwufqZ1YCRmzL2SfHTVkzZovC9VL2UAKhjvRqKiR1'
const GRAPH_URL = `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/${SUBGRAPH_ID}`

export async function POST(req: NextRequest) {
  if (!GRAPH_API_KEY) {
    return NextResponse.json({ errors: [{ message: 'No Graph API key' }] }, { status: 500 })
  }

  try {
    const body = await req.json()
    const res = await fetch(GRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })

    const data = await res.json()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ errors: [{ message: 'Subgraph request failed' }] }, { status: 502 })
  }
}
