/**
 * PULSE PROTOCOL — Stream Detector (Node.js)
 * Analysiert Kick Streams mit Groq Vision und erstellt Märkte
 */

const https = require('https')
const http = require('http')
const crypto = require('crypto')
const { execSync } = require('child_process')

const ORACLE_URL = process.env.ORACLE_URL || 'http://localhost:3001'
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-secret'
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const FRAME_INTERVAL = parseInt(process.env.FRAME_INTERVAL || '30') * 1000

const STREAMS = [
  {
    stream_id: '11111111-1111-1111-1111-111111111111',
    streamer_name: 'xQc',
    streamer_wallet: '0x0000000000000000000000000000000000000000',
    channel: 'xqc',
    game_category: 'irl'
  },
  {
    stream_id: '22222222-2222-2222-2222-222222222222',
    streamer_name: 'Trainwreckstv',
    streamer_wallet: '0x0000000000000000000000000000000000000000',
    channel: 'trainwreckstv',
    game_category: 'irl'
  },
  {
    stream_id: '44444444-4444-4444-4444-444444444444',
    streamer_name: 'Buddha',
    streamer_wallet: '0x0000000000000000000000000000000000000000',
    channel: 'buddha',
    game_category: 'fps'
  }
]

const CATEGORY_PROMPTS = {
  fps: `Analyze this FPS gaming stream screenshot. Look for clutch situations, round wins/losses, kill feed spikes.
Respond ONLY with JSON: {"event_detected": true/false, "event_type": "clutch|win|loss|kill|none", "market_title": "Will [streamer] clutch this?", "confidence": 0.0-1.0}`,
  irl: `Analyze this IRL stream screenshot. Look for debates, emotional reactions, donation goals, controversial moments.
Respond ONLY with JSON: {"event_detected": true/false, "event_type": "debate_outcome|reaction|donation_goal|none", "market_title": "Will [streamer] win this debate?", "confidence": 0.0-1.0}`,
  sports: `Analyze this sports stream screenshot. Look for near-goals, penalties, score changes.
Respond ONLY with JSON: {"event_detected": true/false, "event_type": "goal|win|loss|penalty|none", "market_title": "Will [streamer] score?", "confidence": 0.0-1.0}`
}

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
      headers: options.headers || {}
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
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function captureKickFrame(channel) {
  try {
    // Try to get frame via ffmpeg
    const output = execSync(
      `ffmpeg -i "https://kickcdn-stb.b-cdn.net/hls/${channel}/index.m3u8" -vframes 1 -f image2 -vcodec mjpeg -loglevel error -t 5 pipe:1`,
      { encoding: 'buffer', timeout: 15000, maxBuffer: 5 * 1024 * 1024 }
    )
    if (output && output.length > 0) {
      return output.toString('base64')
    }
  } catch (e) {
    console.log(`[DETECTOR] ffmpeg failed for ${channel}: ${e.message.substring(0, 100)}`)
  }
  return null
}

async function analyzeWithGroq(frameB64, channel, category) {
  if (!GROQ_API_KEY) return null
  
  const prompt = (CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.irl).replace(/\[streamer\]/g, channel)
  
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
        model: 'llama-3.2-11b-vision-preview',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frameB64}` } },
            { type: 'text', text: prompt }
          ]
        }],
        max_tokens: 150,
        temperature: 0.1
      }
    )
    
    if (result.status === 200) {
      const content = result.data.choices[0].message.content
      const match = content.match(/\{.*\}/s)
      if (match) return JSON.parse(match[0])
    } else {
      console.log(`[GROQ] Error ${result.status}`)
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
    rawDetection: { source: 'groq_vision', channel: stream.channel },
    category: stream.game_category
  }

  try {
    const result = await fetchJson(
      `${ORACLE_URL}/webhook/event-detected`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pulse-secret': WEBHOOK_SECRET
        }
      },
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

    if (cooldownOk) {
      console.log(`[DETECTOR] 📸 Capturing frame from ${stream.channel}...`)
      const frameB64 = await captureKickFrame(stream.channel)

      if (frameB64) {
        console.log(`[DETECTOR] 🧠 Analyzing with Groq Vision...`)
        const result = await analyzeWithGroq(frameB64, stream.channel, stream.game_category)

        if (result && result.event_detected && result.confidence > 0.75) {
          console.log(`[DETECTOR] 🎯 Event: ${result.market_title} (${Math.round(result.confidence * 100)}%)`)
          await fireMarketCreation(stream, result)
          lastMarketTs = now
        } else {
          console.log(`[DETECTOR] 💤 No event on ${stream.channel}`)
        }
      } else {
        console.log(`[DETECTOR] ⚠️  Could not capture frame from ${stream.channel}`)
      }
    }
  }
}

console.log('[DETECTOR] 🚀 Pulse Detector starting (Node.js)...')
console.log(`[DETECTOR] Monitoring ${STREAMS.length} streams, interval: ${FRAME_INTERVAL/1000}s`)

if (!GROQ_API_KEY) {
  console.log('[DETECTOR] ❌ GROQ_API_KEY not set!')
  process.exit(1)
}

Promise.all(STREAMS.map(monitorStream)).catch(console.error)
