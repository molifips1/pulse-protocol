/**
 * Pulse Protocol — Oracle Service
 * ================================
 * Receives signed webhooks from the detection service,
 * creates on-chain markets via MarketFactory, and settles them.
 *
 * Environment variables required:
 *   ORACLE_PRIVATE_KEY       — operator wallet PK (signs txs)
 *   BASE_TESTNET_RPC         — Base Sepolia RPC URL
 *   MARKET_FACTORY_ADDRESS   — deployed MarketFactory address
 *   SUPABASE_URL             — Supabase project URL
 *   SUPABASE_SERVICE_KEY     — Supabase service role key
 *   WEBHOOK_SECRET           — shared secret with detection service
 *   PORT                     — HTTP server port (default 3001)
 */

import Fastify from "fastify";
import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { ethers } from "ethers";

// ─── ABIs (minimal) ───────────────────────────────────────────────────────────

const FACTORY_ABI = [
  "function createMarket(string streamId, string question, string category, uint256 durationSeconds, uint256 settleWindowSeconds, address streamerWallet) returns (uint256)",
  "function settleMarket(uint256 marketId, bool yesWon) external",
  "function voidExpiredMarket(uint256 marketId) external",
  "event MarketCreated(uint256 indexed id, string streamId, string question, uint256 closeTime)",
];

// ─── Init ─────────────────────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(process.env.BASE_TESTNET_RPC);
const wallet   = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY, provider);
const factory  = new ethers.Contract(process.env.MARKET_FACTORY_ADDRESS, FACTORY_ABI, wallet);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
);

const app = Fastify({ logger: true });

// ─── Signature verification ───────────────────────────────────────────────────

function verifySignature(rawBody: Buffer, sig: string): boolean {
  const expected = createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleMarketCreate(data: any) {
  app.log.info("Creating market for stream %s", data.stream_id);

  // Enforce max 4 open markets per streamer
  const { count } = await supabase
    .from("markets")
    .select("id", { count: "exact", head: true })
    .eq("stream_id", data.stream_id)
    .eq("status", "open");

  if ((count ?? 0) >= 4) {
    app.log.warn("Skipping market create for %s — already at 4 open markets", data.stream_id);
    return;
  }

  // Write pending market to Supabase first (UI shows it immediately)
  const { data: row, error } = await supabase
    .from("markets")
    .insert({
      stream_id:       data.stream_id,
      question:        data.question,
      category:        data.category,
      status:          "pending_chain",
      yes_pool:        0,
      no_pool:         0,
      confidence:      data.confidence,
      proof_frame_url: null, // store frame separately if needed
    })
    .select()
    .single();

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);

  // Submit on-chain
  try {
    const tx = await factory.createMarket(
      data.stream_id,
      data.question,
      data.category,
      data.duration_sec,
      data.settle_window,
      data.streamer_wallet,
    );
    const receipt = await tx.wait(1);

    // Parse MarketCreated event to get on-chain ID
    const event = receipt.logs
      .map((l: any) => { try { return factory.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === "MarketCreated");

    const onChainId = event?.args?.id?.toString();

    await supabase
      .from("markets")
      .update({ status: "open", on_chain_id: onChainId, tx_hash: receipt.hash })
      .eq("id", row.id);

    app.log.info("Market created on-chain: id=%s tx=%s", onChainId, receipt.hash);
  } catch (err: any) {
    app.log.error("Chain tx failed: %s", err.message);
    await supabase.from("markets").update({ status: "failed" }).eq("id", row.id);
    throw err;
  }
}

async function handleMarketSettle(data: any) {
  app.log.info("Settling market %s yesWon=%s", data.market_id, data.yes_won);

  // Look up Supabase market by stream-local ID
  const { data: market } = await supabase
    .from("markets")
    .select("*")
    .eq("stream_market_id", data.market_id)
    .single();

  if (!market?.on_chain_id) {
    app.log.warn("Market not found or not yet on-chain: %s", data.market_id);
    return;
  }

  const tx = await factory.settleMarket(market.on_chain_id, data.yes_won);
  const receipt = await tx.wait(1);

  await supabase
    .from("markets")
    .update({
      status:    data.yes_won ? "settled_yes" : "settled_no",
      settle_tx: receipt.hash,
      settled_at: new Date().toISOString(),
    })
    .eq("id", market.id);

  app.log.info("Market settled: on_chain_id=%s tx=%s", market.on_chain_id, receipt.hash);
}

async function handleMarketVoid(data: any) {
  app.log.info("Voiding market %s", data.market_id);

  const { data: market } = await supabase
    .from("markets")
    .select("*")
    .eq("stream_market_id", data.market_id)
    .single();

  if (!market?.on_chain_id) return;

  try {
    const tx = await factory.voidExpiredMarket(market.on_chain_id);
    await tx.wait(1);
    await supabase.from("markets").update({ status: "voided" }).eq("id", market.id);
  } catch (err: any) {
    app.log.error("Void tx failed: %s", err.message);
  }
}

// ─── Webhook endpoint ─────────────────────────────────────────────────────────

app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
  done(null, body);
});

app.post("/webhook", async (req, reply) => {
  const sig = req.headers["x-pulse-signature"] as string;
  const rawBody = req.body as Buffer;

  if (!sig || !verifySignature(rawBody, sig)) {
    return reply.status(401).send({ error: "Invalid signature" });
  }

  const { type, data } = JSON.parse(rawBody.toString());

  try {
    switch (type) {
      case "market_create":  await handleMarketCreate(data); break;
      case "market_settle":  await handleMarketSettle(data); break;
      case "market_void":    await handleMarketVoid(data);   break;
      default:
        app.log.warn("Unknown webhook type: %s", type);
    }
    return reply.send({ ok: true });
  } catch (err: any) {
    app.log.error("Webhook handler error: %s", err.message);
    return reply.status(500).send({ error: err.message });
  }
});

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/health", async () => ({ ok: true, ts: Date.now() }));

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen({ port: Number(process.env.PORT ?? 3001), host: "0.0.0.0" }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
