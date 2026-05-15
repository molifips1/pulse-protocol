'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Market } from '../lib/supabase'
import { StreamerCard } from './StreamerCard'
import { buildStreamerMarketModel } from '../lib/marketSimulation'

export function LiveMarketsGrid() {
  const router = useRouter()
  const [markets, setMarkets] = useState<Market[]>([])
  const [liveStreams, setLiveStreams] = useState<{ channel: string; viewers: number; thumbnail: string | null }[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'online' | 'offline'>('online')

  const fetchData = async () => {
    const streamsRes = await fetch('/api/live-streamers').then(r => r.json()).catch(() => ({ streamers: [] }))
    setLiveStreams(streamsRes.streamers || [])

    // Fetch all markets (all statuses) so offline streamers show their history
    const { data } = await supabase
      .from('markets')
      .select('*, streams(*, streamers(*))')
      .order('created_at', { ascending: false })
      .limit(300)
    setMarkets(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const channel = supabase.channel('markets-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, fetchData)
      .subscribe()
    const streamPoll = setInterval(fetchData, 30_000)
    return () => { supabase.removeChannel(channel); clearInterval(streamPoll) }
  }, [])

  const liveMap = new Map(liveStreams.map(s => [s.channel.toLowerCase(), s]))
  const { marketsByChannel, onlineChannels, offlineChannels, openMarkets, totalVolume } =
    buildStreamerMarketModel(markets, liveStreams)

  const activeChannels = tab === 'online' ? onlineChannels : offlineChannels

  const tabBtn = (label: string, value: 'online' | 'offline', count: number) => (
    <button
      onClick={() => setTab(value)}
      style={{
        padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer',
        background: tab === value ? 'var(--surface-2)' : 'transparent',
        color: tab === value ? 'var(--text)' : 'var(--muted)',
        fontWeight: '700', fontSize: '13px', fontFamily: 'var(--font-display)',
        transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '7px',
      }}
    >
      <span style={{
        width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
        background: value === 'online' ? 'var(--live)' : 'var(--dim)',
        boxShadow: value === 'online' && tab === 'online' ? '0 0 6px var(--live)' : 'none',
      }} />
      {label}
      <span style={{
        padding: '1px 7px', borderRadius: '99px', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: '700',
        background: tab === value ? (value === 'online' ? 'rgba(255,45,85,0.15)' : 'var(--surface)') : 'var(--surface)',
        color: tab === value ? (value === 'online' ? 'var(--live)' : 'var(--muted)') : 'var(--dim)',
        border: '1px solid var(--border)',
      }}>{count}</span>
    </button>
  )

  return (
    <div className="markets-page">
      <div className="markets-hero">
        <div>
          <div style={{ color: 'var(--live)', fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 800, letterSpacing: '0.14em', marginBottom: '6px' }}>
            PULSE PROTOCOL
          </div>
          <h1 style={{ fontSize: '28px', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>
            Kick Markets
          </h1>
          <div className="market-stats">
            <div><span>{onlineChannels.length}</span><label>Live creators</label></div>
            <div><span>{openMarkets.length}</span><label>Open markets</label></div>
            <div><span>${totalVolume.toFixed(0)}</span><label>Volume</label></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '3px', alignSelf: 'flex-start' }}>
          {tabBtn('Online', 'online', onlineChannels.length)}
          {tabBtn('Offline', 'offline', offlineChannels.length)}
        </div>
      </div>

      {loading ? (
        <div className="streamer-grid">
          {[...Array(6)].map((_, i) => <div key={i} className="skel" style={{ height: '280px' }} />)}
        </div>
      ) : activeChannels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>{tab === 'online' ? '📡' : '💤'}</div>
          <p style={{ color: 'var(--text)', fontSize: '16px', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '6px' }}>
            {tab === 'online' ? 'No Live Streams' : 'No Offline History'}
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '14px' }}>
            {tab === 'online' ? 'No streamers are live right now.' : 'Bet history appears here when streamers go offline.'}
          </p>
        </div>
      ) : (
        <div className="streamer-grid">
          {activeChannels.map(channel => {
            const live = liveMap.get(channel)
            return (
              <StreamerCard
                key={channel}
                channel={channel}
                markets={marketsByChannel.get(channel) || []}
                isLive={!!live}
                thumbnail={live?.thumbnail || null}
                viewers={live?.viewers}
                onClick={() => router.push(`/markets/${channel}`)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
