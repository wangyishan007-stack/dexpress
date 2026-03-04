import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOST = 'api.geckoterminal.com'
const GT_HEADERS = { Accept: 'application/json;version=20230302' }

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'Missing url param' }, { status: 400 })
  }

  try {
    const parsed = new URL(url)
    if (parsed.host !== ALLOWED_HOST) {
      return NextResponse.json({ error: 'Disallowed host' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const proxyUrl = process.env.PROXY_URL

  try {
    let body: string
    let status: number

    if (proxyUrl) {
      const { ProxyAgent, fetch: uFetch } = await import('undici')
      const agent = new ProxyAgent(proxyUrl)
      const res = await uFetch(url, {
        dispatcher: agent,
        headers: GT_HEADERS,
        signal: AbortSignal.timeout(15_000),
      })
      body = await res.text()
      status = res.status
    } else {
      const res = await fetch(url, {
        headers: GT_HEADERS,
        signal: AbortSignal.timeout(15_000),
      })
      body = await res.text()
      status = res.status
    }

    return new NextResponse(body, {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[/api/gt] proxy error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 502 })
  }
}
