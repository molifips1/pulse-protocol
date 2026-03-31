'use client'
import { useState } from 'react'

interface Props {
  channel: string
  markets: any[]
  isLive: boolean
  thumbnail: string | null
  onClick: () => void
}

export function StreamerCard({ channel, markets, isLive, thumbnail, onClick }: Props) {
  const [imgError, setImgError] = useState(false)
  const firstMarket = markets[0]
  const yes = firstMarket ? Math.round(((firstMarket.total_yes_usdc || 0) / Math.max((firstMarket.total_yes_usdc || 0) + (firstMarket.total_no_usdc || 0), 1)) * 100) : 50
  const no = 100 - yes

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.2s, transform 0.2s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--border-2)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: 'var(--surface-2)' }}>
        {thumbnail && !imgError ? (
          <img src={thumbnail} alt={channel} onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--dim)', fontSize: '28px', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
              {channel.slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
        <div style={{
          position: 'absolute', top: '8px', left: '8px',
          display: 'flex', alignItems: 'center', gap: '5px',
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          borderRadius: '5px', padding: '3px 7px',
        }}>
          {isLive ? (
            <>
              <span className="live-dot" style={{ width: '5px', height: '5px' }} />
              <span style={{ color: 'white', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: '600', letterSpacing: '0.05em' }}>LIVE</span>
            </>
          ) : (
            <>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--dim)', flexShrink: 0 }} />
              <span style={{ color: 'var(--dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: '600', letterSpacing: '0.05em' }}>OFFLINE</span>
            </>
          )}
        </div>
        {markets.length > 0 && (
          <div style={{
            position: 'absolute', top: '8px', right: '8px',
            background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
            borderRadius: '5px', padding: '3px 7px',
          }}>
            <span style={{ color: 'white', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
              {markets.length} {markets.length === 1 ? 'market' : 'markets'}
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px', color: 'var(--text)' }}>
            {channel}
          </span>
          <a href={`https://kick.com/${channel}`} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: 'var(--dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', textDecoration: 'none', marginLeft: 'auto' }}>
            kick ↗
          </a>
        </div>

        {firstMarket ? (
          <>
            <p style={{ color: 'var(--muted)', fontSize: '12px', marginBottom: '10px', lineHeight: '1.4',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {firstMarket.title}
            </p>
            {/* Prob bar */}
            <div style={{ display: 'flex', gap: '2px', borderRadius: '4px', overflow: 'hidden', height: '4px', marginBottom: '7px' }}>
              <div style={{ width: yes + '%', background: 'var(--yes)', transition: 'width 0.5s ease' }} />
              <div style={{ width: no + '%', background: 'var(--no)', transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--yes)', fontWeight: '600' }}>YES {yes}%</span>
              <span style={{ color: 'var(--no)', fontWeight: '600' }}>{no}% NO</span>
            </div>
          </>
        ) : (
          <p style={{ color: 'var(--dim)', fontSize: '12px' }}>No active markets</p>
        )}
      </div>
    </div>
  )
}
