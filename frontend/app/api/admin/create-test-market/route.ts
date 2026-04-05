import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const FIXED_BUCKETS = [
  { bucket_id: 'A', label: '0-5K',    lo: 0,      hi: 4999,  seed_usdc: 25 },
  { bucket_id: 'B', label: '5K-10K',  lo: 5000,   hi: 9999,  seed_usdc: 25 },
  { bucket_id: 'C', label: '10K-20K', lo: 10000,  hi: 19999, seed_usdc: 25 },
  { bucket_id: 'D', label: '20K+',    lo: 20000,  hi: null,  seed_usdc: 25 },
] as const

export async function GET(_req: NextRequest) {
  const now = Date.now()
  const resolveAt = new Date(now + 20 * 60 * 1000).toISOString()  // +20 min
  const lockAt    = new Date(now + 18 * 60 * 1000).toISOString()  // +18 min
  const voidAt    = new Date(now + 30 * 60 * 1000).toISOString()  // +30 min

  const title = "What will Roshtein's Peak Viewership be?"

  // Insert market
  const { data: market, error: marketErr } = await supabase
    .from('markets')
    .insert({
      title,
      status:         'open',
      market_type:    'categorical',
      event_type:     'peak_viewership',
      category:       'irl',
      stream_id:      null,
      streamer_id:    null,
      opens_at:       new Date(now).toISOString(),
      closes_at:      lockAt,
      lock_time:      lockAt,
      resolve_time:   resolveAt,
      auto_void_at:   voidAt,
      total_yes_usdc: 0,
      total_no_usdc:  0,
      rake_rate:      0.0075,
    })
    .select('id')
    .single()

  if (marketErr) return NextResponse.json({ error: marketErr.message }, { status: 500 })

  // Insert 4 bucket rows
  const bucketRows = FIXED_BUCKETS.map(b => ({
    market_id: market.id,
    bucket_id: b.bucket_id,
    label:     b.label,
    lo:        b.lo,
    hi:        b.hi,
    pool_usdc: 0,
    seed_usdc: b.seed_usdc,
  }))
  await supabase.from('market_buckets').insert(bucketRows)

  // Register on-chain via oracle
  const ORACLE_URL = process.env.ORACLE_URL || 'https://pulse-protocol-production.up.railway.app'
  let contractMarketId = null
  try {
    const oracleRes = await fetch(`${ORACLE_URL}/webhook/create-categorical-market`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pulse-secret': process.env.WEBHOOK_SECRET || '',
      },
      body: JSON.stringify({
        supabaseMarketId: market.id,
        streamId: 'roshtein',
        bettingWindowSeconds: 18 * 60,
      }),
    })
    const oracleData = await oracleRes.json()
    contractMarketId = oracleData.contractMarketId
  } catch (e: any) {
    console.error('Oracle call failed:', e.message)
  }

  return NextResponse.json({
    success: true,
    marketId: market.id,
    contractMarketId,
    resolveAt,
    lockAt,
  })
}
