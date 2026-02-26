import type { PairsQuery, PairsResponse, Pool } from '@dex/shared'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? ''

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { next: { revalidate: 10 } })
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

export function buildPairsUrl(params: PairsQuery): string {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) qs.set(k, String(v))
  })
  return `/api/pairs?${qs.toString()}`
}

export const fetchPairs = (params: PairsQuery): Promise<PairsResponse> =>
  apiFetch<PairsResponse>(buildPairsUrl(params))

export const fetchPair = (address: string): Promise<Pool> =>
  apiFetch<Pool>(`/api/pairs/${address}`)

export const fetchCandles = (
  address: string,
  resolution: string,
  from: number,
  to: number
) => apiFetch(`/api/pairs/${address}/candles?resolution=${resolution}&from=${from}&to=${to}`)

export const fetchSearch = (q: string) =>
  apiFetch(`/api/search?q=${encodeURIComponent(q)}`)
