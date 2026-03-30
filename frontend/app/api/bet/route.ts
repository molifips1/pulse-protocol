import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/bet — called after on-chain tx confirmed
export async function POST(req: NextRequest) {
  const { marketId, walletAddress, side, amountUsdc, oddsAtPlacement, potentialPayout, txHash, contractBetId } = await req.json()

  if (!marketId || !walletAddress || !side || !amountUsdc || !txHash) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Verify market is still open
  const { data: market, error: marketErr } = await supabase
    .from('markets')
    .select('status, closes_at, total_yes_usdc, total_no_usdc')
    .eq('id', marketId)
    .single()

  if (marketErr) return NextResponse.json({ error: marketErr.message }, { status: 500 })
  if (!market || market.status !== 'open') {
    return NextResponse.json({ error: `Market not open (status: ${market?.status})` }, { status: 400 })
  }
  if (new Date(market.closes_at) < new Date()) {
    return NextResponse.json({ error: 'Betting window closed' }, { status: 400 })
  }

  // Upsert user
  await supabase.from('users').upsert(
    { wallet_address: walletAddress.toLowerCase(), last_seen_at: new Date().toISOString() },
    { onConflict: 'wallet_address' }
  )
  const { data: user } = await supabase
    .from('users').select('id, is_restricted').eq('wallet_address', walletAddress.toLowerCase()).single()

  if (user?.is_restricted) {
    return NextResponse.json({ error: 'Access restricted in your jurisdiction' }, { status: 403 })
  }

  // Insert bet — try with optional columns first, fall back to core columns only
  let bet: any = null
  const coreFields = {
    market_id: marketId,
    user_id: user?.id,
    wallet_address: walletAddress.toLowerCase(),
    side,
    amount_usdc: amountUsdc,
    odds_at_placement: oddsAtPlacement,
    potential_payout_usdc: potentialPayout,
    status: 'confirmed',
    tx_hash: txHash,
  }

  const { data: betFull, error: errFull } = await supabase
    .from('bets')
    .insert({ ...coreFields, contract_bet_id: contractBetId || null, placed_at: new Date().toISOString() })
    .select().single()

  if (errFull) {
    // Optional columns may not exist — retry with core fields only
    console.error('[api/bet] full insert failed:', errFull.message, '— retrying with core fields')
    const { data: betCore, error: errCore } = await supabase
      .from('bets').insert(coreFields).select().single()
    if (errCore) {
      if (errCore.code === '23505') return NextResponse.json({ error: 'Duplicate transaction' }, { status: 409 })
      return NextResponse.json({ error: errCore.message }, { status: 500 })
    }
    bet = betCore
  } else {
    bet = betFull
  }

  // Update market pool totals
  const poolUpdate = side === 'yes'
    ? { total_yes_usdc: (market.total_yes_usdc || 0) + amountUsdc }
    : { total_no_usdc: (market.total_no_usdc || 0) + amountUsdc }
  await supabase.from('markets').update(poolUpdate).eq('id', marketId)

  return NextResponse.json({ success: true, betId: bet.id })
}
