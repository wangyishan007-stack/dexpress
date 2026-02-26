import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Sidebar } from '../components/Sidebar'

export const metadata: Metadata = {
  title:       'dex.express',
  description: 'Real-time token & pair analytics on Base chain',
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
        <div className="flex flex-col md:flex-row h-screen overflow-hidden">
          {/* Left sidebar */}
          <Sidebar />

          {/* Main content */}
          <div className="flex flex-1 flex-col overflow-hidden min-h-0">
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
