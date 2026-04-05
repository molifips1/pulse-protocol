import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-pulse-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { channel = 'roshtein', windowMinutes = 10 } = await req.json().catch(() => ({}))
  const now = Date.now()
  const resolveAt  = new Date(now + windowMinutes * 60 * 1000).toISOString()
  const lockAt     = new Date(now + (windowMinutes - 2) * 60 * 1000).toISOString()
  const voidAt     = new Date(now + (windowMinutes + 30) * 60 * 1000).toISOString()
  const displayChannel = channel.charAt(0).toUpperCase() + channel.slice(1)

  const { data: streamRow } = await supabase
    .from('streams').select('id, streamer_id').ilike('stream_key', channel).maybeSingle()

  const { data: market, error } = await supabase.from('markets').insert({
    title:          `What will ${displayChannel}'s Peak Viewership be (test)?`,
    status:         'open',
    market_type:    'categorical',
    event_type:     'peak_viewership',
    category:       'irl',
    stream_id:      streamRow?.id ?? null,
    streamer_id:    streamRow?.streamer_id ?? null,
    opens_at:       new Date(now).toISOString(),
    closes_at:      lockAt,
    lock_time:      lockAt,
    resolve_time:   resolveAt,
    auto_void_at:   voidAt,
    total_yes_usdc: 0,
    total_no_usdc:  0,
    rake_rate:      0.0075,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert 4 bucket rows
  await supabase.from('market_buckets').insert(
    ['A','B','C','D'].map((b, i) => ({
      market_id: market.id,
      bucket_id: b,
      label: ['0-5K','5K-10K','10K-20K','20K+'][i],
      lo: [0,5000,10000,20000][i],
      hi: [4999,9999,19999,null][i],
      pool_usdc: 0,
      seed_usdc: 25,
    }))
  )

  // Register on-chain via oracle
  const ORACLE_URL = process.env.ORACLE_URL || ''
  let contractMarketId = null
  if (ORACLE_URL) {
    try {
      const r = await fetch(`${ORACLE_URL}/webhook/create-categorical-market`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-pulse-secret': process.env.WEBHOOK_SECRET || '' },
        body: JSON.stringify({ supabaseMarketId: market.id, streamId: channel, bettingWindowSeconds: (windowMinutes - 2) * 60 }),
      })
      const body = await r.json()
      contractMarketId = body.contractMarketId || null
    } catch (e: any) {
      console.error('[create-test-market] oracle error:', e.message)
    }
  }

  return NextResponse.json({ marketId: market.id, contractMarketId, resolveAt, lockAt })
}
