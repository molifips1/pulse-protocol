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

  return (
    <div
      onClick={onClick}
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.10)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#F3F4F6' }}>
        {thumbnail && !imgError ? (
          <img
            src={thumbnail}
            alt={channel}
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg, #F3F4F6, #E5E7EB)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '32px', opacity: 0.3 }}>📺</span>
          </div>
        )}
        {isLive && (
          <span style={{
            position: 'absolute', top: '10px', left: '10px',
            background: '#EF4444', color: 'white',
            fontSize: '11px', fontWeight: '700',
            padding: '3px 8px', borderRadius: '9999px',
            display: 'flex', alignItems: 'center', gap: '4px',
          }}>
            <span className="live-dot" style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'white', display: 'inline-block' }} />
            LIVE
          </span>
        )}
        {markets.length > 0 && (
          <span style={{
            position: 'absolute', top: '10px', right: '10px',
            background: 'rgba(255,255,255,0.9)',
            color: '#111827', fontSize: '11px', fontWeight: '600',
            padding: '3px 8px', borderRadius: '9999px',
            backdropFilter: 'blur(4px)',
          }}>
            {markets.length} market{markets.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ color: '#111827', fontWeight: '600', fontSize: '14px' }}>{channel}</span>
          <a
            href={`https://kick.com/${channel}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}
          >
            kick.com ↗
          </a>
        </div>

        {firstMarket ? (
          <>
            <p style={{
              color: '#374151', fontSize: '12px', lineHeight: '1.5',
              margin: '0 0 8px',
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {firstMarket.title}
            </p>
            <MiniOddsBar market={firstMarket} />
          </>
        ) : (
          <p style={{ color: '#9CA3AF', fontSize: '12px', margin: 0 }}>No active markets</p>
        )}

        <div style={{ marginTop: '10px', color: '#6366F1', fontSize: '12px', fontWeight: '600' }}>
          View markets →
        </div>
      </div>
    </div>
  )
}

function MiniOddsBar({ market }: { market: any }) {
  const totalPool = (market.total_yes_usdc || 0) + (market.total_no_usdc || 0)
  const yesPercent = totalPool > 0 ? Math.round((market.total_yes_usdc / totalPool) * 100) : 50
  const noPercent = 100 - yesPercent

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
        <span style={{ color: '#2563EB', fontWeight: '700' }}>Yes {yesPercent}%</span>
        <span style={{ color: '#DC2626', fontWeight: '700' }}>{noPercent}% No</span>
      </div>
      <div style={{ height: '3px', background: '#E5E7EB', borderRadius: '9999px', overflow: 'hidden', display: 'flex' }}>
        <div style={{ height: '100%', width: yesPercent + '%', background: '#2563EB', transition: 'width 0.5s ease' }} />
        <div style={{ height: '100%', width: noPercent + '%', background: '#DC2626', transition: 'width 0.5s ease' }} />
      </div>
    </div>
  )
}
