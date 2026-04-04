import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Fixed 4 buckets — same for every streamer
const FIXED_BUCKETS = [
  { bucket_id: 'A', label: '0-5K',    lo: 0,      hi: 4999  },
  { bucket_id: 'B', label: '5K-10K',  lo: 5000,   hi: 9999  },
  { bucket_id: 'C', label: '10K-20K', lo: 10000,  hi: 19999 },
  { bucket_id: 'D', label: '20K+',    lo: 20000,  hi: null  },
] as const

function hourWindow(): string {
  const now   = new Date()
  const start = new Date(now)
  start.setMinutes(0, 0, 0)
  const end   = new Date(start)
  end.setHours(start.getHours() + 1)
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${fmt(start)} - ${fmt(end)}`
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-pulse-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch live streamers from oracle
  const ORACLE_URL = process.env.ORACLE_URL || ''
  let streamers: any[] = []
  if (ORACLE_URL) {
    try {
      const res = await fetch(`${ORACLE_URL}/live-streamers`)
      if (res.ok) {
        const data = await res.json()
        streamers = data.streamers || []
      }
    } catch { /* oracle unreachable */ }
  }

  if (streamers.length === 0) {
    return NextResponse.json({ error: 'No live streamers found from oracle' }, { status: 404 })
  }

  const window     = hourWindow()
  const now        = Date.now()
  const resolveAt  = new Date(now + 60 * 60 * 1000).toISOString()  // +60 min
  const lockAt     = new Date(now + 50 * 60 * 1000).toISOString()  // +50 min (resolve - 10 min)
  const voidAt     = new Date(now + 90 * 60 * 1000).toISOString()  // +90 min

  const created: string[] = []
  const skipped:  string[] = []

  for (const streamer of streamers) {
    const channel        = streamer.channel as string
    const displayChannel = channel.charAt(0).toUpperCase() + channel.slice(1)
    const eventTitle     = `What will ${displayChannel}'s Peak Viewership be (${window})?`

    // Skip if a categorical market already exists for this streamer in this window
    const { count } = await supabase
      .from('markets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .eq('market_type', 'categorical')
      .ilike('title', `%${displayChannel}%Peak Viewership%`)

    if ((count ?? 0) > 0) {
      skipped.push(channel)
      continue
    }

    // Find stream row (best-effort)
    const { data: streamRow } = await supabase
      .from('streams')
      .select('id, streamer_id')
      .ilike('stream_key', channel)
      .maybeSingle()

    // Insert one categorical market
    const { data: market, error: marketErr } = await supabase
      .from('markets')
      .insert({
        title:         eventTitle,
        status:        'open',
        market_type:   'categorical',
        category:      'irl',
        stream_id:     streamRow?.id ?? null,
        streamer_id:   streamRow?.streamer_id ?? null,
        opens_at:      new Date(now).toISOString(),
        closes_at:     lockAt,
        lock_time:     lockAt,
        resolve_time:  resolveAt,
        auto_void_at:  voidAt,
        total_yes_usdc: 0,
        total_no_usdc:  0,
        rake_rate:      0.0075,
      })
      .select('id')
      .single()

    if (marketErr) {
      console.error('[create-viewer-markets] market insert failed:', marketErr.message)
      continue
    }

    // Insert 4 fixed bucket rows
    const bucketRows = FIXED_BUCKETS.map(b => ({
      market_id: market.id,
      bucket_id: b.bucket_id,
      label:     b.label,
      lo:        b.lo,
      hi:        b.hi,
      pool_usdc: 0,
      seed_usdc: 25,
    }))

    const { error: bucketsErr } = await supabase.from('market_buckets').insert(bucketRows)
    if (bucketsErr) {
      console.error('[create-viewer-markets] bucket insert failed:', bucketsErr.message)
    }

    created.push(channel)

    // Register market on-chain via oracle
    if (ORACLE_URL) {
      try {
        const streamKey = streamRow?.id ? channel : null
        await fetch(`${ORACLE_URL}/webhook/create-categorical-market`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-pulse-secret': process.env.WEBHOOK_SECRET || '',
          },
          body: JSON.stringify({
            supabaseMarketId: market.id,
            streamId: channel,
            bettingWindowSeconds: 3000,  // 50 min = 3000 sec (lock_time window)
          }),
        })
      } catch (oracleErr: any) {
        console.error('[create-viewer-markets] oracle on-chain create failed:', oracleErr.message)
        // Market is in Supabase but not on-chain — oracle will retry on next creation cycle
      }
    }
  }

  return NextResponse.json({ created, skipped })
}
