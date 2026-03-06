'use client'

import { useState, useEffect } from 'react'

interface Props {
  tokenAddress: string
}

export function BubblemapsEmbed({ tokenAddress }: Props) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // Timeout fallback: if iframe hasn't loaded after 15s, show error
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => { setLoading(false); setError(true) }, 15_000)
    return () => clearTimeout(t)
  }, [loading])

  return (
    <div className="relative" style={{ minHeight: 500 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sub text-[13px]">
          Loading Bubblemaps…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-sub text-[13px]">
          Failed to load Bubblemaps.
        </div>
      )}
      {!error && (
        <iframe
          src={`https://app.bubblemaps.io/base/token/${tokenAddress}`}
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
