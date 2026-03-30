import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { supabase, type Bet } from '../lib/supabase'

export function useUserBets() {
  const { address } = useAccount()
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)

  const fetchBets = async (addr: string) => {
    setFetchError(null)

    // First: sanity check — how many total bets exist in the table (no filter)?
    const { count: totalCount, error: countErr } = await supabase
      .from('bets')
      .select('*', { count: 'exact', head: true })

    // Second: fetch bets for this wallet
    const { data, error } = await supabase
      .from('bets')
      .select('*, markets(title, status, outcome, category, closes_at, streams(stream_key))')
      .eq('wallet_address', addr.toLowerCase())
      .order('placed_at', { ascending: false, nullsFirst: false })
      .limit(50)

    const info = [
      `wallet: ${addr.toLowerCase()}`,
      `total bets in table: ${countErr ? `err(${countErr.message})` : totalCount}`,
      `bets for wallet: ${error ? `err(${error.message})` : (data?.length ?? 0)}`,
    ].join(' | ')
    setDebugInfo(info)
    console.log('[useUserBets]', info)

    if (error) {
      console.error('[useUserBets] fetch error:', error)
      setFetchError(error.message)
      setLoading(false)
      return
    }
    setBets((data as any) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!address) { setBets([]); return }
    setLoading(true)
    fetchBets(address)

    const channel = supabase.channel('user-bets-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => fetchBets(address))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'markets' }, () => fetchBets(address))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [address])

  const activeBets = bets.filter(b => b.status === 'confirmed' || b.status === 'pending')
  const settledBets = bets.filter(b => ['won', 'lost', 'refunded'].includes(b.status))
  const totalWon = settledBets.filter(b => b.status === 'won').reduce((s, b) => s + b.potential_payout_usdc, 0)

  return { bets, activeBets, settledBets, totalWon, loading, fetchError, debugInfo, refetch: () => address && fetchBets(address) }
}
