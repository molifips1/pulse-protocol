import { useEffect, useState, useCallback } from 'react'
import { supabase, type Market } from '../lib/supabase'

export function useMarkets(category?: string) {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    let query = supabase
      .from('markets')
      .select('*, streams(*, streamers(*))')
      .in('status', ['open', 'locked'])
      .order('created_at', { ascending: false })
      .limit(20)

    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    const { data, error } = await query
    if (error) setError(error.message)
    else { setMarkets(data || []); setError(null) }
    setLoading(false)
  }, [category])

  useEffect(() => {
    fetch()
    const channel = supabase.channel('markets-hook')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'markets' }, fetch)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetch])

  return { markets, loading, error, refetch: fetch }
}

export function useMarketOdds(market: Market) {
  const total = market.total_yes_usdc + market.total_no_usdc
  const rake = 1 - market.rake_rate

  const yesOdds = total > 0 && market.total_yes_usdc > 0
    ? (total * rake) / market.total_yes_usdc
    : market.initial_yes_odds

  const noOdds = total > 0 && market.total_no_usdc > 0
    ? (total * rake) / market.total_no_usdc
    : market.initial_no_odds

  const yesPercent = total > 0 ? (market.total_yes_usdc / total) * 100 : 50

  return { yesOdds, noOdds, yesPercent, noPercent: 100 - yesPercent, total }
}
