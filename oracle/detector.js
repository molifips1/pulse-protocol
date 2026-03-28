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

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

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

async function generateMarketWithGroq(channel, streamInfo) {
  if (!GROQ_API_KEY) return null

  const gameCategory = getGameCategory(streamInfo.category)

  // Generate verifiable market types based on measurable stream data
  const verifiablePrompts = {
    irl: `The streamer is playing casino/slots/IRL. Create a market about:
- viewer count change (e.g. "Will viewer count increase by 5% in the next 5 minutes?")
- win event (e.g. "Will ${streamInfo.streamer_name} hit a win above $500 in the next 5 minutes?")
- stream title change (e.g. "Will ${streamInfo.streamer_name}'s stream title change in the next 5 minutes?")`,
    fps: `The streamer is playing an FPS game. Create a market about:
- kill/death event measurable from stream context
- round win/loss
- viewer count change`,
    sports: `The streamer is playing a sports game. Create a market about:
- goal/score event
- viewer spike (excitement moment)`,
    other: `Create a market about a measurable stream event in the next 5 minutes.`
  }

  const prompt = `Create a verifiable yes/no prediction market for this live Kick.com stream.
The market MUST be something that can be verified by checking the Kick API 5 minutes later.

Streamer: ${streamInfo.streamer_name} (@${channel})
Title: "${streamInfo.title}"
Category: ${streamInfo.category_name}
Current viewers: ${streamInfo.viewers}

${verifiablePrompts[gameCategory] || verifiablePrompts.other}

Respond ONLY with JSON (no markdown):
{"event_type":"viewer_spike|title_change|big_win|score_event|clutch","market_title":"Will ${streamInfo.streamer_name} [verifiable action] in the next 5 minutes?","confidence":0.5,"verification_type":"viewer_count|title_change|win_event","threshold":${streamInfo.viewers}}`

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

async function resolveMarket(market, currentStreamInfo) {
  const verificationType = market.verificationType || 'viewer_count'
  const threshold = market.threshold || 0

  // If stream went offline, resolve NO
  if (!currentStreamInfo || !currentStreamInfo.isLive) {
    return { outcome: 'no', reasoning: 'Stream went offline' }
  }

  if (verificationType === 'viewer_count') {
    // YES if viewer count increased by 5% or more (excitement/win happened)
    const increase = ((currentStreamInfo.viewers - threshold) / (threshold || 1)) * 100
    const outcome = increase >= 5 ? 'yes' : 'no'
    return { outcome, reasoning: `Viewers: ${threshold} → ${currentStreamInfo.viewers} (${increase.toFixed(1)}% change)` }
  }

  if (verificationType === 'title_change') {
    // YES if stream title changed
    const changed = currentStreamInfo.title !== market.snapshotTitle
    return { outcome: changed ? 'yes' : 'no', reasoning: changed ? `Title changed to: "${currentStreamInfo.title}"` : 'Title unchanged' }
  }

  if (verificationType === 'win_event') {
    // YES if title contains win-related keywords
    const title = (currentStreamInfo.title || '').toLowerCase()
    const winKeywords = ['win', 'won', 'jackpot', 'big', 'hit', 'boom', '🎰', '💰', '🔥']
    const hasWin = winKeywords.some(k => title.includes(k))
    return { outcome: hasWin ? 'yes' : 'no', reasoning: `Stream title: "${currentStreamInfo.title}"` }
  }

  // Fallback: viewer spike of any kind
  const outcome = currentStreamInfo.viewers > threshold ? 'yes' : 'no'
  return { outcome, reasoning: `Viewers ${threshold} → ${currentStreamInfo.viewers}` }
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
    return
  }

  // Sort by viewers
  liveStreamers.sort((a, b) => (b.viewers || 0) - (a.viewers || 0))
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
