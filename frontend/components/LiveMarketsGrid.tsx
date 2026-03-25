'use client'
import { useEffect, useState } from 'react'
import { supabase, type Market } from '../lib/supabase'
import { MarketCard } from './MarketCard'

const CATEGORY_FILTERS = ['all', 'fps', 'irl', 'sports'] as const

export function LiveMarketsGrid() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [filter, setFilter] = useState<string>('all')
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

    // Realtime subscription
    const channel = supabase
      .channel('markets-live')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'markets',
      }, () => fetchMarkets())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [filter])

  const filterLabel: Record<string, string> = {
    all: 'All', fps: '🎯 FPS', irl: '📡 IRL', sports: '⚽ Sports'
  }

  return (
    <div>
      {/* Category filter */}
      <div className="flex gap-2 mb-6">
        {CATEGORY_FILTERS.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-4 py-1.5 text-sm font-mono rounded border transition-all ${
              filter === cat
                ? 'bg-pulse-red border-pulse-red text-white'
                : 'border-pulse-border text-pulse-muted hover:border-pulse-red/50 hover:text-white'
            }`}
          >
            {filterLabel[cat]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-pulse-card border border-pulse-border rounded-lg h-64 animate-pulse" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map(market => (
            <MarketCard key={market.id} market={market} onBetPlaced={fetchMarkets} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-6xl mb-4">📡</div>
      <p className="font-display text-2xl tracking-widest text-white mb-2">SCANNING STREAMS</p>
      <p className="text-pulse-muted font-mono text-sm">AI Watcher is monitoring live streams.<br />Markets appear when events are detected.</p>
    </div>
  )
}
