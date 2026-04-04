import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'
import { ethers } from 'ethers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// POST /api/oracle/resolve — called by oracle signing service to update Supabase
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-pulse-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { marketId, contractMarketId, outcome, signature, txHash, confidence } = await req.json()

  if (!marketId || !outcome || !signature) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Update market
  const { error } = await supabase.from('markets').update({
    status: 'resolved',
    outcome,
    oracle_signature: signature,
    settlement_tx: txHash,
    oracle_confidence: confidence,
    updated_at: new Date().toISOString()
  }).eq('id', marketId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update winning bets
  await supabase.from('bets')
    .update({ status: 'won', settled_at: new Date().toISOString() })
    .eq('market_id', marketId).eq('side', outcome).eq('status', 'confirmed')

  // Update losing bets
  await supabase.from('bets')
    .update({ status: 'lost', settled_at: new Date().toISOString() })
    .eq('market_id', marketId).neq('side', outcome).eq('status', 'confirmed')

  return NextResponse.json({ success: true })
}
