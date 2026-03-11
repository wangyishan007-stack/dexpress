import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SUPPORTED_CHAINS, DEFAULT_CHAIN, CHAINS, type ChainSlug } from '@/lib/chains'
import { ChainProvider } from '@/contexts/ChainContext'

const VALID_PARAMS = [...SUPPORTED_CHAINS, 'all'] as const

const OG_IMAGES: Record<string, string> = {
  base:   '/og-base.jpg',
  bsc:    '/og-bnb.jpg',
  solana: '/og-solana.jpg',
}

export function generateStaticParams() {
  return VALID_PARAMS.map(chain => ({ chain }))
}

export function generateMetadata({ params }: { params: { chain: string } }): Metadata {
  const chain = params.chain
  if (chain === 'all') {
    return {
      title: 'All Chains Token Screener — Live Prices & Analytics',
      description: 'Track tokens across Base, BNB Chain, and Solana with live prices, smart money wallets, and contract security insights.',
      openGraph: {
        images: [{ url: '/og-image.jpg', width: 1456, height: 816 }],
      },
      twitter: {
        card: 'summary_large_image',
        images: ['/og-image.jpg'],
      },
    }
  }
  const c = CHAINS[chain as ChainSlug]
  if (!c) return {}
  const ogImage = OG_IMAGES[chain] || '/og-image.jpg'
  return {
    title: `The Fastest ${c.name} Token Screener`,
    description: `Track ${c.name} tokens with live prices, smart money wallets, and contract security insights.`,
    openGraph: {
      images: [{ url: ogImage, width: 1456, height: 816 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [ogImage],
    },
  }
}

export default function ChainLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { chain: string }
}) {
  if (!VALID_PARAMS.includes(params.chain as any)) {
    notFound()
  }
  const isAll = params.chain === 'all'
  const chainSlug = isAll ? DEFAULT_CHAIN : (params.chain as ChainSlug)
  return (
    <ChainProvider initialChain={chainSlug} isAllChains={isAll}>
      {children}
    </ChainProvider>
  )
}
