import type { Metadata } from 'next'
import { getChain, type ChainSlug } from '@/lib/chains'

export function generateMetadata({ params }: { params: { chain: string } }): Metadata {
  const c = getChain(params.chain as ChainSlug)
  return {
    title: `Gainers & Losers — Top Performing Tokens on ${c.name}`,
    description: `See the best and worst performing tokens on ${c.name} DEX. Real-time price changes, volume, and trending data.`,
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
