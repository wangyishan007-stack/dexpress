import { NextRequest, NextResponse } from 'next/server'

/* ── Types ────────────────────────────────────────────── */

export interface SwapQuote {
  chainId: number
  sellToken: string
  buyToken: string
  sellAmount: string
  buyAmount: string
  buyAmountFormatted: string
  buySymbol: string
  price: string
  priceImpact: number
  platformFee: number
  estimatedGas: string
  transaction: {
    to?: string
    data?: string
    value?: string
    serializedTransaction?: string
  }
}

/* ── Chain constants ──────────────────────────────────── */

const CHAIN_MAP: Record<string, {
  chainId: number
  nativeAddress: string
  nativeDecimals: number
  nativeSymbol: string
  type: 'evm' | 'svm'
}> = {
  base: {
    chainId: 8453,
    nativeAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    nativeDecimals: 18,
    nativeSymbol: 'ETH',
    type: 'evm',
  },
  bsc: {
    chainId: 56,
    nativeAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    nativeDecimals: 18,
    nativeSymbol: 'BNB',
    type: 'evm',
  },
  solana: {
    chainId: 0,
    nativeAddress: 'So11111111111111111111111111111111111111112',
    nativeDecimals: 9,
    nativeSymbol: 'SOL',
    type: 'svm',
  },
}

/* ── Helpers ──────────────────────────────────────────── */

function usdToWei(usdAmount: number, nativeDecimals: number, nativePriceUsd: number): string {
  const nativeAmount = usdAmount / nativePriceUsd
  const wei = BigInt(Math.floor(nativeAmount * 10 ** nativeDecimals))
  return wei.toString()
}

function formatTokenAmount(raw: string, decimals: number): string {
  const n = Number(raw) / 10 ** decimals
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  if (n >= 1) return n.toFixed(2)
  return n.toFixed(4)
}

async function fetchNativePrice(chain: string): Promise<number> {
  // Fallback prices if API fails
  const fallback: Record<string, number> = { base: 3000, bsc: 600, solana: 150 }
  try {
    const ids: Record<string, string> = { base: 'ethereum', bsc: 'binancecoin', solana: 'solana' }
    const id = ids[chain]
    if (!id) return fallback[chain] ?? 3000
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return fallback[chain] ?? 3000
    const data = await res.json()
    return data[id]?.usd ?? fallback[chain] ?? 3000
  } catch {
    return fallback[chain] ?? 3000
  }
}

/* ── 0x API (EVM chains) ─────────────────────────────── */

async function fetchEvmQuote(
  chainId: number,
  buyToken: string,
  sellAmountWei: string,
  taker: string,
): Promise<any> {
  const apiKey = process.env.ZERO_EX_API_KEY
  if (!apiKey) throw new Error('ZERO_EX_API_KEY not configured')

  // FEE_RECIPIENT_ADDRESS — platform fee wallet (0.25%)
  // If not set, swap still works but no platform fee is collected
  const feeRecipient = process.env.FEE_RECIPIENT_ADDRESS

  const params = new URLSearchParams({
    sellToken: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    buyToken,
    sellAmount: sellAmountWei,
    taker,
    chainId: String(chainId),
    ...(feeRecipient ? {
      swapFeeRecipient: feeRecipient,
      swapFeeBps: '25',
      swapFeeToken: buyToken,
    } : {}),
  })

  const url = `https://api.0x.org/swap/allowance-holder/quote?${params}`

  const res = await fetch(url, {
    headers: {
      '0x-api-key': apiKey,
      '0x-version': 'v2',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`0x API error ${res.status}: ${text}`)
  }

  return res.json()
}

/* ── Jupiter API (Solana) ────────────────────────────── */

async function fetchSolanaQuote(
  buyToken: string,
  sellAmountLamports: string,
  _taker: string,
): Promise<any> {
  const params = new URLSearchParams({
    inputMint: 'So11111111111111111111111111111111111111112',
    outputMint: buyToken,
    amount: sellAmountLamports,
    slippageBps: '100',
    platformFeeBps: '25',
  })

  const quoteRes = await fetch(
    `https://quote-api.jup.ag/v6/quote?${params}`,
    { signal: AbortSignal.timeout(15_000) },
  )
  if (!quoteRes.ok) {
    const text = await quoteRes.text().catch(() => '')
    throw new Error(`Jupiter quote error ${quoteRes.status}: ${text}`)
  }

  const quoteData = await quoteRes.json()

  // Get swap transaction
  const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quoteData,
      userPublicKey: _taker,
      wrapAndUnwrapSol: true,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!swapRes.ok) {
    const text = await swapRes.text().catch(() => '')
    throw new Error(`Jupiter swap error ${swapRes.status}: ${text}`)
  }

  const swapData = await swapRes.json()
  return { quote: quoteData, swap: swapData }
}

/* ── Route handler ───────────────────────────────────── */

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams
  const chain = sp.get('chain') ?? 'base'
  const buyToken = sp.get('buyToken')
  const sellAmountUsd = Number(sp.get('sellAmountUsd') ?? '0')
  const taker = sp.get('taker') ?? ''
  const buySymbol = sp.get('buySymbol') ?? '???'
  const buyDecimals = Number(sp.get('buyDecimals') ?? '18')

  if (!buyToken || !sellAmountUsd || !taker) {
    return NextResponse.json({ error: 'Missing required params: buyToken, sellAmountUsd, taker' }, { status: 400 })
  }

  const chainInfo = CHAIN_MAP[chain]
  if (!chainInfo) {
    return NextResponse.json({ error: `Unsupported chain: ${chain}` }, { status: 400 })
  }

  try {
    const nativePrice = await fetchNativePrice(chain)
    const sellAmountRaw = usdToWei(sellAmountUsd, chainInfo.nativeDecimals, nativePrice)

    if (chainInfo.type === 'evm') {
      const data = await fetchEvmQuote(chainInfo.chainId, buyToken, sellAmountRaw, taker)

      // 0x v2 response: buyAmount, sellAmount at top level; transaction.{to,data,value,gas}
      const tx = data.transaction ?? {}
      const quote: SwapQuote = {
        chainId: chainInfo.chainId,
        sellToken: chainInfo.nativeAddress,
        buyToken,
        sellAmount: data.sellAmount ?? sellAmountRaw,
        buyAmount: data.buyAmount ?? '0',
        buyAmountFormatted: formatTokenAmount(data.buyAmount ?? '0', buyDecimals),
        buySymbol,
        price: data.buyAmount && data.sellAmount
          ? String(Number(data.buyAmount) / Number(data.sellAmount))
          : '0',
        priceImpact: 0, // v2 doesn't return priceImpact directly
        platformFee: sellAmountUsd * 0.0025,
        estimatedGas: tx.gas ?? '0',
        transaction: {
          to: tx.to,
          data: tx.data,
          value: tx.value,
        },
      }

      return NextResponse.json(quote)
    }

    // Solana
    const { quote: jupQuote, swap: jupSwap } = await fetchSolanaQuote(buyToken, sellAmountRaw, taker)

    const quote: SwapQuote = {
      chainId: 0,
      sellToken: chainInfo.nativeAddress,
      buyToken,
      sellAmount: sellAmountRaw,
      buyAmount: jupQuote.outAmount ?? '0',
      buyAmountFormatted: formatTokenAmount(jupQuote.outAmount ?? '0', buyDecimals),
      buySymbol,
      price: jupQuote.outAmount && sellAmountRaw
        ? String(Number(jupQuote.outAmount) / Number(sellAmountRaw))
        : '0',
      priceImpact: Number(jupQuote.priceImpactPct ?? 0) * 100,
      platformFee: sellAmountUsd * 0.0025,
      estimatedGas: '5000', // ~0.000005 SOL
      transaction: {
        serializedTransaction: jupSwap.swapTransaction,
      },
    }

    return NextResponse.json(quote)
  } catch (err: any) {
    console.error('[swap/quote] error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to fetch quote' },
      { status: 502 },
    )
  }
}
