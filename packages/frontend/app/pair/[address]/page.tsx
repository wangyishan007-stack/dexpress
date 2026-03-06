import type { Metadata } from 'next'
import { PairDetailClient } from './PairDetailClient'

interface Props {
  params: { address: string }
}

export default function PairPage({ params }: Props) {
  return <PairDetailClient address={params.address} />
}

export function generateMetadata({ params }: Props): Metadata {
  const addr = params.address
  const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`
  return {
    title: `Pair ${short} — Base DEX Analytics`,
    description: `Live price, volume, liquidity, security audit, and top traders for pair ${short} on Base chain.`,
    openGraph: {
      title: `Pair ${short} — dex.express`,
      description: `Real-time analytics for pair ${short} on Base chain DEX.`,
    },
  }
}
