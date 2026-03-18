import type { Metadata } from 'next'
import { getChain, type ChainSlug } from '@/lib/chains'

const OG_MAP: Record<string, string> = {
  base: '/og-smart-money-base.jpg',
  bsc: '/og-smart-money-bsc.jpg',
  solana: '/og-smart-money-solana.jpg',
}

export function generateMetadata({ params }: { params: { chain: string } }): Metadata {
  const c = getChain(params.chain as ChainSlug)
  const ogImage = OG_MAP[params.chain] || '/og-smart-money.jpg'
  return {
    title: `Smart Money — Track the Most Profitable Wallets on ${c.name}`,
    description: `See the most profitable wallets on ${c.name}. Real-time PnL, win rate, buys/sells, and copy trade.`,
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
