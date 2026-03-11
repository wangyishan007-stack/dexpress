'use client'

import { useState, useEffect } from 'react'
import clsx from 'clsx'

/** DexScreener token logo CDN — chain-aware */
const DS_LOGO_CDN = 'https://dd.dexscreener.com/ds-data/tokens'

export function addrToHue(address: string): number {
  let h = 0
  for (let i = 2; i < address.length; i++) {
    h = (h * 31 + address.charCodeAt(i)) >>> 0
  }
  return h % 360
}

/** Map chain slugs to DexScreener CDN chain names */
const DS_CHAIN_MAP: Record<string, string> = {
  base: 'base',
  bsc: 'bsc',
  solana: 'solana',
}

interface TokenAvatarProps {
  symbol: string
  logoUrl: string | null
  address: string
  size?: number
  rounded?: 'full' | 'md'
  chain?: string
}

export function TokenAvatar({ symbol, logoUrl, address, size = 22, rounded = 'full', chain = 'base' }: TokenAvatarProps) {
  const hue = addrToHue(address)
  const rCls = rounded === 'md' ? 'rounded-md' : 'rounded-full'

  // Build fallback URL from DexScreener CDN (chain-aware)
  const dsChain = DS_CHAIN_MAP[chain] || 'base'
  const fallbackUrl = address ? `${DS_LOGO_CDN}/${dsChain}/${address.toLowerCase()}.png?size=lg` : null

  // Track which image source to show: 'primary' -> 'fallback' -> 'none'
  const [imgSrc, setImgSrc] = useState<'primary' | 'fallback' | 'none'>(
    logoUrl ? 'primary' : fallbackUrl ? 'fallback' : 'none'
  )

  // Reset state when logoUrl changes (e.g. new token selected)
  useEffect(() => {
    setImgSrc(logoUrl ? 'primary' : fallbackUrl ? 'fallback' : 'none')
  }, [logoUrl, fallbackUrl])

  const currentSrc =
    imgSrc === 'primary' ? logoUrl :
    imgSrc === 'fallback' ? fallbackUrl :
    null

  const handleError = () => {
    if (imgSrc === 'primary' && fallbackUrl) {
      setImgSrc('fallback')
    } else {
      setImgSrc('none')
    }
  }

  const showingImg = imgSrc !== 'none'

  return (
    <div
      className={clsx('relative flex items-center justify-center overflow-hidden flex-shrink-0', rCls)}
      style={{ backgroundColor: showingImg ? 'transparent' : `hsl(${hue},55%,20%)`, width: size, height: size }}
    >
      {!showingImg && (
        <span
          className="font-bold select-none"
          style={{ color: `hsl(${hue},70%,72%)`, fontSize: Math.max(9, size * 0.36) }}
        >
          {symbol.slice(0, 2).toUpperCase()}
        </span>
      )}
      {currentSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentSrc}
          alt={symbol}
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          className={clsx('absolute inset-0 object-cover', rCls)}
          onError={handleError}
        />
      )}
    </div>
  )
}
