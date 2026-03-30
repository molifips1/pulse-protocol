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
const WebSocket = require('ws')

// In-memory cache of live streamers (updated each mainLoop)
let liveStreamersCache = []

const ORACLE_URL = process.env.ORACLE_URL || 'http://localhost:3001'
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'dev-secret'
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL || '60') * 1000
const MARKET_COOLDOWN = 30000

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

// Track open markets pending resolution
const pendingMarkets = new Map()

// Chat monitors: marketId -> { messages: string[], ws: WebSocket }
const chatMonitors = new Map()
const PUSHER_KEY = '32cbd69e4b950bf97679'

function startChatMonitor(marketId, chatRoomId) {
  if (!chatRoomId) return
  const messages = []
  try {
    const ws = new WebSocket(
      `wss://ws-us2.pusher.com/app/${PUSHER_KEY}?protocol=7&client=js&version=7.2.0&flash=false`,
      { headers: { 'Origin': 'https://kick.com' } }
    )
    chatMonitors.set(marketId, { messages, ws })

    ws.on('open', () => {
      ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel: `chatrooms.${chatRoomId}.v2` } }))
      console.log(`[CHAT] Monitoring chatroom ${chatRoomId} for market ${marketId}`)
    })
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw)
        if (msg.event === 'App\\Events\\ChatMessageEvent') {
          const d = JSON.parse(msg.data)
          if (d.content) messages.push(d.content)
        }
      } catch (e) {}
    })
    ws.on('error', () => {})
    ws.on('close', () => {})
  } catch (e) {
    console.log(`[CHAT] Connect failed: ${e.message}`)
  }
}

function stopChatMonitor(marketId) {
  const monitor = chatMonitors.get(marketId)
  if (monitor) {
    try { monitor.ws.close() } catch (e) {}
    chatMonitors.delete(marketId)
  }
}

function analyzeChatMessages(messages, eventType) {
  if (!messages || messages.length === 0) return null
  const text = messages.join(' ')

  if (eventType === 'big_win' || eventType === 'multiplier') {
    // Extract multiplier numbers from chat (e.g. "500x!!", "1000x")
    const multMatches = [...text.matchAll(/(\d+)\s*x/gi)]
    const maxMult = multMatches.reduce((m, r) => Math.max(m, parseInt(r[1])), 0)
    const hasWinWords = /big\s*win|jackpot|insane|crazy|omg|holy|pogchamp|pog|letsgo|lets\s*go|!!!|monkaS/i.test(text)
    if (maxMult >= 50 || (hasWinWords && messages.length >= 15)) {
      return { outcome: 'yes', reasoning: `Chat: max ${maxMult}x seen, ${messages.length} msgs, win words: ${hasWinWords}` }
    }
    return { outcome: 'no', reasoning: `Chat: max ${maxMult}x, ${messages.length} msgs — no big win detected` }
  }

  if (eventType === 'bonus') {
    const hasBonus = /bonus|free\s*spin|freespin|feature|triggered|bonus\s*round/i.test(text)
    if (hasBonus && messages.length >= 10) {
      return { outcome: 'yes', reasoning: `Chat: bonus keywords detected in ${messages.length} messages` }
    }
    return { outcome: 'no', reasoning: `Chat: no bonus keywords in ${messages.length} messages` }
  }

  if (eventType === 'viewer_spike') {
    // High chat activity = viewer excitement
    const outcome = messages.length >= 40 ? 'yes' : 'no'
    return { outcome, reasoning: `Chat activity: ${messages.length} messages in 5 mins` }
  }

  return null // game_change etc — fall back to API
}

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
          thumbnail: d.livestream.thumbnail?.url || null,
          chatRoomId: d.chatroom?.id || null
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

// Category-aware bet types
const CATEGORY_TYPES = {
  casino: ['big_win', 'bonus', 'multiplier', 'game_change', 'viewer_spike'],
  fps:    ['kill_streak', 'win_round', 'clutch_play', 'game_change', 'viewer_spike'],
  sports: ['score_goal', 'win_match', 'big_play', 'game_change', 'viewer_spike'],
  irl:    ['viewer_spike', 'donation_goal', 'raid_incoming', 'react_moment', 'game_change'],
  other:  ['viewer_spike', 'game_change', 'hype_moment', 'donation_goal', 'clip_moment'],
}

function getStreamContentType(streamInfo) {
  const cat = (streamInfo.category || '').toLowerCase()
  const title = (streamInfo.title || '').toLowerCase()
  if (['slots', 'casino', 'poker', 'gambling', 'blackjack', 'roulette'].some(k => cat.includes(k) || title.includes(k))) return 'casino'
  if (['valorant', 'counter-strike', 'apex', 'overwatch', 'call-of-duty', 'fortnite', 'fps'].some(k => cat.includes(k))) return 'fps'
  if (['fifa', 'nba-2k', 'rocket-league', 'madden', 'football', 'sports'].some(k => cat.includes(k))) return 'sports'
  if (['just-chatting', 'irl', 'talk-shows'].some(k => cat.includes(k))) return 'irl'
  return 'other'
}

// Generate market using Claude Vision — sees what's actually on screen
async function generateMarketWithVision(channel, streamInfo) {
  if (!ANTHROPIC_API_KEY) return null

  // Fetch live thumbnail from Kick (updated every few seconds)
  if (!streamInfo.thumbnail) return null
  const imageBase64 = await fetchThumbnailBase64(streamInfo.thumbnail)
  if (!imageBase64) return null

  const prompt = `You are watching a live stream on Kick.com.
Streamer: ${streamInfo.streamer_name} | Category: "${streamInfo.category_name}" | Title: "${streamInfo.title}" | Viewers: ${streamInfo.viewers}

Look at this stream screenshot and create ONE specific yes/no prediction market that resolves in 5 minutes.
Base it on what is ACTUALLY happening on screen — do not assume it is a casino stream.
Be specific: mention the game, activity, or event visible. Use the streamer's name.
Examples by content type:
- Casino/slots: "Will [streamer] hit above 500x on [game] in the next 5 mins?"
- FPS game: "Will [streamer] get a 3+ kill streak in the next round?"
- IRL/chatting: "Will [streamer]'s viewer count rise above [current+10%] in 5 mins?"
- Other game: "Will [streamer] complete the current objective in [game] within 5 mins?"

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

// Returns how many open markets this channel already has
async function countOpenMarkets(channel) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return 0
  try {
    // Query via streams join — accurate regardless of market title wording
    const url = `${SUPABASE_URL}/rest/v1/markets?select=id,streams!inner(stream_key)&status=in.(open,locked)&streams.stream_key=eq.${encodeURIComponent(channel.toLowerCase())}`
    const result = await fetchJson(url, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` }
    })
    if (result.status === 200 && Array.isArray(result.data)) return result.data.length
    // Fallback: title search
    const fallback = await fetchJson(
      `${SUPABASE_URL}/rest/v1/markets?status=in.(open,locked)&title=ilike.*${encodeURIComponent(channel)}*&select=id`,
      { headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` } }
    )
    return fallback.status === 200 && Array.isArray(fallback.data) ? fallback.data.length : 0
  } catch (e) {
    return 0
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

async function generateMarketWithGroq(channel, streamInfo, betType) {
  if (!GROQ_API_KEY) return null

  const detectedGame = extractGameFromTitle(streamInfo.title)
  const contentType = getStreamContentType(streamInfo)
  const name = streamInfo.streamer_name

  const typeInstructions = {
    // Casino
    big_win:       { label: 'BIG WIN',        example: `"Will ${name} hit a mega win above 500x on ${detectedGame ? `"${detectedGame}"` : 'their current slot'} in the next 5 mins?"`, verification_type: 'win_event' },
    multiplier:    { label: 'MULTIPLIER',      example: `"Will ${name} land a 100x+ multiplier in the next 5 mins?"`,                                                                    verification_type: 'win_event' },
    bonus:         { label: 'BONUS ROUND',     example: `"Will ${name} trigger Free Spins on ${detectedGame ? `"${detectedGame}"` : 'their current slot'} in the next 5 mins?"`,         verification_type: 'win_event' },
    game_change:   { label: 'GAME CHANGE',     example: `"Will ${name} switch to a different game in the next 5 mins?"`,                                                                  verification_type: 'title_change' },
    viewer_spike:  { label: 'VIEWER SPIKE',    example: `"Will ${name}'s viewer count increase 10%+ in the next 5 mins?"`,                                                               verification_type: 'viewer_count' },
    // FPS
    kill_streak:   { label: 'KILL STREAK',     example: `"Will ${name} get 3 or more kills in a single round in the next 5 mins?"`,                                                      verification_type: 'win_event' },
    win_round:     { label: 'WIN ROUND',       example: `"Will ${name}'s team win the next round?"`,                                                                                      verification_type: 'win_event' },
    clutch_play:   { label: 'CLUTCH PLAY',     example: `"Will ${name} clutch a 1v2 or better in the next 5 mins?"`,                                                                     verification_type: 'win_event' },
    // Sports
    score_goal:    { label: 'SCORE/GOAL',      example: `"Will ${name} score in the next 5 mins?"`,                                                                                       verification_type: 'win_event' },
    win_match:     { label: 'WIN MATCH',       example: `"Will ${name} win their current match?"`,                                                                                         verification_type: 'win_event' },
    big_play:      { label: 'BIG PLAY',        example: `"Will ${name} make a highlight-worthy play in the next 5 mins?"`,                                                                verification_type: 'win_event' },
    // IRL / Other
    donation_goal: { label: 'DONATION GOAL',   example: `"Will ${name} receive a $100+ donation in the next 5 mins?"`,                                                                   verification_type: 'viewer_count' },
    raid_incoming: { label: 'RAID',            example: `"Will ${name} receive a raid in the next 5 mins?"`,                                                                               verification_type: 'viewer_count' },
    react_moment:  { label: 'REACTION MOMENT', example: `"Will ${name} have a big reaction moment in the next 5 mins?"`,                                                                  verification_type: 'win_event' },
    hype_moment:   { label: 'HYPE MOMENT',     example: `"Will ${name} trigger a hype train or celebration in the next 5 mins?"`,                                                         verification_type: 'viewer_count' },
    clip_moment:   { label: 'CLIP MOMENT',     example: `"Will something clip-worthy happen on ${name}'s stream in the next 5 mins?"`,                                                    verification_type: 'win_event' },
  }

  const t = typeInstructions[betType] || typeInstructions['viewer_spike']
  const prompt = `Generate a yes/no prediction market for a LIVE STREAM on Kick.com.

TYPE: ${t.label} — create a ${t.label} market.
Streamer: ${name} | Category: "${streamInfo.category_name}" | Title: "${streamInfo.title}" | Viewers: ${streamInfo.viewers}

EXAMPLE:
${t.example}

Rules: be specific to this streamer and their actual content. Do not use casino references for non-casino streams.
Respond ONLY with this exact JSON (no markdown, no extra text):
{"event_type":"${betType}","market_title":"Will ...?","confidence":0.55,"verification_type":"${t.verification_type}","threshold":${streamInfo.viewers}}`

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
        temperature: 1.0
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

async function fireMarketCreation(channel, streamInfo, event, chatRoomId) {
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
      const marketId = result.data.marketId
      pendingMarkets.set(marketId, {
        supabaseMarketId: marketId,
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
      // Start listening to chat for this market
      startChatMonitor(marketId, chatRoomId)
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
      // Try chat-based resolution first (most accurate)
      const monitor = chatMonitors.get(id)
      let resolution = monitor ? analyzeChatMessages(monitor.messages, market.eventType) : null
      stopChatMonitor(id)

      // Fall back to Kick API comparison if chat unavailable
      if (!resolution) {
        const streamInfo = await checkIfLive(market.channel)
        resolution = await resolveMarket(market, streamInfo)
      }

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
  liveStreamersCache = liveStreamers.map(s => ({
    channel: s.channel,
    viewers: s.viewers || 0,
    thumbnail: s.thumbnail || null,
  }))
  console.log(`[DETECTOR] ${liveStreamers.length} streamers live:`)
  liveStreamers.slice(0, 5).forEach(s => console.log(`  - ${s.channel} (${s.viewers} viewers)`))

  // Sync top 10 to Supabase
  try {
    await fetchJson(
      `${ORACLE_URL}/webhook/sync-streams`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-pulse-secret': WEBHOOK_SECRET } },
      { streams: liveStreamers }
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
      { streamers: liveStreamers.map(s => ({ channel: s.channel, viewers: s.viewers, thumbnail: s.thumbnail || null })) }
    )
  } catch (e) {
    // silent
  }

  // Generate markets for all live streamers
  for (const streamer of liveStreamers) {
    const lastMarket = marketCooldowns.get(streamer.channel) || 0
    const cooldownOk = (Date.now() - lastMarket) > MARKET_COOLDOWN
    if (!cooldownOk) continue

    // Allow up to 3 concurrent bets per streamer (different types)
    const openCount = await countOpenMarkets(streamer.channel)
    if (openCount >= 3) {
      console.log(`[DETECTOR] Skipping ${streamer.channel} — ${openCount} markets already open`)
      continue
    }

    // Pick bet types appropriate for this stream's content
    const contentType = getStreamContentType(streamer)
    const allTypes = CATEGORY_TYPES[contentType] || CATEGORY_TYPES.other
    const typesToGenerate = allTypes.slice(0, 3 - openCount)

    console.log(`[DETECTOR] Generating ${typesToGenerate.length} market(s) for ${streamer.channel}...`)

    let anyCreated = false
    for (const betType of typesToGenerate) {
      let event = await generateMarketWithVision(streamer.channel, streamer)
      if (!event) event = await generateMarketWithGroq(streamer.channel, streamer, betType)

      if (event && event.market_title) {
        console.log(`[DETECTOR] [${betType}] ${event.market_title}`)
        const created = await fireMarketCreation(streamer.channel, streamer, event, streamer.chatRoomId)
        if (created) anyCreated = true
      }
      await new Promise(r => setTimeout(r, 2000))
    }

    // Only set cooldown if we actually created markets — don't penalise API failures
    if (anyCreated) marketCooldowns.set(streamer.channel, Date.now())
    await new Promise(r => setTimeout(r, 1000))
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
