'use client'

import { useState, useEffect } from 'react'

interface Props {
  tokenAddress: string
}

// Bubblemaps partner ID.
// Use 'demo' until a real partner ID is obtained from https://bubblemaps.io/partner
// The demo ID works but may be rate-limited or watermarked.
// Replace with the real ID once approved to unlock your domain.
const PARTNER_ID = process.env.NEXT_PUBLIC_BUBBLEMAPS_PARTNER_ID ?? 'demo'

export function BubblemapsEmbed({ tokenAddress }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Reset state when token changes
  useEffect(() => {
    setLoading(true)
    setError(false)
  }, [tokenAddress])

  // Timeout fallback: if iframe hasn't loaded after 15s, show error
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => { setLoading(false); setError(true) }, 15_000)
    return () => clearTimeout(t)
  }, [loading, tokenAddress])

  // Correct iframe URL per Bubblemaps docs:
  // https://iframe.bubblemaps.io/map?chain=base&address={addr}&partnerId={id}
  const src = `https://iframe.bubblemaps.io/map?chain=base&address=${tokenAddress}&partnerId=${PARTNER_ID}`

  return (
    <div className="relative" style={{ minHeight: 500 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sub text-[13px]">
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            Loading Bubblemaps…
          </span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sub text-[13px]">
          <span>Failed to load Bubblemaps.</span>
          <a
            href={`https://app.bubblemaps.io/base/token/${tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue hover:underline text-[12px]"
          >
            Open in Bubblemaps ↗
          </a>
        </div>
      )}
      {!error && (
        <iframe
          key={tokenAddress}
          src={src}
          className="w-full border-none"
          style={{ height: 600 }}
          title="Bubblemaps"
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError(true) }}
        />
      )}
    </div>
  )
}
