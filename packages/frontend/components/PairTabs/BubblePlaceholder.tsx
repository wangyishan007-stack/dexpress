'use client'

import { useState } from 'react'

interface Props {
  tokenAddress: string
}

export function BubblemapsEmbed({ tokenAddress }: Props) {
  const [loading, setLoading] = useState(true)

  return (
    <div className="relative" style={{ minHeight: 500 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sub text-[13px]">
          Loading Bubblemaps…
        </div>
      )}
      <iframe
        src={`https://iframe.bubblemaps.io/map?chain=base&address=${tokenAddress}&partnerId=demo`}
        className="w-full border-none"
        style={{ height: 600 }}
        title="Bubblemaps"
        onLoad={() => setLoading(false)}
      />
    </div>
  )
}
