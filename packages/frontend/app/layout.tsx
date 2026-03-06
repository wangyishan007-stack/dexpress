import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Sidebar } from '../components/Sidebar'
import { Providers } from '../components/Providers'

export const metadata: Metadata = {
  metadataBase: new URL('https://base-dex-screener.vercel.app'),
  title: {
    default: 'dex.express — Base Chain DEX Screener',
    template: '%s | dex.express',
  },
  description: 'Real-time token & pair analytics on Base chain. Live prices, security audits, top traders, and watchlists for Uniswap V3/V4 and Aerodrome.',
  keywords: ['DEX', 'Base chain', 'token screener', 'Uniswap', 'Aerodrome', 'crypto', 'DeFi', 'trading'],
  openGraph: {
    type: 'website',
    siteName: 'dex.express',
    title: 'dex.express — Base Chain DEX Screener',
    description: 'Real-time token & pair analytics on Base chain. Live prices, security audits, top traders, and watchlists.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'dex.express — Base Chain DEX Screener',
    description: 'Real-time token & pair analytics on Base chain.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-text">
        <Providers>
          <div className="flex flex-col md:flex-row h-screen overflow-hidden">
            {/* Left sidebar */}
            <Sidebar />

            {/* Main content */}
            <div className="flex flex-1 flex-col overflow-hidden min-h-0">
              <main className="flex-1 flex flex-col overflow-hidden min-h-0">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  )
}
