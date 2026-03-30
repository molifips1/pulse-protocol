import type { Metadata } from 'next'
import { Providers } from './providers'
import { Sidebar } from '../components/Sidebar'
import { TopBar } from '../components/TopBar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pulse Protocol — Live Prediction Markets',
  description: 'Bet on live streaming events. AI-detected. Crypto-settled.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ display: 'flex', minHeight: '100vh' }}>
        <Providers>
          {/* Desktop sidebar — hidden on mobile */}
          <div className="hidden lg:block" style={{ width: '240px', flexShrink: 0 }}>
            <Sidebar />
          </div>
          {/* Main column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <TopBar />
            <main style={{ flex: 1, background: '#FFFFFF' }}>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
