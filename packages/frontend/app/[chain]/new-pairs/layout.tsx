import type { Metadata } from 'next'
import { getChain, type ChainSlug } from '@/lib/chains'

const OG_IMAGES: Record<string, string> = {
  base:   '/og-new-pairs-base.jpg',
  bsc:    '/og-new-pairs-bnb.jpg',
  solana: '/og-new-pairs-solana.jpg',
}

export function generateMetadata({ params }: { params: { chain: string } }): Metadata {
  const c = getChain(params.chain as ChainSlug)
  const ogImage = OG_IMAGES[params.chain] || '/og-new-pairs-base.jpg'
  return {
    title: `New Pairs — Recently Launched Tokens on ${c.name}`,
    description: `Discover newly created token pairs on ${c.name} DEX. Track new listings in real-time.`,
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
