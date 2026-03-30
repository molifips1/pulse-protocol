import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import type { Bet } from '../lib/supabase'

export function useUserBets() {
  const { address } = useAccount()
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchBets = async (addr: string) => {
    setFetchError(null)
    const res = await fetch(`/api/user-bets?wallet=${addr.toLowerCase()}`)
    const json = await res.json()
    if (!res.ok) {
      console.error('[useUserBets] error:', json.error)
      setFetchError(json.error || 'Failed to load bets')
      setLoading(false)
      return
    }
    setBets(json.bets || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!address) { setBets([]); return }
    setLoading(true)
    fetchBets(address)
  }, [address])

  const refetch = () => { if (address) { setLoading(true); fetchBets(address) } }

  const activeBets = bets.filter(b => b.status === 'confirmed' || b.status === 'pending')
  const settledBets = bets.filter(b => ['won', 'lost', 'refunded'].includes(b.status))
  const totalWon = settledBets.filter(b => b.status === 'won').reduce((s, b) => s + b.potential_payout_usdc, 0)

  return { bets, activeBets, settledBets, totalWon, loading, fetchError, refetch }
}
