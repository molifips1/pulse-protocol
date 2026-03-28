'use client'
import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { formatDistanceToNow, isPast } from 'date-fns'
import { supabase } from '../lib/supabase'
import { BetModal } from './BetModal'

interface Props {
  channel: string
  markets: any[]
  onClose: () => void
  onBetPlaced: () => void
}

export function StreamerMarketsModal({ channel, markets: initialMarkets, onClose, onBetPlaced }: Props) {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [betModal, setBetModal] = useState<{ market: any; side: 'yes' | 'no'; odds: number } | null>(null)
  const [markets, setMarkets] = useState(initialMarkets)

  // Fetch fresh market data and subscribe to realtime updates
  useEffect(() => {
    const ids = initialMarkets.map(m => m.id)
    if (!ids.length) return

    const fetchFresh = async () => {
      const { data } = await supabase
        .from('markets')
        .select('*')
        .in('id', ids)
      if (data) setMarkets(data)
    }
    fetchFresh()

    const ch = supabase.channel('modal-markets')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'markets' }, fetchFresh)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [initialMarkets.map(m => m.id).join(',')])

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleBet = (market: any, side: 'yes' | 'no', odds: number) => {
    if (!isConnected) { openConnectModal?.(); return }
    setBetModal({ market, side, odds })
  }

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'stretch',
        justifyContent: 'center',
        padding: '0',
      }}
    >
      <div style={{
        background: '#0D1117',
        width: '100%',
        maxWidth: '1100px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid #1F2937',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              background: '#DC2626', display: 'inline-block',
            }} />
            <span style={{ color: 'white', fontWeight: '700', fontSize: '16px' }}>{channel}</span>
            <a
              href={`https://kick.com/${channel}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: '#6B7280', fontSize: '12px', fontFamily: 'monospace', textDecoration: 'none' }}
            >
              kick.com/{channel} ↗
            </a>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #374151',
              color: '#9CA3AF', borderRadius: '6px',
              padding: '4px 10px', cursor: 'pointer', fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Body: stream + markets side by side */}
        <div style={{
          display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0,
        }}>
          {/* Stream */}
          <div style={{
            flex: '0 0 55%', background: '#000',
            position: 'relative',
          }}>
            <iframe
              src={`https://player.kick.com/${channel}?autoplay=true&muted=false&parent=pulse-protocol1.vercel.app`}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              allowFullScreen
              allow="autoplay; fullscreen"
            />
          </div>

          {/* Markets list */}
          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '16px',
            display: 'flex', flexDirection: 'column', gap: '10px',
            background: '#0D1117',
          }}>
            <p style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
              {markets.length} Active Market{markets.length !== 1 ? 's' : ''}
            </p>
            {markets.map(market => (
              <MarketRow
                key={market.id}
                market={market}
                onBet={(side, odds) => handleBet(market, side, odds)}
              />
            ))}
          </div>
        </div>
      </div>

      {betModal && (
        <BetModal
          market={betModal.market}
          side={betModal.side}
          odds={betModal.odds}
          onClose={() => setBetModal(null)}
          onSuccess={() => { setBetModal(null); onBetPlaced() }}
        />
      )}
    </div>
  )
}

function MarketRow({ market, onBet }: { market: any; onBet: (side: 'yes' | 'no', odds: number) => void }) {
  const [timeLeft, setTimeLeft] = useState('')
  const [expired, setExpired] = useState(false)

  const totalPool = market.total_yes_usdc + market.total_no_usdc
  const yesPercent = totalPool > 0 ? Math.round((market.total_yes_usdc / totalPool) * 100) : 50
  const noPercent = 100 - yesPercent
  const yesOdds = totalPool > 0 && market.total_yes_usdc > 0
    ? parseFloat(((totalPool * 0.9925) / market.total_yes_usdc).toFixed(2))
    : market.initial_yes_odds
  const noOdds = totalPool > 0 && market.total_no_usdc > 0
    ? parseFloat(((totalPool * 0.9925) / market.total_no_usdc).toFixed(2))
    : market.initial_no_odds

  useEffect(() => {
    const update = () => {
      const closes = new Date(market.closes_at)
      if (isPast(closes)) { setExpired(true); setTimeLeft('Ended') }
      else { setExpired(false); setTimeLeft(formatDistanceToNow(closes, { addSuffix: true })) }
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [market.closes_at])

  return (
    <div style={{
      background: '#111827',
      border: '1px solid #1F2937',
      borderRadius: '10px',
      padding: '12px',
      display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <p style={{ color: '#F9FAFB', fontSize: '13px', fontWeight: '600', lineHeight: '1.5', margin: 0, flex: 1 }}>
          {market.title}
        </p>
        <span style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {timeLeft}
        </span>
      </div>

      {/* Odds bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'monospace', marginBottom: '5px' }}>
          <span style={{ color: '#34D399', fontWeight: '700' }}>Yes {yesPercent}%</span>
          <span style={{ color: '#6B7280' }}>${totalPool.toFixed(0)} Vol.</span>
          <span style={{ color: '#F87171', fontWeight: '700' }}>{noPercent}% No</span>
        </div>
        <div style={{ height: '3px', background: '#1F2937', borderRadius: '9999px', overflow: 'hidden', display: 'flex' }}>
          <div style={{ height: '100%', width: yesPercent + '%', background: 'linear-gradient(90deg, #059669, #34D399)', transition: 'width 0.5s ease' }} />
          <div style={{ height: '100%', width: noPercent + '%', background: 'linear-gradient(90deg, #F87171, #DC2626)', transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {/* Bet buttons */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          onClick={() => onBet('yes', yesOdds)}
          disabled={expired}
          style={{
            flex: 1, padding: '7px 0', borderRadius: '7px',
            background: expired ? '#1F2937' : 'rgba(52,211,153,0.12)',
            color: expired ? '#4B5563' : '#34D399',
            border: '1px solid ' + (expired ? '#374151' : 'rgba(52,211,153,0.3)'),
            fontSize: '12px', fontWeight: '700',
            cursor: expired ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
          }}
        >
          Yes {yesOdds}x
        </button>
        <button
          onClick={() => onBet('no', noOdds)}
          disabled={expired}
          style={{
            flex: 1, padding: '7px 0', borderRadius: '7px',
            background: expired ? '#1F2937' : 'rgba(248,113,113,0.12)',
            color: expired ? '#4B5563' : '#F87171',
            border: '1px solid ' + (expired ? '#374151' : 'rgba(248,113,113,0.3)'),
            fontSize: '12px', fontWeight: '700',
            cursor: expired ? 'not-allowed' : 'pointer',
            fontFamily: 'monospace',
          }}
        >
          No {noOdds}x
        </button>
      </div>
    </div>
  )
}
