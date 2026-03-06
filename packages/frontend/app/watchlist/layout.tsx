import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Watchlist — Track Your Favorite Pairs',
  description: 'Monitor your favorite token pairs on Base chain. Create custom watchlists and track price movements in real-time.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
