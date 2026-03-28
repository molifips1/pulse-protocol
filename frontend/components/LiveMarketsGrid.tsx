'use client'
import { useEffect, useState } from 'react'
import { supabase, type Market } from '../lib/supabase'
import { StreamerCard } from './StreamerCard'
import { StreamerMarketsModal } from './StreamerMarketsModal'

const KNOWN_STREAMERS = [
  'trainwreckstv','haddzy','roshtein','xqc','adinross','mellstroy475','xposed',
  'classybeef','stevewilldoit','casinodaddy','cheesur','caseoh','kingkulbik',
  'ngslot','jarttu84','snikwins','gtasty','ac7ionman','westcol','elzeein',
  'syztmz','mitchjones','corinnakopf','taour','tyceno','capatob','snutz',
  'ilyaselmaliki','szymool','scurrows','lobanjicaa','teufeurs','deuceace','vondice',
  'bougassaa','nahoule82k','vodkafunky','7idan7777','mathematicien','paymoneywubby',
  'butisito','zonagemelosoficial','lospollosTV','letsgiveItaspin','striker6x6','rombears',
  'real_bazzi','hunterowner','sniff','andymilonakis','orangemorange',
  'stake','stakeus','nickslots','labowsky','bonusking','fruityslots','slotspinner',
  'goonbags','nicks_slots','cg_cgaming','chipmonkz','casino_eric','slotlady',
  'vegaslow','mrvegas','david_labowsky','bonanzas','spintwix','slotsfighter','casinogrounds',
  'sweetflips','zubarefff45','wesbtw','blonderabbit','artemgraph',
  'native_stream_192','aferist','generalqw77',
]

function getStreamerFromTitle(title: string): string | null {
  const lower = title.toLowerCase()
  // First try exact match from known list
  const known = KNOWN_STREAMERS.find(s => lower.includes(s.toLowerCase()))
  if (known) return known.toLowerCase()
  // Fallback: extract name from "Will [name]'s ..." or "Will [name] ..."
  const match = title.match(/^Will ([^'\s]+)(?:'s|\s)/i)
  if (match) return match[1].toLowerCase()
  return null
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'fps', label: '🎯 FPS' },
  { key: 'irl', label: '📡 IRL' },
  { key: 'sports', label: '⚽ Sports' },
]

export function LiveMarketsGrid() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [liveStreams, setLiveStreams] = useState<{ channel: string; viewers: number }[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [activeStreamer, setActiveStreamer] = useState<string | null>(null)

  const fetchData = async () => {
    // Fetch live streamers directly from Kick (bypasses broken streams table)
    const streamsRes = await fetch('/api/live-streamers').then(r => r.json()).catch(() => ({ streamers: [] }))
    setLiveStreams(streamsRes.streamers || [])

    // Fetch open markets
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
    // Refresh live streams every 60s (oracle updates every ~60s)
    const streamPoll = setInterval(fetchData, 60_000)
    return () => { supabase.removeChannel(channel); clearInterval(streamPoll) }
  }, [filter])

  // Build streamer map from markets
  const streamerMap = new Map<string, Market[]>()
  for (const market of markets) {
    const streamer = market.streams?.stream_key || getStreamerFromTitle(market.title)
    if (!streamer) continue
    if (!streamerMap.has(streamer)) streamerMap.set(streamer, [])
    streamerMap.get(streamer)!.push(market)
  }

  // Merge: start with live streams from DB, then add any market-only streamers
  const allChannels: string[] = []
  const seen = new Set<string>()
  for (const s of liveStreams) {
    if (!seen.has(s.channel)) { allChannels.push(s.channel); seen.add(s.channel) }
  }
  for (const key of streamerMap.keys()) {
    if (!seen.has(key)) { allChannels.push(key); seen.add(key) }
  }

  const activeMarkets = activeStreamer ? (streamerMap.get(activeStreamer) || []) : []

  return (
    <div>
      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '20px',
        borderBottom: '1px solid #1F2937', paddingBottom: '16px'
      }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 16px',
              borderRadius: '9999px',
              fontSize: '14px',
              fontWeight: '500',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
              background: filter === f.key ? 'white' : 'transparent',
              color: filter === f.key ? '#111827' : '#6B7280',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              height: '280px', background: '#111827',
              border: '1px solid #1F2937', borderRadius: '12px',
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
          ))}
        </div>
      ) : allChannels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📡</div>
          <p style={{ color: 'white', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
            Scanning Streams
          </p>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>
            AI Watcher is monitoring live streams. Markets appear when events are detected.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {allChannels.map(channel => (
            <StreamerCard
              key={channel}
              channel={channel}
              markets={streamerMap.get(channel) || []}
              onClick={() => setActiveStreamer(channel)}
            />
          ))}
        </div>
      )}

      {activeStreamer && (
        <StreamerMarketsModal
          channel={activeStreamer}
          markets={activeMarkets}
          onClose={() => setActiveStreamer(null)}
          onBetPlaced={fetchData}
        />
      )}
    </div>
  )
}
