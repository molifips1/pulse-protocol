import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const status = searchParams.get('status') || 'open'

  const KNOWN_STREAMERS = [
    'trainwreckstv','haddzy','roshtein','xqc','adinross','mellstroy475','xposed',
    'classybeef','stevewilldoit','casinodaddy','cheesur','caseoh','kingkulbik',
    'ngslot','jarttu84','snikwins','gtasty','ac7ionman','westcol','elzeein'
  ]

  // Only show markets created in the last 15 minutes to filter out stale old ones
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString()

  let query = supabase
    .from('markets')
    .select('*, streams(*, streamers(*))')
    .eq('status', status)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(100)

  if (category && category !== 'all') {
    query = query.eq('category', category)
  }

  const { data: markets, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Deduplicate: keep only the most recent market per streamer
  const seen = new Set<string>()
  const deduped = (markets || []).filter(market => {
    const lower = market.title.toLowerCase()
    const streamer = KNOWN_STREAMERS.find(s => lower.includes(s.toLowerCase())) || market.title.split(' ')[1]?.toLowerCase() || 'unknown'
    if (seen.has(streamer)) return false
    seen.add(streamer)
    return true
  })

  // Enrich markets missing stream_id by matching streamer name in title
  const enriched = deduped.map(market => {
    if (market.streams) return market
    const lower = market.title.toLowerCase()
    const streamKey = KNOWN_STREAMERS.find(s => lower.includes(s.toLowerCase())) || null
    return streamKey ? { ...market, streams: { stream_key: streamKey } } : market
  })

  return NextResponse.json({ markets: enriched })
}
