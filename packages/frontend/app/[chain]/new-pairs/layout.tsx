import type { Metadata } from 'next'
import { getChain, type ChainSlug } from '@/lib/chains'

export function generateMetadata({ params }: { params: { chain: string } }): Metadata {
  const c = getChain(params.chain as ChainSlug)
  return {
    title: `New Pairs — Recently Launched Tokens on ${c.name}`,
    description: `Discover newly created token pairs on ${c.name} DEX. Track new listings in real-time.`,
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
