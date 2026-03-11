import type { Metadata } from 'next'
import { getChain, type ChainSlug } from '@/lib/chains'

const OG_IMAGES: Record<string, string> = {
  base:   '/og-gainers-base.jpg',
  bsc:    '/og-gainers-bnb.jpg',
  solana: '/og-gainers-solana.jpg',
}

export function generateMetadata({ params }: { params: { chain: string } }): Metadata {
  const c = getChain(params.chain as ChainSlug)
  const ogImage = OG_IMAGES[params.chain] || '/og-gainers-base.jpg'
  return {
    title: `Gainers & Losers — Top Performing Tokens on ${c.name}`,
    description: `See the best and worst performing tokens on ${c.name} DEX. Real-time price changes, volume, and trending data.`,
    openGraph: {
      images: [{ url: ogImage, width: 1456, height: 816 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [ogImage],
    },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
