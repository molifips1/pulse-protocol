/**
 * PULSE PROTOCOL — Stream Detector v2 (No ffmpeg needed)
 * Nutzt Kick API + Groq Text um Events zu simulieren
 * Kein Frame-Capture nötig — analysiert Stream-Metadaten
 */

const https = require('https')
const http = require('http')
const crypto = require('crypto')

const ORACLE_URL = process.env.ORACLE_URL || 'http://localhost:3001'
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-secret'
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const FRAME_INTERVAL = parseInt(process.env.FRAME_INTERVAL || '60') * 1000

const STREAMS = [
  { stream_id: '11111111-1111-1111-1111-111111111111', streamer_name: 'xQc', streamer_wallet: '0x0000000000000000000000000000000000000000', channel: 'xqc', game_category: 'irl' },
  { stream_id: '22222222-2222-2222-2222-222222222222', streamer_name: 'Trainwreckstv', streamer_wallet: '0x0000000000000000000000000000000000000000', channel: 'trainwreckstv', game_category: 'irl' },
  { stream_id: '44444444-4444-4444-4444-444444444444', streamer_name: 'Buddha', streamer_wallet: '0x0000000000000000000000000000000000000000', channel: 'buddha', game_category: 'fps' }
]

async function fetchJson(url, options, body) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https')
    const lib = isHttps ? https : http
    const urlObj = new URL(url)
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0', ...(options.headers || {}) }
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
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')) })
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function getKickStreamInfo(channel) {
  try {
    const result = await fetchJson(`https://kick.com/api/v2/channels/${channel}`, {
      headers: { 'Accept': 'application/json', 'Referer': 'https://kick.com' }
    })
    if (result.status === 200 && result.data) {
      const data = result.data
      return {
        isLive: !!data.livestream,
        title: data.livestream?.session_title || '',
        category: data.livestream?.categories?.[0]?.name || '',
        viewers: data.livestream?.viewer_count || 0,
        chatMessages: [] 
      }
    }
  } catch (e) {
    console.log(`[DETECTOR] Kick API failed for ${channel}: ${e.message}`)
  }
  return null
}

async function generateMarketWithGroq(stream, streamInfo) {
  if (!GROQ_API_KEY) return null

  const prompt = `You are an AI that creates prediction markets for live streaming events.

Streamer: ${stream.channel}
Stream title: "${streamInfo.title}"
Category: ${streamInfo.game_category}
Viewers: ${streamInfo.viewers}

Based on this stream info, create ONE interesting binary prediction market question that viewers would want to bet on right now.

The question should be:
- Answerable within 60 seconds
- Related to what might happen in the stream
- Exciting and relevant

Respond ONLY with JSON (no other text):
{
  "event_type": "clutch|win|loss|goal|reaction|debate_outcome|donation_goal",
  "market_title": "Will [specific question]?",
  "confidence": 0.85
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
        temperature: 0.7
      }
    )

    if (result.status === 200) {
      const content = result.data.choices[0].message.content
      const match = content.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        return parsed
      }
    } else {
      console.log(`[GROQ] Error ${result.status}: ${JSON.stringify(result.data).substring(0, 200)}`)
    }
  } catch (e) {
    console.log(`[GROQ] Failed: ${e.message}`)
  }
  return null
}

async function fireMarketCreation(stream, event) {
  const payload = {
    streamId: stream.stream_id,
    streamerId: null,
    streamerWallet: stream.streamer_wallet,
    eventType: event.event_type,
    confidence: event.confidence,
    marketTitle: event.market_title,
    bettingWindowSeconds: 60,
    frameHash: crypto.randomBytes(32).toString('hex'),
    rawDetection: { source: 'groq_text', channel: stream.channel },
    category: stream.game_category
  }

  try {
    const result = await fetchJson(
      `${ORACLE_URL}/webhook/event-detected`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pulse-secret': WEBHOOK_SECRET } },
      payload
    )
    if (result.status === 200) {
      console.log(`[DETECTOR] ✅ Market created: ${event.market_title}`)
    } else {
      console.log(`[DETECTOR] ❌ Oracle error: ${JSON.stringify(result.data)}`)
    }
  } catch (e) {
    console.log(`[DETECTOR] Webhook failed: ${e.message}`)
  }
}

async function monitorStream(stream) {
  let lastMarketTs = 0
  console.log(`[DETECTOR] 👀 Monitoring: ${stream.channel} (${stream.game_category})`)

  while (true) {
    await new Promise(r => setTimeout(r, FRAME_INTERVAL))

    const now = Date.now()
    const cooldownOk = (now - lastMarketTs) > 90000

    if (!cooldownOk) continue

    console.log(`[DETECTOR] 📡 Checking stream: ${stream.channel}...`)
    const streamInfo = await getKickStreamInfo(stream.channel)

    if (!streamInfo || !streamInfo.isLive) {
      console.log(`[DETECTOR] 💤 ${stream.channel} is not live`)
      continue
    }

    console.log(`[DETECTOR] 🟢 ${stream.channel} is LIVE (${streamInfo.viewers} viewers) - "${streamInfo.title}"`)
    console.log(`[DETECTOR] 🧠 Generating market with Groq...`)

    const event = await generateMarketWithGroq(stream, streamInfo)

    if (event && event.market_title) {
      console.log(`[DETECTOR] 🎯 Market: ${event.market_title}`)
      await fireMarketCreation(stream, event)
      lastMarketTs = now
    } else {
      console.log(`[DETECTOR] ⚠️  Could not generate market for ${stream.channel}`)
    }
  }
}

console.log('[DETECTOR] 🚀 Pulse Detector v2 starting...')
console.log(`[DETECTOR] Oracle: ${ORACLE_URL}`)
console.log(`[DETECTOR] Interval: ${FRAME_INTERVAL/1000}s`)

if (!GROQ_API_KEY) {
  console.log('[DETECTOR] ❌ GROQ_API_KEY not set!')
  process.exit(1)
}

Promise.all(STREAMS.map(monitorStream)).catch(console.error)