import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Sidebar } from '../components/Sidebar'
import { Providers } from '../components/Providers'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'

const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://dex.express'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'dex.express — Multi-Chain DEX Screener',
    template: '%s | dex.express',
  },
  description: 'Real-time token & pair analytics across Base, BNB Chain, and Solana. Live prices, security audits, top traders, and watchlists.',
  keywords: ['DEX', 'Base', 'BNB Chain', 'Solana', 'token screener', 'Uniswap', 'PancakeSwap', 'crypto', 'DeFi', 'trading'],
  openGraph: {
    type: 'website',
    siteName: 'dex.express',
    title: 'The Fastest Multi-Chain DEX Screener — dex.express',
    description: 'Track tokens across Base, BNB Chain, and Solana with live prices, smart money wallets, and contract security insights.',
    images: [{ url: '/og-base.jpg', width: 1456, height: 816 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Fastest Multi-Chain DEX Screener — dex.express',
    description: 'Track tokens across Base, BNB Chain, and Solana with live prices, smart money wallets, and contract security insights.',
    images: ['/og-base.jpg'],
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale}>
      <body className="bg-bg text-text">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            <div className="flex flex-col md:flex-row h-screen overflow-hidden">
              {/* Left sidebar */}
              <Sidebar />

              {/* Main content */}
              <div className="flex flex-1 flex-col overflow-hidden min-h-0">
                <main className="flex-1 flex flex-col overflow-hidden min-h-0 pb-[52px] md:pb-0">
                  {children}
                </main>
              </div>
            </div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
