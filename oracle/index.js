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
  'function resolveMarket(bytes32 marketId, uint8 outcome, bytes calldata signature) external',
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
    }
  }
}

setInterval(lockDueMarkets, 60 * 1000);

app.listen(PORT, () => {
  console.log(`[ORACLE] Pulse Oracle running on :${PORT}`);
  console.log(`[ORACLE] Signer: ${oracleWallet.address}`);
  console.log(`[ORACLE] Vault: ${VAULT_CONTRACT_ADDRESS}`);
});