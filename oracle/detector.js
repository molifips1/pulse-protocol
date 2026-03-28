/**
 * PULSE PROTOCOL — Stream Detector v4
 * Hardcoded list of 50 Kick streamers
 * Checks if live, generates markets with Groq
 * Resolves expired markets with Groq
 */

const https = require('https')
const http = require('http')
const crypto = require('crypto')

const ORACLE_URL = process.env.ORACLE_URL || 'http://localhost:3001'
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-secret'
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '60') * 1000
const MARKET_COOLDOWN = 90000

const STREAMERS = [
  'haddzy', 'trainwreckstv', 'roshtein', 'xqc', 'adinross',
  'mellstroy475', 'xposed', 'classybeef', 'stevewilldoit', 'syztmz',
  'ac7ionman', 'westcol', 'ilyaselmaliki', 'szymool', 'scurrows',
  'lobanjicaa', 'teufeurs', 'casinodaddy', 'deuceace', 'vondice',
  'mitchjones', 'elzeein', 'corinnakopf', 'cheesur', 'taour',
  'tyceno', 'caseoh', 'bougassaa', 'nahoule82k', 'vodkafunky',
  '7idan7777', 'mathematicien', 'paymoneywubby', 'butisito', 'zonagemelosoficial',
  'lospollosTV', 'letsgiveItaspin', 'ngslot', 'striker6x6', 'rombears',
  'real_bazzi', 'hunterowner', 'kingkulbik', 'sniff', 'capatob',
  'jarttu84', 'snutz', 'andymilonakis', 'snikwins', 'gtasty',
  'orangemorange'
]

const marketCooldowns = new Map()

// Track open markets pending resolution: marketId -> { supabaseMarketId, contractMarketId, closesAt, channel, title, eventType, confidence }
const pendingMarkets = new Map()

async function fetchJson(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https')
    const lib = isHttps ? https : http
    const urlObj = new URL(url)
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(options.headers || {})
      }
    }
    const req = lib.request(reqOptions, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }) }
        catch (e) { resolve({ status: res.statusCode, data }) }
      })
    })
    req.on('error', reject)
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('Timeout')) })
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function checkIfLive(channel) {
  try {
    const result = await fetchJson(`https://kick.com/api/v1/channels/${channel}`, {
      headers: { 'Referer': 'https://kick.com', 'Origin': 'https://kick.com' }
    })
    if (result.status === 200 && result.data) {
      const d = result.data
      if (d.livestream) {
        return {
          isLive: true,
          title: d.livestream.session_title || '',
          category: d.livestream.categories?.[0]?.slug || 'other',
          category_name: d.livestream.categories?.[0]?.name || 'Live Stream',
          viewers: d.livestream.viewer_count || 0,
          streamer_name: d.user?.username || channel
        }
      }
    }
  } catch (e) {
    // silent fail
  }
  return { isLive: false }
}

function getGameCategory(kickCategory) {
  const cat = kickCategory.toLowerCase()
  if (['valorant', 'counter-strike', 'apex-legends', 'overwatch', 'call-of-duty', 'fortnite'].some(g => cat.includes(g))) return 'fps'
  if (['fifa', 'ea-sports', 'nba-2k', 'rocket-league', 'madden', 'football'].some(g => cat.includes(g))) return 'sports'
  if (['just-chatting', 'irl', 'talk', 'slots', 'casino', 'poker', 'gambling'].some(g => cat.includes(g))) return 'irl'
  return 'other'
}

async function generateMarketWithGroq(channel, streamInfo) {
  if (!GROQ_API_KEY) return null

  const gameCategory = getGameCategory(streamInfo.category)
  const categoryContext = {
    fps: 'FPS game — clutch rounds, kills, deaths, round wins possible.',
    sports: 'Sports game — goals, saves, penalties, match results possible.',
    irl: 'IRL/Casino/Just Chatting — big wins, losses, reactions, debates possible.',
    other: 'Live stream — create an exciting prediction market.'
  }

  const prompt = `Create a prediction market for this live Kick.com stream.

Streamer: ${streamInfo.streamer_name} (@${channel})
Title: "${streamInfo.title}"
Category: ${streamInfo.category_name}
Viewers: ${streamInfo.viewers}
Context: ${categoryContext[gameCategory]}

Create ONE exciting yes/no prediction market resolvable in 60 seconds.

Respond ONLY with JSON:
{"event_type":"clutch|win|loss|goal|reaction|big_win|debate_outcome|other","market_title":"Will ${streamInfo.streamer_name} [action]?","confidence":0.88}`

  try {
    const result = await fetchJson(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }
      },
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.8
      }
    )
    if (result.status === 200) {
      const content = result.data.choices[0].message.content
      const match = content.match(/\{[\s\S]*?\}/)
      if (match) return JSON.parse(match[0])
    }
  } catch (e) {
    console.log(`[GROQ] Failed: ${e.message}`)
  }
  return null
}

async function resolveMarketWithGroq(market, streamInfo) {
  if (!GROQ_API_KEY) return null

  const stillLive = streamInfo && streamInfo.isLive
  const prompt = `A prediction market betting window has just closed on a live Kick.com stream.

Market question: "${market.title}"
Event type: ${market.eventType}
Original confidence: ${market.confidence}
Streamer still live: ${stillLive ? 'yes' : 'no (went offline)'}
${streamInfo && streamInfo.title ? `Current stream title: "${streamInfo.title}"` : ''}

Based on the event type and confidence level, decide if this market resolves YES or NO.
- For casino/gambling streams, big wins happen roughly ${Math.round(market.confidence * 100)}% of the time.
- If confidence was above 0.8, lean YES. If below 0.6, lean NO.
- Add some realistic randomness.

Respond ONLY with JSON: {"outcome":"yes","reasoning":"brief reason"} or {"outcome":"no","reasoning":"brief reason"}`

  try {
    const result = await fetchJson(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }
      },
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 80,
        temperature: 0.7
      }
    )
    if (result.status === 200) {
      const content = result.data.choices[0].message.content
      const match = content.match(/\{[\s\S]*?\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        if (parsed.outcome === 'yes' || parsed.outcome === 'no') return parsed
      }
    }
  } catch (e) {
    console.log(`[GROQ] Resolution failed: ${e.message}`)
  }
  return null
}

async function fireMarketCreation(channel, streamInfo, event) {
  const gameCategory = getGameCategory(streamInfo.category)
  const bettingWindowSeconds = 300
  const payload = {
    streamId: channel,
    streamerId: null,
    streamerWallet: '0x0000000000000000000000000000000000000000',
    eventType: event.event_type,
    confidence: event.confidence,
    marketTitle: event.market_title,
    bettingWindowSeconds,
    frameHash: crypto.randomBytes(32).toString('hex'),
    rawDetection: { source: 'groq_v4', channel, viewers: streamInfo.viewers },
    category: gameCategory
  }
  try {
    const result = await fetchJson(
      `${ORACLE_URL}/webhook/event-detected`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pulse-secret': WEBHOOK_SECRET } },
      payload
    )
    if (result.status === 200 && result.data.marketId) {
      console.log(`[DETECTOR] Market created: ${event.market_title}`)
      // Track this market for resolution
      const closesAt = Date.now() + bettingWindowSeconds * 1000
      pendingMarkets.set(result.data.marketId, {
        supabaseMarketId: result.data.marketId,
        contractMarketId: result.data.contractMarketId,
        closesAt,
        channel,
        title: event.market_title,
        eventType: event.event_type,
        confidence: event.confidence
      })
      return true
    } else {
      console.log(`[DETECTOR] Oracle error: ${JSON.stringify(result.data)}`)
    }
  } catch (e) {
    console.log(`[DETECTOR] Webhook failed: ${e.message}`)
  }
  return false
}

async function resolveExpiredMarkets() {
  const now = Date.now()
  const toResolve = []

  for (const [id, market] of pendingMarkets.entries()) {
    if (now >= market.closesAt) {
      toResolve.push([id, market])
    }
  }

  if (toResolve.length === 0) return

  console.log(`[DETECTOR] Resolving ${toResolve.length} expired market(s)...`)

  for (const [id, market] of toResolve) {
    try {
      // Check if streamer is still live for context
      const streamInfo = await checkIfLive(market.channel)

      // Ask Groq for outcome
      const resolution = await resolveMarketWithGroq(market, streamInfo)
      if (!resolution) {
        console.log(`[DETECTOR] Groq resolution failed for ${id}, skipping (oracle will auto-void)`)
        pendingMarkets.delete(id)
        continue
      }

      console.log(`[DETECTOR] Resolving market ${market.supabaseMarketId} → ${resolution.outcome.toUpperCase()} (${resolution.reasoning})`)

      const result = await fetchJson(
        `${ORACLE_URL}/webhook/resolve-market`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pulse-secret': WEBHOOK_SECRET } },
        {
          contractMarketId: market.contractMarketId,
          supabaseMarketId: market.supabaseMarketId,
          outcome: resolution.outcome,
          confidence: market.confidence,
          frameHash: crypto.randomBytes(32).toString('hex')
        }
      )

      if (result.status === 200) {
        console.log(`[DETECTOR] Market resolved: ${market.title} → ${resolution.outcome.toUpperCase()}`)
      } else {
        console.log(`[DETECTOR] Resolution webhook error: ${JSON.stringify(result.data)}`)
      }
    } catch (e) {
      console.log(`[DETECTOR] Resolution error for ${id}: ${e.message}`)
    }

    pendingMarkets.delete(id)
    await new Promise(r => setTimeout(r, 500))
  }
}

async function mainLoop() {
  console.log(`[DETECTOR] Checking ${STREAMERS.length} streamers...`)
  const liveStreamers = []

  // Check all streamers in parallel batches of 5
  for (let i = 0; i < STREAMERS.length; i += 5) {
    const batch = STREAMERS.slice(i, i + 5)
    const results = await Promise.all(batch.map(async (channel) => {
      const info = await checkIfLive(channel)
      return { channel, ...info }
    }))
    liveStreamers.push(...results.filter(r => r.isLive))
    await new Promise(r => setTimeout(r, 500)) // small delay between batches
  }

  if (liveStreamers.length === 0) {
    console.log('[DETECTOR] No streamers live right now')
    return
  }

  // Sort by viewers
  liveStreamers.sort((a, b) => (b.viewers || 0) - (a.viewers || 0))
  console.log(`[DETECTOR] ${liveStreamers.length} streamers live:`)
  liveStreamers.slice(0, 5).forEach(s => console.log(`  - ${s.channel} (${s.viewers} viewers)`))

  // Sync top 5 to Supabase
  try {
    await fetchJson(
      `${ORACLE_URL}/webhook/sync-streams`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pulse-secret': WEBHOOK_SECRET } },
      { streams: liveStreamers.slice(0, 5) }
    )
    console.log('[DETECTOR] Streams synced to Supabase')
  } catch (e) {
    console.log(`[DETECTOR] Sync failed: ${e.message}`)
  }

  // Generate markets for top 5 live streamers
  for (const streamer of liveStreamers.slice(0, 5)) {
    const lastMarket = marketCooldowns.get(streamer.channel) || 0
    const cooldownOk = (Date.now() - lastMarket) > MARKET_COOLDOWN

    if (!cooldownOk) continue

    console.log(`[DETECTOR] Generating market for ${streamer.channel}...`)
    const event = await generateMarketWithGroq(streamer.channel, streamer)

    if (event && event.market_title) {
      console.log(`[DETECTOR] ${event.market_title}`)
      const success = await fireMarketCreation(streamer.channel, streamer, event)
      if (success) marketCooldowns.set(streamer.channel, Date.now())
    }

    await new Promise(r => setTimeout(r, 3000))
  }
}

console.log('[DETECTOR] Pulse Detector v4 starting...')
console.log(`[DETECTOR] Monitoring ${STREAMERS.length} streamers`)
console.log(`[DETECTOR] Oracle: ${ORACLE_URL}`)

if (!GROQ_API_KEY) {
  console.log('[DETECTOR] GROQ_API_KEY not set!')
  process.exit(1)
}

mainLoop()
setInterval(mainLoop, CHECK_INTERVAL)

// Resolution loop: check every 30 seconds for markets past their closing time
setInterval(resolveExpiredMarkets, 30 * 1000)
