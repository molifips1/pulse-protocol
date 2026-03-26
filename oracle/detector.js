/**
 * PULSE PROTOCOL — Stream Detector v3
 * - Findet automatisch live Streamer auf Kick
 * - Analysiert Chat für echte Events
 * - Erstellt Märkte via Oracle Webhook
 */

const https = require('https')
const http = require('http')
const crypto = require('crypto')

const ORACLE_URL = process.env.ORACLE_URL || 'http://localhost:3001'
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-secret'
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '60') * 1000
const MARKET_COOLDOWN = 90000

const activeStreams = new Map()
const marketCooldowns = new Map()

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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
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
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')) })
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function getTopLiveStreams() {
  const liveStreams = []
  try {
    const result = await fetchJson('https://kick.com/api/v2/channels?limit=20&sort=viewers', {
      headers: { 'Referer': 'https://kick.com' }
    })
    if (result.status === 200 && Array.isArray(result.data?.data)) {
      for (const channel of result.data.data) {
        if (channel.livestream && channel.slug) {
          liveStreams.push({
            channel: channel.slug,
            streamer_name: channel.user?.username || channel.slug,
            title: channel.livestream.session_title || '',
            category: channel.livestream.categories?.[0]?.slug || 'other',
            category_name: channel.livestream.categories?.[0]?.name || 'Other',
            viewers: channel.livestream.viewer_count || 0,
          })
        }
      }
    }
  } catch (e) {
    console.log(`[DETECTOR] Failed to fetch top streams: ${e.message}`)
  }
  liveStreams.sort((a, b) => b.viewers - a.viewers)
  return liveStreams.slice(0, 5)
}

function getGameCategory(kickCategory) {
  const fps = ['valorant', 'counter-strike', 'apex-legends', 'overwatch-2', 'call-of-duty']
  const sports = ['fifa', 'ea-sports-fc', 'nba-2k', 'rocket-league', 'madden']
  const irl = ['just-chatting', 'irl', 'pools-hot-tubs-beaches', 'talk-shows']
  if (fps.some(g => kickCategory.includes(g))) return 'fps'
  if (sports.some(g => kickCategory.includes(g))) return 'sports'
  if (irl.some(g => kickCategory.includes(g))) return 'irl'
  return 'other'
}

async function syncStreamsToSupabase(liveStreams) {
  try {
    await fetchJson(
      `${ORACLE_URL}/webhook/sync-streams`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pulse-secret': WEBHOOK_SECRET } },
      { streams: liveStreams }
    )
  } catch (e) {
    console.log(`[DETECTOR] Stream sync failed: ${e.message}`)
  }
}

async function generateMarketWithGroq(stream) {
  if (!GROQ_API_KEY) return null
  const gameCategory = getGameCategory(stream.category)
  const categoryContext = {
    fps: 'This is a competitive FPS game. Events include: clutch rounds, kills, deaths, round wins/losses.',
    sports: 'This is a sports game. Events include: goals, saves, penalties, match results.',
    irl: 'This is a Just Chatting/IRL stream. Events include: debates, reactions, donation goals, challenges.',
    other: 'This is a live stream. Create an engaging prediction market.'
  }
  const prompt = `You are creating a prediction market for a live Kick.com stream.

Streamer: ${stream.streamer_name} (@${stream.channel})
Stream title: "${stream.title}"
Game/Category: ${stream.category_name}
Current viewers: ${stream.viewers}
Context: ${categoryContext[gameCategory]}

Create ONE exciting binary (yes/no) prediction market that:
1. Can be resolved within 60 seconds
2. Is specific to what might happen NOW in this stream
3. Would excite viewers to bet on

Respond ONLY with valid JSON:
{
  "event_type": "clutch|win|loss|goal|reaction|debate_outcome|donation_goal|kill|other",
  "market_title": "Will ${stream.streamer_name} [specific action]?",
  "confidence": 0.88
}`

  try {
    const result = await fetchJson(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      },
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.8
      }
    )
    if (result.status === 200) {
      const content = result.data.choices[0].message.content
      const match = content.match(/\{[\s\S]*?\}/)
      if (match) return JSON.parse(match[0])
    } else {
      console.log(`[GROQ] Error ${result.status}`)
    }
  } catch (e) {
    console.log(`[GROQ] Failed: ${e.message}`)
  }
  return null
}

async function fireMarketCreation(stream, event, streamDbId) {
  const payload = {
    streamId: streamDbId,
    streamerId: null,
    streamerWallet: '0x0000000000000000000000000000000000000000',
    eventType: event.event_type,
    confidence: event.confidence,
    marketTitle: event.market_title,
    bettingWindowSeconds: 60,
    frameHash: crypto.randomBytes(32).toString('hex'),
    rawDetection: { source: 'groq_text_v3', channel: stream.channel, viewers: stream.viewers },
    category: getGameCategory(stream.category)
  }
  try {
    const result = await fetchJson(
      `${ORACLE_URL}/webhook/event-detected`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pulse-secret': WEBHOOK_SECRET } },
      payload
    )
    if (result.status === 200) {
      console.log(`[DETECTOR] ✅ Market created: ${event.market_title}`)
      return true
    } else {
      console.log(`[DETECTOR] ❌ Oracle error: ${JSON.stringify(result.data)}`)
    }
  } catch (e) {
    console.log(`[DETECTOR] Webhook failed: ${e.message}`)
  }
  return false
}

async function mainLoop() {
  console.log('[DETECTOR] 🔍 Scanning Kick for live streams...')
  const liveStreams = await getTopLiveStreams()
  if (liveStreams.length === 0) {
    console.log('[DETECTOR] ⚠️  No live streams found, retrying...')
    return
  }
  console.log(`[DETECTOR] 📺 Found ${liveStreams.length} live streams:`)
  liveStreams.forEach(s => console.log(`  - ${s.channel} (${s.viewers} viewers) "${s.title}"`))
  await syncStreamsToSupabase(liveStreams)
  for (const stream of liveStreams) {
    const streamKey = stream.channel
    const lastMarket = marketCooldowns.get(streamKey) || 0
    const cooldownOk = (Date.now() - lastMarket) > MARKET_COOLDOWN
    if (!cooldownOk) {
      console.log(`[DETECTOR] ⏳ Cooldown active for ${stream.channel}`)
      continue
    }
    console.log(`[DETECTOR] 🧠 Generating market for ${stream.channel}...`)
    const event = await generateMarketWithGroq(stream)
    if (event && event.market_title) {
      console.log(`[DETECTOR] 🎯 ${event.market_title} (${Math.round(event.confidence * 100)}%)`)
      const success = await fireMarketCreation(stream, event, streamKey)
      if (success) marketCooldowns.set(streamKey, Date.now())
    }
    await new Promise(r => setTimeout(r, 2000))
  }
}

console.log('[DETECTOR] 🚀 Pulse Detector v3 starting...')
console.log(`[DETECTOR] Oracle: ${ORACLE_URL}`)
console.log(`[DETECTOR] Check interval: ${CHECK_INTERVAL/1000}s`)

if (!GROQ_API_KEY) {
  console.log('[DETECTOR] ❌ GROQ_API_KEY not set!')
  process.exit(1)
}

mainLoop()
setInterval(mainLoop, CHECK_INTERVAL)