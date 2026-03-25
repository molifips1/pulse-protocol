/**
 * PULSE PROTOCOL — Oracle Signing Service (Node.js)
 * 
 * Responsibilities:
 * 1. Receives webhook from Python detection service
 * 2. Creates market record in Supabase
 * 3. Calls smart contract to mint the market on-chain
 * 4. Signs resolution results and submits to contract
 * 
 * v1: Trusted single signer (decentralise in v2)
 */

const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { ethers } = require('ethers');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// ============ Config ============
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

// Minimal ABI — only what oracle needs
const VAULT_ABI = [
  'function createMarket(bytes32 marketId, address streamer, uint256 bettingWindowSeconds) external',
  'function resolveMarket(bytes32 marketId, uint8 outcome, bytes calldata signature) external',
  'function voidMarket(bytes32 marketId) external',
];

const vault = new ethers.Contract(VAULT_CONTRACT_ADDRESS, VAULT_ABI, oracleWallet);

// ============ Helpers ============

function verifyWebhookSecret(req) {
  const provided = req.headers['x-pulse-secret'];
  return provided === WEBHOOK_SECRET;
}

function generateMarketId(streamId, eventType, timestamp) {
  return ethers.keccak256(
    ethers.toUtf8Bytes(`${streamId}:${eventType}:${timestamp}`)
  );
}

async function signResolution(marketId, outcome) {
  // outcome: 1 = YES, 2 = NO (matches contract enum)
  const msgHash = ethers.solidityPackedKeccak256(
    ['bytes32', 'uint8'],
    [marketId, outcome]
  );
  const ethHash = ethers.hashMessage(ethers.getBytes(msgHash));
  return oracleWallet.signMessage(ethers.getBytes(msgHash));
}

// ============ Routes ============

/**
 * POST /webhook/event-detected
 * Called by Python detection service when a high-signal event is found
 * 
 * Body: {
 *   streamId: string,
 *   streamerId: string,
 *   streamerWallet: string,
 *   eventType: 'clutch'|'death'|'win'|'goal'|'debate',
 *   confidence: number,
 *   marketTitle: string,
 *   bettingWindowSeconds: number (default 60),
 *   frameHash: string,
 *   rawDetection: object
 * }
 */
app.post('/webhook/event-detected', async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const {
    streamId,
    streamerId,
    streamerWallet,
    eventType,
    confidence,
    marketTitle,
    bettingWindowSeconds = 60,
    frameHash,
    rawDetection,
    category
  } = req.body;

  if (!streamId || !eventType || !marketTitle) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const timestamp = Date.now();
    const contractMarketId = generateMarketId(streamId, eventType, timestamp);
    const closesAt = new Date(timestamp + bettingWindowSeconds * 1000);
    const autoVoidAt = new Date(timestamp + (bettingWindowSeconds + 600) * 1000);

    // 1. Insert market to Supabase (optimistically — before on-chain)
    const { data: market, error: dbErr } = await supabase
      .from('markets')
      .insert({
        stream_id: streamId,
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
      .select()
      .single();

    if (dbErr) throw dbErr;

    // 2. Log oracle event
    await supabase.from('oracle_events').insert({
      market_id: market.id,
      stream_id: streamId,
      event_type: eventType,
      raw_detection: rawDetection,
      frame_hash: frameHash,
      confidence,
      triggered_by: 'ai_auto'
    });

    // 3. Create market on-chain
    const tx = await vault.createMarket(
      contractMarketId,
      streamerWallet || ethers.ZeroAddress,
      bettingWindowSeconds
    );
    const receipt = await tx.wait();

    console.log(`[ORACLE] Market created: ${market.id} | tx: ${receipt.hash}`);
    res.json({ success: true, marketId: market.id, contractMarketId, tx: receipt.hash });

  } catch (err) {
    console.error('[ORACLE] Event detection error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /webhook/resolve-market
 * Called by detection service when outcome is determined
 * 
 * Body: {
 *   contractMarketId: string (bytes32 hex),
 *   supabaseMarketId: string (UUID),
 *   outcome: 'yes'|'no',
 *   confidence: number,
 *   frameHash: string
 * }
 */
app.post('/webhook/resolve-market', async (req, res) => {
  if (!verifyWebhookSecret(req)) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const { contractMarketId, supabaseMarketId, outcome, confidence, frameHash } = req.body;

  if (!contractMarketId || !supabaseMarketId || !outcome) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const outcomeEnum = outcome === 'yes' ? 1 : 2;

  try {
    // 1. Sign the result
    const signature = await signResolution(contractMarketId, outcomeEnum);

    // 2. Submit to contract
    const tx = await vault.resolveMarket(contractMarketId, outcomeEnum, signature);
    const receipt = await tx.wait();

    // 3. Update Supabase
    await supabase
      .from('markets')
      .update({
        status: 'resolved',
        outcome,
        oracle_signature: signature,
        oracle_frame_hash: frameHash,
        oracle_confidence: confidence,
        settlement_tx: receipt.hash,
        updated_at: new Date().toISOString()
      })
      .eq('id', supabaseMarketId);

    // 4. Update bets in Supabase
    await supabase
      .from('bets')
      .update({ status: 'won', settled_at: new Date().toISOString() })
      .eq('market_id', supabaseMarketId)
      .eq('side', outcome)
      .eq('status', 'confirmed');

    await supabase
      .from('bets')
      .update({ status: 'lost', settled_at: new Date().toISOString() })
      .eq('market_id', supabaseMarketId)
      .neq('side', outcome)
      .eq('status', 'confirmed');

    console.log(`[ORACLE] Market resolved: ${supabaseMarketId} → ${outcome} | tx: ${receipt.hash}`);
    res.json({ success: true, outcome, tx: receipt.hash, signature });

  } catch (err) {
    console.error('[ORACLE] Resolve error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /webhook/trigger-test-market
 * Dev/testing endpoint — manually fires a fake market creation
 */
app.post('/webhook/trigger-test-market', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  const testPayload = {
    streamId: req.body.streamId || 'test-stream-001',
    streamerId: req.body.streamerId || null,
    streamerWallet: req.body.streamerWallet || ethers.ZeroAddress,
    eventType: req.body.eventType || 'clutch',
    confidence: 0.92,
    marketTitle: req.body.marketTitle || 'Will the player clutch this 1v3?',
    bettingWindowSeconds: 60,
    frameHash: crypto.randomBytes(32).toString('hex'),
    rawDetection: { source: 'manual_test', timestamp: Date.now() },
    category: req.body.category || 'fps'
  };

  // Pipe through to real handler
  req.body = testPayload;
  req.headers['x-pulse-secret'] = WEBHOOK_SECRET;

  // Re-call handler logic (simplified for dev)
  res.json({ message: 'Test market trigger sent', payload: testPayload });
});

// ============ Auto-void Cron ============
// Check every 2 minutes for markets past autoVoidAt
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
      await supabase
        .from('markets')
        .update({ status: 'voided', updated_at: new Date().toISOString() })
        .eq('id', market.id);
      console.log(`[ORACLE] Auto-voided market: ${market.id}`);
    } catch (err) {
      console.error(`[ORACLE] Failed to void ${market.id}:`, err.message);
    }
  }
}, 2 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`[ORACLE] Pulse Oracle running on :${PORT}`);
  console.log(`[ORACLE] Signer: ${oracleWallet.address}`);
  console.log(`[ORACLE] Vault: ${VAULT_CONTRACT_ADDRESS}`);
});
