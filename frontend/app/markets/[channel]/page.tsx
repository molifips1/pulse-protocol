'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow, isPast } from 'date-fns'
import { useAccount } from 'wagmi'
import { supabase } from '../../../lib/supabase'
import { calcOdds, getStreamerFromTitle } from '../../../lib/utils'
import { BetWidget } from '../../../components/BetWidget'

// ─── tiny helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      color: 'var(--muted)', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 10px',
    }}>{children}</h3>
  )
}

function StatusBadge({ status, outcome }: { status: string; outcome?: string }) {
  let label = ''
  let bg = ''
  let color = ''
  if (status === 'open') { label = 'LIVE'; bg = 'rgba(59,130,246,0.15)'; color = 'var(--yes)' }
  else if (status === 'locked') { label = 'LOCKED'; bg = 'rgba(161,161,170,0.12)'; color = 'var(--muted)' }
  else if (status === 'resolved') {
    if (outcome === 'yes') { label = 'YES WON'; bg = 'rgba(59,130,246,0.18)'; color = 'var(--yes)' }
    else if (outcome === 'no') { label = 'NO WON'; bg = 'rgba(239,68,68,0.18)'; color = 'var(--no)' }
    else { label = 'RESOLVED'; bg = 'rgba(161,161,170,0.12)'; color = 'var(--muted)' }
  }
  else if (status === 'voided') { label = 'VOIDED'; bg = 'rgba(161,161,170,0.12)'; color = 'var(--dim)' }
  return (
    <span style={{
      padding: '3px 8px', borderRadius: '5px', fontSize: '9px', fontWeight: '800',
      fontFamily: 'var(--font-mono)', background: bg, color, letterSpacing: '0.08em',
      display: 'inline-block',
    }}>{label}</span>
  )
}

// ─── BettingCard (carousel item) ─────────────────────────────────────────────

function BettingCard({
  market, selected, onClick,
}: { market: any; selected: boolean; onClick: () => void }) {
  const odds = calcOdds(market)
  const open = market.status === 'open'

  const borderColor = selected
    ? (open ? 'var(--yes)' : 'rgba(124,58,237,0.7)')
    : 'var(--border)'
  const glowShadow = selected
    ? (open ? '0 0 0 1px var(--yes), 0 8px 32px rgba(59,130,246,0.18)' : '0 0 0 1px rgba(124,58,237,0.5), 0 8px 24px rgba(124,58,237,0.12)')
    : 'none'

  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        width: '220px',
        background: selected ? 'var(--surface-2)' : 'var(--surface)',
        border: `1px solid ${borderColor}`,
        borderRadius: '14px',
        padding: '16px',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'box-shadow 0.2s, border-color 0.2s, background 0.2s',
        boxShadow: glowShadow,
        opacity: (!open && !selected) ? 0.65 : 1,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* faint accent stripe at top */}
      {selected && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
          background: open
            ? 'linear-gradient(90deg, var(--yes), rgba(59,130,246,0.3))'
            : 'linear-gradient(90deg, var(--accent), rgba(124,58,237,0.3))',
        }} />
      )}

      {/* status badge */}
      <div style={{ marginBottom: '10px' }}>
        <StatusBadge status={market.status} outcome={market.outcome} />
      </div>

      {/* question */}
      <p style={{
        color: 'var(--text)', fontSize: '12px', fontWeight: '600',
        lineHeight: '1.5', margin: '0 0 14px',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        minHeight: '54px',
      }}>
        {market.title}
      </p>

      {/* big probability numbers */}
      {odds && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
            <div>
              <div style={{
                fontSize: '28px', fontWeight: '800', fontFamily: 'var(--font-display)',
                color: 'var(--yes)', lineHeight: 1,
              }}>
                {odds.yesPercent}%
              </div>
              <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '0.08em', marginTop: '2px' }}>
                YES ×{odds.yesOdds}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                fontSize: '28px', fontWeight: '800', fontFamily: 'var(--font-display)',
                color: 'var(--no)', lineHeight: 1,
              }}>
                {odds.noPercent}%
              </div>
              <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '0.08em', marginTop: '2px', textAlign: 'right' }}>
                ×{odds.noOdds} NO
              </div>
            </div>
          </div>

          {/* probability bar */}
          <div style={{
            height: '5px', background: 'var(--surface-2)', borderRadius: '99px',
            overflow: 'hidden', display: 'flex', marginBottom: '10px',
          }}>
            <div style={{
              height: '100%', width: `${odds.yesPercent}%`,
              background: 'var(--yes)', transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
            }} />
            <div style={{
              height: '100%', width: `${odds.noPercent}%`,
              background: 'var(--no)', transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
            }} />
          </div>

          {/* volume */}
          <div style={{
            fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--dim)',
            textAlign: 'center',
          }}>
            ${odds.totalPool.toFixed(0)} vol
          </div>
        </>
      )}
    </button>
  )
}

// ─── OutcomeResultCard (for ended markets in list view) ──────────────────────

function EndedMarketRow({
  market, selected, onClick,
}: { market: any; selected: boolean; onClick: () => void }) {
  const odds = calcOdds(market)
  const winSide = market.outcome // 'yes' | 'no' | null

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        background: selected ? 'var(--surface-2)' : 'transparent',
        border: `1px solid ${selected ? 'var(--border-2)' : 'var(--border)'}`,
        borderRadius: '10px', padding: '12px 14px',
        transition: 'background 0.15s, border-color 0.15s',
        display: 'flex', alignItems: 'center', gap: '14px',
      }}
    >
      {/* outcome indicator */}
      <div style={{
        width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: winSide === 'yes'
          ? 'rgba(59,130,246,0.12)'
          : winSide === 'no'
          ? 'rgba(239,68,68,0.12)'
          : 'var(--surface-2)',
        fontSize: '14px', fontWeight: '800', fontFamily: 'var(--font-mono)',
        color: winSide === 'yes' ? 'var(--yes)' : winSide === 'no' ? 'var(--no)' : 'var(--dim)',
      }}>
        {winSide === 'yes' ? 'Y' : winSide === 'no' ? 'N' : '—'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          color: 'var(--text)', fontSize: '12px', fontWeight: '600', margin: '0 0 3px',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{market.title}</p>
        {odds && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--yes)' }}>
              {odds.yesPercent}% YES
            </span>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--dim)' }}>·</span>
            <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', color: 'var(--muted)' }}>
              ${odds.totalPool.toFixed(0)} vol
            </span>
          </div>
        )}
      </div>

      <StatusBadge status={market.status} outcome={market.outcome} />
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

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
  const [activeTab, setActiveTab] = useState<'available' | 'ended'>('available')

  // Fetch ALL markets for this channel (open + ended)
  useEffect(() => {
    const fetchMarkets = async () => {
      const { data } = await supabase
        .from('markets')
        .select('*, streams(*, streamers(*))')
        .in('status', ['open', 'locked', 'resolved', 'voided'])
      if (!data) { setLoading(false); return }

      const channelMarkets = data.filter((m: any) =>
        (m.streams?.stream_key?.toLowerCase() === channel) ||
        getStreamerFromTitle(m.title) === channel
      )
      setMarkets(channelMarkets)

      // Auto-select: prefer first open market, else first
      const firstOpen = channelMarkets.find((m: any) => m.status === 'open')
      setSelectedMarket(prev => {
        if (prev) return channelMarkets.find((m: any) => m.id === prev.id) || channelMarkets[0] || null
        return firstOpen || channelMarkets[0] || null
      })
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
      const p = new URLSearchParams({ marketId: selectedMarket.id })
      if (address) p.set('wallet', address.toLowerCase())
      const res = await fetch(`/api/market-bets?${p}`).then(r => r.json()).catch(() => ({}))
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

  // ── loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '28px 32px', maxWidth: '1200px', margin: '0 auto' }}>
        <div className="skel" style={{ height: '20px', width: '140px', marginBottom: '20px' }} />
        <div className="skel" style={{ height: '460px', borderRadius: '16px', marginBottom: '20px' }} />
        <div style={{ display: 'flex', gap: '12px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skel" style={{ width: '220px', height: '200px', borderRadius: '14px', flexShrink: 0 }} />
          ))}
        </div>
      </div>
    )
  }

  const availableMarkets = markets.filter(m => m.status === 'open')
  const endedMarkets = markets.filter(m => m.status !== 'open')
  const sm = selectedMarket
  const odds = sm ? calcOdds(sm) : null
  const smOpen = sm?.status === 'open'

  // tab auto-switch: if selected market is ended, switch to ended tab
  const visibleTab = activeTab

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 28px 60px' }}>

      {/* ── breadcrumb + channel header ─────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        marginBottom: '18px', flexWrap: 'wrap',
      }}>
        <Link href="/" style={{
          color: 'var(--muted)', fontSize: '12px', textDecoration: 'none',
          fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '5px',
        }}>
          ← Markets
        </Link>

        <span style={{ color: 'var(--dim)', fontSize: '12px' }}>/</span>

        <span style={{
          color: 'var(--text)', fontWeight: '700', fontSize: '16px',
          fontFamily: 'var(--font-display)', letterSpacing: '-0.01em',
          textTransform: 'capitalize',
        }}>
          {channel}
        </span>

        {liveInfo && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            background: 'rgba(255,45,85,0.1)', color: 'var(--live)',
            fontSize: '10px', fontWeight: '700', padding: '3px 10px', borderRadius: '99px',
            fontFamily: 'var(--font-mono)', border: '1px solid rgba(255,45,85,0.2)',
          }}>
            <span className="live-dot" style={{ width: '5px', height: '5px' }} />
            LIVE{liveInfo.viewers ? ` · ${liveInfo.viewers.toLocaleString()}` : ''}
          </span>
        )}

        <a
          href={`https://kick.com/${channel}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            marginLeft: 'auto', color: 'var(--dim)', fontSize: '11px',
            fontFamily: 'var(--font-mono)', textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: '4px',
            transition: 'color 0.15s',
          }}
        >
          kick.com/{channel} ↗
        </a>
      </div>

      {/* ── two-column layout: stream + markets ──────────────────────────── */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* LEFT — stream + market selector (grows) */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* stream embed */}
          <div style={{
            borderRadius: '16px', overflow: 'hidden',
            aspectRatio: '16/9', width: '100%',
            background: 'var(--surface-2)',
            marginBottom: '20px',
            boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
            border: '1px solid var(--border)',
          }}>
            <iframe
              src={`https://player.kick.com/${channel}?autoplay=true&muted=false&parent=pulse-protocol1.vercel.app`}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              allowFullScreen
              allow="autoplay; fullscreen"
            />
          </div>

          {/* ── tab switcher ─────────────────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '14px' }}>
            {/* Available tab */}
            <button
              onClick={() => setActiveTab('available')}
              style={{
                padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: visibleTab === 'available' ? 'var(--surface-2)' : 'transparent',
                color: visibleTab === 'available' ? 'var(--text)' : 'var(--muted)',
                fontWeight: '700', fontSize: '13px', fontFamily: 'var(--font-display)',
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '7px',
              }}
            >
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: 'var(--yes)',
                boxShadow: availableMarkets.length > 0 ? '0 0 6px var(--yes)' : 'none',
                display: 'inline-block', flexShrink: 0,
              }} />
              Available Bets
              <span style={{
                padding: '1px 7px', borderRadius: '99px', fontSize: '10px',
                fontFamily: 'var(--font-mono)', fontWeight: '700',
                background: visibleTab === 'available' ? 'rgba(59,130,246,0.15)' : 'var(--surface)',
                color: visibleTab === 'available' ? 'var(--yes)' : 'var(--muted)',
              }}>
                {availableMarkets.length}
              </span>
            </button>

            {/* Ended tab */}
            <button
              onClick={() => setActiveTab('ended')}
              style={{
                padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: visibleTab === 'ended' ? 'var(--surface-2)' : 'transparent',
                color: visibleTab === 'ended' ? 'var(--text)' : 'var(--muted)',
                fontWeight: '700', fontSize: '13px', fontFamily: 'var(--font-display)',
                transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '7px',
              }}
            >
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: 'var(--dim)', display: 'inline-block', flexShrink: 0,
              }} />
              Ended Bets
              <span style={{
                padding: '1px 7px', borderRadius: '99px', fontSize: '10px',
                fontFamily: 'var(--font-mono)', fontWeight: '700',
                background: visibleTab === 'ended' ? 'var(--surface-2)' : 'var(--surface)',
                color: 'var(--muted)',
                border: '1px solid var(--border)',
              }}>
                {endedMarkets.length}
              </span>
            </button>
          </div>

          {/* ── AVAILABLE: horizontal scroll carousel ────────────────────── */}
          {visibleTab === 'available' && (
            <>
              {availableMarkets.length === 0 ? (
                <div style={{
                  padding: '32px 20px', borderRadius: '14px',
                  border: '1px dashed var(--border)',
                  color: 'var(--muted)', fontSize: '13px', textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                }}>
                  No open bets right now — check back soon.
                </div>
              ) : (
                <div style={{
                  display: 'flex', gap: '10px',
                  overflowX: 'auto', paddingBottom: '12px',
                  /* hide scrollbar on Firefox */
                  scrollbarWidth: 'none',
                }}>
                  {availableMarkets.map(m => (
                    <BettingCard
                      key={m.id}
                      market={m}
                      selected={sm?.id === m.id}
                      onClick={() => { setSelectedMarket(m); setActiveTab('available') }}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── ENDED: compact vertical list ─────────────────────────────── */}
          {visibleTab === 'ended' && (
            <>
              {endedMarkets.length === 0 ? (
                <div style={{
                  padding: '32px 20px', borderRadius: '14px',
                  border: '1px dashed var(--border)',
                  color: 'var(--muted)', fontSize: '13px', textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                }}>
                  No ended bets yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {endedMarkets.map(m => (
                    <EndedMarketRow
                      key={m.id}
                      market={m}
                      selected={sm?.id === m.id}
                      onClick={() => setSelectedMarket(m)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── selected market detail + activity (below carousel) ──────── */}
          {sm && odds && (
            <div style={{
              marginTop: '24px',
              borderTop: '1px solid var(--border)',
              paddingTop: '24px',
            }}>
              {/* market title + meta strip */}
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '20px 22px',
                marginBottom: '20px',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {/* accent line */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                  background: smOpen
                    ? 'linear-gradient(90deg, var(--yes) 0%, rgba(59,130,246,0.0) 100%)'
                    : 'linear-gradient(90deg, var(--dim) 0%, transparent 100%)',
                }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{
                      color: 'var(--text)', fontFamily: 'var(--font-display)',
                      fontSize: '17px', fontWeight: '700', margin: '0 0 8px', lineHeight: '1.4',
                    }}>
                      {sm.title}
                    </h2>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusBadge status={sm.status} outcome={sm.outcome} />
                      <span style={{
                        color: expired ? 'var(--no)' : 'var(--muted)',
                        fontSize: '11px', fontFamily: 'var(--font-mono)',
                      }}>
                        {timeLeft}
                      </span>
                    </div>
                  </div>

                  {/* large YES% display */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontSize: '42px', fontWeight: '800', fontFamily: 'var(--font-display)',
                      color: 'var(--yes)', lineHeight: 1,
                    }}>
                      {odds.yesPercent}%
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: '3px' }}>
                      chance YES
                    </div>
                  </div>
                </div>

                {/* full-width probability bar */}
                <div style={{
                  height: '8px', background: 'var(--surface-2)', borderRadius: '99px',
                  overflow: 'hidden', display: 'flex', marginBottom: '10px',
                }}>
                  <div style={{
                    height: '100%', width: `${odds.yesPercent}%`,
                    background: 'linear-gradient(90deg, #3B82F6, #60A5FA)',
                    transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
                  }} />
                  <div style={{
                    height: '100%', width: `${odds.noPercent}%`,
                    background: 'linear-gradient(90deg, #EF4444, #F87171)',
                    transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
                  }} />
                </div>

                {/* stats row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{
                      padding: '4px 14px', borderRadius: '99px', fontSize: '12px',
                      fontFamily: 'var(--font-mono)', fontWeight: '700',
                      background: 'var(--yes-bg)', border: '1px solid rgba(59,130,246,0.2)',
                      color: 'var(--yes)',
                    }}>
                      YES ×{odds.yesOdds}
                    </span>
                    <span style={{
                      padding: '4px 14px', borderRadius: '99px', fontSize: '12px',
                      fontFamily: 'var(--font-mono)', fontWeight: '700',
                      background: 'var(--no-bg)', border: '1px solid rgba(239,68,68,0.2)',
                      color: 'var(--no)',
                    }}>
                      NO ×{odds.noOdds}
                    </span>
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                    ${odds.totalPool.toFixed(0)} total volume
                  </span>
                </div>
              </div>

              {/* rules */}
              <div style={{ marginBottom: '20px' }}>
                <SectionLabel>Resolution rules</SectionLabel>
                <div style={{
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: '12px', padding: '14px 16px',
                }}>
                  <p style={{ color: 'var(--text)', fontSize: '13px', lineHeight: '1.65', margin: '0 0 8px' }}>
                    This market resolves <strong>YES</strong> if {sm.title.replace(/^Will\s+/i, '').replace(/\?$/, '')}, as verified by live stream data monitored by the Pulse oracle.
                    Resolves <strong>NO</strong> if the event does not occur or the stream ends first.
                  </p>
                  <p style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)', margin: 0 }}>
                    Source: Kick stream oracle · {sm.status === 'open' ? `Closes ${timeLeft}` : 'Closed'}
                  </p>
                </div>
              </div>

              {/* activity feed */}
              <div>
                <SectionLabel>Activity feed</SectionLabel>
                {activity.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '13px', padding: '12px 0' }}>
                    No bets yet — be the first!
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {activity.map((bet, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 14px', background: 'var(--surface)',
                        border: '1px solid var(--border)', borderRadius: '9px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{
                            padding: '2px 9px', borderRadius: '5px', fontSize: '10px',
                            fontWeight: '800', fontFamily: 'var(--font-mono)',
                            background: bet.side === 'yes' ? 'var(--yes-bg)' : 'var(--no-bg)',
                            color: bet.side === 'yes' ? 'var(--yes)' : 'var(--no)',
                            letterSpacing: '0.05em',
                          }}>
                            {bet.side.toUpperCase()}
                          </span>
                          <span style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                            {bet.wallet_address.slice(0, 6)}…{bet.wallet_address.slice(-4)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <span style={{
                            color: 'var(--text)', fontSize: '13px',
                            fontFamily: 'var(--font-mono)', fontWeight: '600',
                          }}>
                            ${bet.amount_usdc.toFixed(2)}
                          </span>
                          {(bet.placed_at || bet.created_at) && (
                            <span style={{ color: 'var(--dim)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                              {formatDistanceToNow(new Date(bet.placed_at || bet.created_at), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {markets.length === 0 && !loading && (
            <div style={{
              textAlign: 'center', padding: '64px 0',
              color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '13px',
            }}>
              No markets for this streamer yet.
            </div>
          )}
        </div>

        {/* RIGHT — sticky bet sidebar */}
        {sm && odds && (
          <div style={{
            width: '300px', flexShrink: 0,
            position: 'sticky', top: '20px',
            display: 'flex', flexDirection: 'column', gap: '12px',
          }}>

            {/* bet widget card */}
            <div style={{
              background: 'var(--surface)',
              border: `1px solid ${smOpen ? 'var(--border-2)' : 'var(--border)'}`,
              borderRadius: '16px',
              overflow: 'hidden',
            }}>
              {/* card header strip */}
              <div style={{
                padding: '14px 18px 12px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-2)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '0.1em', marginBottom: '2px' }}>
                    PLACE BET
                  </div>
                  <div style={{
                    fontSize: '13px', fontWeight: '600', color: 'var(--text)',
                    display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    maxWidth: '180px',
                  }}>
                    {sm.title}
                  </div>
                </div>
                {smOpen && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '22px', fontWeight: '800', fontFamily: 'var(--font-display)',
                      color: 'var(--yes)', lineHeight: 1,
                    }}>
                      {odds.yesPercent}%
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                      YES
                    </div>
                  </div>
                )}
                {!smOpen && (
                  <StatusBadge status={sm.status} outcome={sm.outcome} />
                )}
              </div>

              <div style={{ padding: '16px 18px' }}>
                <BetWidget
                  market={sm}
                  expired={expired}
                  onSuccess={() => setDataRefresh(n => n + 1)}
                />
              </div>
            </div>

            {/* my positions */}
            {positions.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '14px', padding: '16px 18px',
              }}>
                <SectionLabel>My Positions</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {positions.map((bet, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '9px 12px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)', borderRadius: '9px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          padding: '2px 9px', borderRadius: '5px', fontSize: '10px',
                          fontWeight: '800', fontFamily: 'var(--font-mono)',
                          background: bet.side === 'yes' ? 'var(--yes-bg)' : 'var(--no-bg)',
                          color: bet.side === 'yes' ? 'var(--yes)' : 'var(--no)',
                        }}>
                          {bet.side.toUpperCase()}
                        </span>
                        <span style={{ color: 'var(--muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                          staked
                        </span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                          ${bet.amount_usdc.toFixed(2)}
                        </div>
                        <div style={{ color: 'var(--muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                          → ${bet.potential_payout_usdc?.toFixed(2) || '—'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* top holders */}
            {topHolders.length > 0 && (
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '14px', padding: '16px 18px',
              }}>
                <SectionLabel>Top Holders</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {topHolders.map((h, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)', borderRadius: '9px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          color: i === 0 ? '#F59E0B' : i === 1 ? 'var(--muted)' : 'var(--dim)',
                          fontSize: '10px', fontFamily: 'var(--font-mono)',
                          width: '16px', textAlign: 'center', fontWeight: '700',
                        }}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : `#${i + 1}`}
                        </span>
                        <span style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                          {h.addr.slice(0, 6)}…{h.addr.slice(-4)}
                        </span>
                      </div>
                      <span style={{
                        color: 'var(--text)', fontSize: '12px',
                        fontFamily: 'var(--font-mono)', fontWeight: '600',
                      }}>
                        ${h.total.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}
