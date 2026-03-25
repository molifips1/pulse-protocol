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

const CATEGORY_ICONS: Record<string, string> = {
  fps: '🎯', irl: '📡', sports: '⚽', other: '🎲'
}

const EVENT_COLORS: Record<string, string> = {
  clutch: 'text-pulse-gold',
  win: 'text-pulse-green',
  death: 'text-pulse-red',
  goal: 'text-pulse-green',
  debate_outcome: 'text-blue-400',
  kill: 'text-orange-400',
  reaction: 'text-purple-400',
}

function StreamEmbed({ platform, streamKey }: { platform: string, streamKey: string }) {
  if (platform === 'twitch') {
    return (
      <div className="w-full aspect-video bg-black rounded-t-lg overflow-hidden">
        <iframe
          src={`https://player.twitch.tv/?channel=${streamKey}&parent=${window.location.hostname}&muted=true&autoplay=true`}
          height="100%"
          width="100%"
          allowFullScreen
        />
      </div>
    )
  }

  if (platform === 'kick') {
    return (
      <div className="w-full aspect-video bg-black rounded-t-lg overflow-hidden">
        <iframe
          src={`https://player.kick.com/${streamKey}?autoplay=true&muted=true`}
          height="100%"
          width="100%"
          allowFullScreen
        />
      </div>
    )
  }

  return null
}

export function MarketCard({ market, onBetPlaced }: Props) {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [betModal, setBetModal] = useState<'yes' | 'no' | null>(null)
  const [timeLeft, setTimeLeft] = useState('')
  const [expired, setExpired] = useState(false)
  const [showStream, setShowStream] = useState(false)

  const totalPool = market.total_yes_usdc + market.total_no_usdc
  const yesPercent = totalPool > 0 ? (market.total_yes_usdc / totalPool) * 100 : 50
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
        setTimeLeft('LOCKED')
      } else {
        setExpired(false)
        setTimeLeft(formatDistanceToNow(closes, { addSuffix: false }))
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

  const platform = market.streams?.platform
  const streamKey = market.streams?.stream_key

  return (
    <>
      <div className="bg-pulse-card border border-pulse-border rounded-lg overflow-hidden hover:border-pulse-muted transition-all duration-200 flex flex-col animate-[fadeIn_0.4s_ease-out]">

        {/* Stream embed toggle */}
        {platform && streamKey && (
          <>
            <button
              onClick={() => setShowStream(!showStream)}
              className="w-full px-4 py-2 bg-pulse-border/50 text-xs font-mono text-pulse-muted hover:text-white hover:bg-pulse-border transition-all flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <span className="live-dot w-1.5 h-1.5 rounded-full bg-pulse-red inline-block" />
                {platform === 'twitch' ? '📺 TWITCH' : '🎬 KICK'} · {streamKey}
              </span>
              <span>{showStream ? '▲ Hide Stream' : '▼ Watch Stream'}</span>
            </button>
            {showStream && (
              <StreamEmbed platform={platform} streamKey={streamKey} />
            )}
          </>
        )}

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-pulse-border">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-lg">{CATEGORY_ICONS[market.category]}</span>
            <div className="flex items-center gap-2 ml-auto">
              <span className={`text-xs font-mono uppercase ${EVENT_COLORS[market.event_type] || 'text-pulse-muted'}`}>
                {market.event_type.replace('_', ' ')}
              </span>
              <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                expired
                  ? 'border-pulse-muted text-pulse-muted'
                  : 'border-pulse-red text-pulse-red'
              }`}>
                {expired ? 'LOCKED' : timeLeft}
              </span>
            </div>
          </div>
          <h3 className="text-white font-semibold text-sm leading-snug">{market.title}</h3>
          {market.streams?.streamers && (
            <p className="text-pulse-muted text-xs font-mono mt-1">
              {platform === 'twitch' ? '📺' : '🎬'}{' '}
              {market.streams.streamers.display_name} · {streamKey}
            </p>
          )}
        </div>

        {/* Liquidity bar */}
        <div className="px-4 py-3">
          <div className="flex justify-between text-xs font-mono mb-1.5">
            <span className="text-pulse-green">YES {yesPercent.toFixed(0)}%</span>
            <span className="text-pulse-muted">${totalPool.toFixed(0)} pool</span>
            <span className="text-pulse-red">NO {noPercent.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-pulse-border rounded-full overflow-hidden flex">
            <div className="h-full bg-pulse-green transition-all duration-500" style={{ width: `${yesPercent}%` }} />
            <div className="h-full bg-pulse-red transition-all duration-500" style={{ width: `${noPercent}%` }} />
          </div>
        </div>

        {/* Bet buttons */}
        <div className="px-4 pb-4 flex gap-3 mt-auto">
          <button
            onClick={() => handleBet('yes')}
            disabled={expired || market.status === 'locked'}
            className="flex-1 py-2.5 rounded border border-pulse-green/40 bg-pulse-green/10 text-pulse-green font-mono text-sm font-semibold hover:bg-pulse-green/20 hover:border-pulse-green transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            YES · ×{yesOdds}
          </button>
          <button
            onClick={() => handleBet('no')}
            disabled={expired || market.status === 'locked'}
            className="flex-1 py-2.5 rounded border border-pulse-red/40 bg-pulse-red/10 text-pulse-red font-mono text-sm font-semibold hover:bg-pulse-red/20 hover:border-pulse-red transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            NO · ×{noOdds}
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
    </>
  )
}