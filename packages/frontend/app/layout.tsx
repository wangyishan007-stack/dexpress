import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '../components/Sidebar'

export const metadata: Metadata = {
  title:       'dex.express',
  description: 'Real-time token & pair analytics on Base chain',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-text">
        <div className="flex h-screen overflow-hidden">
          {/* Left sidebar */}
          <Sidebar />

          {/* Main content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
