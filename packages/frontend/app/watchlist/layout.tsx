import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Watchlist — Track Your Favorite Pairs',
  description: 'Monitor your favorite token pairs across all chains. Create custom watchlists and track price movements in real-time.',
  openGraph: {
    images: [{ url: '/og-watchlist.jpg', width: 1456, height: 816 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-watchlist.jpg'],
  },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
