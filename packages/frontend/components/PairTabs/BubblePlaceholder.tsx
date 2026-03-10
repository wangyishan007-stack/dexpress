'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useChain } from '@/contexts/ChainContext'

interface Props {
  tokenAddress: string
}

const PARTNER_ID = process.env.NEXT_PUBLIC_BUBBLEMAPS_PARTNER_ID ?? 'demo'

export function BubblemapsEmbed({ tokenAddress }: Props) {
  const t = useTranslations('bubblemaps')
  const { chainConfig } = useChain()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(false)
  }, [tokenAddress])

  useEffect(() => {
    if (!loading) return
    const timer = setTimeout(() => { setLoading(false); setError(true) }, 15_000)
    return () => clearTimeout(timer)
  }, [loading, tokenAddress])

  const src = `https://iframe.bubblemaps.io/map?chain=${chainConfig.bubblemapsChain}&address=${tokenAddress}&partnerId=${PARTNER_ID}`

  return (
    <div className="relative" style={{ minHeight: 500 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-sub text-[13px]">
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {t('loading')}
          </span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sub text-[13px]">
          <span>{t('failed')}</span>
          <a
            href={`https://app.bubblemaps.io/${chainConfig.bubblemapsChain}/token/${tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue hover:underline text-[12px]"
          >
            {t('openIn')}
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
