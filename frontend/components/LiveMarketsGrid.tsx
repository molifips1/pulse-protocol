'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Market } from '../lib/supabase'
import { StreamerCard } from './StreamerCard'
import { getStreamerFromTitle, KNOWN_STREAMERS } from '../lib/utils'

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

  // Build streamer → all markets map
  const streamerMap = new Map<string, Market[]>()
  for (const market of markets) {
    const streamer = (market.streams?.stream_key || getStreamerFromTitle(market.title))?.toLowerCase()
    if (!streamer) continue
    if (!streamerMap.has(streamer)) streamerMap.set(streamer, [])
    streamerMap.get(streamer)!.push(market)
  }

  const liveMap = new Map(liveStreams.map(s => [s.channel.toLowerCase(), s]))
  const liveSet = new Set(liveStreams.map(s => s.channel.toLowerCase()))

  // Online: currently live streamers (ordered by viewer count)
  const onlineChannels = liveStreams
    .slice()
    .sort((a, b) => b.viewers - a.viewers)
    .map(s => s.channel.toLowerCase())

  // Offline: all known streamers not currently live, sorted by those with markets first
  const liveSetLower = new Set(onlineChannels)
  const offlineChannels: string[] = []
  const seen = new Set(onlineChannels)
  // First add known streamers with markets
  for (const key of streamerMap.keys()) {
    if (!seen.has(key)) { offlineChannels.push(key); seen.add(key) }
  }
  // Then add all other known streamers who are simply offline
  for (const s of KNOWN_STREAMERS) {
    if (!seen.has(s)) { offlineChannels.push(s); seen.add(s) }
  }

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
    <div style={{ padding: '24px 32px' }}>
      {/* Header + tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '22px', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          Markets
        </h1>
        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '3px' }}>
          {tabBtn('Online', 'online', onlineChannels.length)}
          {tabBtn('Offline', 'offline', offlineChannels.length)}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {activeChannels.map(channel => {
            const live = liveMap.get(channel)
            return (
              <StreamerCard
                key={channel}
                channel={channel}
                markets={streamerMap.get(channel) || []}
                isLive={!!live}
                thumbnail={live?.thumbnail || null}
                onClick={() => router.push(`/markets/${channel}`)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
