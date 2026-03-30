'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, type Market } from '../lib/supabase'
import { StreamerCard } from './StreamerCard'
import { getStreamerFromTitle, KNOWN_STREAMERS } from '../lib/utils'

const FILTERS = [
  { key: 'casino', label: 'Casino' },
  { key: 'all', label: 'All' },
  { key: 'fps', label: 'FPS' },
  { key: 'sports', label: 'Sports' },
]

export function LiveMarketsGrid() {
  const router = useRouter()
  const [markets, setMarkets] = useState<Market[]>([])
  const [liveStreams, setLiveStreams] = useState<{ channel: string; viewers: number; thumbnail: string | null }[]>([])
  const [filter, setFilter] = useState('casino')
  const [loading, setLoading] = useState(true)

  const fetchData = async () => {
    const streamsRes = await fetch('/api/live-streamers').then(r => r.json()).catch(() => ({ streamers: [] }))
    setLiveStreams(streamsRes.streamers || [])

    let query = supabase
      .from('markets')
      .select('*, streams(*, streamers(*))')
      .in('status', ['open', 'locked'])
      .order('created_at', { ascending: false })
      .limit(100)
    if (filter !== 'all') query = query.eq('category', filter)
    const { data } = await query
    setMarkets(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const channel = supabase.channel('markets-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, fetchData)
      .subscribe()
    const streamPoll = setInterval(fetchData, 60_000)
    return () => { supabase.removeChannel(channel); clearInterval(streamPoll) }
  }, [filter])

  // Build streamer → markets map
  const streamerMap = new Map<string, Market[]>()
  for (const market of markets) {
    const streamer = market.streams?.stream_key || getStreamerFromTitle(market.title)
    if (!streamer) continue
    if (!streamerMap.has(streamer)) streamerMap.set(streamer, [])
    streamerMap.get(streamer)!.push(market)
  }

  // Merge live streams + market-only streamers
  // When a specific category is active, only show channels that have markets in that category
  const allChannels: string[] = []
  const seen = new Set<string>()
  for (const s of liveStreams) {
    if (!seen.has(s.channel)) { allChannels.push(s.channel); seen.add(s.channel) }
  }
  for (const key of streamerMap.keys()) {
    if (!seen.has(key)) { allChannels.push(key); seen.add(key) }
  }
  const filteredChannels = filter === 'all'
    ? allChannels
    : allChannels.filter(ch => streamerMap.has(ch))

  const liveMap = new Map(liveStreams.map(s => [s.channel, s]))

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Page heading */}
      <h1 style={{
        fontSize: '22px', fontFamily: 'var(--font-display)', fontWeight: 800,
        color: 'var(--text)', marginBottom: '16px',
      }}>Markets</h1>

      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: '0',
        borderBottom: '1px solid var(--border)', marginBottom: '24px',
      }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '8px 16px', background: 'transparent', border: 'none',
              borderBottom: filter === f.key ? '2px solid var(--accent)' : '2px solid transparent',
              color: filter === f.key ? 'var(--text)' : 'var(--muted)',
              fontWeight: filter === f.key ? '600' : '500',
              fontSize: '14px', cursor: 'pointer', transition: 'all 0.15s',
              marginBottom: '-1px', fontFamily: 'var(--font-body)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skel" style={{ height: '280px' }} />
          ))}
        </div>
      ) : filteredChannels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>📡</div>
          <p style={{ color: 'var(--text)', fontSize: '16px', fontFamily: 'var(--font-display)', fontWeight: 700, marginBottom: '6px' }}>
            Scanning Streams
          </p>
          <p style={{ color: 'var(--muted)', fontSize: '14px' }}>
            AI Watcher is monitoring live streams. Markets appear when events are detected.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {filteredChannels.map(channel => {
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
