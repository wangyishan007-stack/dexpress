import type { Metadata } from 'next'
import { getChain, type ChainSlug } from '@/lib/chains'

export function generateMetadata({ params }: { params: { chain: string } }): Metadata {
  const c = getChain(params.chain as ChainSlug)
  return {
    title: 'Watchlist — Track Your Favorite Pairs',
    description: `Monitor your favorite token pairs on ${c.name}. Create custom watchlists and track price movements in real-time.`,
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
