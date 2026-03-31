import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

function fmtK(n: number): string {
  if (n >= 1000) return `${n / 1000 % 1 === 0 ? n / 1000 : (n / 1000).toFixed(1)}K`
  return `${n}`
}

function viewerBrackets(viewers: number): Array<{ label: string }> {
  const rawStep = Math.max(viewers * 0.25, 100)
  const steps   = [250, 500, 1000, 2000, 2500, 5000, 10000, 25000, 50000]
  const step    = steps.find(s => s >= rawStep) ?? 50000
  const center  = Math.round(viewers / step) * step
  const b1      = Math.max(center - step, 0)
  const b2      = center
  const b3      = center + step
  return [
    { label: `<${fmtK(b1 || step)}` },
    { label: `${fmtK(b1)}-${fmtK(b2)}` },
    { label: `${fmtK(b2)}-${fmtK(b3)}` },
    { label: `${fmtK(b3)}+` },
  ]
}

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
  // Simple auth check
  const secret = req.headers.get('x-pulse-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch live streamers
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

  const window    = hourWindow()
  const closesAt  = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const voidAt    = new Date(Date.now() + 90 * 60 * 1000).toISOString()
  const created: string[] = []
  const skipped:  string[] = []

  for (const streamer of streamers) {
    const channel  = streamer.channel as string
    const viewers  = streamer.viewers as number ?? 0
    const displayChannel = channel.charAt(0).toUpperCase() + channel.slice(1)
    const eventTitle = `What will ${displayChannel}'s Peak Viewership be (${window})?`

    // Skip if brackets already exist for this streamer in this window
    const { count } = await supabase
      .from('markets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .ilike('title', `%${displayChannel}%Peak Viewership%`)

    if ((count ?? 0) > 0) {
      skipped.push(channel)
      continue
    }

    // Find stream row for this channel (best-effort)
    const { data: streamRow } = await supabase
      .from('streams')
      .select('id, streamer_id')
      .ilike('stream_key', channel)
      .maybeSingle()

    const brackets = viewerBrackets(viewers)
    for (const bracket of brackets) {
      await supabase.from('markets').insert({
        title:            `${eventTitle} | ${bracket.label} viewers`,
        status:           'open',
        category:         'irl',
        stream_id:        streamRow?.id ?? null,
        streamer_id:      streamRow?.streamer_id ?? null,
        opens_at:         new Date().toISOString(),
        closes_at:        closesAt,
        auto_void_at:     voidAt,
        total_yes_usdc:   0,
        total_no_usdc:    0,
        initial_yes_odds: 2.0,
        initial_no_odds:  2.0,
        rake_rate:        0.0075,
      })
    }
    created.push(`${channel} (${viewers} viewers)`)
  }

  return NextResponse.json({ created, skipped })
}
