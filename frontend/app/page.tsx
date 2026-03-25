import { Navbar } from '../components/Navbar'
import { LiveMarketsGrid } from '../components/LiveMarketsGrid'
import { HeroTicker } from '../components/HeroTicker'

export default function Home() {
  return (
    <main className="min-h-screen bg-pulse-dark">
      <Navbar />
      <HeroTicker />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <span className="live-dot w-2 h-2 rounded-full bg-pulse-red inline-block" />
            <span className="font-display text-4xl tracking-widest text-white">LIVE MARKETS</span>
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-pulse-border to-transparent" />
        </div>
        <LiveMarketsGrid />
      </div>
    </main>
  )
}
