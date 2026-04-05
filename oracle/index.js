/**
 * PULSE PROTOCOL — Oracle Signing Service (Node.js)
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  ORACLE_PRIVATE_KEY,
  VAULT_CONTRACT_ADDRESS,
  BASE_SEPOLIA_RPC = 'https://sepolia.base.org',
  WEBHOOK_SECRET,
  PORT = 3001
} = process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
const oracleWallet = new ethers.Wallet(ORACLE_PRIVATE_KEY, provider);

const VAULT_ABI = [
  'function createMarket(bytes32 marketId, address streamer, uint256 bettingWindowSeconds) external',
  'function resolveMarket(bytes32 marketId, uint8 outcome) external',
  'function voidMarket(bytes32 marketId) external',
];

const vault = new ethers.Contract(VAULT_CONTRACT_ADDRESS, VAULT_ABI, oracleWallet);

function verifyWebhookSecret(req) {
  return req.headers['x-pulse-secret'] === WEBHOOK_SECRET;
}

function generateMarketId(streamId, eventType, timestamp) {
  return ethers.keccak256(ethers.toUtf8Bytes(`${streamId}:${eventType}:${timestamp}`));
}

async function signResolution(marketId, outcome) {
  const msgHash = ethers.solidityPackedKeccak256(['bytes32', 'uint8'], [marketId, outcome]);
  return oracleWallet.signMessage(ethers.getBytes(msgHash));
}

app.post('/webhook/event-detected', async (req, res) => {
  if (!verifyWebhookSecret(req)) return res.status(401).json({ error: 'Unauthorised' });
  // Market creation disabled — only Peak Viewership markets are created via admin endpoint
  console.warn('[ORACLE] event-detected ignored: automated market creation is disabled');
  return res.json({ success: false, reason: 'automated market creation disabled' });

  const {
    streamId, streamerId, streamerWallet, eventType, confidence,
    marketTitle, bettingWindowSeconds = 60, frameHash, rawDetection, category
  } = req.body;

  if (!streamId || !eventType || !marketTitle) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const timestamp = Date.now();
    const contractMarketId = generateMarketId(streamId, eventType, timestamp);
    const closesAt = new Date(timestamp + bettingWindowSeconds * 1000);
    const autoVoidAt = new Date(timestamp + (bettingWindowSeconds + 600) * 1000);

    let streamUUID = null;
    const { data: streamRow } = await supabase
      .from('streams').select('id').eq('stream_key', streamId).single();
    if (streamRow) {
      streamUUID = streamRow.id;
    } else {
      // Stream not synced yet — upsert it now so the market has a valid stream_id
      const { data: newStream } = await supabase
        .from('streams')
        .upsert({
          platform: 'kick',
          stream_key: streamId,
          game_category: category || 'other',
          game_title: 'Live Stream',
          is_live: true,
          viewer_count: 0,
          started_at: new Date().toISOString()
        }, { onConflict: 'stream_key' })
        .select('id').single();
      if (newStream) streamUUID = newStream.id;
    }

    const { data: market, error: dbErr } = await supabase
      .from('markets')
      .insert({
        stream_id: streamUUID,
        streamer_id: streamerId,
        title: marketTitle,
        event_type: eventType,
        category: category || 'other',
        status: 'open',
        opens_at: new Date(timestamp).toISOString(),
        closes_at: closesAt.toISOString(),
        auto_void_at: autoVoidAt.toISOString(),
        contract_market_id: contractMarketId,
        vault_address: VAULT_CONTRACT_ADDRESS,
        oracle_frame_hash: frameHash,
        oracle_confidence: confidence,
      })
      .select().single();

    if (dbErr) throw dbErr;

    await supabase.from('oracle_events').insert({
      market_id: market.id,
      stream_id: streamUUID,
      event_type: eventType,
      raw_detection: rawDetection,
      frame_hash: frameHash,
      confidence,
      triggered_by: 'ai_auto'
    });

    try {
      const tx = await vault.createMarket(
        contractMarketId,
        streamerWallet || ethers.ZeroAddress,
        bettingWindowSeconds
      );
      const receipt = await tx.wait();
      console.log(`[ORACLE] Market created: ${market.id} | tx: ${receipt.hash}`);
      res.json({ success: true, marketId: market.id, contractMarketId, tx: receipt.hash });
    } catch (chainErr) {
      console.error('[ORACLE] On-chain error (market saved to DB):', chainErr.message);
      res.json({ success: true, marketId: market.id, contractMarketId, tx: null });
    }

  } catch (err) {
    console.error('[ORACLE] Event detection error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/webhook/resolve-market', async (req, res) => {
  if (!verifyWebhookSecret(req)) return res.status(401).json({ error: 'Unauthorised' });

  const { contractMarketId, supabaseMarketId, outcome, confidence, frameHash } = req.body;
  if (!contractMarketId || !supabaseMarketId || !outcome) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const outcomeEnum = outcome === 'yes' ? 1 : 2;

  try {
    const signature = await signResolution(contractMarketId, outcomeEnum);
    const tx = await vault.resolveMarket(contractMarketId, outcomeEnum, signature);
    const receipt = await tx.wait();

    await supabase.from('markets').update({
      status: 'resolved',
      outcome,
      oracle_signature: signature,
      oracle_frame_hash: frameHash,
      oracle_confidence: confidence,
      settlement_tx: receipt.hash,
      updated_at: new Date().toISOString()
    }).eq('id', supabaseMarketId);

    await supabase.from('bets')
      .update({ status: 'won', settled_at: new Date().toISOString() })
      .eq('market_id', supabaseMarketId).eq('side', outcome).eq('status', 'confirmed');

    await supabase.from('bets')
      .update({ status: 'lost', settled_at: new Date().toISOString() })
      .eq('market_id', supabaseMarketId).neq('side', outcome).eq('status', 'confirmed');

    console.log(`[ORACLE] Market resolved: ${supabaseMarketId} to ${outcome} | tx: ${receipt.hash}`);
    res.json({ success: true, outcome, tx: receipt.hash, signature });
  } catch (err) {
    console.error('[ORACLE] Resolve error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/webhook/sync-streams', async (req, res) => {
  if (!verifyWebhookSecret(req)) return res.status(401).json({ error: 'Unauthorised' });

  const { streams } = req.body;
  if (!streams || !Array.isArray(streams)) {
    return res.status(400).json({ error: 'Missing streams array' });
  }

  try {
    await supabase.from('streams')
      .update({ is_live: false })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    for (const stream of streams) {
      const cat = stream.category || '';
      let gameCategory = 'other';
      if (['valorant', 'counter-strike', 'apex', 'overwatch', 'call-of-duty'].some(g => cat.includes(g))) {
        gameCategory = 'fps';
      } else if (['fifa', 'ea-sports', 'nba-2k', 'rocket-league', 'madden'].some(g => cat.includes(g))) {
        gameCategory = 'sports';
      } else if (['just-chatting', 'irl', 'talk'].some(g => cat.includes(g))) {
        gameCategory = 'irl';
      }

      await supabase.from('streams').upsert({
        platform: 'kick',
        stream_key: stream.channel,
        game_category: gameCategory,
        game_title: stream.title || stream.category_name || 'Live Stream',
        is_live: true,
        viewer_count: stream.viewers || 0,
        started_at: new Date().toISOString()
      }, { onConflict: 'stream_key' });
    }

    console.log(`[ORACLE] Synced ${streams.length} live streams`);
    res.json({ success: true, synced: streams.length });
  } catch (err) {
    console.error('[ORACLE] Stream sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cache of live streamers updated by detector
let liveStreamersCache = [];
app.post('/webhook/live-streamers-update', (req, res) => {
  if (!verifyWebhookSecret(req)) return res.status(401).json({ error: 'Unauthorised' });
  liveStreamersCache = req.body.streamers || [];
  res.json({ success: true });
});
app.get('/live-streamers', (req, res) => {
  res.json({ streamers: liveStreamersCache });
});

setInterval(async () => {
  const { data: expiredMarkets } = await supabase
    .from('markets')
    .select('id, contract_market_id')
    .in('status', ['open', 'locked'])
    .lt('auto_void_at', new Date().toISOString());

  for (const market of (expiredMarkets || [])) {
    try {
      const tx = await vault.voidMarket(market.contract_market_id);
      await tx.wait();
      await supabase.from('markets')
        .update({ status: 'voided', updated_at: new Date().toISOString() })
        .eq('id', market.id);
      console.log(`[ORACLE] Auto-voided market: ${market.id}`);
    } catch (err) {
      console.error(`[ORACLE] Failed to void ${market.id}:`, err.message);
    }
  }
}, 2 * 60 * 1000);

// ─── Viewer snapshot buffer ────────────────────────────────────────────────────
// Key: market UUID → array of { ts: epoch ms, viewers: number }
// In-memory map is the working set; Supabase viewer_snapshots is the durable store.
const viewerSnapshots = new Map();

// Load existing snapshots from Supabase on startup so resolution survives restarts
async function loadSnapshots() {
  const { data, error } = await supabase
    .from('viewer_snapshots')
    .select('market_id, ts, viewers')
    .order('ts', { ascending: true });
  if (error) { console.error('[ORACLE] loadSnapshots error:', error.message); return; }
  for (const row of (data || [])) {
    const snaps = viewerSnapshots.get(row.market_id) || [];
    snaps.push({ ts: row.ts, viewers: row.viewers });
    viewerSnapshots.set(row.market_id, snaps);
  }
  console.log(`[ORACLE] Loaded ${data?.length || 0} viewer snapshots from DB`);
}

async function pollViewers() {
  const { data: markets, error } = await supabase
    .from('markets')
    .select('id, stream_id, streams(stream_key), resolve_time')
    .in('status', ['open', 'locked'])
    .eq('market_type', 'categorical');

  if (error) {
    console.error('[ORACLE] pollViewers query error:', error.message);
    return;
  }

  for (const market of (markets || [])) {
    const channel = market.streams?.stream_key;
    if (!channel) continue;

    try {
      const res = await fetch(`https://kick.com/api/v2/channels/${channel}`);
      if (!res.ok) continue;
      const data = await res.json();
      const viewers = data?.livestream?.viewer_count ?? 0;
      const ts = Date.now();

      const snaps = viewerSnapshots.get(market.id) || [];
      snaps.push({ ts, viewers });
      viewerSnapshots.set(market.id, snaps);

      // Persist to Supabase so snapshots survive oracle restarts
      await supabase.from('viewer_snapshots').insert({ market_id: market.id, ts, viewers });

      console.log(`[ORACLE] pollViewers: ${channel} → ${viewers} viewers`);
    } catch (err) {
      console.warn(`[ORACLE] pollViewers fetch failed for ${channel}:`, err.message);
    }
  }
}

setInterval(pollViewers, 60 * 1000);
// Load persisted snapshots first, then kick off polling immediately
loadSnapshots()
  .then(() => pollViewers())
  .catch(err => console.error('[ORACLE] initial pollViewers error:', err.message));

// ─── Lock categorical markets 10 min before resolve_time ──────────────────────

async function lockDueMarkets() {
  const lockCutoff = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { data: markets, error } = await supabase
    .from('markets')
    .select('id, resolve_time')
    .eq('status', 'open')
    .eq('market_type', 'categorical')
    .lte('resolve_time', lockCutoff);

  if (error) {
    console.error('[ORACLE] lockDueMarkets error:', error.message);
    return;
  }

  for (const market of (markets || [])) {
    const lockTime = new Date(
      new Date(market.resolve_time).getTime() - 10 * 60 * 1000
    ).toISOString();

    const { error: updateErr } = await supabase
      .from('markets')
      .update({ status: 'locked', lock_time: lockTime, closes_at: lockTime })
      .eq('id', market.id)
      .eq('status', 'open');    // guard: skip if already locked

    if (!updateErr) {
      console.log(`[ORACLE] Locked market: ${market.id}`);
    } else {
      console.error(`[ORACLE] Failed to lock market ${market.id}:`, updateErr.message);
    }
  }
}

setInterval(lockDueMarkets, 60 * 1000);

// ─── Median helpers ───────────────────────────────────────────────────────────

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function getMedianViewers(marketId, resolveTime) {
  const windowStart = resolveTime.getTime() - 15 * 60 * 1000;  // 15 min before resolve
  const windowEnd   = resolveTime.getTime() - 10 * 60 * 1000;  // 10 min before resolve
  const values = (viewerSnapshots.get(marketId) || [])
    .filter(s => s.ts >= windowStart && s.ts <= windowEnd)
    .map(s => s.viewers);
  return median(values);
}

function mapToBucket(viewers) {
  if (viewers <  5000)  return 'A';
  if (viewers < 10000)  return 'B';
  if (viewers < 20000)  return 'C';
  return 'D';
}

// ─── Resolve categorical markets ──────────────────────────────────────────────

async function resolveMarket(market) {
  const resolveTime = new Date(market.resolve_time);

  // Void if no snapshots were collected in the 15-min window before resolve
  const allSnaps = viewerSnapshots.get(market.id) || [];
  const windowSnaps = allSnaps.filter(
    s => s.ts >= resolveTime.getTime() - 15 * 60 * 1000 &&
         s.ts <= resolveTime.getTime() - 10 * 60 * 1000
  );

  if (windowSnaps.length === 0) {
    try {
      const voidTx = await vault.voidMarket(market.contract_market_id);
      await voidTx.wait();
    } catch (voidErr) {
      console.error(`[ORACLE] vault.voidMarket failed for ${market.id}:`, voidErr.message);
    }
    await supabase.from('markets')
      .update({ status: 'voided', updated_at: new Date().toISOString() })
      .eq('id', market.id);
    await supabase.from('viewer_snapshots').delete().eq('market_id', market.id);
    console.warn(`[ORACLE] Voided market ${market.id} — no viewer snapshots in window`);
    viewerSnapshots.delete(market.id);
    return;
  }

  const medianViewers = getMedianViewers(market.id, resolveTime);
  const winningBucket = mapToBucket(medianViewers);
  // Bucket index: A=0, B=1, C=2, D=3
  const bucketIndex   = { A: 0, B: 1, C: 2, D: 3 }[winningBucket];

  // Settle on-chain: resolveMarket(bytes32 marketId, uint8 outcome)
  const contractMarketId = market.contract_market_id;
  if (!contractMarketId) {
    console.error(`[ORACLE] market ${market.id} has no contract_market_id — skipping resolve`);
    return;
  }

  let settleTx = null;
  try {
    const tx = await vault.resolveMarket(contractMarketId, bucketIndex);
    const receipt = await tx.wait();
    settleTx = receipt.hash;
    console.log(`[ORACLE] Settled on-chain: market=${market.id} bucket=${winningBucket} tx=${settleTx}`);
  } catch (chainErr) {
    console.error(`[ORACLE] On-chain settle failed for ${market.id}:`, chainErr.message);
  }

  if (settleTx === null) {
    // Chain settlement failed — leave market as 'locked' so the next cron tick retries
    console.error(`[ORACLE] Skipping Supabase update for ${market.id} — on-chain settle failed`);
    return;
  }

  // Update market row
  await supabase.from('markets').update({
    status:         'resolved',
    outcome:        winningBucket,
    winning_bucket: winningBucket,
    settlement_tx:  settleTx,
    updated_at:     new Date().toISOString(),
  }).eq('id', market.id);

  // Mark winning bets
  await supabase.from('bets')
    .update({ status: 'won', settled_at: new Date().toISOString() })
    .eq('market_id', market.id)
    .eq('bucket_id', winningBucket)
    .eq('status', 'confirmed');

  // Mark losing bets
  await supabase.from('bets')
    .update({ status: 'lost', settled_at: new Date().toISOString() })
    .neq('bucket_id', winningBucket)
    .eq('market_id', market.id)
    .eq('status', 'confirmed');

  // Clean up persisted snapshots
  await supabase.from('viewer_snapshots').delete().eq('market_id', market.id);
  viewerSnapshots.delete(market.id);
  console.log(`[ORACLE] Resolved market ${market.id} → bucket ${winningBucket} (${medianViewers} viewers)`);
}

async function resolveAllDue() {
  const { data: markets, error } = await supabase
    .from('markets')
    .select('id, contract_market_id, resolve_time')
    .eq('status', 'locked')
    .eq('market_type', 'categorical')
    .lte('resolve_time', new Date().toISOString());

  if (error) {
    console.error('[ORACLE] resolveAllDue query error:', error.message);
    return;
  }

  for (const market of (markets || [])) {
    try {
      await resolveMarket(market);
    } catch (err) {
      console.error(`[ORACLE] resolveMarket failed for ${market.id}:`, err.message);
    }
  }
}

setInterval(resolveAllDue, 60 * 1000);

// ─── Live streamer sync ───────────────────────────────────────────────────────
// Polls Kick for the hardcoded streamer list, updates streams table in Supabase,
// and triggers create-viewer-markets for any newly-live streamers.

const TRACKED_STREAMERS = [
  'trainwreckstv', 'roshtein', 'classybeef', 'xposed', 'mellstroy987',
  'sweetflips', 'cheesur', 'syztmz', 'vysotzky', 'elzeein', 'taour',
  'plinkoplayerca', 'glowis888', 'sloxol', 'dajmaxdajmax',
  'ladyluckslots', 'mascoobs', 'cousik', 'tck', 'shurzggg', 'haddzy', 'snikwins', 'gtasty',
  'rakkispider', 'gamegladiatorgg', 'baldybronson',
  'hunterowner', 'lvsteppers', 'splyfe_sv', 'umbrab0i', 'real_bazzi', '666dope', 'stripnclub',
  'zeroedg3', 'torontovvs', 'dzhordik', 'strikeeth', 'art_depo', 'scurrows', 'kyrexx21', 'k3ltz',
  'viktoria_sun', 'robertolovely', 'rombears', 'zpaic0', 'renzrzkzbhsfw', 'jo1nder', 'moratiar',
  'skinnyoungster', 'sparta4elo', 'hutonis4', 'striker6x6', 'opmbaby_', 'tobbianoq', 'playermaketv',
  'disthydbeast', 'slowl33', 'moneyneedoff', 'voryndor', 'ketlerrr52', 'misterjack1995', 'goert08', 'hoodden',
  'hstikkytokky', 'cuffem', 'shnaggyhose', 'danludan2311', 'artemgraph', 'thedoctor', 'generalqw77',
];

const FRONTEND_URL = process.env.FRONTEND_URL || '';

const KICK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://kick.com',
  'Origin': 'https://kick.com',
};

async function checkChannelV1(channel) {
  try {
    const res = await fetch(`https://kick.com/api/v1/channels/${channel}`, { headers: KICK_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    const stream = data.livestream;
    if (!stream) return null;
    return {
      channel,
      viewers: stream.viewer_count || 0,
      category: data.recent_categories?.[0]?.slug || 'irl',
      title: stream.session_title || 'Live Stream',
    };
  } catch { return null; }
}

async function syncLiveStreamers() {
  const liveChannels = [];
  let kickApiResponded = false;

  // Try v2 batch first
  let v2ok = false;
  for (let i = 0; i < TRACKED_STREAMERS.length; i += 25) {
    const batch = TRACKED_STREAMERS.slice(i, i + 25);
    const query = batch.map(c => `channels[]=${encodeURIComponent(c)}`).join('&');
    try {
      const res = await fetch(`https://kick.com/api/v2/channels?${query}`, { headers: KICK_HEADERS });
      if (!res.ok) {
        console.warn(`[ORACLE] Kick v2 batch ${res.status} — will use v1 fallback`);
        break;
      }
      v2ok = true;
      kickApiResponded = true;
      const raw = await res.json();
      const items = Array.isArray(raw) ? raw : (raw.data ?? []);
      for (const ch of items) {
        const stream = ch.current_livestream || ch.livestream;
        if ((ch.is_live || !!stream) && stream) {
          liveChannels.push({
            channel: ch.slug,
            viewers: ch.viewer_count || stream.viewer_count || 0,
            category: stream.categories?.[0]?.slug || 'irl',
            title: stream.session_title || 'Live Stream',
          });
        }
      }
    } catch (err) {
      console.error(`[ORACLE] v2 batch error:`, err.message);
      break;
    }
    if (i + 25 < TRACKED_STREAMERS.length) await new Promise(r => setTimeout(r, 1500));
  }

  // Fall back to v1 individual checks if v2 failed
  if (!v2ok) {
    console.log(`[ORACLE] Falling back to v1 API for ${TRACKED_STREAMERS.length} channels`);
    for (const channel of TRACKED_STREAMERS) {
      const result = await checkChannelV1(channel);
      if (result !== null) kickApiResponded = true;
      if (result) liveChannels.push(result);
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // Only wipe is_live if Kick API responded (don't wipe manually-set live streamers on API failure)
  if (kickApiResponded) {
    await supabase.from('streams')
      .update({ is_live: false })
      .in('stream_key', TRACKED_STREAMERS);
  } else {
    console.log('[ORACLE] Kick API unreachable — preserving existing is_live values');
  }

  for (const s of liveChannels) {
    await supabase.from('streams').upsert({
      platform: 'kick',
      stream_key: s.channel,
      is_live: true,
      viewer_count: s.viewers,
      game_category: s.category,
      game_title: s.title,
      started_at: new Date().toISOString(),
    }, { onConflict: 'stream_key' });
  }

  liveStreamersCache = liveChannels.map(s => ({ channel: s.channel, viewers: s.viewers }));
  console.log(`[ORACLE] Live streamers: ${liveChannels.length} — ${liveChannels.map(s => s.channel).join(', ') || 'none'}`);

  // Trigger market creation if there are live streamers and a frontend URL is configured
  if (liveChannels.length > 0 && FRONTEND_URL && WEBHOOK_SECRET) {
    try {
      const r = await fetch(`${FRONTEND_URL}/api/admin/create-viewer-markets`, {
        method: 'POST',
        headers: { 'x-pulse-secret': WEBHOOK_SECRET },
      });
      const body = await r.json();
      if (body.created?.length > 0) {
        console.log(`[ORACLE] Markets created: ${body.created.join(', ')}`);
      }
    } catch (err) {
      console.error('[ORACLE] create-viewer-markets trigger failed:', err.message);
    }
  }
}

setInterval(syncLiveStreamers, 60 * 1000);
// Run immediately on start
syncLiveStreamers().catch(err => console.error('[ORACLE] initial syncLiveStreamers error:', err.message));

// ─── Dev: register market on-chain without auth ────────────────────────────────
app.post('/dev/register-market', async (req, res) => {
  const { supabaseMarketId, streamId = 'roshtein', bettingWindowSeconds = 7200 } = req.body;
  if (!supabaseMarketId) return res.status(400).json({ error: 'Missing supabaseMarketId' });
  const contractMarketId = ethers.keccak256(ethers.toUtf8Bytes(`${streamId}:categorical:${Date.now()}`));
  try {
    const tx = await vault.createMarket(contractMarketId, ethers.ZeroAddress, bettingWindowSeconds);
    const receipt = await tx.wait();
    await supabase.from('markets').update({ contract_market_id: contractMarketId }).eq('id', supabaseMarketId);
    res.json({ success: true, contractMarketId, tx: receipt.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Create categorical market on-chain ───────────────────────────────────────

app.post('/webhook/create-categorical-market', async (req, res) => {
  if (!verifyWebhookSecret(req)) return res.status(401).json({ error: 'Unauthorised' });

  const { supabaseMarketId, streamId, bettingWindowSeconds = 3000 } = req.body;
  if (!supabaseMarketId || !streamId) {
    return res.status(400).json({ error: 'Missing supabaseMarketId or streamId' });
  }

  const timestamp = Date.now();
  const contractMarketId = ethers.keccak256(
    ethers.toUtf8Bytes(`${streamId}:categorical:${timestamp}`)
  );

  try {
    const tx = await vault.createMarket(
      contractMarketId,
      ethers.ZeroAddress,
      bettingWindowSeconds
    );
    const receipt = await tx.wait();

    await supabase.from('markets')
      .update({ contract_market_id: contractMarketId })
      .eq('id', supabaseMarketId);

    console.log(`[ORACLE] Categorical market created on-chain: ${supabaseMarketId} | tx: ${receipt.hash}`);
    res.json({ success: true, contractMarketId, tx: receipt.hash });
  } catch (err) {
    console.error('[ORACLE] create-categorical-market failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Mint MockUSDC (dev/test only) ────────────────────────────────────────────
app.post('/webhook/mint-usdc', async (req, res) => {
  if (!verifyWebhookSecret(req)) return res.status(401).json({ error: 'Unauthorised' });
  const { to, amount = '1000000000' } = req.body; // default 1000 USDC (6 decimals)
  if (!to) return res.status(400).json({ error: 'Missing to address' });
  try {
    const usdcAddress = process.env.USDC_ADDRESS;
    if (!usdcAddress) return res.status(500).json({ error: 'USDC_ADDRESS not set' });
    const usdc = new ethers.Contract(usdcAddress, [
      'function mint(address to, uint256 amount) external',
    ], oracleWallet);
    const tx = await usdc.mint(to, BigInt(amount));
    await tx.wait();
    res.json({ success: true, to, amount, tx: tx.hash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[ORACLE] Pulse Oracle running on :${PORT}`);
  console.log(`[ORACLE] Signer: ${oracleWallet.address}`);
  console.log(`[ORACLE] Vault: ${VAULT_CONTRACT_ADDRESS}`);
});