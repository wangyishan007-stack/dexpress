import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'New Pairs — Recently Launched Tokens on Base',
  description: 'Discover newly created token pairs on Base chain DEX. Track new Uniswap V3/V4 and Aerodrome listings in real-time.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
