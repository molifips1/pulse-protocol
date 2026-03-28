'use client'
import { useState, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useConfig } from 'wagmi'
import { simulateContract } from '@wagmi/core'
import { parseUnits, formatUnits } from 'viem'
import { supabase, type Market } from '../lib/supabase'
import { VAULT_ADDRESS, USDC_ADDRESS, VAULT_ABI, ERC20_ABI } from '../lib/wagmi'

interface Props {
  market: Market
  side: 'yes' | 'no'
  odds: number
  onClose: () => void
  onSuccess: () => void
}

type Step = 'input' | 'approve' | 'bet' | 'confirming' | 'done' | 'error'

export function BetModal({ market, side, odds, onClose, onSuccess }: Props) {
  const { address } = useAccount()
  const config = useConfig()
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<Step>('input')
  const [errorMsg, setErrorMsg] = useState('')
  const contractBetIdRef = useRef<string | null>(null)

  const amountUsdc = parseFloat(amount) || 0
  const amountRaw = amount ? parseUnits(amount, 6) : 0n
  const potentialPayout = (amountUsdc * odds).toFixed(2)

  // Check allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, VAULT_ADDRESS] : undefined,
  })

  const needsApproval = allowance !== undefined && amountRaw > 0n && allowance < amountRaw

  // Approve USDC
  const { writeContract: approve, data: approveTxHash } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // Place bet
  const { writeContract: placeBet, data: betTxHash } = useWriteContract()
  const { isSuccess: betConfirmed, isLoading: betPending } = useWaitForTransactionReceipt({ hash: betTxHash })

  // After approve confirmed, move to bet
  useEffect(() => {
    if (approveConfirmed) {
      refetchAllowance()
      setStep('bet')
    }
  }, [approveConfirmed])

  // After bet confirmed, save to Supabase and done
  useEffect(() => {
    if (betConfirmed && betTxHash) {
      saveBetToSupabase(betTxHash)
    }
  }, [betConfirmed, betTxHash])

  const saveBetToSupabase = async (txHash: string) => {
    if (!address) return
    try {
      // Upsert user
      await supabase.from('users').upsert({
        wallet_address: address.toLowerCase(),
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'wallet_address', ignoreDuplicates: false })

      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', address.toLowerCase())
        .single()

      // Record bet
      await supabase.from('bets').insert({
        market_id: market.id,
        user_id: user?.id,
        wallet_address: address.toLowerCase(),
        side,
        amount_usdc: amountUsdc,
        odds_at_placement: odds,
        potential_payout_usdc: parseFloat(potentialPayout),
        status: 'confirmed',
        tx_hash: txHash,
        contract_bet_id: contractBetIdRef.current,
      })

      setStep('done')
      setTimeout(onSuccess, 1500)
    } catch (e: any) {
      console.error('Supabase save error:', e)
      setStep('done') // still done on-chain
    }
  }

  const handleSubmit = async () => {
    if (!amountRaw || !address) return
    setErrorMsg('')

    try {
      if (needsApproval) {
        setStep('approve')
        approve({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [VAULT_ADDRESS, amountRaw],
        })
      } else {
        setStep('bet')
        placeBetNow()
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Transaction failed')
      setStep('error')
    }
  }

  const placeBetNow = async () => {
    try {
      // Simulate first to capture the betId return value
      const { result: betId, request } = await simulateContract(config, {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'placeBet',
        args: [market.contract_market_id as `0x${string}`, side === 'yes', amountRaw],
      })
      contractBetIdRef.current = betId as string
      placeBet(request)
      setStep('confirming')
    } catch (e: any) {
      setErrorMsg(e.shortMessage || e.message || 'Transaction failed')
      setStep('error')
    }
  }

  useEffect(() => {
    if (step === 'bet') placeBetNow()
  }, [step === 'bet'])

  const sideColor = side === 'yes' ? 'text-pulse-green' : 'text-pulse-red'
  const sideBorder = side === 'yes' ? 'border-pulse-green' : 'border-pulse-red'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
         onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`bg-pulse-card border ${sideBorder} rounded-lg w-full max-w-sm p-6 relative animate-[slideUp_0.3s_ease-out]`}>
        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 text-pulse-muted hover:text-white">✕</button>

        <div className="mb-5">
          <p className="text-xs font-mono text-pulse-muted mb-1">PLACING BET</p>
          <h2 className={`font-display text-2xl tracking-wider ${sideColor}`}>
            {side.toUpperCase()} · ×{odds}
          </h2>
          <p className="text-white/70 text-sm mt-1 leading-snug">{market.title}</p>
        </div>

        {step === 'input' && (
          <>
            <div className="mb-4">
              <label className="text-xs font-mono text-pulse-muted block mb-2">AMOUNT (USDC)</label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  min="1"
                  className="w-full bg-pulse-dark border border-pulse-border rounded px-4 py-3 text-white font-mono text-lg focus:outline-none focus:border-pulse-muted"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-pulse-muted font-mono text-sm">USDC</span>
              </div>
              <div className="flex gap-2 mt-2">
                {[5, 10, 25, 50].map(v => (
                  <button key={v} onClick={() => setAmount(String(v))}
                    className="flex-1 py-1 text-xs font-mono border border-pulse-border rounded text-pulse-muted hover:text-white hover:border-pulse-muted transition-all">
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {amountUsdc > 0 && (
              <div className="bg-pulse-dark rounded p-3 mb-4 font-mono text-sm">
                <div className="flex justify-between text-pulse-muted">
                  <span>Potential payout</span>
                  <span className="text-white">${potentialPayout}</span>
                </div>
                <div className="flex justify-between text-pulse-muted mt-1">
                  <span>Protocol rake</span>
                  <span>{(market.rake_rate * 100).toFixed(2)}%</span>
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!amountUsdc || amountUsdc <= 0}
              className={`w-full py-3 rounded font-display tracking-widest text-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                side === 'yes'
                  ? 'bg-pulse-green text-pulse-dark hover:brightness-110'
                  : 'bg-pulse-red text-white hover:brightness-110'
              }`}
            >
              {needsApproval ? 'APPROVE + BET' : `BET ${side.toUpperCase()}`}
            </button>
          </>
        )}

        {(step === 'approve' || step === 'confirming') && (
          <div className="text-center py-6">
            <div className="w-10 h-10 border-2 border-pulse-muted border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="font-mono text-pulse-muted">
              {step === 'approve' ? 'Approving USDC...' : 'Confirming bet...'}
            </p>
            <p className="text-xs text-pulse-muted/50 mt-1">Check your wallet</p>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">✅</div>
            <p className="font-display text-xl tracking-widest text-pulse-green">BET CONFIRMED</p>
            <p className="text-pulse-muted font-mono text-sm mt-1">
              ${amountUsdc} on {side.toUpperCase()} · payout up to ${potentialPayout}
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center py-4">
            <p className="text-pulse-red font-mono text-sm">{errorMsg || 'Transaction failed'}</p>
            <button onClick={() => setStep('input')}
              className="mt-3 text-xs font-mono text-pulse-muted hover:text-white underline">
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
