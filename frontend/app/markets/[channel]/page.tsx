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

// ─── BettingCard (Polymarket-style grid card) ────────────────────────────────

function BettingCard({
  market, selected, onClick,
}: { market: any; selected: boolean; onClick: () => void }) {
  const odds = calcOdds(market)

  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? 'var(--surface-2)' : 'var(--surface)',
        border: `1px solid ${selected ? 'var(--yes)' : 'var(--border)'}`,
        borderRadius: '14px',
        padding: '16px',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.15s',
        boxShadow: selected ? '0 0 0 1px var(--yes), 0 4px 20px rgba(59,130,246,0.1)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
      }}
    >
      {/* Header: icon + title */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{
          width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))',
          border: '1px solid rgba(59,130,246,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '16px',
        }}>🎲</div>
        <p style={{
          color: 'var(--text)', fontSize: '13px', fontWeight: '600',
          lineHeight: '1.45', margin: 0, flex: 1,
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {market.title}
        </p>
      </div>

      {/* YES / NO outcome rows */}
      {odds && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* YES row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 10px', borderRadius: '8px',
            background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.14)',
          }}>
            <span style={{
              color: 'var(--yes)', fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)',
            }}>
              {odds.yesPercent}%
            </span>
            <span style={{
              padding: '3px 16px', borderRadius: '99px', fontSize: '12px', fontWeight: '700',
              background: 'rgba(59,130,246,0.18)', color: 'var(--yes)',
              fontFamily: 'var(--font-mono)',
            }}>Yes</span>
          </div>
          {/* NO row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 10px', borderRadius: '8px',
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.14)',
          }}>
            <span style={{
              color: 'var(--no)', fontSize: '14px', fontWeight: '700', fontFamily: 'var(--font-mono)',
            }}>
              {odds.noPercent}%
            </span>
            <span style={{
              padding: '3px 16px', borderRadius: '99px', fontSize: '12px', fontWeight: '700',
              background: 'rgba(239,68,68,0.18)', color: 'var(--no)',
              fontFamily: 'var(--font-mono)',
            }}>No</span>
          </div>
        </div>
      )}

      {/* Thin probability bar */}
      {odds && (
        <div style={{ height: '4px', background: 'var(--surface-2)', borderRadius: '99px', overflow: 'hidden', display: 'flex' }}>
          <div style={{ height: '100%', width: `${odds.yesPercent}%`, background: 'var(--yes)', transition: 'width 0.6s ease' }} />
          <div style={{ height: '100%', width: `${odds.noPercent}%`, background: 'var(--no)', transition: 'width 0.6s ease' }} />
        </div>
      )}

      {/* Footer: LIVE + volume */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--live)', boxShadow: '0 0 6px var(--live)', display: 'inline-block',
          }} />
          <span style={{ color: 'var(--live)', fontSize: '10px', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>LIVE</span>
        </div>
        {odds && (
          <span style={{ color: 'var(--dim)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
            ${odds.totalPool.toFixed(0)} Vol.
          </span>
        )}
      </div>
    </button>
  )
}

// ─── GroupedEventCard (Polymarket multi-range style) ─────────────────────────

function GroupedEventCard({
  eventTitle, markets, selectedId, onSelect,
}: {
  eventTitle: string
  markets: any[]
  selectedId: string | null
  onSelect: (m: any, side: 'yes' | 'no') => void
}) {
  const totalVol = markets.reduce((s, m) => {
    const o = calcOdds(m); return s + (o?.totalPool ?? 0)
  }, 0)

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: '14px', overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
            background: 'linear-gradient(135deg,rgba(59,130,246,0.2),rgba(99,102,241,0.2))',
            border: '1px solid rgba(59,130,246,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px',
          }}>👁</div>
          <p style={{ color: 'var(--text)', fontSize: '14px', fontWeight: '700', margin: 0, lineHeight: '1.4', flex: 1 }}>
            {eventTitle}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--live)', boxShadow: '0 0 5px var(--live)', flexShrink: 0 }} />
          <span style={{ color: 'var(--live)', fontSize: '10px', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>LIVE</span>
          <span style={{ color: 'var(--dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', marginLeft: '6px' }}>
            ${totalVol.toFixed(0)} total vol.
          </span>
        </div>
      </div>

      {/* column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 70px 110px 110px',
        padding: '7px 18px', background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
      }}>
        {['Outcome', 'Chance', '', ''].map((h, i) => (
          <span key={i} style={{ color: 'var(--dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: '600', letterSpacing: '0.08em', textAlign: i >= 2 ? 'center' : 'left' }}>{h}</span>
        ))}
      </div>

      {/* range rows */}
      {markets.map((m, i) => {
        const odds = calcOdds(m)
        const rangeLabel = m.title.split(' | ')[1]?.replace(' viewers', '') ?? m.title
        const isSelected = selectedId === m.id
        return (
          <div
            key={m.id}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 70px 110px 110px',
              alignItems: 'center',
              padding: '13px 18px',
              borderBottom: i < markets.length - 1 ? '1px solid var(--border)' : 'none',
              background: isSelected ? 'rgba(59,130,246,0.04)' : 'transparent',
              transition: 'background 0.12s',
            }}
          >
            {/* range label + volume */}
            <div>
              <div style={{ color: 'var(--text)', fontSize: '14px', fontWeight: '700' }}>{rangeLabel}</div>
              {odds && (
                <div style={{ color: 'var(--dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  ${odds.totalPool.toFixed(0)} Vol.
                </div>
              )}
            </div>

            {/* probability */}
            <div style={{
              color: 'var(--text)', fontSize: '18px', fontWeight: '800',
              fontFamily: 'var(--font-display)',
            }}>
              {odds ? (odds.yesPercent < 1 ? '<1' : odds.yesPercent) : '—'}%
            </div>

            {/* Buy Yes */}
            <button
              onClick={() => onSelect(m, 'yes')}
              style={{
                padding: '9px 0', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: isSelected && m.id === selectedId ? 'rgba(59,130,246,0.22)' : 'rgba(59,130,246,0.13)',
                color: 'var(--yes)', fontSize: '12px', fontWeight: '700', fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap', transition: 'background 0.12s', width: '100%',
              }}
            >
              Buy Yes {odds ? `${odds.yesPercent}¢` : ''}
            </button>

            {/* Buy No */}
            <button
              onClick={() => onSelect(m, 'no')}
              style={{
                padding: '9px 0', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: 'rgba(239,68,68,0.1)',
                color: 'var(--no)', fontSize: '12px', fontWeight: '700', fontFamily: 'var(--font-mono)',
                whiteSpace: 'nowrap', transition: 'background 0.12s', width: '100%',
              }}
            >
              Buy No {odds ? `${odds.noPercent}¢` : ''}
            </button>
          </div>
        )
      })}
    </div>
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
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes')
  const [loading, setLoading] = useState(true)
  const [activity, setActivity] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [topHolders, setTopHolders] = useState<{ addr: string; total: number }[]>([])
  const [timeLeft, setTimeLeft] = useState('')
  const [expired, setExpired] = useState(false)
  const [dataRefresh, setDataRefresh] = useState(0)
  const [liveInfo, setLiveInfo] = useState<{ viewers?: number } | null>(null)
  const [activeTab, setActiveTab] = useState<'available' | 'ended'>('available')
  const [buckets, setBuckets] = useState<any[]>([])

  // Fetch buckets when selected market changes
  useEffect(() => {
    if (!selectedMarket || selectedMarket.market_type !== 'categorical') { setBuckets([]); return }
    supabase.from('market_buckets').select('*').eq('market_id', selectedMarket.id)
      .then(({ data }) => setBuckets(data || []))
  }, [selectedMarket?.id])

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

  // Live info — fetch directly from Kick every 10s for accurate real-time data
  useEffect(() => {
    const fetchLive = () => {
      fetch(`/api/kick-live/${channel}`).then(r => r.json()).then(d => {
        if (d.isLive) setLiveInfo({ viewers: d.viewers })
        else setLiveInfo(null)
      }).catch(() => {})
    }
    fetchLive()
    const t = setInterval(fetchLive, 10000)
    return () => clearInterval(t)
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
  const visibleTab = activeTab

  // Group available markets that share an event title (split on " | ")
  // Returns: [{ type:'group', eventTitle, markets } | { type:'single', market }]
  const availableItems: Array<{ type: 'group'; eventTitle: string; markets: any[] } | { type: 'single'; market: any }> = []
  const groupMap = new Map<string, any[]>()
  for (const m of availableMarkets) {
    const sep = m.title.indexOf(' | ')
    if (sep !== -1) {
      const key = m.title.slice(0, sep)
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key)!.push(m)
    } else {
      availableItems.push({ type: 'single', market: m })
    }
  }
  // Insert groups at start (viewer count market is the first standard bet)
  for (const [eventTitle, groupMarkets] of groupMap) {
    availableItems.unshift({ type: 'group', eventTitle, markets: groupMarkets })
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '16px 24px 60px' }}>

      {/* breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <Link href="/" style={{ color: 'var(--muted)', fontSize: '14px', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>
          ← Markets
        </Link>
        <span style={{ color: 'var(--dim)', fontSize: '18px' }}>/</span>
        <span style={{ color: 'var(--text)', fontWeight: '700', fontSize: '24px', fontFamily: 'var(--font-display)', textTransform: 'capitalize' }}>
          {channel}
        </span>
        {liveInfo && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            background: 'rgba(255,45,85,0.1)', color: 'var(--live)',
            fontSize: '14px', fontWeight: '700', padding: '6px 14px', borderRadius: '99px',
            fontFamily: 'var(--font-mono)', border: '1px solid rgba(255,45,85,0.25)',
          }}>
            <span className="live-dot" style={{ width: '7px', height: '7px' }} />
            LIVE{liveInfo.viewers ? ` · ${liveInfo.viewers.toLocaleString()}` : ''}
          </span>
        )}
        <a href={`https://kick.com/${channel}`} target="_blank" rel="noopener noreferrer"
          style={{ marginLeft: 'auto', color: 'var(--dim)', fontSize: '11px', fontFamily: 'var(--font-mono)', textDecoration: 'none' }}>
          kick.com/{channel} ↗
        </a>
      </div>

      {/* ── stream embed (full width) ── */}
      <div style={{
        borderRadius: '14px', overflow: 'hidden', aspectRatio: '16/9', width: '100%',
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        marginBottom: '20px',
      }}>
        <iframe
          src={`https://player.kick.com/${channel}?autoplay=true&muted=false`}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allowFullScreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          referrerPolicy="origin"
        />
      </div>

      {/* ── below stream: LEFT = markets + detail, RIGHT = sticky bet widget ── */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

        {/* ── LEFT: tabs + market cards + selected detail + activity ── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* tab switcher */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
            <button onClick={() => setActiveTab('available')} style={{
              flex: 1, padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: visibleTab === 'available' ? 'var(--surface-2)' : 'transparent',
              color: visibleTab === 'available' ? 'var(--text)' : 'var(--muted)',
              fontWeight: '700', fontSize: '12px', fontFamily: 'var(--font-display)',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--yes)', boxShadow: availableMarkets.length > 0 ? '0 0 5px var(--yes)' : 'none', flexShrink: 0 }} />
              Available
              <span style={{ padding: '1px 6px', borderRadius: '99px', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: '700', background: visibleTab === 'available' ? 'rgba(59,130,246,0.15)' : 'var(--surface)', color: visibleTab === 'available' ? 'var(--yes)' : 'var(--muted)' }}>
                {availableMarkets.length}
              </span>
            </button>
            <button onClick={() => setActiveTab('ended')} style={{
              flex: 1, padding: '8px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
              background: visibleTab === 'ended' ? 'var(--surface-2)' : 'transparent',
              color: visibleTab === 'ended' ? 'var(--text)' : 'var(--muted)',
              fontWeight: '700', fontSize: '12px', fontFamily: 'var(--font-display)',
              transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--dim)', flexShrink: 0 }} />
              Ended
              <span style={{ padding: '1px 6px', borderRadius: '99px', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: '700', background: visibleTab === 'ended' ? 'var(--surface-2)' : 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                {endedMarkets.length}
              </span>
            </button>
          </div>

          {/* market cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {visibleTab === 'available' && (
              availableItems.length === 0 ? (
                <div style={{ padding: '24px', borderRadius: '12px', border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: '12px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                  No open bets right now
                </div>
              ) : availableItems.map((item, i) =>
                item.type === 'group' ? (
                  <GroupedEventCard
                    key={item.eventTitle}
                    eventTitle={item.eventTitle}
                    markets={item.markets}
                    selectedId={sm?.id ?? null}
                    onSelect={(m, side) => { setSelectedMarket(m); setSelectedSide(side); setActiveTab('available') }}
                  />
                ) : (
                  <BettingCard key={item.market.id} market={item.market} selected={sm?.id === item.market.id} onClick={() => { setSelectedMarket(item.market); setActiveTab('available') }} />
                )
              )
            )}
            {visibleTab === 'ended' && (
              endedMarkets.length === 0 ? (
                <div style={{ padding: '24px', borderRadius: '12px', border: '1px dashed var(--border)', color: 'var(--muted)', fontSize: '12px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
                  No ended bets yet
                </div>
              ) : endedMarkets.map(m => (
                <EndedMarketRow key={m.id} market={m} selected={sm?.id === m.id} onClick={() => setSelectedMarket(m)} />
              ))
            )}
          </div>

          {/* selected market detail */}
          {sm && odds ? (
            <div>
              {/* market question + prob card */}
              <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '16px', padding: '20px 22px', marginBottom: '16px',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
                  background: smOpen
                    ? 'linear-gradient(90deg, var(--yes), rgba(59,130,246,0))'
                    : 'linear-gradient(90deg, var(--dim), transparent)',
                }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '700', margin: '0 0 10px', lineHeight: '1.35' }}>
                      {sm.title}
                    </h2>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <StatusBadge status={sm.status} outcome={sm.outcome} />
                      <span style={{ color: expired ? 'var(--no)' : 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{timeLeft}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '44px', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--yes)', lineHeight: 1 }}>{odds.yesPercent}%</div>
                    <div style={{ fontSize: '10px', color: 'var(--muted)', fontFamily: 'var(--font-mono)', marginTop: '3px' }}>chance YES</div>
                  </div>
                </div>
                <div style={{ height: '8px', background: 'var(--surface-2)', borderRadius: '99px', overflow: 'hidden', display: 'flex', marginBottom: '12px' }}>
                  <div style={{ height: '100%', width: `${odds.yesPercent}%`, background: 'linear-gradient(90deg,#3B82F6,#60A5FA)', transition: 'width 0.6s ease' }} />
                  <div style={{ height: '100%', width: `${odds.noPercent}%`, background: 'linear-gradient(90deg,#EF4444,#F87171)', transition: 'width 0.6s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ padding: '4px 14px', borderRadius: '99px', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: '700', background: 'var(--yes-bg)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--yes)' }}>YES ×{odds.yesOdds}</span>
                    <span style={{ padding: '4px 14px', borderRadius: '99px', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: '700', background: 'var(--no-bg)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--no)' }}>NO ×{odds.noOdds}</span>
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>${odds.totalPool.toFixed(0)} total volume</span>
                </div>
              </div>

              {/* resolution rules */}
              <div style={{ marginBottom: '16px' }}>
                <SectionLabel>Resolution rules</SectionLabel>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
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
                  <p style={{ color: 'var(--muted)', fontSize: '13px', padding: '8px 0' }}>No bets yet — be the first!</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {activity.map((bet, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '9px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{
                            padding: '2px 9px', borderRadius: '5px', fontSize: '10px', fontWeight: '800',
                            fontFamily: 'var(--font-mono)', letterSpacing: '0.05em',
                            background: bet.side === 'yes' ? 'var(--yes-bg)' : 'var(--no-bg)',
                            color: bet.side === 'yes' ? 'var(--yes)' : 'var(--no)',
                          }}>{bet.side.toUpperCase()}</span>
                          <span style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
                            {bet.wallet_address.slice(0, 6)}…{bet.wallet_address.slice(-4)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <span style={{ color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>${bet.amount_usdc.toFixed(2)}</span>
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
          ) : (
            markets.length > 0 && (
              <div style={{ padding: '24px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '14px', textAlign: 'center' }}>
                <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 0 }}>Select a bet above to see details</p>
              </div>
            )
          )}

          {markets.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
              No markets for this streamer yet.
            </div>
          )}
        </div>

        {/* ── RIGHT: sticky bet widget + positions + holders ── */}
        <div style={{
          width: '360px', flexShrink: 0,
          position: 'sticky', top: '16px',
          maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
          scrollbarWidth: 'none',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          {sm && odds ? (
            <>
              {/* bet widget */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--muted)', letterSpacing: '0.12em', marginBottom: '5px' }}>PLACE BET</div>
                  <p style={{ color: 'var(--text)', fontSize: '13px', fontWeight: '600', margin: 0, lineHeight: '1.4' }}>{sm.title}</p>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <BetWidget market={sm} buckets={buckets} expired={expired} forceSide={selectedSide} onSuccess={() => setDataRefresh(n => n + 1)} />
                </div>
              </div>

              {/* my positions */}
              {positions.length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                  <SectionLabel>My Positions</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {positions.map((bet, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '800', fontFamily: 'var(--font-mono)', background: bet.side === 'yes' ? 'var(--yes-bg)' : 'var(--no-bg)', color: bet.side === 'yes' ? 'var(--yes)' : 'var(--no)' }}>{bet.side.toUpperCase()}</span>
                          <span style={{ color: 'var(--muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>staked</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>${bet.amount_usdc.toFixed(2)}</div>
                          <div style={{ color: 'var(--muted)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>→ ${bet.potential_payout_usdc?.toFixed(2) || '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* top holders */}
              {topHolders.length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                  <SectionLabel>Top Holders</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {topHolders.map((h, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                          <span style={{ color: 'var(--dim)', fontSize: '10px', fontFamily: 'var(--font-mono)', width: '16px', textAlign: 'center', fontWeight: '700' }}>
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : `#${i + 1}`}
                          </span>
                          <span style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{h.addr.slice(0, 6)}…{h.addr.slice(-4)}</span>
                        </div>
                        <span style={{ color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>${h.total.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: '24px', background: 'var(--surface)', border: '1px dashed var(--border)', borderRadius: '14px', textAlign: 'center' }}>
              <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 0 }}>Select a bet to place your position</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
