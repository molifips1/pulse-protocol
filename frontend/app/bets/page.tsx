'use client'
import { useState } from 'react'
import { Navbar } from '../../components/Navbar'
import { useUserBets } from '../../hooks/useUserBets'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { formatDistanceToNow } from 'date-fns'
import { VAULT_ADDRESS, VAULT_ABI } from '../../lib/wagmi'

export default function BetsPage() {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { activeBets, settledBets, totalWon, loading, refetch } = useUserBets()

  return (
    <main style={{ minHeight: '100vh', background: '#0D1117' }}>
      <Navbar />
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
          <span style={{ color: 'white', fontSize: '28px', fontWeight: '800', letterSpacing: '0.1em' }}>MY BETS</span>
          <div style={{ height: '1px', flex: 1, background: 'linear-gradient(to right, #1F2937, transparent)' }} />
        </div>

        {!isConnected ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <p style={{ color: '#6B7280', fontFamily: 'monospace', marginBottom: '16px' }}>Connect your wallet to view your bets</p>
            <button onClick={openConnectModal} style={{
              padding: '10px 24px', background: '#DC2626', color: 'white',
              border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', fontSize: '14px'
            }}>
              CONNECT WALLET
            </button>
          </div>
        ) : loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} style={{ height: '80px', background: '#111827', border: '1px solid #1F2937', borderRadius: '12px' }} />
            ))}
          </div>
        ) : (
          <>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '32px' }}>
              {[
                { label: 'ACTIVE BETS', value: activeBets.length },
                { label: 'SETTLED', value: settledBets.length },
                { label: 'TOTAL WON', value: `$${totalWon.toFixed(2)}` },
              ].map(s => (
                <div key={s.label} style={{
                  background: '#111827', border: '1px solid #1F2937',
                  borderRadius: '12px', padding: '16px', textAlign: 'center'
                }}>
                  <p style={{ color: 'white', fontSize: '22px', fontWeight: '800', margin: 0 }}>{s.value}</p>
                  <p style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'monospace', margin: '4px 0 0', letterSpacing: '0.1em' }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Active bets */}
            {activeBets.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <p style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>Active</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activeBets.map(bet => <BetRow key={bet.id} bet={bet} onClaimed={refetch} />)}
                </div>
              </div>
            )}

            {/* Settled bets */}
            {settledBets.length > 0 && (
              <div>
                <p style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>History</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {settledBets.map(bet => <BetRow key={bet.id} bet={bet} onClaimed={refetch} />)}
                </div>
              </div>
            )}

            {activeBets.length === 0 && settledBets.length === 0 && (
              <div style={{ textAlign: 'center', padding: '64px 0' }}>
                <p style={{ color: '#6B7280', fontFamily: 'monospace' }}>No bets yet. Find a live market and place your first bet.</p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function BetRow({ bet, onClaimed }: { bet: any; onClaimed: () => void }) {
  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  const claimed = isSuccess

  const handleClaim = () => {
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: bet.status === 'won' ? 'claimWinnings' : 'claimRefund',
      args: [bet.contract_bet_id as `0x${string}`],
    })
  }

  // Refresh bets list after claim confirmed
  if (isSuccess) onClaimed()

  const statusColors: Record<string, { color: string; bg: string; border: string }> = {
    won:       { color: '#34D399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.3)' },
    lost:      { color: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)' },
    confirmed: { color: '#FCD34D', bg: 'rgba(252,211,77,0.1)',  border: 'rgba(252,211,77,0.3)' },
    refunded:  { color: '#9CA3AF', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)' },
  }
  const sc = statusColors[bet.status] || statusColors.confirmed
  const canClaim = (bet.status === 'won' || bet.status === 'refunded') && !claimed && bet.contract_bet_id

  return (
    <div style={{
      background: '#111827', border: '1px solid #1F2937',
      borderRadius: '12px', padding: '14px 16px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: 'white', fontSize: '13px', fontWeight: '600', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bet.markets?.title || 'Market'}
        </p>
        <p style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'monospace', margin: '3px 0 0' }}>
          {formatDistanceToNow(new Date(bet.placed_at), { addSuffix: true })}
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ color: bet.side === 'yes' ? '#34D399' : '#F87171', fontSize: '13px', fontFamily: 'monospace', fontWeight: '700', margin: 0 }}>
            {bet.side.toUpperCase()} · ${bet.amount_usdc.toFixed(2)}
          </p>
          <p style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'monospace', margin: '2px 0 0' }}>
            win ${bet.potential_payout_usdc.toFixed(2)}
          </p>
        </div>
        <span style={{
          fontSize: '11px', fontFamily: 'monospace', padding: '4px 10px',
          borderRadius: '6px', border: `1px solid ${sc.border}`,
          color: sc.color, background: sc.bg, fontWeight: '600'
        }}>
          {bet.status.toUpperCase()}
        </span>
        {canClaim && (
          <button
            onClick={handleClaim}
            disabled={isPending}
            style={{
              padding: '6px 14px', borderRadius: '8px', border: 'none',
              background: bet.status === 'won' ? '#059669' : '#374151',
              color: 'white', fontSize: '12px', fontWeight: '700',
              cursor: isPending ? 'not-allowed' : 'pointer', fontFamily: 'monospace',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? '...' : bet.status === 'won' ? 'CLAIM' : 'REFUND'}
          </button>
        )}
      </div>
    </div>
  )
}
