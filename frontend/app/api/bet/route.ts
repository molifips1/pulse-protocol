import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  const {
    marketId, walletAddress, side, bucketId,
    amountUsdc, oddsAtPlacement, potentialPayout, txHash, contractBetId
  } = await req.json()

  if (!marketId || !walletAddress || !side || !amountUsdc || !txHash) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Verify market is still open
  const { data: market, error: marketErr } = await supabase
    .from('markets')
    .select('status, closes_at, market_type, total_yes_usdc, total_no_usdc')
    .eq('id', marketId)
    .single()

  if (marketErr) return NextResponse.json({ error: marketErr.message }, { status: 500 })
  if (!market || market.status !== 'open') {
    return NextResponse.json({ error: `Market not open (status: ${market?.status})` }, { status: 400 })
  }
  if (new Date(market.closes_at) < new Date()) {
    return NextResponse.json({ error: 'Betting window closed' }, { status: 400 })
  }

  // Categorical markets require a bucketId
  if (market.market_type === 'categorical' && !bucketId) {
    return NextResponse.json({ error: 'bucketId required for categorical market' }, { status: 400 })
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

  // Insert bet
  const coreFields: Record<string, any> = {
    market_id: marketId,
    user_id: user?.id,
    wallet_address: walletAddress.toLowerCase(),
    side,
    bucket_id: bucketId || null,
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

  let bet: any = null
  if (errFull) {
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

  // Update pool totals
  if (market.market_type === 'categorical' && bucketId) {
    // Categorical: update market_buckets.pool_usdc for this bucket
    const { error: rpcErr } = await supabase.rpc('increment_bucket_pool', {
      p_market_id: marketId,
      p_bucket_id: bucketId,
      p_amount:    amountUsdc,
    })
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  } else {
    // Binary: existing logic unchanged
    const poolUpdate = side === 'yes'
      ? { total_yes_usdc: (market.total_yes_usdc || 0) + amountUsdc }
      : { total_no_usdc: (market.total_no_usdc || 0) + amountUsdc }
    await supabase.from('markets').update(poolUpdate).eq('id', marketId)
  }

  return NextResponse.json({ success: true, betId: bet.id })
}
