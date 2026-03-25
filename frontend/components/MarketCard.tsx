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
    <div className="bg-pulse-card border border-pulse-border rounded-xl overflow-hidden hover:border-white/20 transition-all duration-200 flex flex-col group">

      {/* Stream Thumbnail */}
      {thumbUrl && (
        <a href={kickUrl} target="_blank" rel="noopener noreferrer" className="relative block">
          <div className="w-full aspect-video bg-pulse-border overflow-hidden">
            <img
              src={thumbUrl}
              alt={streamerName}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-red-600 px-2 py-0.5 rounded text-white text-xs font-bold">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-white inline-block" />
            LIVE
          </div>
          <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded text-white text-xs font-mono">
            {timeLeft}
          </div>
        </a>
      )}

      {/* Market Info */}
      <div className="p-3 flex flex-col flex-1">
        <p className="text-xs text-pulse-muted font-mono mb-1">🎬 {streamerName}</p>
        <h3 className="text-white text-sm font-semibold leading-snug mb-3 flex-1">{market.title}</h3>

        {/* Odds bar like Polymarket */}
        <div className="mb-3">
          <div className="flex justify-between text-xs font-mono mb-1">
            <span className="text-green-400 font-semibold">Yes {yesPercent}%</span>
            <span className="text-pulse-muted">${totalPool.toFixed(0)} Vol.</span>
            <span className="text-red-400 font-semibold">{noPercent}% No</span>
          </div>
          <div className="h-1 bg-pulse-border rounded-full overflow-hidden flex">
            <div className="h-full bg-green-500 transition-all duration-500" style={{ width: yesPercent + '%' }} />
            <div className="h-full bg-red-500 transition-all duration-500" style={{ width: noPercent + '%' }} />
          </div>
        </div>

        {/* Bet buttons like Polymarket */}
        <div className="flex gap-2">
          <button
            onClick={() => handleBet('yes')}
            disabled={expired}
            className="flex-1 py-2 rounded-lg text-sm font-semibold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 hover:border-green-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Yes {yesOdds}x
          </button>
          <button
            onClick={() => handleBet('no')}
            disabled={expired}
            className="flex-1 py-2 rounded-lg text-sm font-semibold bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 hover:border-red-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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