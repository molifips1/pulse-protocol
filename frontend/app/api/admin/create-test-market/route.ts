import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(_req: NextRequest) {
  const now = Date.now()
  const resolveAt = new Date(now + 2.5 * 60 * 60 * 1000).toISOString()  // +2.5 hours
  const lockAt    = new Date(now + 2   * 60 * 60 * 1000).toISOString()  // +2 hours
  const voidAt    = new Date(now + 3   * 60 * 60 * 1000).toISOString()  // +3 hours

  const { data: market, error: marketErr } = await supabase
    .from('markets')
    .insert({
      title:          "What will Roshtein's Peak Viewership be?",
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

  await supabase.from('market_buckets').insert([
    { market_id: market.id, bucket_id: 'A', label: '0-5K',    lo: 0,     hi: 4999,  pool_usdc: 0, seed_usdc: 25 },
    { market_id: market.id, bucket_id: 'B', label: '5K-10K',  lo: 5000,  hi: 9999,  pool_usdc: 0, seed_usdc: 25 },
    { market_id: market.id, bucket_id: 'C', label: '10K-20K', lo: 10000, hi: 19999, pool_usdc: 0, seed_usdc: 25 },
    { market_id: market.id, bucket_id: 'D', label: '20K+',    lo: 20000, hi: null,  pool_usdc: 0, seed_usdc: 25 },
  ])

  return NextResponse.json({ success: true, marketId: market.id, resolveAt, lockAt })
}
