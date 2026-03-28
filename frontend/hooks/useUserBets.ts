import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { supabase, type Bet } from '../lib/supabase'

export function useUserBets() {
  const { address } = useAccount()
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(false)

  const fetchBets = async (addr: string) => {
    const { data } = await supabase
      .from('bets')
      .select('*, markets(title, status, outcome, category)')
      .eq('wallet_address', addr.toLowerCase())
      .order('placed_at', { ascending: false })
      .limit(50)
    setBets((data as any) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!address) { setBets([]); return }
    setLoading(true)
    fetchBets(address)

    // Realtime: refresh when bets or markets change
    const channel = supabase.channel('user-bets-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bets' }, () => fetchBets(address))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'markets' }, () => fetchBets(address))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [address])

  const activeBets = bets.filter(b => b.status === 'confirmed' || b.status === 'pending')
  const settledBets = bets.filter(b => ['won', 'lost', 'refunded'].includes(b.status))
  const totalWon = settledBets.filter(b => b.status === 'won').reduce((s, b) => s + b.potential_payout_usdc, 0)

  return { bets, activeBets, settledBets, totalWon, loading, refetch: () => address && fetchBets(address) }
}
