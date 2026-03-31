import { useEffect, useState, useRef } from 'react'
import { useAccount } from 'wagmi'
import type { Bet } from '../lib/supabase'

export function useUserBets() {
  const { address } = useAccount()
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchBets = async (addr: string) => {
    setFetchError(null)
    try {
      const res = await fetch(`/api/user-bets?wallet=${addr.toLowerCase()}`)
      const json = await res.json()
      if (!res.ok) {
        setFetchError(json.error || 'Failed to load bets')
      } else {
        setBets(json.bets || [])
      }
    } catch {
      setFetchError('Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!address) { setBets([]); return }
    setLoading(true)
    fetchBets(address)
    intervalRef.current = setInterval(() => fetchBets(address), 15_000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [address])

  const refetch = () => { if (address) { setLoading(true); fetchBets(address) } }

  const activeBets = bets.filter(b => b.status === 'confirmed' || b.status === 'pending')
  const settledBets = bets.filter(b => ['won', 'lost', 'refunded'].includes(b.status))
  const totalWon = settledBets.filter(b => b.status === 'won').reduce((s, b) => s + b.potential_payout_usdc, 0)

  return { bets, activeBets, settledBets, totalWon, loading, fetchError, refetch }
}
