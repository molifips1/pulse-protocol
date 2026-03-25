'use client'
import { useEffect, useState } from 'react'
import { supabase, type Market } from '../lib/supabase'
import { MarketCard } from './MarketCard'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'fps', label: '🎯 FPS' },
  { key: 'irl', label: '📡 IRL' },
  { key: 'sports', label: '⚽ Sports' },
]

export function LiveMarketsGrid() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const fetchMarkets = async () => {
    let query = supabase
      .from('markets')
      .select('*, streams(*, streamers(*))')
      .in('status', ['open', 'locked'])
      .order('created_at', { ascending: false })
      .limit(20)

    if (filter !== 'all') query = query.eq('category', filter)

    const { data } = await query
    setMarkets(data || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchMarkets()
    const channel = supabase.channel('markets-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, fetchMarkets)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [filter])

  return (
    <div>
      {/* Filter tabs like Polymarket */}
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{
              height: '320px', background: '#111827',
              border: '1px solid #1F2937', borderRadius: '12px',
              animation: 'pulse 1.5s ease-in-out infinite'
            }} />
          ))}
        </div>
      ) : markets.length === 0 ? (
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {markets.map(market => (
            <MarketCard key={market.id} market={market} onBetPlaced={fetchMarkets} />
          ))}
        </div>
      )}
    </div>
  )
}