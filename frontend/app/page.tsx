import { Navbar } from '../components/Navbar'
import { LiveMarketsGrid } from '../components/LiveMarketsGrid'

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: '#0D1117' }}>
      <Navbar />
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 20px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: '#DC2626', display: 'inline-block'
            }} />
            <h1 style={{ color: 'white', fontSize: '20px', fontWeight: '700', margin: 0 }}>
              Live Markets
            </h1>
          </div>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>
            AI-detected events on live streams. Bet with USDC on Base.
          </p>
        </div>
        <LiveMarketsGrid />
      </div>
    </main>
  )
}