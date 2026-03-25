import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/bet — called after on-chain tx confirmed
export async function POST(req: NextRequest) {
  const { marketId, walletAddress, side, amountUsdc, oddsAtPlacement, potentialPayout, txHash } = await req.json()

  if (!marketId || !walletAddress || !side || !amountUsdc || !txHash) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Verify market is still open
  const { data: market } = await supabase
    .from('markets')
    .select('status, closes_at')
    .eq('id', marketId)
    .single()

  if (!market || market.status !== 'open') {
    return NextResponse.json({ error: 'Market not open' }, { status: 400 })
  }

  if (new Date(market.closes_at) < new Date()) {
    return NextResponse.json({ error: 'Betting window closed' }, { status: 400 })
  }

  // Upsert user
  await supabase.from('users').upsert({
    wallet_address: walletAddress.toLowerCase(),
    last_seen_at: new Date().toISOString()
  }, { onConflict: 'wallet_address' })

  const { data: user } = await supabase
    .from('users')
    .select('id, is_restricted')
    .eq('wallet_address', walletAddress.toLowerCase())
    .single()

  if (user?.is_restricted) {
    return NextResponse.json({ error: 'Access restricted in your jurisdiction' }, { status: 403 })
  }

  // Record bet
  const { data: bet, error } = await supabase.from('bets').insert({
    market_id: marketId,
    user_id: user?.id,
    wallet_address: walletAddress.toLowerCase(),
    side,
    amount_usdc: amountUsdc,
    odds_at_placement: oddsAtPlacement,
    potential_payout_usdc: potentialPayout,
    status: 'confirmed',
    tx_hash: txHash
  }).select().single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Duplicate transaction' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update market liquidity totals
  const field = side === 'yes' ? 'total_yes_usdc' : 'total_no_usdc'
  await supabase.rpc('increment_market_liquidity', {
    p_market_id: marketId,
    p_side: side,
    p_amount: amountUsdc
  })

  return NextResponse.json({ success: true, betId: bet.id })
}
