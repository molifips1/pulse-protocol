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

  const fetchData = async () => {
    const streamsRes = await fetch('/api/live-streamers').then(r => r.json()).catch(() => ({ streamers: [] }))
    setLiveStreams(streamsRes.streamers || [])

    const { data } = await supabase
      .from('markets')
      .select('*, streams(*, streamers(*))')
      .in('status', ['open', 'locked'])
      .eq('category', 'casino')
      .order('created_at', { ascending: false })
      .limit(100)
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
  }, [])

  // Build streamer → markets map
  const streamerMap = new Map<string, Market[]>()
  for (const market of markets) {
    const streamer = market.streams?.stream_key || getStreamerFromTitle(market.title)
    if (!streamer) continue
    if (!streamerMap.has(streamer)) streamerMap.set(streamer, [])
    streamerMap.get(streamer)!.push(market)
  }

  // Show live streamers first, then any additional channels with casino markets
  const allChannels: string[] = []
  const seen = new Set<string>()
  for (const s of liveStreams) {
    if (!seen.has(s.channel)) { allChannels.push(s.channel); seen.add(s.channel) }
  }
  for (const key of streamerMap.keys()) {
    if (!seen.has(key)) { allChannels.push(key); seen.add(key) }
  }

  const liveMap = new Map(liveStreams.map(s => [s.channel, s]))

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Page heading */}
      <h1 style={{
        fontSize: '22px', fontFamily: 'var(--font-display)', fontWeight: 800,
        color: 'var(--text)', marginBottom: '16px',
      }}>Markets</h1>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skel" style={{ height: '280px' }} />
          ))}
        </div>
      ) : allChannels.length === 0 ? (
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
          {allChannels.map(channel => {
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
