import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Gainers & Losers — Top Performing Tokens on Base',
  description: 'See the best and worst performing tokens on Base chain DEX. Real-time price changes, volume, and trending data.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
