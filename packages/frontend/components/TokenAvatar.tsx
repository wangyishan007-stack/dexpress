'use client'

import { useState } from 'react'
import clsx from 'clsx'

/** Covalent logo CDN — accepts lowercase addresses, good coverage for Base tokens */
const COVALENT_CDN = 'https://logos.covalenthq.com/tokens/8453'

export function addrToHue(address: string): number {
  let h = 0
  for (let i = 2; i < address.length; i++) {
    h = (h * 31 + address.charCodeAt(i)) >>> 0
  }
  return h % 360
}

interface TokenAvatarProps {
  symbol: string
  logoUrl: string | null
  address: string
  size?: number
  rounded?: 'full' | 'md'
}

export function TokenAvatar({ symbol, logoUrl, address, size = 22, rounded = 'full' }: TokenAvatarProps) {
  const hue = addrToHue(address)
  const rCls = rounded === 'md' ? 'rounded-md' : 'rounded-full'

  // Build fallback URL from Covalent CDN
  const fallbackUrl = address ? `${COVALENT_CDN}/${address.toLowerCase()}.png` : null

  // Track which image source to show: 'primary' -> 'fallback' -> 'none'
  const [imgSrc, setImgSrc] = useState<'primary' | 'fallback' | 'none'>(
    logoUrl ? 'primary' : fallbackUrl ? 'fallback' : 'none'
  )

  // Reset state when logoUrl changes (e.g. new token selected)
  const [prevLogoUrl, setPrevLogoUrl] = useState(logoUrl)
  if (logoUrl !== prevLogoUrl) {
    setPrevLogoUrl(logoUrl)
    setImgSrc(logoUrl ? 'primary' : fallbackUrl ? 'fallback' : 'none')
  }

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

  return (
    <div
      className={clsx('relative flex items-center justify-center overflow-hidden flex-shrink-0', rCls)}
      style={{ backgroundColor: `hsl(${hue},55%,20%)`, width: size, height: size }}
    >
      <span
        className="font-bold select-none"
        style={{ color: `hsl(${hue},70%,72%)`, fontSize: Math.max(9, size * 0.36) }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </span>
      {currentSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentSrc}
          alt={symbol}
          width={size}
          height={size}
          className={clsx('absolute inset-0 object-cover', rCls)}
          onError={handleError}
        />
      )}
    </div>
  )
}
