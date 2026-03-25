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
  const thumbUrl = streamKey ? 'https://thumb.kick.com/thumbnails/' + streamKey + '/1920x1080.webp' : null

  return (
    <div style={{
      background: '#0E0E1A',
      border: '1px solid #1A1A2E',
      borderRadius: '12px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      transition: 'border-color 0.2s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#3A3A5C')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#1A1A2E')}
    >
      {thumbUrl && (
        <a href={kickUrl} target="_blank" rel="noopener noreferrer" style={{ position: 'relative', display: 'block' }}>
          <div style={{ width: '100%', aspectRatio: '16/9', background: '#1A1A2E', overflow: 'hidden' }}>
            <img
              src={thumbUrl}
              alt={streamerName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div style={{
            position: 'absolute', top: '8px', left: '8px',
            background: '#e53e3e', padding: '2px 8px',
            borderRadius: '4px', color: 'white',
            fontSize: '11px', fontWeight: 'bold',
            display: 'flex', alignItems: 'center', gap: '4px'
          }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'white', display: 'inline-block' }} />
            LIVE
          </div>
          <div style={{
            position: 'absolute', bottom: '8px', right: '8px',
            background: 'rgba(0,0,0,0.7)', padding: '2px 8px',
            borderRadius: '4px', color: 'white', fontSize: '11px'
          }}>
            {timeLeft}
          </div>
        </a>
      )}

      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <p style={{ fontSize: '11px', color: '#3A3A5C', fontFamily: 'monospace', marginBottom: '4px' }}>
          🎬 {streamerName}
        </p>
        <h3 style={{ color: 'white', fontSize: '14px', fontWeight: '600', lineHeight: '1.4', marginBottom: '12px', flex: 1 }}>
          {market.title}
        </h3>

        <div style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'monospace', marginBottom: '4px' }}>
            <span style={{ color: '#48bb78', fontWeight: '600' }}>Yes {yesPercent}%</span>
            <span style={{ color: '#3A3A5C' }}>${totalPool.toFixed(0)} Vol.</span>
            <span style={{ color: '#fc8181', fontWeight: '600' }}>{noPercent}% No</span>
          </div>
          <div style={{ height: '4px', background: '#1A1A2E', borderRadius: '9999px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', width: yesPercent + '%', background: '#48bb78', transition: 'width 0.5s' }} />
            <div style={{ height: '100%', width: noPercent + '%', background: '#fc8181', transition: 'width 0.5s' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleBet('yes')}
            disabled={expired}
            style={{
              flex: 1, padding: '8px', borderRadius: '8px',
              background: 'rgba(72,187,120,0.15)', color: '#48bb78',
              border: '1px solid rgba(72,187,120,0.3)',
              fontSize: '13px', fontWeight: '600', cursor: expired ? 'not-allowed' : 'pointer',
              opacity: expired ? 0.4 : 1, transition: 'all 0.2s'
            }}
            onMouseEnter={e => { if (!expired) (e.currentTarget.style.background = 'rgba(72,187,120,0.25)') }}
            onMouseLeave={e => { if (!expired) (e.currentTarget.style.background = 'rgba(72,187,120,0.15)') }}
          >
            Yes {yesOdds}x
          </button>
          <button
            onClick={() => handleBet('no')}
            disabled={expired}
            style={{
              flex: 1, padding: '8px', borderRadius: '8px',
              background: 'rgba(252,129,129,0.15)', color: '#fc8181',
              border: '1px solid rgba(252,129,129,0.3)',
              fontSize: '13px', fontWeight: '600', cursor: expired ? 'not-allowed' : 'pointer',
              opacity: expired ? 0.4 : 1, transition: 'all 0.2s'
            }}
            onMouseEnter={e => { if (!expired) (e.currentTarget.style.background = 'rgba(252,129,129,0.25)') }}
            onMouseLeave={e => { if (!expired) (e.currentTarget.style.background = 'rgba(252,129,129,0.15)') }}
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