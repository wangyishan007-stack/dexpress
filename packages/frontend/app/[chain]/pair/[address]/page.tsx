import type { Metadata } from 'next'
import { getChain, type ChainSlug } from '@/lib/chains'
import { PairDetailClient } from './PairDetailClient'

interface Props {
  params: { chain: string; address: string }
}

export default function PairPage({ params }: Props) {
  return <PairDetailClient address={params.address} />
}

export function generateMetadata({ params }: Props): Metadata {
  const addr = params.address
  const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`
  const chainConfig = getChain(params.chain as ChainSlug)
  const ogImageUrl = `/${params.chain}/pair/${addr}/opengraph-image`
  return {
    title: `Pair ${short} — ${chainConfig.name} DEX Analytics`,
    description: `Live price, volume, liquidity, security audit, and top traders for pair ${short} on ${chainConfig.name}.`,
    openGraph: {
      title: `Pair ${short} — dex.express`,
      description: `Real-time analytics for pair ${short} on ${chainConfig.name} DEX.`,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Pair ${short} — dex.express`,
      description: `Real-time analytics for pair ${short} on ${chainConfig.name} DEX.`,
      images: [ogImageUrl],
    },
  }
}
