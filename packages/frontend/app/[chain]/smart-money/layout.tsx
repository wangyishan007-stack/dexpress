import type { Metadata } from 'next'
import { getChain, type ChainSlug } from '@/lib/chains'

export function generateMetadata({ params }: { params: { chain: string } }): Metadata {
  const c = getChain(params.chain as ChainSlug)
  return {
    title: `Smart Money — Track the Most Profitable Wallets on ${c.name}`,
    description: `See the most profitable wallets on ${c.name}. Real-time PnL, win rate, buys/sells, and copy trade.`,
    openGraph: {
      images: [{ url: '/og-smart-money.jpg', width: 1456, height: 816 }],
    },
    twitter: {
      card: 'summary_large_image',
      images: ['/og-smart-money.jpg'],
    },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
