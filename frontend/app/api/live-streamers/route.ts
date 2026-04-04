import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { KNOWN_STREAMERS } from '@/lib/utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const KICK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://kick.com',
  'Origin': 'https://kick.com',
}

// Try Kick v2 batch for up to 25 channels — returns null if the API itself failed
async function tryBatch(channels: string[]): Promise<any[] | null> {
  try {
    const query = channels.map(c => `channels[]=${encodeURIComponent(c)}`).join('&')
    const res = await fetch(`https://kick.com/api/v2/channels?${query}`, {
      headers: KICK_HEADERS,
      next: { revalidate: 0 },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data)) return null

    return data
      .filter((ch: any) => {
        const stream = ch.current_livestream || ch.livestream
        return (ch.is_live || !!stream) && stream
      })
      .map((ch: any) => {
        const stream = ch.current_livestream || ch.livestream
        return {
          channel: ch.slug,
          viewers: ch.viewer_count || stream.viewer_count || 0,
          thumbnail: stream.thumbnail?.url || null,
          category: stream.categories?.[0]?.name || '',
        }
      })
  } catch {
    return null
  }
}

// Oracle cache fallback
async function fromOracleCache(): Promise<any[] | null> {
  const oracleUrl = process.env.ORACLE_URL
  if (!oracleUrl) return null
  try {
    const res = await fetch(`${oracleUrl}/live-streamers`, { next: { revalidate: 0 } })
    if (!res.ok) return null
    const data = await res.json()
    const all: any[] = data.streamers || []
    return all.filter((s: any) =>
      KNOWN_STREAMERS.includes((s.channel || s.name || '').toLowerCase())
    )
  } catch {
    return null
  }
}

export async function GET() {
  try {
    const live: any[] = []
    let batchOk = true

    // Kick v2 batch: 3 requests for ~72 channels
    for (let i = 0; i < KNOWN_STREAMERS.length; i += 25) {
      const batch = KNOWN_STREAMERS.slice(i, i + 25)
      const result = await tryBatch(batch)
      if (result === null) {
        batchOk = false
        break
      }
      live.push(...result)
    }

    // If v2 failed entirely, fall back to oracle cache then Supabase
    if (!batchOk) {
      const cached = await fromOracleCache()
      if (cached && cached.length > 0) {
        cached.sort((a: any, b: any) => (b.viewers || 0) - (a.viewers || 0))
        return NextResponse.json({ streamers: cached, source: 'cache' })
      }

      // Final fallback: read is_live from Supabase streams table
      const { data: liveRows } = await supabase
        .from('streams')
        .select('stream_key, viewer_count')
        .eq('is_live', true)
        .eq('platform', 'kick')
      if (liveRows && liveRows.length > 0) {
        const streamers = liveRows.map((r: any) => ({
          channel: r.stream_key,
          viewers: r.viewer_count || 0,
          thumbnail: null,
          category: '',
        }))
        streamers.sort((a: any, b: any) => b.viewers - a.viewers)
        return NextResponse.json({ streamers, source: 'supabase' })
      }

      return NextResponse.json({ streamers: [] })
    }

    live.sort((a, b) => b.viewers - a.viewers)
    return NextResponse.json({ streamers: live, source: 'kick' })
  } catch {
    return NextResponse.json({ streamers: [] })
  }
}
