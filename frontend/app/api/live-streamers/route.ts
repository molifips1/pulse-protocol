import { NextResponse } from 'next/server'

const CASINO_STREAMERS = [
  'trainwreckstv','roshtein','haddzy','xposed','classybeef',
  'casinodaddy','jarttu84','stevewilldoit','elzeein','cheesur',
  'westcol','ac7ionman','deuceace','vondice','syztmz',
  'taour','tyceno','capatob','snutz','ilyaselmaliki',
  'mellstroy475','adinross','caseoh','ngslot','snikwins',
]

async function checkKick(channel: string): Promise<{ channel: string; viewers: number } | null> {
  try {
    const res = await fetch(`https://kick.com/api/v1/channels/${channel}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://kick.com',
      },
      next: { revalidate: 60 },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.livestream) {
      return { channel, viewers: data.livestream.viewer_count || 0 }
    }
    return null
  } catch {
    return null
  }
}

export async function GET() {
  // Check all streamers in parallel
  const results = await Promise.all(CASINO_STREAMERS.map(checkKick))
  const live = results
    .filter((r): r is { channel: string; viewers: number } => r !== null)
    .sort((a, b) => b.viewers - a.viewers)
    .slice(0, 10)

  return NextResponse.json({ streamers: live }, {
    headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' }
  })
}
