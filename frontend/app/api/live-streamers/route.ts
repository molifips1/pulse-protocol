import { NextResponse } from 'next/server'
import { KNOWN_STREAMERS } from '@/lib/utils'

const KICK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://kick.com',
  'Origin': 'https://kick.com',
}

async function checkBatch(channels: string[]): Promise<any[]> {
  const query = channels.map(c => `channels[]=${encodeURIComponent(c)}`).join('&')
  const res = await fetch(`https://kick.com/api/v2/channels?${query}`, {
    headers: KICK_HEADERS,
    next: { revalidate: 0 },
  })
  if (!res.ok) return []
  const data = await res.json()
  if (!Array.isArray(data)) return []

  const live: any[] = []
  for (const ch of data) {
    const stream = ch.current_livestream || ch.livestream
    const isLive = ch.is_live || !!stream
    if (isLive && stream) {
      live.push({
        channel: ch.slug,
        viewers: ch.viewer_count || stream.viewer_count || 0,
        thumbnail: stream.thumbnail?.url || null,
        category: stream.categories?.[0]?.name || '',
      })
    }
  }
  return live
}

async function checkIndividual(channel: string): Promise<any | null> {
  const res = await fetch(`https://kick.com/api/v1/channels/${channel}`, {
    headers: KICK_HEADERS,
    next: { revalidate: 0 },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data?.livestream) return null
  return {
    channel,
    viewers: data.livestream.viewer_count || 0,
    thumbnail: data.livestream.thumbnail?.url || null,
    category: data.livestream.categories?.[0]?.name || '',
  }
}

export async function GET() {
  try {
    const live: any[] = []

    // Try v2 batch first (25 channels per request)
    let batchWorked = false
    for (let i = 0; i < KNOWN_STREAMERS.length; i += 25) {
      const batch = KNOWN_STREAMERS.slice(i, i + 25)
      const results = await checkBatch(batch)
      if (i === 0 && results.length === 0 && batch.length > 0) {
        // v2 might have failed — fall through to v1
        break
      }
      batchWorked = true
      live.push(...results)
    }

    // Fall back to individual v1 calls if batch failed
    if (!batchWorked) {
      const promises = KNOWN_STREAMERS.map(c => checkIndividual(c))
      const results = await Promise.allSettled(promises)
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) live.push(r.value)
      }
    }

    live.sort((a, b) => b.viewers - a.viewers)
    return NextResponse.json({ streamers: live })
  } catch {
    return NextResponse.json({ streamers: [] })
  }
}
