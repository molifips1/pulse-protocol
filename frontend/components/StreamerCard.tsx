'use client'

interface Props {
  channel: string
  markets: any[]
  onClick: () => void
}

export function StreamerCard({ channel, markets, onClick }: Props) {
  const marketCount = markets.length

  return (
    <div
      onClick={onClick}
      style={{
        background: '#111827',
        border: '1px solid #1F2937',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#374151'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#1F2937'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Stream embed */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000' }}>
        <iframe
          src={`https://player.kick.com/${channel}?autoplay=true&muted=true&parent=pulse-protocol1.vercel.app`}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block', pointerEvents: 'none' }}
          allowFullScreen
          allow="autoplay; fullscreen"
        />
        {/* LIVE badge */}
        <div style={{
          position: 'absolute', top: '10px', left: '10px',
          background: '#DC2626', padding: '3px 8px',
          borderRadius: '4px', color: 'white',
          fontSize: '11px', fontWeight: 'bold',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white', display: 'inline-block' }} />
          LIVE
        </div>
        {/* Click overlay hint */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0)',
          transition: 'background 0.2s',
        }} />
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <p style={{ color: 'white', fontWeight: '600', fontSize: '14px', margin: 0 }}>
            {channel}
          </p>
          <p style={{ color: '#6B7280', fontSize: '12px', fontFamily: 'monospace', margin: '2px 0 0' }}>
            kick.com/{channel}
          </p>
        </div>
        <div style={{
          background: '#DC2626',
          color: 'white',
          borderRadius: '8px',
          padding: '6px 12px',
          fontSize: '13px',
          fontWeight: '700',
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
        }}>
          {marketCount} BET{marketCount !== 1 ? 'S' : ''} →
        </div>
      </div>
    </div>
  )
}
