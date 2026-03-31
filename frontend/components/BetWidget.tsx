'use client'
import { useState, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useConfig } from 'wagmi'
import { simulateContract } from '@wagmi/core'
import { parseUnits, maxUint256 } from 'viem'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { VAULT_ADDRESS, USDC_ADDRESS, VAULT_ABI, ERC20_ABI } from '../lib/wagmi'
import { calcOdds } from '../lib/utils'

interface Props {
  market: any
  expired: boolean
  onSuccess: () => void
}

type BetStep = 'input' | 'approve' | 'confirming' | 'done' | 'error'

export function BetWidget({ market, expired, onSuccess }: Props) {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const config = useConfig()

  const [betSide, setBetSide] = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<BetStep>('input')
  const [errorMsg, setErrorMsg] = useState('')
  const contractBetIdRef = useRef<string | null>(null)

  const amountUsdc = parseFloat(amount) || 0
  const amountRaw = amount ? parseUnits(amount, 6) : 0n
  const odds = calcOdds(market)
  const selectedOdds = betSide === 'yes' ? odds.yesOdds : odds.noOdds
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
      const { result: betId, request } = await simulateContract(config, {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'placeBet',
        args: [market.contract_market_id as `0x${string}`, betSide === 'yes', amountRaw],
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
          side: betSide,
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
          ${amountUsdc.toFixed(2)} on {betSide.toUpperCase()} · up to ${potentialPayout}
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
      {/* YES / NO toggle */}
      <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: '8px', padding: '3px', gap: '3px', marginBottom: '14px' }}>
        {(['yes', 'no'] as const).map(s => (
          <button
            key={s}
            onClick={() => setBetSide(s)}
            disabled={expired}
            style={{
              flex: 1, padding: '9px 0', borderRadius: '6px', border: 'none',
              cursor: expired ? 'not-allowed' : 'pointer',
              background: betSide === s
                ? (s === 'yes' ? 'var(--yes-bg)' : 'var(--no-bg)')
                : 'transparent',
              color: betSide === s ? (s === 'yes' ? 'var(--yes)' : 'var(--no)') : 'var(--muted)',
              fontWeight: '700', fontSize: '13px', transition: 'all 0.15s',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {s.toUpperCase()} ×{s === 'yes' ? odds.yesOdds : odds.noOdds}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div style={{ marginBottom: '10px' }}>
        <label style={{ color: 'var(--muted)', fontSize: '11px', display: 'block', marginBottom: '6px', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>
          AMOUNT (USDC)
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            min="1"
            disabled={expired}
            style={{
              width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '8px',
              padding: '10px 48px 10px 12px', color: 'var(--text)', fontSize: '15px',
              fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
            }}
          />
          <span style={{
            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--font-mono)',
          }}>USDC</span>
        </div>
        <div style={{ display: 'flex', gap: '5px', marginTop: '7px' }}>
          {[5, 10, 25, 50].map(v => (
            <button
              key={v}
              onClick={() => setAmount(String(v))}
              disabled={expired}
              style={{
                flex: 1, padding: '5px 0', background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: '6px', color: 'var(--muted)', cursor: expired ? 'not-allowed' : 'pointer',
                fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: '600',
              }}
            >${v}</button>
          ))}
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
          ? 'Approve & Bet'
          : `Bet ${betSide.toUpperCase()}`}
      </button>
    </div>
  )
}
