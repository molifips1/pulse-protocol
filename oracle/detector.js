/**
 * PULSE PROTOCOL — Stream Detector v4
 * Hardcoded list of 50 Kick streamers
 * Checks if live, generates markets with Groq
 * Resolves expired markets with Groq
 */

const https = require('https')
const http = require('http')
const crypto = require('crypto')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// In-memory cache of live streamers (updated each mainLoop)
let liveStreamersCache = []

const ORACLE_URL = process.env.ORACLE_URL || 'http://localhost:3001'
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-secret'
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '60') * 1000
const MARKET_COOLDOWN = 90000

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

const STREAMERS = [
  // Top casino streamers
  'trainwreckstv', 'roshtein', 'haddzy', 'xposed', 'classybeef',
  'casinodaddy', 'jarttu84', 'stevewilldoit', 'elzeein', 'cheesur',
  'westcol', 'ac7ionman', 'deuceace', 'vondice', 'syztmz',
  'taour', 'tyceno', 'capatob', 'snutz', 'ilyaselmaliki',
  'mellstroy475', 'adinross', 'caseoh', 'ngslot', 'snikwins',
  'xqc', 'mitchjones', 'corinnakopf', 'kingkulbik', 'gtasty',
  // Additional casino streamers
  'stake', 'stakeus', 'nickslots', 'labowsky', 'bonusking',
  'fruityslots', 'slotspinner', 'goonbags', 'nicks_slots', 'cg_cgaming',
  'chipmonkz', 'casino_eric', 'slotlady', 'vegaslow', 'mrvegas',
  'david_labowsky', 'bonanzas', 'spintwix', 'slotsfighter', 'casinogrounds',
  'szymool', 'scurrows', 'lobanjicaa', 'teufeurs', 'bougassaa',
  'nahoule82k', 'vodkafunky', '7idan7777', 'mathematicien', 'paymoneywubby',
  'butisito', 'zonagemelosoficial', 'lospollosTV', 'letsgiveItaspin', 'striker6x6',
  'rombears', 'real_bazzi', 'hunterowner', 'sniff', 'andymilonakis',
  'SweetFlips', 'zubarefff45', 'wesbtw', 'BlondeRabbit', 'ARTEMGRAPH',
  'Native_Stream_192', 'AFERIStT', 'generalqw77',
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
          streamer_name: d.user?.username || channel,
          playbackUrl: d.playback_url || null,
          thumbnail: d.livestream.thumbnail?.url || null
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

// Grab a single frame from the stream using ffmpeg
function grabStreamFrame(playbackUrl, channel) {
  try {
    const outPath = path.join('/tmp', `${channel}_frame.jpg`)
    execSync(
      `ffmpeg -y -i "${playbackUrl}" -vframes 1 -q:v 2 -vf "scale=640:-1" "${outPath}" 2>/dev/null`,
      { timeout: 15000 }
    )
    if (fs.existsSync(outPath)) {
      const data = fs.readFileSync(outPath)
      fs.unlinkSync(outPath)
      return data.toString('base64')
    }
  } catch (e) {
    // ffmpeg failed or timed out
  }
  return null
}

// Download thumbnail as base64
async function fetchThumbnailBase64(url) {
  try {
    return new Promise((resolve) => {
      const lib = url.startsWith('https') ? https : http
      const req = lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')))
      })
      req.on('error', () => resolve(null))
      req.setTimeout(8000, () => { req.destroy(); resolve(null) })
    })
  } catch { return null }
}

// Generate market using Claude Vision — sees what's actually on screen
async function generateMarketWithVision(channel, streamInfo) {
  if (!ANTHROPIC_API_KEY) return null

  // Fetch live thumbnail from Kick (updated every few seconds)
  if (!streamInfo.thumbnail) return null
  const imageBase64 = await fetchThumbnailBase64(streamInfo.thumbnail)
  if (!imageBase64) return null

  const prompt = `You are watching a live casino/gambling stream on Kick.com.
Streamer: ${streamInfo.streamer_name} | Title: "${streamInfo.title}" | Viewers: ${streamInfo.viewers}

Look at this stream screenshot and create ONE specific yes/no prediction market that resolves in 5 minutes.
Be SPECIFIC about what you see: the slot game name, bet amount, multiplier, game being played, etc.
Examples: "Will [game] hit above 10x in next 5 mins?", "Will streamer change to a new slot game?", "Will [streamer] win on [specific game] they're playing?"

Respond ONLY with JSON (no markdown, no explanation):
{"market_title":"Will ...?","event_type":"win_event","verification_type":"win_event","confidence":0.55,"threshold":${streamInfo.viewers}}`

  try {
    const result = await fetchJson(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      },
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/webp', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      }
    )
    if (result.status === 200) {
      const content = result.data.content?.[0]?.text || ''
      const match = content.match(/\{[\s\S]*?\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        console.log(`[VISION] Generated for ${channel}: ${parsed.market_title}`)
        return parsed
      }
    } else {
      console.log(`[VISION] API error ${result.status}: ${JSON.stringify(result.data).slice(0, 100)}`)
    }
  } catch (e) {
    console.log(`[VISION] Failed: ${e.message}`)
  }
  return null
}

// Check Supabase for existing open markets for this channel to prevent duplicates
async function hasOpenMarket(channel) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return false
  try {
    const url = `${SUPABASE_URL}/rest/v1/markets?stream_id=not.is.null&status=eq.open&title=ilike.*${encodeURIComponent(channel)}*&select=id&limit=1`
    // Use title match as proxy since stream_id linkage is unreliable
    const titleUrl = `${SUPABASE_URL}/rest/v1/markets?status=in.(open,locked)&title=ilike.*${encodeURIComponent(channel)}*&select=id&limit=1`
    const result = await fetchJson(titleUrl, {
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    })
    return result.status === 200 && Array.isArray(result.data) && result.data.length > 0
  } catch (e) {
    return false
  }
}

// Extract slot/game name from stream title
function extractGameFromTitle(title) {
  const t = title.toLowerCase()
  // Common slot games mentioned in titles
  const slots = [
    'sweet bonanza','gates of olympus','big bass','dog house','wanted dead',
    'mental','fire portals','pragmatic','no limit','hacksaw','push gaming',
    'jammin jars','reactoonz','book of dead','razor shark','money train',
    'deadwood','tombstone','san quentin','poison eve','volatile slot',
    'chaos crew','fat banker','release the kraken','pirots','train of thought',
    'retrigger','high roller','bonus hunt','bonus buys','bonus round',
  ]
  const found = slots.find(s => t.includes(s))
  if (found) return found
  // Extract anything after common keywords
  const m = title.match(/playing\s+([^|!@#]+)/i) || title.match(/\|\s*([^|]{4,30})\s*\|/i)
  return m ? m[1].trim() : null
}

async function generateMarketWithGroq(channel, streamInfo) {
  if (!GROQ_API_KEY) return null

  const gameCategory = getGameCategory(streamInfo.category)
  const detectedGame = extractGameFromTitle(streamInfo.title)

  // Pick a random bet type for variety
  const betTypes = ['big_win', 'multiplier', 'bonus', 'viewer_spike', 'game_change']
  const betType = betTypes[Math.floor(Math.random() * betTypes.length)]

  const gameContext = detectedGame
    ? `The streamer appears to be playing: "${detectedGame}"`
    : `Stream title: "${streamInfo.title}"`

  const betTypePrompts = {
    big_win: `Create a market about whether they will hit a BIG WIN (typically 100x+ bet) in the next 5 minutes.`,
    multiplier: `Create a market about a specific multiplier milestone (e.g. "Will they hit above 50x?", "Will they get a 100x+ multiplier?").`,
    bonus: `Create a market about whether they will trigger a bonus round / free spins in the next 5 minutes.`,
    viewer_spike: `Create a market about a viewer count spike — big wins attract viewers. Will viewers increase by 10%+?`,
    game_change: `Create a market about whether the streamer will switch to a different game/slot in the next 5 minutes.`,
  }

  const prompt = `You are generating prediction markets for a live casino stream on Kick.com.

Streamer: ${streamInfo.streamer_name}
${gameContext}
Category: ${streamInfo.category_name}
Current viewers: ${streamInfo.viewers}

${betTypePrompts[betType]}

Make the market title SPECIFIC and EXCITING. Use the game name if known. Avoid generic phrases.
Good examples:
- "Will ${streamInfo.streamer_name} hit 100x+ on Sweet Bonanza in the next 5 mins?"
- "Will ${streamInfo.streamer_name} trigger Free Spins in the next 5 mins?"
- "Will ${streamInfo.streamer_name} switch slots in the next 5 mins?"

Respond ONLY with JSON (no markdown):
{"event_type":"${betType}","market_title":"Will ...?","confidence":0.5,"verification_type":"win_event","threshold":${streamInfo.viewers}}`

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
        max_tokens: 150,
        temperature: 0.9
      }
    )
    if (result.status === 200) {
      const content = result.data.choices[0].message.content
      const match = content.match(/\{[\s\S]*?\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        console.log(`[GROQ] Generated for ${channel}: ${parsed.market_title}`)
        return parsed
      }
    }
  } catch (e) {
    console.log(`[GROQ] Failed: ${e.message}`)
  }
  return null
}

async function resolveMarket(market, currentStreamInfo) {
  const eventType = market.eventType || 'viewer_spike'
  const threshold = market.threshold || 0
  const snapshotTitle = market.snapshotTitle || ''

  // Stream went offline → NO
  if (!currentStreamInfo || !currentStreamInfo.isLive) {
    return { outcome: 'no', reasoning: 'Stream went offline' }
  }

  const currentTitle = (currentStreamInfo.title || '').toLowerCase()
  const titleChanged = currentStreamInfo.title !== snapshotTitle
  const viewerChange = ((currentStreamInfo.viewers - threshold) / (threshold || 1)) * 100

  const WIN_KEYWORDS = ['win', 'won', 'jackpot', 'mega', 'epic', 'insane', 'huge', 'big', '🔥', '💰', '🎰', 'x ', '×']
  const titleHasWin = WIN_KEYWORDS.some(k => currentTitle.includes(k))

  if (eventType === 'big_win' || eventType === 'multiplier') {
    // YES if title changed AND contains win keywords (streamer updated title after big hit)
    // OR viewer count spiked 15%+ (excitement from big win)
    const outcome = (titleChanged && titleHasWin) || viewerChange >= 15 ? 'yes' : 'no'
    return { outcome, reasoning: `Title changed: ${titleChanged}, win keywords: ${titleHasWin}, viewer change: ${viewerChange.toFixed(1)}%` }
  }

  if (eventType === 'bonus') {
    // YES if viewer count spiked 8%+ (bonus rounds cause excitement/chat activity)
    // OR title changed (streamer often updates title when bonus hits)
    const outcome = viewerChange >= 8 || titleChanged ? 'yes' : 'no'
    return { outcome, reasoning: `Viewer change: ${viewerChange.toFixed(1)}%, title changed: ${titleChanged}` }
  }

  if (eventType === 'game_change') {
    // YES if title changed significantly (new game name likely in title)
    const outcome = titleChanged ? 'yes' : 'no'
    return { outcome, reasoning: titleChanged ? `Title changed to: "${currentStreamInfo.title}"` : 'Title unchanged' }
  }

  if (eventType === 'viewer_spike') {
    // YES if viewers increased 10%+
    const outcome = viewerChange >= 10 ? 'yes' : 'no'
    return { outcome, reasoning: `Viewers: ${threshold} → ${currentStreamInfo.viewers} (${viewerChange.toFixed(1)}%)` }
  }

  // Legacy verification types
  if (market.verificationType === 'title_change') {
    return { outcome: titleChanged ? 'yes' : 'no', reasoning: titleChanged ? `Title changed to: "${currentStreamInfo.title}"` : 'Title unchanged' }
  }
  if (market.verificationType === 'win_event') {
    return { outcome: titleHasWin ? 'yes' : 'no', reasoning: `Title: "${currentStreamInfo.title}"` }
  }

  // Fallback
  const outcome = viewerChange >= 5 ? 'yes' : 'no'
  return { outcome, reasoning: `Viewers ${threshold} → ${currentStreamInfo.viewers} (${viewerChange.toFixed(1)}%)` }
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
      const closesAt = Date.now() + bettingWindowSeconds * 1000
      pendingMarkets.set(result.data.marketId, {
        supabaseMarketId: result.data.marketId,
        contractMarketId: result.data.contractMarketId,
        closesAt,
        channel,
        title: event.market_title,
        eventType: event.event_type,
        confidence: event.confidence,
        verificationType: event.verification_type || 'viewer_count',
        threshold: event.threshold || streamInfo.viewers,
        snapshotTitle: streamInfo.title,
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
      // Re-fetch live stream data to verify outcome
      const streamInfo = await checkIfLive(market.channel)
      const resolution = await resolveMarket(market, streamInfo)
      if (!resolution) {
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
    liveStreamersCache = []
    return
  }

  // Sort by viewers
  liveStreamers.sort((a, b) => (b.viewers || 0) - (a.viewers || 0))
  liveStreamersCache = liveStreamers.slice(0, 10).map(s => ({ channel: s.channel, viewers: s.viewers || 0 }))
  console.log(`[DETECTOR] ${liveStreamers.length} streamers live:`)
  liveStreamers.slice(0, 5).forEach(s => console.log(`  - ${s.channel} (${s.viewers} viewers)`))

  // Sync top 10 to Supabase
  try {
    await fetchJson(
      `${ORACLE_URL}/webhook/sync-streams`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pulse-secret': WEBHOOK_SECRET } },
      { streams: liveStreamers.slice(0, 10) }
    )
    console.log('[DETECTOR] Streams synced to Supabase')
  } catch (e) {
    console.log(`[DETECTOR] Sync failed: ${e.message}`)
  }

  // Update live streamers cache in oracle for frontend
  try {
    await fetchJson(
      `${ORACLE_URL}/webhook/live-streamers-update`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pulse-secret': WEBHOOK_SECRET } },
      { streamers: liveStreamers.slice(0, 10).map(s => ({ channel: s.channel, viewers: s.viewers })) }
    )
  } catch (e) {
    // silent
  }

  // Generate markets for top 10 live streamers
  for (const streamer of liveStreamers.slice(0, 10)) {
    const lastMarket = marketCooldowns.get(streamer.channel) || 0
    const cooldownOk = (Date.now() - lastMarket) > MARKET_COOLDOWN

    if (!cooldownOk) continue

    // Check DB for existing open market to prevent duplicates across restarts
    const alreadyOpen = await hasOpenMarket(streamer.channel)
    if (alreadyOpen) {
      console.log(`[DETECTOR] Skipping ${streamer.channel} — market already open`)
      marketCooldowns.set(streamer.channel, Date.now())
      continue
    }

    console.log(`[DETECTOR] Generating market for ${streamer.channel}...`)

    // Try vision-based market generation first (sees actual stream content)
    let event = await generateMarketWithVision(streamer.channel, streamer)
    // Fall back to Groq text-only if vision fails or not configured
    if (!event) event = await generateMarketWithGroq(streamer.channel, streamer)

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

// Simple HTTP server so Railway keeps the service alive and exposes live streamers
const PORT = parseInt(process.env.PORT || '3002')
http.createServer((req, res) => {
  if (req.url === '/live-streamers' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
    res.end(JSON.stringify({ streamers: liveStreamersCache }))
  } else if (req.url === '/health') {
    res.writeHead(200)
    res.end('ok')
  } else {
    res.writeHead(404)
    res.end()
  }
}).listen(PORT, () => {
  console.log(`[DETECTOR] HTTP server on :${PORT}`)
})
