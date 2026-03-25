'use client'
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { formatDistanceToNow, isPast } from 'date-fns'
import { type Market } from '../lib/supabase'
import { BetModal } from './BetModal'

interface Props {
  market: Market
  onBetPlaced: () => void
}

export function MarketCard(props: Props) {
  const market = props.market
  const onBetPlaced = props.onBetPlaced
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [betModal, setBetModal] = useState<'yes' | 'no' | null>(null)
  const [timeLeft, setTimeLeft] = useState('')
  const [expired, setExpired] = useState(false)
  const [imgError, setImgError] = useState(false)

  const totalPool = market.total_yes_usdc + market.total_no_usdc
  const yesPercent = totalPool > 0 ? Math.round((market.total_yes_usdc / totalPool) * 100) : 50
  const noPercent = 100 - yesPercent

  const yesOdds = totalPool > 0 && market.total_yes_usdc > 0
    ? ((totalPool * 0.9925) / market.total_yes_usdc).toFixed(2)
    : market.initial_yes_odds.toFixed(2)
  const noOdds = totalPool > 0 && market.total_no_usdc > 0
    ? ((totalPool * 0.9925) / market.total_no_usdc).toFixed(2)
    : market.initial_no_odds.toFixed(2)

  useEffect(() => {
    const update = () => {
      const closes = new Date(market.closes_at)
      if (isPast(closes)) {
        setExpired(true)
        setTimeLeft('Ended')
      } else {
        setExpired(false)
        setTimeLeft(formatDistanceToNow(closes, { addSuffix: true }))
      }
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [market.closes_at])

  const handleBet = (side: 'yes' | 'no') => {
    if (!isConnected) { openConnectModal?.(); return }
    setBetModal(side)
  }

  const streamKey = market.streams?.stream_key
  const streamerName = market.streams?.streamers?.display_name || streamKey || 'Live Stream'
  const kickUrl = 'https://kick.com/' + streamKey

  const categoryColors: Record<string, string> = {
    fps: '#FF6B35',
    irl: '#9B59B6',
    sports: '#27AE60',
    other: '#3498DB'
  }
  const categoryColor = categoryColors[market.category] || '#3498DB'

  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid #1F2937',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.2s',
        cursor: 'pointer',
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
      {/* Thumbnail or placeholder */}
      <a href={kickUrl} target="_blank" rel="noopener noreferrer" style={{ position: 'relative', display: 'block', textDecoration: 'none' }}>
        <div style={{ width: '100%', aspectRatio: '16/9', background: '#1F2937', overflow: 'hidden', position: 'relative' }}>
          {!imgError ? (
            <img
              src={'https://thumbnails.kick.com/video_thumbnail/channel/' + streamKey + '/original.webp'}
              alt={streamerName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setImgError(true)}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: '8px'
            }}>
              <div style={{ fontSize: '32px' }}>🎮</div>
              <p style={{ color: '#6B7280', fontSize: '12px', fontFamily: 'monospace' }}>{streamKey}</p>
            </div>
          )}

          {/* Gradient overlay */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: '50%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)'
          }} />
        </div>

        {/* LIVE badge */}
        <div style={{
          position: 'absolute', top: '10px', left: '10px',
          background: '#DC2626', padding: '3px 8px',
          borderRadius: '4px', color: 'white',
          fontSize: '11px', fontWeight: 'bold',
          display: 'flex', alignItems: 'center', gap: '5px',
          letterSpacing: '0.05em'
        }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'white', display: 'inline-block',
            animation: 'pulse 1.2s ease-in-out infinite'
          }} />
          LIVE
        </div>

        {/* Category badge */}
        <div style={{
          position: 'absolute', top: '10px', right: '10px',
          background: categoryColor + '33',
          border: '1px solid ' + categoryColor + '66',
          padding: '3px 8px', borderRadius: '4px',
          color: categoryColor, fontSize: '10px',
          fontWeight: '600', fontFamily: 'monospace',
          textTransform: 'uppercase', letterSpacing: '0.1em'
        }}>
          {market.category}
        </div>

        {/* Streamer name on image */}
        <div style={{
          position: 'absolute', bottom: '8px', left: '10px',
          color: 'white', fontSize: '13px', fontWeight: '600',
        }}>
          {streamerName}
        </div>

        {/* Timer */}
        <div style={{
          position: 'absolute', bottom: '8px', right: '10px',
          color: '#9CA3AF', fontSize: '11px', fontFamily: 'monospace'
        }}>
          {timeLeft}
        </div>
      </a>

      {/* Content */}
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', flex: 1, gap: '12px' }}>

        {/* Market title */}
        <h3 style={{
          color: '#F9FAFB', fontSize: '14px', fontWeight: '600',
          lineHeight: '1.5', margin: 0
        }}>
          {market.title}
        </h3>

        {/* Odds bar like Polymarket */}
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: '13px', fontFamily: 'monospace', marginBottom: '6px'
          }}>
            <span style={{ color: '#34D399', fontWeight: '700' }}>Yes {yesPercent}%</span>
            <span style={{ color: '#6B7280', fontSize: '11px' }}>${totalPool.toFixed(0)} Vol.</span>
            <span style={{ color: '#F87171', fontWeight: '700' }}>{noPercent}% No</span>
          </div>
          <div style={{
            height: '4px', background: '#1F2937',
            borderRadius: '9999px', overflow: 'hidden', display: 'flex'
          }}>
            <div style={{
              height: '100%', width: yesPercent + '%',
              background: 'linear-gradient(90deg, #059669, #34D399)',
              transition: 'width 0.5s ease'
            }} />
            <div style={{
              height: '100%', width: noPercent + '%',
              background: 'linear-gradient(90deg, #F87171, #DC2626)',
              transition: 'width 0.5s ease'
            }} />
          </div>
        </div>

        {/* Bet buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleBet('yes')}
            disabled={expired}
            style={{
              flex: 1, padding: '9px 0', borderRadius: '8px',
              background: expired ? '#1F2937' : 'rgba(52,211,153,0.12)',
              color: expired ? '#4B5563' : '#34D399',
              border: '1px solid ' + (expired ? '#374151' : 'rgba(52,211,153,0.3)'),
              fontSize: '13px', fontWeight: '700',
              cursor: expired ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s', fontFamily: 'monospace'
            }}
            onMouseEnter={e => { if (!expired) e.currentTarget.style.background = 'rgba(52,211,153,0.22)' }}
            onMouseLeave={e => { if (!expired) e.currentTarget.style.background = 'rgba(52,211,153,0.12)' }}
          >
            Yes {yesOdds}x
          </button>
          <button
            onClick={() => handleBet('no')}
            disabled={expired}
            style={{
              flex: 1, padding: '9px 0', borderRadius: '8px',
              background: expired ? '#1F2937' : 'rgba(248,113,113,0.12)',
              color: expired ? '#4B5563' : '#F87171',
              border: '1px solid ' + (expired ? '#374151' : 'rgba(248,113,113,0.3)'),
              fontSize: '13px', fontWeight: '700',
              cursor: expired ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s', fontFamily: 'monospace'
            }}
            onMouseEnter={e => { if (!expired) e.currentTarget.style.background = 'rgba(248,113,113,0.22)' }}
            onMouseLeave={e => { if (!expired) e.currentTarget.style.background = 'rgba(248,113,113,0.12)' }}
          >
            No {noOdds}x
          </button>
        </div>
      </div>

      {betModal && (
        <BetModal
          market={market}
          side={betModal}
          odds={betModal === 'yes' ? parseFloat(yesOdds) : parseFloat(noOdds)}
          onClose={() => setBetModal(null)}
          onSuccess={() => { setBetModal(null); onBetPlaced() }}
        />
      )}
    </div>
  )
}
