'use client'
import { useState, useEffect } from 'react'
import { useUserBets } from '../../hooks/useUserBets'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { formatDistanceToNow, isPast } from 'date-fns'
import Link from 'next/link'
import { VAULT_ADDRESS, VAULT_ABI } from '../../lib/wagmi'
import { getStreamerFromTitle } from '../../lib/utils'

type Tab = 'active' | 'settled' | 'all'

export default function BetsPage() {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { bets, activeBets, settledBets, totalWon, loading, fetchError, refetch } = useUserBets()
  const [tab, setTab] = useState<Tab>('active')

  const totalWagered = bets.reduce((s, b) => s + b.amount_usdc, 0)
  const pnl = totalWon - totalWagered

  const displayBets = tab === 'active' ? activeBets : tab === 'settled' ? settledBets : bets

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{
        fontSize: '22px', fontFamily: 'var(--font-display)', fontWeight: 800,
        color: 'var(--text)', marginBottom: '12px',
      }}>My Bets</h1>


      {!isConnected ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <p style={{ color: 'var(--muted)', marginBottom: '16px', fontSize: '15px' }}>Connect your wallet to see your bets</p>
          <button
            onClick={openConnectModal}
            style={{
              padding: '10px 24px', background: 'var(--accent)', color: 'white',
              border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', fontSize: '14px',
            }}
          >Connect Wallet</button>
        </div>
      ) : loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skel" style={{ height: '80px' }} />
          ))}
        </div>
      ) : fetchError ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ color: 'var(--no)', fontSize: '14px', marginBottom: '8px' }}>Failed to load bets</p>
          <p style={{ color: 'var(--muted)', fontSize: '12px', fontFamily: 'var(--font-mono)', marginBottom: '16px' }}>{fetchError}</p>
          <button
            onClick={refetch}
            style={{ padding: '8px 20px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', cursor: 'pointer', fontSize: '13px' }}
          >Retry</button>
        </div>
      ) : (
        <>
          {/* Stats row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Total Wagered', value: `$${totalWagered.toFixed(2)}` },
              { label: 'Total Won', value: `$${totalWon.toFixed(2)}` },
              { label: 'P&L', value: `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`, color: pnl >= 0 ? 'var(--green)' : 'var(--no)' },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '10px', padding: '14px', textAlign: 'center',
              }}>
                <p style={{ color: s.color || 'var(--text)', fontSize: '18px', fontWeight: '700', margin: '0 0 3px', fontFamily: 'var(--font-mono)' }}>{s.value}</p>
                <p style={{ color: 'var(--muted)', fontSize: '11px', margin: 0 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '16px' }}>
            {(['active', 'settled', 'all'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: '8px 16px', background: 'transparent', border: 'none',
                  borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                  color: tab === t ? 'var(--text)' : 'var(--muted)',
                  fontWeight: tab === t ? '600' : '500',
                  fontSize: '14px', cursor: 'pointer', marginBottom: '-1px',
                  textTransform: 'capitalize', fontFamily: 'var(--font-body)',
                }}
              >
                {t} {t === 'active' ? `(${activeBets.length})` : t === 'settled' ? `(${settledBets.length})` : `(${bets.length})`}
              </button>
            ))}
          </div>

          {/* Bet list */}
          {displayBets.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
              {tab === 'active'
                ? <><p style={{ marginBottom: '8px' }}>No active bets.</p><Link href="/" style={{ color: 'var(--accent)', fontWeight: '600', fontSize: '14px' }}>Browse markets →</Link></>
                : 'No bets here yet.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {displayBets.map(bet => <BetCard key={bet.id} bet={bet} onClaimed={refetch} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function BetCard({ bet, onClaimed }: { bet: any; onClaimed: () => void }) {
  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (isSuccess) onClaimed()
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClaim = () => {
    const fn = (bet.status === 'won' || userWon) ? 'claimWinnings' : 'claimRefund'
    writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: fn,
      args: [bet.contract_bet_id as `0x${string}`],
    })
  }

  const market = bet.markets
  const userWon = market?.status === 'resolved' && market?.outcome === bet.side
  const userRefund = bet.status === 'refunded' || market?.status === 'voided' || market?.outcome === 'void'
  const canClaim = (bet.status === 'won' || userWon) && !isSuccess && !!bet.contract_bet_id
  const canRefundClaim = userRefund && !isSuccess && !!bet.contract_bet_id
  const channel = market?.streams?.stream_key || (market?.title ? getStreamerFromTitle(market.title) : null)
  const marketExpired = market?.closes_at ? isPast(new Date(market.closes_at)) : false

  const statusStyle = {
    won: { color: 'var(--green)', bg: 'var(--green-bg)', border: 'rgba(16,185,129,0.25)' },
    lost: { color: 'var(--no)', bg: 'var(--no-bg)', border: 'rgba(239,68,68,0.25)' },
    confirmed: { color: '#D97706', bg: 'rgba(217,119,6,0.12)', border: 'rgba(217,119,6,0.25)' },
    refunded: { color: 'var(--muted)', bg: 'var(--surface-2)', border: 'var(--border)' },
  }
  const ss = statusStyle[bet.status as keyof typeof statusStyle] || statusStyle.confirmed

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px',
    }}>
      {/* Market title */}
      <div style={{ marginBottom: '10px' }}>
        {channel ? (
          <Link href={`/markets/${channel}`} style={{ textDecoration: 'none' }}>
            <p style={{ color: 'var(--text)', fontSize: '14px', fontWeight: '600', margin: '0 0 2px', lineHeight: '1.4' }}>
              {market?.title || 'Market'}
            </p>
          </Link>
        ) : (
          <p style={{ color: 'var(--text)', fontSize: '14px', fontWeight: '600', margin: '0 0 2px' }}>{market?.title || 'Market'}</p>
        )}
        {channel && <p style={{ color: 'var(--muted)', fontSize: '11px', margin: 0, fontFamily: 'var(--font-mono)' }}>{channel}</p>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        {/* Left: side + amount */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '700', fontFamily: 'var(--font-mono)',
            background: bet.side === 'yes' ? 'var(--yes-bg)' : 'var(--no-bg)',
            color: bet.side === 'yes' ? 'var(--yes)' : 'var(--no)',
          }}>{(bet.side || '').toUpperCase()}</span>
          <span style={{ color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
            ${bet.amount_usdc.toFixed(2)}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            ×{bet.odds_at_placement?.toFixed(2) || '—'} → ${bet.potential_payout_usdc?.toFixed(2) ?? '—'}
          </span>
        </div>

        {/* Right: status + time + claim */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--dim)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>
            {(bet.placed_at || bet.created_at) ? formatDistanceToNow(new Date(bet.placed_at || bet.created_at!), { addSuffix: true }) : '—'}
          </span>
          <span style={{
            padding: '2px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', fontFamily: 'var(--font-mono)',
            background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color,
          }}>{(bet.status || '').toUpperCase()}</span>
          {(canClaim || canRefundClaim) && (
            <button
              onClick={handleClaim}
              disabled={isPending}
              style={{
                padding: '5px 14px', borderRadius: '8px', border: 'none',
                background: canClaim ? 'var(--green)' : 'var(--muted)',
                color: 'white', fontSize: '12px', fontWeight: '600',
                cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.6 : 1,
              }}
            >
              {isPending ? '…' : canClaim ? 'Claim Win' : 'Refund'}
            </button>
          )}
          {isSuccess && <span style={{ color: 'var(--green)', fontSize: '12px', fontWeight: '600' }}>✓ Claimed</span>}
        </div>
      </div>
    </div>
  )
}
