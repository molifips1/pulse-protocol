'use client'
import { Navbar } from '../../components/Navbar'
import { useUserBets } from '../../hooks/useUserBets'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { formatDistanceToNow } from 'date-fns'

export default function BetsPage() {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { activeBets, settledBets, totalWon, loading } = useUserBets()

  const statusStyle: Record<string, string> = {
    won: 'text-pulse-green border-pulse-green/30 bg-pulse-green/10',
    lost: 'text-pulse-red border-pulse-red/30 bg-pulse-red/10',
    confirmed: 'text-pulse-gold border-pulse-gold/30 bg-pulse-gold/10',
    refunded: 'text-pulse-muted border-pulse-muted/30 bg-pulse-muted/10',
  }

  return (
    <main className="min-h-screen bg-pulse-dark">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <span className="font-display text-4xl tracking-widest text-white">MY BETS</span>
          <div className="h-px flex-1 bg-gradient-to-r from-pulse-border to-transparent" />
        </div>

        {!isConnected ? (
          <div className="text-center py-20">
            <p className="text-pulse-muted font-mono mb-4">Connect your wallet to view your bets</p>
            <button onClick={openConnectModal}
              className="px-6 py-2.5 bg-pulse-red text-white font-display tracking-widest rounded hover:brightness-110 transition-all">
              CONNECT WALLET
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 bg-pulse-card border border-pulse-border rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { label: 'ACTIVE BETS', value: activeBets.length },
                { label: 'SETTLED', value: settledBets.length },
                { label: 'TOTAL WON', value: `$${totalWon.toFixed(2)}` },
              ].map(s => (
                <div key={s.label} className="bg-pulse-card border border-pulse-border rounded-lg p-4 text-center">
                  <p className="font-display text-2xl text-white num">{s.value}</p>
                  <p className="text-xs font-mono text-pulse-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Active bets */}
            {activeBets.length > 0 && (
              <div className="mb-6">
                <h2 className="font-mono text-xs text-pulse-muted mb-3 uppercase tracking-widest">Active</h2>
                <div className="space-y-2">
                  {activeBets.map(bet => <BetRow key={bet.id} bet={bet} />)}
                </div>
              </div>
            )}

            {/* Settled bets */}
            {settledBets.length > 0 && (
              <div>
                <h2 className="font-mono text-xs text-pulse-muted mb-3 uppercase tracking-widest">History</h2>
                <div className="space-y-2">
                  {settledBets.map(bet => <BetRow key={bet.id} bet={bet} />)}
                </div>
              </div>
            )}

            {activeBets.length === 0 && settledBets.length === 0 && (
              <div className="text-center py-16">
                <p className="text-pulse-muted font-mono">No bets yet. Find a live market and place your first bet.</p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function BetRow({ bet }: { bet: any }) {
  const statusStyle: Record<string, string> = {
    won: 'text-pulse-green border-pulse-green/30 bg-pulse-green/10',
    lost: 'text-pulse-red border-pulse-red/30 bg-pulse-red/10',
    confirmed: 'text-pulse-gold border-pulse-gold/30 bg-pulse-gold/10',
    refunded: 'text-pulse-muted border-pulse-muted/30',
  }

  return (
    <div className="bg-pulse-card border border-pulse-border rounded-lg px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{bet.markets?.title}</p>
        <p className="text-pulse-muted text-xs font-mono mt-0.5">
          {formatDistanceToNow(new Date(bet.placed_at), { addSuffix: true })}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <p className={`text-sm font-mono font-semibold ${bet.side === 'yes' ? 'text-pulse-green' : 'text-pulse-red'}`}>
            {bet.side.toUpperCase()} · ${bet.amount_usdc.toFixed(2)}
          </p>
          <p className="text-xs text-pulse-muted font-mono">
            win ${bet.potential_payout_usdc.toFixed(2)}
          </p>
        </div>
        <span className={`text-xs font-mono px-2 py-1 rounded border ${statusStyle[bet.status] || 'text-pulse-muted border-pulse-border'}`}>
          {bet.status.toUpperCase()}
        </span>
      </div>
    </div>
  )
}
