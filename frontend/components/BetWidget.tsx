'use client'
import { useState, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useConfig } from 'wagmi'
import { simulateContract } from '@wagmi/core'
import { parseUnits, maxUint256 } from 'viem'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { VAULT_ADDRESS, USDC_ADDRESS, VAULT_ABI, ERC20_ABI } from '../lib/wagmi'
import { calcOdds } from '../lib/utils'

const BUCKET_LABELS: Record<string, string> = { A: '0–5K', B: '5K–10K', C: '10K–20K', D: '20K+' }
const BUCKET_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 }
const BUCKET_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981']

interface Props {
  market: any
  buckets?: any[]
  expired: boolean
  onSuccess: () => void
  forceSide?: 'yes' | 'no'
}

type BetStep = 'input' | 'approve' | 'confirming' | 'done' | 'error'

export function BetWidget({ market, buckets, expired, onSuccess, forceSide }: Props) {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const config = useConfig()

  const isCategorical = market?.market_type === 'categorical'
  const [betSide, setBetSide] = useState<'yes' | 'no'>(forceSide ?? 'yes')
  const [selectedBucket, setSelectedBucket] = useState<string>('A')

  useEffect(() => {
    if (forceSide) setBetSide(forceSide)
  }, [forceSide])
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<BetStep>('input')
  const [errorMsg, setErrorMsg] = useState('')
  const contractBetIdRef = useRef<string | null>(null)

  const amountUsdc = parseFloat(amount) || 0
  const amountRaw = amount ? parseUnits(amount, 6) : 0n
  const odds = calcOdds(market)

  // For categorical: calculate price from bucket pools
  const selectedBucketData = buckets?.find(b => b.bucket_id === selectedBucket)
  const totalPool = buckets?.reduce((s: number, b: any) => s + (b.pool_usdc || 0) + (b.seed_usdc || 0), 0) || 100
  const bucketEffective = (selectedBucketData?.pool_usdc || 0) + (selectedBucketData?.seed_usdc || 25)
  const bucketPrice = totalPool > 0 ? bucketEffective / totalPool : 0.25
  const bucketOdds = bucketPrice > 0 ? parseFloat((1 / bucketPrice).toFixed(2)) : 4

  const selectedOdds = isCategorical ? bucketOdds : (betSide === 'yes' ? odds.yesOdds : odds.noOdds)
  const potentialPayout = (amountUsdc * selectedOdds).toFixed(2)

  // Allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, VAULT_ADDRESS] : undefined,
  })
  const needsApproval = amountRaw > 0n && (allowance === undefined || allowance < amountRaw)

  // Approve
  const { writeContract: approve, data: approveTxHash } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // Place bet
  const { writeContract: placeBet, data: betTxHash } = useWriteContract()
  const { isSuccess: betConfirmed } = useWaitForTransactionReceipt({ hash: betTxHash })

  useEffect(() => {
    if (approveConfirmed) { refetchAllowance(); placeBetNow() }
  }, [approveConfirmed])

  useEffect(() => {
    if (betConfirmed && betTxHash) saveBet(betTxHash)
  }, [betConfirmed, betTxHash])

  const placeBetNow = async () => {
    if (!market || !address || !amountRaw) return
    try {
      setStep('confirming')
      const bucketArg = isCategorical ? BUCKET_INDEX[selectedBucket] : (betSide === 'yes' ? 1 : 0)
      const { result: betId, request } = await simulateContract(config, {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'placeBet',
        args: [market.contract_market_id as `0x${string}`, bucketArg, amountRaw],
        account: address,
      })
      contractBetIdRef.current = betId as string
      placeBet(request)
    } catch (e: any) {
      setErrorMsg(e.shortMessage || e.message || 'Transaction failed')
      setStep('error')
    }
  }

  const handleBet = async () => {
    if (!isConnected) { openConnectModal?.(); return }
    if (!amountRaw) return
    setErrorMsg('')
    try {
      if (needsApproval) {
        setStep('approve')
        approve({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [VAULT_ADDRESS, maxUint256] })
      } else {
        await placeBetNow()
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Transaction failed')
      setStep('error')
    }
  }

  const saveBet = async (txHash: string) => {
    if (!address) return
    try {
      const res = await fetch('/api/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId: market.id,
          walletAddress: address,
          side: 'yes',
          bucketId: isCategorical ? selectedBucket : undefined,
          amountUsdc,
          oddsAtPlacement: selectedOdds,
          potentialPayout: parseFloat(potentialPayout),
          txHash,
          contractBetId: contractBetIdRef.current,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        console.error('Save bet error:', err)
      }
    } catch (e) { console.error('Save error:', e) }
    setStep('done')
    setTimeout(() => { setStep('input'); setAmount(''); onSuccess() }, 2000)
  }

  if (step === 'done') {
    return (
      <div style={{ textAlign: 'center', padding: '28px 0' }}>
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
        <p style={{ color: 'var(--green)', fontWeight: '700', fontSize: '15px', margin: '0 0 4px' }}>Bet Confirmed</p>
        <p style={{ color: 'var(--muted)', fontSize: '12px', fontFamily: 'var(--font-mono)', margin: '0 0 14px' }}>
          ${amountUsdc.toFixed(2)} on {isCategorical ? `${selectedBucket} (${BUCKET_LABELS[selectedBucket]})` : betSide.toUpperCase()} · up to ${potentialPayout}
        </p>
        <a href="/bets" style={{
          display: 'inline-block', padding: '7px 18px', borderRadius: '8px',
          background: 'var(--accent)', color: 'white',
          fontSize: '13px', fontWeight: '700', textDecoration: 'none',
          fontFamily: 'var(--font-mono)',
        }}>View My Bets →</a>
      </div>
    )
  }

  if (step === 'approve' || step === 'confirming') {
    return (
      <div style={{ textAlign: 'center', padding: '28px 0' }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{
          width: '32px', height: '32px', border: '2px solid var(--border-2)', borderTopColor: 'var(--accent)',
          borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px',
        }} />
        <p style={{ color: 'var(--muted)', fontSize: '13px', margin: '0 0 3px' }}>
          {step === 'approve' ? 'Approving USDC…' : 'Confirming bet…'}
        </p>
        <p style={{ color: 'var(--dim)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Check your wallet</p>
      </div>
    )
  }

  return (
    <div>
      {/* Buy tab header */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '14px', borderBottom: '2px solid var(--border)' }}>
        <div style={{
          padding: '8px 16px', fontSize: '13px', fontWeight: '700', color: 'var(--text)',
          borderBottom: '2px solid var(--text)', marginBottom: '-2px', fontFamily: 'var(--font-display)',
        }}>Buy</div>
      </div>

      {/* Bucket selector (categorical) or YES/NO (binary) */}
      {isCategorical ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '16px' }}>
          {(['A', 'B', 'C', 'D'] as const).map((b, i) => {
            const bd = buckets?.find((x: any) => x.bucket_id === b)
            const pool = (bd?.pool_usdc || 0) + (bd?.seed_usdc || 25)
            const pct = totalPool > 0 ? Math.round((pool / totalPool) * 100) : 25
            const color = BUCKET_COLORS[i]
            const active = selectedBucket === b
            return (
              <button key={b} onClick={() => setSelectedBucket(b)} disabled={expired}
                style={{
                  padding: '10px 8px', borderRadius: '8px', cursor: expired ? 'not-allowed' : 'pointer',
                  border: `2px solid ${active ? color : 'var(--border)'}`,
                  background: active ? `${color}20` : 'var(--surface-2)',
                  color: active ? color : 'var(--muted)',
                  fontWeight: '700', fontSize: '12px', transition: 'all 0.15s', fontFamily: 'var(--font-mono)',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '11px', marginBottom: '2px' }}>{BUCKET_LABELS[b]}</div>
                <div style={{ fontSize: '13px' }}>{pct}¢</div>
              </button>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => setBetSide('yes')}
            disabled={expired}
            style={{
              flex: 1, padding: '10px 0', borderRadius: '8px', cursor: expired ? 'not-allowed' : 'pointer',
              border: betSide === 'yes' ? '2px solid var(--yes)' : '2px solid var(--border)',
              background: betSide === 'yes' ? 'rgba(59,130,246,0.12)' : 'var(--surface-2)',
              color: betSide === 'yes' ? 'var(--yes)' : 'var(--muted)',
              fontWeight: '700', fontSize: '14px', transition: 'all 0.15s', fontFamily: 'var(--font-mono)',
            }}
          >Yes {odds.yesPercent}¢</button>
          <button
            onClick={() => setBetSide('no')}
            disabled={expired}
            style={{
              flex: 1, padding: '10px 0', borderRadius: '8px', cursor: expired ? 'not-allowed' : 'pointer',
              border: betSide === 'no' ? '2px solid var(--no)' : '2px solid var(--border)',
              background: betSide === 'no' ? 'rgba(239,68,68,0.1)' : 'var(--surface-2)',
              color: betSide === 'no' ? 'var(--no)' : 'var(--muted)',
              fontWeight: '700', fontSize: '14px', transition: 'all 0.15s', fontFamily: 'var(--font-mono)',
            }}
          >No {odds.noPercent}¢</button>
        </div>
      )}

      {/* Amount */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <label style={{ color: 'var(--muted)', fontSize: '11px', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>AMOUNT</label>
          <span style={{ color: 'var(--dim)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>Balance $0.00</span>
        </div>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--muted)', fontSize: '18px', fontWeight: '300',
          }}>$</span>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            min="1"
            disabled={expired}
            style={{
              width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px',
              padding: '12px 12px 12px 28px', color: 'var(--text)', fontSize: '20px', fontWeight: '700',
              fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }}>
          {[1, 5, 10, 100].map(v => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              disabled={expired}
              style={{
                flex: 1, padding: '6px 0', background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: '6px', color: 'var(--muted)', cursor: expired ? 'not-allowed' : 'pointer',
                fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: '600',
              }}
            >+${v}</button>
          ))}
          <button
            onClick={() => setAmount('500')}
            disabled={expired}
            style={{
              flex: 1, padding: '6px 0', background: 'var(--surface-2)', border: '1px solid var(--border)',
              borderRadius: '6px', color: 'var(--muted)', cursor: expired ? 'not-allowed' : 'pointer',
              fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: '600',
            }}
          >Max</button>
        </div>
      </div>

      {/* Payout preview */}
      {amountUsdc > 0 && (
        <div style={{
          background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '10px 12px', marginBottom: '12px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--muted)' }}>Potential payout</span>
            <span style={{ color: 'var(--text)', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>${potentialPayout}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <span style={{ color: 'var(--dim)' }}>Odds</span>
            <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>×{selectedOdds}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '3px' }}>
            <span style={{ color: 'var(--dim)' }}>Protocol fee</span>
            <span style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>0.75%</span>
          </div>
        </div>
      )}

      {step === 'error' && (
        <p style={{ color: 'var(--no)', fontSize: '11px', marginBottom: '8px', lineHeight: '1.4' }}>
          {errorMsg || 'Transaction failed'}
        </p>
      )}

      <button
        onClick={handleBet}
        disabled={expired || (isConnected && !amountUsdc)}
        style={{
          width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
          background: expired || (isConnected && !amountUsdc)
            ? 'var(--surface-2)'
            : betSide === 'yes' ? 'var(--yes)' : 'var(--no)',
          color: expired || (isConnected && !amountUsdc) ? 'var(--muted)' : 'white',
          fontWeight: '700', fontSize: '14px', letterSpacing: '0.04em',
          cursor: expired || (isConnected && !amountUsdc) ? 'not-allowed' : 'pointer',
          transition: 'opacity 0.15s', fontFamily: 'var(--font-mono)',
        }}
      >
        {expired
          ? 'Market Closed'
          : !isConnected
          ? 'Connect Wallet'
          : needsApproval
          ? 'Approve & Buy'
          : amountUsdc > 0
          ? `Buy ${betSide === 'yes' ? 'Yes' : 'No'} — $${amountUsdc.toFixed(2)}`
          : 'Enter Amount'}
      </button>
    </div>
  )
}
