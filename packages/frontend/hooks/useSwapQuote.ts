'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import type { SwapQuote } from '@/app/api/swap/quote/route'
import type { ChainSlug } from '@/lib/chains'

async function fetcher(url: string): Promise<SwapQuote> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Quote failed: ${res.status}`)
  }
  return res.json()
}

export function useSwapQuote(
  chain: ChainSlug,
  buyToken: string | undefined,
  buySymbol: string,
  buyDecimals: number,
  sellAmountUsd: number,
  takerAddress: string | undefined,
) {
  // Debounce sellAmountUsd by 600ms
  const [debouncedAmount, setDebouncedAmount] = useState(sellAmountUsd)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAmount(sellAmountUsd), 600)
    return () => clearTimeout(t)
  }, [sellAmountUsd])

  const shouldFetch = !!buyToken && debouncedAmount > 0 && !!takerAddress

  const key = shouldFetch
    ? `/api/swap/quote?chain=${chain}&buyToken=${buyToken}&buySymbol=${encodeURIComponent(buySymbol)}&buyDecimals=${buyDecimals}&sellAmountUsd=${debouncedAmount}&taker=${takerAddress}`
    : null

  const { data, isLoading, error } = useSWR<SwapQuote>(key, fetcher, {
    dedupingInterval: 10_000,
    revalidateOnFocus: false,
    errorRetryCount: 1,
  })

  return { quote: data ?? null, isLoading: shouldFetch && isLoading, error }
}
