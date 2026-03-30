import type { Metadata } from 'next'
import { Providers } from './providers'
import { Sidebar } from '../components/Sidebar'
import { TopBar } from '../components/TopBar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pulse — Live Prediction Markets',
  description: 'Bet on live streaming events. AI-detected. Crypto-settled.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Sidebar />
          <div className="main-wrap">
            <TopBar />
            <main style={{ flex: 1 }}>
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}
