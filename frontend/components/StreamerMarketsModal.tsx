'use client'
import { useState, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useConfig } from 'wagmi'
import { simulateContract } from '@wagmi/core'
import { parseUnits, maxUint256 } from 'viem'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { formatDistanceToNow, isPast } from 'date-fns'
import { supabase } from '../lib/supabase'
import { VAULT_ADDRESS, USDC_ADDRESS, VAULT_ABI, ERC20_ABI } from '../lib/wagmi'

interface Props {
  channel: string
  markets: any[]
  onClose: () => void
  onBetPlaced: () => void
}

function calcOdds(market: any) {
  const totalPool = (market.total_yes_usdc || 0) + (market.total_no_usdc || 0)
  const yesPercent = totalPool > 0 ? Math.round((market.total_yes_usdc / totalPool) * 100) : 50
  const noPercent = 100 - yesPercent
  const yesOdds = totalPool > 0 && market.total_yes_usdc > 0
    ? parseFloat(((totalPool * 0.9925) / market.total_yes_usdc).toFixed(2))
    : market.initial_yes_odds || 2.0
  const noOdds = totalPool > 0 && market.total_no_usdc > 0
    ? parseFloat(((totalPool * 0.9925) / market.total_no_usdc).toFixed(2))
    : market.initial_no_odds || 2.0
  return { totalPool, yesPercent, noPercent, yesOdds, noOdds }
}

export function StreamerMarketsModal({ channel, markets: initialMarkets, onClose, onBetPlaced }: Props) {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const config = useConfig()

  const [markets, setMarkets] = useState(initialMarkets)
  const [selectedMarket, setSelectedMarket] = useState<any>(initialMarkets[0] || null)

  // Bet state
  const [betSide, setBetSide] = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('')
  const [betStep, setBetStep] = useState<'input' | 'approve' | 'confirming' | 'done' | 'error'>('input')
  const [errorMsg, setErrorMsg] = useState('')
  const contractBetIdRef = useRef<string | null>(null)

  // Data sections
  const [activity, setActivity] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [topHolders, setTopHolders] = useState<any[]>([])
  const [timeLeft, setTimeLeft] = useState('')
  const [expired, setExpired] = useState(false)
  const [dataRefresh, setDataRefresh] = useState(0)

  // Wagmi — allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, VAULT_ADDRESS] : undefined,
  })

  const amountUsdc = parseFloat(amount) || 0
  const amountRaw = amount ? parseUnits(amount, 6) : 0n
  const needsApproval = amountRaw > 0n && (allowance === undefined || allowance < amountRaw)

  // Wagmi — approve
  const { writeContract: approve, data: approveTxHash } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash })

  // Wagmi — place bet
  const { writeContract: placeBet, data: betTxHash } = useWriteContract()
  const { isSuccess: betConfirmed } = useWaitForTransactionReceipt({ hash: betTxHash })

  // Refresh markets from Supabase + realtime
  useEffect(() => {
    const ids = initialMarkets.map(m => m.id)
    if (!ids.length) return
    const fetchFresh = async () => {
      const { data } = await supabase.from('markets').select('*').in('id', ids)
      if (data) {
        setMarkets(data)
        setSelectedMarket((prev: any) => data.find((m: any) => m.id === prev?.id) || data[0] || null)
      }
    }
    fetchFresh()
    const ch = supabase.channel('modal-markets')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'markets' }, fetchFresh)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [initialMarkets.map(m => m.id).join(',')])

  // Fetch activity / positions / top holders for selected market
  useEffect(() => {
    if (!selectedMarket) return
    const go = async () => {
      const { data: bets } = await supabase
        .from('bets')
        .select('*')
        .eq('market_id', selectedMarket.id)
        .order('created_at', { ascending: false })
        .limit(25)
      setActivity(bets || [])

      if (address) {
        const { data: myBets } = await supabase
          .from('bets')
          .select('*')
          .eq('market_id', selectedMarket.id)
          .eq('wallet_address', address.toLowerCase())
          .order('created_at', { ascending: false })
        setPositions(myBets || [])
      }

      const { data: allBets } = await supabase
        .from('bets')
        .select('wallet_address, amount_usdc')
        .eq('market_id', selectedMarket.id)
      if (allBets) {
        const map = new Map<string, number>()
        for (const b of allBets) map.set(b.wallet_address, (map.get(b.wallet_address) || 0) + b.amount_usdc)
        setTopHolders([...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([addr, total]) => ({ addr, total })))
      }
    }
    go()
  }, [selectedMarket?.id, address, dataRefresh])

  // Countdown timer
  useEffect(() => {
    if (!selectedMarket) return
    const update = () => {
      const closes = new Date(selectedMarket.closes_at)
      if (isPast(closes)) { setExpired(true); setTimeLeft('Ended') }
      else { setExpired(false); setTimeLeft(formatDistanceToNow(closes, { addSuffix: true })) }
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [selectedMarket?.closes_at])

  // After approve confirmed → place bet
  useEffect(() => {
    if (approveConfirmed) { refetchAllowance(); placeBetNow() }
  }, [approveConfirmed])

  // After bet confirmed → save to Supabase
  useEffect(() => {
    if (betConfirmed && betTxHash) saveBet(betTxHash)
  }, [betConfirmed, betTxHash])

  const placeBetNow = async () => {
    if (!selectedMarket || !address || !amountRaw) return
    try {
      setBetStep('confirming')
      const { result: betId, request } = await simulateContract(config, {
        address: VAULT_ADDRESS,
        abi: VAULT_ABI,
        functionName: 'placeBet',
        args: [selectedMarket.contract_market_id as `0x${string}`, betSide === 'yes', amountRaw],
        account: address,
      })
      contractBetIdRef.current = betId as string
      placeBet(request)
    } catch (e: any) {
      setErrorMsg(e.shortMessage || e.message || 'Transaction failed')
      setBetStep('error')
    }
  }

  const handleBet = async () => {
    if (!isConnected) { openConnectModal?.(); return }
    if (!amountRaw || !selectedMarket) return
    setErrorMsg('')
    try {
      if (needsApproval) {
        setBetStep('approve')
        approve({ address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [VAULT_ADDRESS, maxUint256] })
      } else {
        await placeBetNow()
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Transaction failed')
      setBetStep('error')
    }
  }

  const saveBet = async (txHash: string) => {
    if (!address || !selectedMarket) return
    const odds = calcOdds(selectedMarket)
    const sideOdds = betSide === 'yes' ? odds.yesOdds : odds.noOdds
    try {
      await supabase.from('users').upsert(
        { wallet_address: address.toLowerCase(), last_seen_at: new Date().toISOString() },
        { onConflict: 'wallet_address', ignoreDuplicates: false }
      )
      const { data: user } = await supabase.from('users').select('id').eq('wallet_address', address.toLowerCase()).single()
      await supabase.from('bets').insert({
        market_id: selectedMarket.id,
        user_id: user?.id,
        wallet_address: address.toLowerCase(),
        side: betSide,
        amount_usdc: amountUsdc,
        odds_at_placement: sideOdds,
        potential_payout_usdc: parseFloat((amountUsdc * sideOdds).toFixed(2)),
        status: 'confirmed',
        tx_hash: txHash,
        contract_bet_id: contractBetIdRef.current,
      })
    } catch (e) { console.error('Save error:', e) }
    setBetStep('done')
    setTimeout(() => {
      setBetStep('input')
      setAmount('')
      setDataRefresh(n => n + 1)
      onBetPlaced()
    }, 2000)
  }

  // Keyboard + backdrop close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const sm = selectedMarket
  const odds = sm ? calcOdds(sm) : null
  const selectedOdds = odds ? (betSide === 'yes' ? odds.yesOdds : odds.noOdds) : 2.0
  const potentialPayout = (amountUsdc * selectedOdds).toFixed(2)

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'stretch', justifyContent: 'center',
      }}
    >
      <style>{`@keyframes modalSpin { to { transform: rotate(360deg) } }`}</style>

      <div style={{
        background: '#0D1117', width: '100%', maxWidth: '1140px',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: '1px solid #1F2937', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#DC2626', display: 'inline-block' }} />
            <span style={{ color: 'white', fontWeight: '700', fontSize: '15px' }}>{channel}</span>
            <a
              href={`https://kick.com/${channel}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: '#4B5563', fontSize: '11px', fontFamily: 'monospace', textDecoration: 'none' }}
            >
              kick.com/{channel} ↗
            </a>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid #374151', color: '#9CA3AF',
              borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '13px',
            }}
          >✕</button>
        </div>

        {/* ── Stream embed ── */}
        <div style={{ background: '#000', flexShrink: 0, width: '100%', maxHeight: '38vh', aspectRatio: '16/9' }}>
          <iframe
            src={`https://player.kick.com/${channel}?autoplay=true&muted=false&parent=pulse-protocol1.vercel.app`}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
            allowFullScreen
            allow="autoplay; fullscreen"
          />
        </div>

        {/* ── Market tabs ── */}
        {markets.length > 1 && (
          <div style={{
            display: 'flex', borderBottom: '1px solid #1F2937', flexShrink: 0,
            overflowX: 'auto', padding: '0 20px', background: '#0D1117',
          }}>
            {markets.map(m => {
              const active = sm?.id === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => { setSelectedMarket(m); setBetStep('input'); setAmount('') }}
                  style={{
                    padding: '10px 16px', background: 'transparent', border: 'none',
                    borderBottom: active ? '2px solid #34D399' : '2px solid transparent',
                    color: active ? '#34D399' : '#6B7280',
                    cursor: 'pointer', fontSize: '11px', fontFamily: 'monospace',
                    whiteSpace: 'nowrap', transition: 'all 0.15s', flexShrink: 0,
                  }}
                >
                  {m.title.length > 44 ? m.title.slice(0, 44) + '…' : m.title}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Body: left content + right sidebar ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

          {/* LEFT — market details, rules, activity */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
            {sm && odds && (
              <>
                {/* Market question + prob */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                    <h2 style={{ color: 'white', fontSize: '17px', fontWeight: '700', margin: 0, lineHeight: '1.45' }}>
                      {sm.title}
                    </h2>
                    <span style={{
                      color: expired ? '#F87171' : '#6B7280',
                      fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'nowrap', flexShrink: 0, paddingTop: '3px',
                    }}>
                      {timeLeft}
                    </span>
                  </div>

                  {/* Probability bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'monospace', marginBottom: '6px' }}>
                    <span style={{ color: '#34D399', fontWeight: '700' }}>YES {odds.yesPercent}%</span>
                    <span style={{ color: '#4B5563' }}>${odds.totalPool.toFixed(0)} total volume</span>
                    <span style={{ color: '#F87171', fontWeight: '700' }}>{odds.noPercent}% NO</span>
                  </div>
                  <div style={{ height: '5px', background: '#1F2937', borderRadius: '9999px', overflow: 'hidden', display: 'flex' }}>
                    <div style={{ height: '100%', width: odds.yesPercent + '%', background: 'linear-gradient(90deg,#059669,#34D399)', transition: 'width 0.5s ease' }} />
                    <div style={{ height: '100%', width: odds.noPercent + '%', background: 'linear-gradient(90deg,#F87171,#DC2626)', transition: 'width 0.5s ease' }} />
                  </div>

                  {/* Odds pills */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <div style={{
                      padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontFamily: 'monospace',
                      background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#34D399',
                    }}>Yes ×{odds.yesOdds}</div>
                    <div style={{
                      padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontFamily: 'monospace',
                      background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', color: '#F87171',
                    }}>No ×{odds.noOdds}</div>
                  </div>
                </div>

                {/* Rules */}
                <section style={{ marginBottom: '24px' }}>
                  <SectionHeader>Rules</SectionHeader>
                  <div style={{
                    background: '#111827', border: '1px solid #1F2937', borderRadius: '10px', padding: '14px 16px',
                  }}>
                    <p style={{ color: '#D1D5DB', fontSize: '13px', lineHeight: '1.65', margin: '0 0 8px' }}>
                      This market resolves <strong style={{ color: 'white' }}>YES</strong> if{' '}
                      {sm.title.replace(/^Will\s+/i, '').replace(/\?$/, '')}, as verified by live stream data and chat activity monitored by the Pulse oracle.
                      Resolves <strong style={{ color: 'white' }}>NO</strong> if the event does not occur, or the stream ends before it can be confirmed.
                    </p>
                    <p style={{ color: '#4B5563', fontSize: '11px', fontFamily: 'monospace', margin: 0 }}>
                      Resolution source: Kick stream oracle · Closes {timeLeft}
                    </p>
                  </div>
                </section>

                {/* Activity */}
                <section style={{ marginBottom: '24px' }}>
                  <SectionHeader>Activity</SectionHeader>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {activity.length === 0 ? (
                      <p style={{ color: '#374151', fontSize: '13px', fontFamily: 'monospace' }}>No bets placed yet. Be the first!</p>
                    ) : activity.map((bet, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 12px', background: '#111827', border: '1px solid #1F2937', borderRadius: '8px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', fontFamily: 'monospace',
                            background: bet.side === 'yes' ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                            color: bet.side === 'yes' ? '#34D399' : '#F87171',
                          }}>{bet.side.toUpperCase()}</span>
                          <span style={{ color: '#6B7280', fontSize: '12px', fontFamily: 'monospace' }}>
                            {bet.wallet_address.slice(0, 6)}…{bet.wallet_address.slice(-4)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ color: 'white', fontSize: '13px', fontFamily: 'monospace', fontWeight: '600' }}>
                            ${bet.amount_usdc.toFixed(2)}
                          </span>
                          <span style={{ color: '#374151', fontSize: '10px', fontFamily: 'monospace' }}>
                            {formatDistanceToNow(new Date(bet.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>

          {/* RIGHT — bet widget, positions, top holders */}
          <div style={{
            width: '300px', flexShrink: 0, borderLeft: '1px solid #1F2937',
            overflowY: 'auto', padding: '20px 18px', background: '#080D13',
          }}>
            {sm && odds && (
              <>
                {/* ── Bet Widget ── */}
                <div style={{ marginBottom: '28px' }}>
                  <SectionHeader>Place Bet</SectionHeader>

                  {betStep === 'done' ? (
                    <div style={{ textAlign: 'center', padding: '28px 0' }}>
                      <div style={{ fontSize: '40px', marginBottom: '10px' }}>✅</div>
                      <p style={{ color: '#34D399', fontFamily: 'monospace', fontWeight: '700', fontSize: '15px', margin: '0 0 4px' }}>
                        BET CONFIRMED
                      </p>
                      <p style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'monospace', margin: 0 }}>
                        ${amountUsdc.toFixed(2)} on {betSide.toUpperCase()} · up to ${potentialPayout}
                      </p>
                    </div>
                  ) : betStep === 'approve' || betStep === 'confirming' ? (
                    <div style={{ textAlign: 'center', padding: '28px 0' }}>
                      <div style={{
                        width: '34px', height: '34px', border: '2px solid #374151', borderTopColor: 'white',
                        borderRadius: '50%', animation: 'modalSpin 0.8s linear infinite', margin: '0 auto 12px',
                      }} />
                      <p style={{ color: '#9CA3AF', fontFamily: 'monospace', fontSize: '12px', margin: '0 0 3px' }}>
                        {betStep === 'approve' ? 'Approving USDC…' : 'Confirming bet…'}
                      </p>
                      <p style={{ color: '#374151', fontSize: '10px', fontFamily: 'monospace', margin: 0 }}>Check your wallet</p>
                    </div>
                  ) : (
                    <>
                      {/* YES / NO toggle */}
                      <div style={{
                        display: 'flex', background: '#111827', borderRadius: '8px',
                        padding: '3px', gap: '3px', marginBottom: '14px',
                      }}>
                        {(['yes', 'no'] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => setBetSide(s)}
                            style={{
                              flex: 1, padding: '9px 0', borderRadius: '6px', border: 'none',
                              cursor: expired ? 'not-allowed' : 'pointer',
                              background: betSide === s
                                ? (s === 'yes' ? 'rgba(52,211,153,0.18)' : 'rgba(248,113,113,0.18)')
                                : 'transparent',
                              color: betSide === s ? (s === 'yes' ? '#34D399' : '#F87171') : '#4B5563',
                              fontFamily: 'monospace', fontWeight: '700', fontSize: '13px',
                              transition: 'all 0.15s',
                            }}
                          >
                            {s.toUpperCase()} ×{s === 'yes' ? odds.yesOdds : odds.noOdds}
                          </button>
                        ))}
                      </div>

                      {/* Amount input */}
                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ color: '#4B5563', fontSize: '10px', fontFamily: 'monospace', display: 'block', marginBottom: '6px', letterSpacing: '0.08em' }}>
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
                              width: '100%', background: '#111827', border: '1px solid #1F2937',
                              borderRadius: '8px', padding: '10px 48px 10px 12px',
                              color: 'white', fontSize: '15px', fontFamily: 'monospace',
                              outline: 'none', boxSizing: 'border-box',
                            }}
                          />
                          <span style={{
                            position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                            color: '#374151', fontFamily: 'monospace', fontSize: '11px',
                          }}>USDC</span>
                        </div>
                        <div style={{ display: 'flex', gap: '5px', marginTop: '7px' }}>
                          {[5, 10, 25, 50].map(v => (
                            <button
                              key={v}
                              onClick={() => setAmount(String(v))}
                              disabled={expired}
                              style={{
                                flex: 1, padding: '5px 0', background: 'transparent',
                                border: '1px solid #1F2937', borderRadius: '6px',
                                color: '#6B7280', cursor: expired ? 'not-allowed' : 'pointer',
                                fontSize: '11px', fontFamily: 'monospace', transition: 'all 0.1s',
                              }}
                            >${v}</button>
                          ))}
                        </div>
                      </div>

                      {/* Payout preview */}
                      {amountUsdc > 0 && (
                        <div style={{
                          background: '#111827', border: '1px solid #1F2937', borderRadius: '8px',
                          padding: '10px 12px', marginBottom: '12px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'monospace', marginBottom: '3px' }}>
                            <span style={{ color: '#4B5563' }}>Potential payout</span>
                            <span style={{ color: 'white', fontWeight: '700' }}>${potentialPayout}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'monospace' }}>
                            <span style={{ color: '#374151' }}>Odds</span>
                            <span style={{ color: '#6B7280' }}>×{selectedOdds}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'monospace', marginTop: '3px' }}>
                            <span style={{ color: '#374151' }}>Protocol fee</span>
                            <span style={{ color: '#6B7280' }}>0.75%</span>
                          </div>
                        </div>
                      )}

                      {betStep === 'error' && (
                        <p style={{ color: '#F87171', fontSize: '11px', fontFamily: 'monospace', marginBottom: '8px', lineHeight: '1.4' }}>
                          {errorMsg || 'Transaction failed'}
                        </p>
                      )}

                      {/* Submit button */}
                      <button
                        onClick={handleBet}
                        disabled={expired || !amountUsdc}
                        style={{
                          width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
                          background: expired || !amountUsdc
                            ? '#1F2937'
                            : betSide === 'yes'
                              ? 'linear-gradient(135deg,#059669,#34D399)'
                              : 'linear-gradient(135deg,#DC2626,#F87171)',
                          color: expired || !amountUsdc ? '#4B5563' : 'white',
                          fontWeight: '700', fontSize: '14px', fontFamily: 'monospace', letterSpacing: '0.08em',
                          cursor: expired || !amountUsdc ? 'not-allowed' : 'pointer',
                          transition: 'opacity 0.15s',
                        }}
                      >
                        {expired
                          ? 'MARKET CLOSED'
                          : !isConnected
                          ? 'CONNECT WALLET'
                          : needsApproval
                          ? 'APPROVE & BET'
                          : `BET ${betSide.toUpperCase()}`}
                      </button>
                    </>
                  )}
                </div>

                {/* ── My Positions ── */}
                {positions.length > 0 && (
                  <div style={{ marginBottom: '28px' }}>
                    <SectionHeader>My Positions</SectionHeader>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {positions.map((bet, i) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '9px 11px', background: '#111827', border: '1px solid #1F2937', borderRadius: '8px',
                        }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', fontFamily: 'monospace',
                            background: bet.side === 'yes' ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
                            color: bet.side === 'yes' ? '#34D399' : '#F87171',
                          }}>{bet.side.toUpperCase()}</span>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ color: 'white', fontSize: '12px', fontFamily: 'monospace', fontWeight: '600' }}>
                              ${bet.amount_usdc.toFixed(2)}
                            </div>
                            <div style={{ color: '#374151', fontSize: '10px', fontFamily: 'monospace' }}>
                              → ${bet.potential_payout_usdc?.toFixed(2) || '—'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Top Holders ── */}
                {topHolders.length > 0 && (
                  <div>
                    <SectionHeader>Top Holders</SectionHeader>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {topHolders.map((h, i) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '8px 11px', background: '#111827', border: '1px solid #1F2937', borderRadius: '8px',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#374151', fontSize: '10px', fontFamily: 'monospace', width: '14px' }}>
                              #{i + 1}
                            </span>
                            <span style={{ color: '#6B7280', fontSize: '11px', fontFamily: 'monospace' }}>
                              {h.addr.slice(0, 6)}…{h.addr.slice(-4)}
                            </span>
                          </div>
                          <span style={{ color: 'white', fontSize: '12px', fontFamily: 'monospace', fontWeight: '600' }}>
                            ${h.total.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      color: '#6B7280', fontSize: '10px', fontFamily: 'monospace',
      textTransform: 'uppercase', letterSpacing: '0.12em',
      margin: '0 0 10px', fontWeight: '600',
    }}>
      {children}
    </h3>
  )
}
