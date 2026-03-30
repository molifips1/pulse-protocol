'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow, isPast } from 'date-fns'
import { useAccount } from 'wagmi'
import { supabase } from '../../../lib/supabase'
import { calcOdds, getStreamerFromTitle } from '../../../lib/utils'
import { BetWidget } from '../../../components/BetWidget'

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      color: 'var(--muted)', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px',
    }}>{children}</h3>
  )
}

export default function MarketPage() {
  const params = useParams()
  const channel = (params.channel as string).toLowerCase()
  const { address } = useAccount()

  const [markets, setMarkets] = useState<any[]>([])
  const [selectedMarket, setSelectedMarket] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [topHolders, setTopHolders] = useState<{ addr: string; total: number }[]>([])
  const [timeLeft, setTimeLeft] = useState('')
  const [expired, setExpired] = useState(false)
  const [dataRefresh, setDataRefresh] = useState(0)
  const [liveInfo, setLiveInfo] = useState<{ viewers?: number } | null>(null)

  // Fetch markets for this channel
  useEffect(() => {
    const fetchMarkets = async () => {
      const { data } = await supabase
        .from('markets')
        .select('*, streams(*, streamers(*))')
        .in('status', ['open', 'locked'])
      if (!data) { setLoading(false); return }

      const channelMarkets = data.filter((m: any) =>
        (m.streams?.stream_key?.toLowerCase() === channel) ||
        getStreamerFromTitle(m.title) === channel
      )
      setMarkets(channelMarkets)
      setSelectedMarket(channelMarkets[0] || null)
      setLoading(false)
    }
    fetchMarkets()

    const ch = supabase.channel('market-page')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'markets' }, fetchMarkets)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [channel])

  // Fetch activity/positions/holders
  useEffect(() => {
    if (!selectedMarket) return
    const go = async () => {
      const params = new URLSearchParams({ marketId: selectedMarket.id })
      if (address) params.set('wallet', address.toLowerCase())
      const res = await fetch(`/api/market-bets?${params}`).then(r => r.json()).catch(() => ({}))
      setActivity(res.activity || [])
      setPositions(res.myBets || [])
      setTopHolders(res.topHolders || [])
    }
    go()
  }, [selectedMarket?.id, address, dataRefresh])

  // Live info
  useEffect(() => {
    fetch('/api/live-streamers').then(r => r.json()).then(d => {
      const streamer = (d.streamers || []).find((s: any) => s.channel.toLowerCase() === channel)
      if (streamer) setLiveInfo({ viewers: streamer.viewers })
    }).catch(() => {})
  }, [channel])

  // Countdown timer
  useEffect(() => {
    if (!selectedMarket) return
    const update = () => {
      const closes = new Date(selectedMarket.closes_at)
      if (isPast(closes)) { setExpired(true); setTimeLeft('Ended') }
      else { setExpired(false); setTimeLeft(formatDistanceToNow(closes, { addSuffix: true })) }
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [selectedMarket?.closes_at])

  if (loading) {
    return (
      <div style={{ padding: '32px', maxWidth: '1100px', margin: '0 auto' }}>
        <div className="skel" style={{ height: '24px', width: '120px', marginBottom: '24px' }} />
        <div className="skel" style={{ height: '400px' }} />
      </div>
    )
  }

  const sm = selectedMarket
  const odds = sm ? calcOdds(sm) : null

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 32px' }}>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <Link href="/" style={{ color: 'var(--muted)', fontSize: '13px', textDecoration: 'none' }}>
          ← Markets
        </Link>
        <span style={{ color: 'var(--dim)' }}>·</span>
        <span style={{ color: 'var(--text)', fontWeight: '600', fontSize: '15px', fontFamily: 'var(--font-display)' }}>{channel}</span>
        {liveInfo && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            background: 'rgba(255,45,85,0.12)', color: 'var(--live)',
            fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '9999px',
            fontFamily: 'var(--font-mono)',
          }}>
            <span className="live-dot" style={{ width: '5px', height: '5px' }} />
            LIVE
            {liveInfo.viewers ? ` · ${liveInfo.viewers.toLocaleString()} viewers` : ''}
          </span>
        )}
        <a href={`https://kick.com/${channel}`} target="_blank" rel="noopener noreferrer"
           style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)', textDecoration: 'none', marginLeft: 'auto' }}>
          kick.com/{channel} ↗
        </a>
      </div>

      {/* Stream */}
      <div style={{ background: 'var(--surface-2)', borderRadius: '12px', overflow: 'hidden', aspectRatio: '16/9', width: '100%', marginBottom: '0' }}>
        <iframe
          src={`https://player.kick.com/${channel}?autoplay=true&muted=false&parent=pulse-protocol1.vercel.app`}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allowFullScreen
          allow="autoplay; fullscreen"
        />
      </div>

      {/* Market tabs */}
      {markets.length > 1 && (
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border)',
          overflowX: 'auto', marginTop: '16px',
        }}>
          {markets.map(m => {
            const active = sm?.id === m.id
            return (
              <button
                key={m.id}
                onClick={() => setSelectedMarket(m)}
                style={{
                  padding: '10px 16px', background: 'transparent', border: 'none',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  color: active ? 'var(--text)' : 'var(--muted)',
                  cursor: 'pointer', fontSize: '12px', fontWeight: active ? '600' : '400',
                  whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s',
                  marginBottom: '-1px',
                }}
              >
                {m.title.length > 44 ? m.title.slice(0, 44) + '…' : m.title}
              </button>
            )
          })}
        </div>
      )}

      {markets.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
          No active markets for this streamer yet.
        </div>
      )}

      {sm && odds && (
        <div style={{ display: 'flex', gap: '24px', marginTop: '20px', alignItems: 'flex-start' }}>
          {/* Left column */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Market question + prob */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                <h2 style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700', margin: 0, lineHeight: '1.45' }}>
                  {sm.title}
                </h2>
                <span style={{ color: expired ? 'var(--no)' : 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', flexShrink: 0, paddingTop: '3px' }}>
                  {timeLeft}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-mono)', marginBottom: '6px' }}>
                <span style={{ color: 'var(--yes)', fontWeight: '700' }}>YES {odds.yesPercent}%</span>
                <span style={{ color: 'var(--muted)' }}>${odds.totalPool.toFixed(0)} volume</span>
                <span style={{ color: 'var(--no)', fontWeight: '700' }}>{odds.noPercent}% NO</span>
              </div>
              <div style={{ height: '6px', background: 'var(--surface-2)', borderRadius: '9999px', overflow: 'hidden', display: 'flex' }}>
                <div style={{ height: '100%', width: odds.yesPercent + '%', background: 'var(--yes)', transition: 'width 0.5s ease' }} />
                <div style={{ height: '100%', width: odds.noPercent + '%', background: 'var(--no)', transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                <span style={{ padding: '3px 12px', borderRadius: '9999px', fontSize: '12px', fontFamily: 'var(--font-mono)', background: 'var(--yes-bg)', border: '1px solid rgba(59,130,246,0.25)', color: 'var(--yes)' }}>Yes ×{odds.yesOdds}</span>
                <span style={{ padding: '3px 12px', borderRadius: '9999px', fontSize: '12px', fontFamily: 'var(--font-mono)', background: 'var(--no-bg)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--no)' }}>No ×{odds.noOdds}</span>
              </div>
            </div>

            {/* Rules */}
            <div style={{ marginBottom: '24px' }}>
              <SectionLabel>Rules</SectionLabel>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
                <p style={{ color: 'var(--text)', fontSize: '13px', lineHeight: '1.65', margin: '0 0 8px' }}>
                  This market resolves <strong>YES</strong> if {sm.title.replace(/^Will\s+/i, '').replace(/\?$/, '')}, as verified by live stream data monitored by the Pulse oracle.
                  Resolves <strong>NO</strong> if the event does not occur or the stream ends first.
                </p>
                <p style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)', margin: 0 }}>
                  Source: Kick stream oracle · Closes {timeLeft}
                </p>
              </div>
            </div>

            {/* Activity */}
            <div>
              <SectionLabel>Activity</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {activity.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px' }}>No bets yet — be the first!</p>
                ) : activity.map((bet, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '9px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', fontFamily: 'var(--font-mono)',
                        background: bet.side === 'yes' ? 'var(--yes-bg)' : 'var(--no-bg)',
                        color: bet.side === 'yes' ? 'var(--yes)' : 'var(--no)',
                      }}>{bet.side.toUpperCase()}</span>
                      <span style={{ color: 'var(--muted)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                        {bet.wallet_address.slice(0, 6)}…{bet.wallet_address.slice(-4)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                        ${bet.amount_usdc.toFixed(2)}
                      </span>
                      <span style={{ color: 'var(--dim)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                        {formatDistanceToNow(new Date(bet.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right sidebar — sticky */}
          <div style={{
            width: '300px', flexShrink: 0,
            position: 'sticky', top: '20px',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
            padding: '18px',
          }}>
            <SectionLabel>Place Bet</SectionLabel>
            <BetWidget
              market={sm}
              expired={expired}
              onSuccess={() => setDataRefresh(n => n + 1)}
            />

            {positions.length > 0 && (
              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                <SectionLabel>My Positions</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {positions.map((bet, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px',
                    }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', fontFamily: 'var(--font-mono)',
                        background: bet.side === 'yes' ? 'var(--yes-bg)' : 'var(--no-bg)',
                        color: bet.side === 'yes' ? 'var(--yes)' : 'var(--no)',
                      }}>{bet.side.toUpperCase()}</span>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>${bet.amount_usdc.toFixed(2)}</div>
                        <div style={{ color: 'var(--muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>→ ${bet.potential_payout_usdc?.toFixed(2) || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {topHolders.length > 0 && (
              <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                <SectionLabel>Top Holders</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {topHolders.map((h, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span style={{ color: 'var(--dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', width: '14px' }}>#{i + 1}</span>
                        <span style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                          {h.addr.slice(0, 6)}…{h.addr.slice(-4)}
                        </span>
                      </div>
                      <span style={{ color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                        ${h.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
