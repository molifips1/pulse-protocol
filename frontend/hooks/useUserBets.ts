import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { supabase, type Bet } from '../lib/supabase'

export function useUserBets() {
  const { address } = useAccount()
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) { setBets([]); return }
    setLoading(true)

    supabase
      .from('bets')
      .select('*, markets(title, status, outcome, category)')
      .eq('wallet_address', address.toLowerCase())
      .order('placed_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setBets((data as any) || [])
        setLoading(false)
      })
  }, [address])

  const activeBets = bets.filter(b => b.status === 'confirmed' || b.status === 'pending')
  const settledBets = bets.filter(b => ['won', 'lost', 'refunded'].includes(b.status))
  const totalWon = settledBets.filter(b => b.status === 'won').reduce((s, b) => s + b.potential_payout_usdc, 0)

  return { bets, activeBets, settledBets, totalWon, loading }
}
