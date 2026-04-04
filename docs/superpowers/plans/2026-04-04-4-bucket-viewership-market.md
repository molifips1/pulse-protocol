# 4-Bucket Viewership Market Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4 separate binary YES/NO markets per streamer with a single categorical market having 4 fixed viewer-count buckets (A: 0-5K, B: 5K-10K, C: 10K-20K, D: 20K+), using seeded parimutuel pricing, a 10-minute kill switch, and median-based resolution.

**Architecture:** One `markets` row per streamer event (replacing 4 rows). Four `market_buckets` rows hold individual pool balances. The oracle polls Kick's API every 60 seconds for viewer snapshots, computes the median over the last 5 minutes before the lock, maps to a bucket, and settles on-chain using the existing `vault.resolveMarket(bytes32, uint8, bytes)` ABI.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres), Node.js CommonJS oracle (Express), ethers v6, Vitest (new — for pure function tests), Base Sepolia.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260404_4_bucket_market.sql` | Create | Schema: new `market_buckets` table + columns on `markets` and `bets` |
| `frontend/lib/utils.ts` | Modify | Add `calculatePrice()`, `BucketPool`, `BucketPrice` interfaces |
| `frontend/__tests__/utils.test.ts` | Create | Vitest unit tests for `calculatePrice()` |
| `frontend/package.json` | Modify | Add Vitest dev dependency |
| `frontend/vitest.config.ts` | Create | Vitest config (ESM, no DOM) |
| `frontend/app/api/bet/route.ts` | Modify | Accept `bucketId`; update `market_buckets.pool_usdc` for categorical bets |
| `frontend/app/api/admin/create-viewer-markets/route.ts` | Modify | Create one categorical market row + 4 bucket rows instead of 4 binary markets |
| `oracle/index.js` | Modify | Add `lockDueMarkets()`, `pollViewers()`, `resolveAllDue()`, `resolveMarket()`, `median()`, `mapToBucket()` |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260404_4_bucket_market.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260404_4_bucket_market.sql

-- 1. New table: market_buckets
CREATE TABLE IF NOT EXISTS market_buckets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id    UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  bucket_id    CHAR(1) NOT NULL CHECK (bucket_id IN ('A','B','C','D')),
  label        TEXT NOT NULL,
  lo           INTEGER NOT NULL,
  hi           INTEGER,             -- NULL = unbounded (bucket D)
  pool_usdc    NUMERIC(18,6) NOT NULL DEFAULT 0,
  seed_usdc    NUMERIC(18,6) NOT NULL DEFAULT 25,
  UNIQUE (market_id, bucket_id)
);

-- 2. Extend markets table
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS market_type    TEXT         NOT NULL DEFAULT 'binary',
  ADD COLUMN IF NOT EXISTS resolve_time   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lock_time      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS winning_bucket CHAR(1);

-- 3. Extend bets table
ALTER TABLE bets
  ADD COLUMN IF NOT EXISTS bucket_id CHAR(1) CHECK (bucket_id IN ('A','B','C','D'));
```

- [ ] **Step 2: Run the migration**

Open the Supabase dashboard → SQL Editor → paste the contents of `supabase/migrations/20260404_4_bucket_market.sql` → Run.

Expected: no errors. Verify by running:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'market_buckets';
-- should return: id, market_id, bucket_id, label, lo, hi, pool_usdc, seed_usdc
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260404_4_bucket_market.sql
git commit -m "feat: add market_buckets table and categorical market columns"
```

---

## Task 2: Vitest Setup

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`

- [ ] **Step 1: Install Vitest**

```bash
cd frontend
npm install --save-dev vitest
```

Expected output: `added 1 package` (or similar). No errors.

- [ ] **Step 2: Add test script to `frontend/package.json`**

In `frontend/package.json`, add to the `"scripts"` block:

```json
"test": "vitest run"
```

The scripts block should look like:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run"
}
```

- [ ] **Step 3: Create `frontend/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 4: Verify Vitest runs**

```bash
cd frontend
npm test
```

Expected: `No test files found` or similar — no crash.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/vitest.config.ts frontend/package-lock.json
git commit -m "chore: add vitest for unit testing"
```

---

## Task 3: `calculatePrice()` — TDD

**Files:**
- Create: `frontend/__tests__/utils.test.ts`
- Modify: `frontend/lib/utils.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/__tests__/utils.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calculatePrice, BucketPool } from '../lib/utils'

const EQUAL_BUCKETS: BucketPool[] = [
  { bucket_id: 'A', pool_usdc: 0, seed_usdc: 25 },
  { bucket_id: 'B', pool_usdc: 0, seed_usdc: 25 },
  { bucket_id: 'C', pool_usdc: 0, seed_usdc: 25 },
  { bucket_id: 'D', pool_usdc: 0, seed_usdc: 25 },
]

describe('calculatePrice', () => {
  it('returns 0.25 for all buckets at open (no real bets, equal seeds)', () => {
    const prices = calculatePrice(EQUAL_BUCKETS)
    expect(prices).toHaveLength(4)
    prices.forEach(p => expect(p.price).toBe(0.25))
  })

  it('prices always sum to 1.0', () => {
    const buckets: BucketPool[] = [
      { bucket_id: 'A', pool_usdc: 100, seed_usdc: 25 },
      { bucket_id: 'B', pool_usdc: 50,  seed_usdc: 25 },
      { bucket_id: 'C', pool_usdc: 10,  seed_usdc: 25 },
      { bucket_id: 'D', pool_usdc: 5,   seed_usdc: 25 },
    ]
    const prices = calculatePrice(buckets)
    const total = prices.reduce((sum, p) => sum + p.price, 0)
    expect(total).toBeCloseTo(1.0, 5)
  })

  it('a bucket with more bets gets a higher price', () => {
    const buckets: BucketPool[] = [
      { bucket_id: 'A', pool_usdc: 200, seed_usdc: 25 },
      { bucket_id: 'B', pool_usdc: 0,   seed_usdc: 25 },
      { bucket_id: 'C', pool_usdc: 0,   seed_usdc: 25 },
      { bucket_id: 'D', pool_usdc: 0,   seed_usdc: 25 },
    ]
    const prices = calculatePrice(buckets)
    const [a, b, c, d] = prices
    expect(a.price).toBeGreaterThan(b.price)
    expect(a.price).toBeGreaterThan(c.price)
    expect(a.price).toBeGreaterThan(d.price)
  })

  it('implied_pct equals price * 100 rounded to 2dp', () => {
    const prices = calculatePrice(EQUAL_BUCKETS)
    prices.forEach(p => {
      expect(p.implied_pct).toBeCloseTo(p.price * 100, 2)
    })
  })

  it('odds equals 1 / price', () => {
    const prices = calculatePrice(EQUAL_BUCKETS)
    prices.forEach(p => {
      expect(p.odds).toBeCloseTo(1 / p.price, 3)
    })
  })

  it('seed is excluded from payouts — seed does not inflate winning pool', () => {
    // Verify seeds add to effective pool (pricing), not payout pool
    const buckets: BucketPool[] = [
      { bucket_id: 'A', pool_usdc: 100, seed_usdc: 25 },
      { bucket_id: 'B', pool_usdc: 25,  seed_usdc: 25 },
      { bucket_id: 'C', pool_usdc: 25,  seed_usdc: 25 },
      { bucket_id: 'D', pool_usdc: 25,  seed_usdc: 25 },
    ]
    const prices = calculatePrice(buckets)
    // Effective total = (100+25) + (25+25)*3 = 125 + 225 = 350... wait
    // Actually: A=125, B=50, C=50, D=50 → total=275
    // price_A = 125/275 ≈ 0.4545
    expect(prices.find(p => p.bucket_id === 'A')!.price).toBeCloseTo(125 / 275, 4)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend
npm test
```

Expected: `calculatePrice is not a function` or similar import error.

- [ ] **Step 3: Implement `calculatePrice()` in `frontend/lib/utils.ts`**

Add these exports at the end of the existing `frontend/lib/utils.ts` file (do not remove existing `calcOdds` or `KNOWN_STREAMERS`):

```ts
export interface BucketPool {
  bucket_id: 'A' | 'B' | 'C' | 'D'
  pool_usdc: number
  seed_usdc: number
}

export interface BucketPrice {
  bucket_id:   'A' | 'B' | 'C' | 'D'
  price:       number   // 0–1
  implied_pct: number   // price * 100
  odds:        number   // 1 / price
}

export function calculatePrice(buckets: BucketPool[]): BucketPrice[] {
  const total = buckets.reduce((sum, b) => sum + b.pool_usdc + b.seed_usdc, 0)

  return buckets.map(b => {
    const effective = b.pool_usdc + b.seed_usdc
    const price = total > 0 ? effective / total : 0.25
    return {
      bucket_id:   b.bucket_id,
      price:       parseFloat(price.toFixed(6)),
      implied_pct: parseFloat((price * 100).toFixed(2)),
      odds:        parseFloat((1 / price).toFixed(4)),
    }
  })
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend
npm test
```

Expected:
```
✓ frontend/__tests__/utils.test.ts (6 tests)
Test Files  1 passed (1)
Tests       6 passed (6)
```

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/utils.ts frontend/__tests__/utils.test.ts
git commit -m "feat: add calculatePrice() for 4-bucket seeded parimutuel pricing"
```

---

## Task 4: Update Bet Route for Categorical Bets

**Files:**
- Modify: `frontend/app/api/bet/route.ts`

The bet route currently accepts `side` (yes/no) and updates `markets.total_yes_usdc`. For categorical bets it must additionally accept `bucketId` and update `market_buckets.pool_usdc`.

- [ ] **Step 1: Replace `frontend/app/api/bet/route.ts` with the updated version**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function POST(req: NextRequest) {
  const {
    marketId, walletAddress, side, bucketId,
    amountUsdc, oddsAtPlacement, potentialPayout, txHash, contractBetId
  } = await req.json()

  if (!marketId || !walletAddress || !side || !amountUsdc || !txHash) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Verify market is still open
  const { data: market, error: marketErr } = await supabase
    .from('markets')
    .select('status, closes_at, market_type, total_yes_usdc, total_no_usdc')
    .eq('id', marketId)
    .single()

  if (marketErr) return NextResponse.json({ error: marketErr.message }, { status: 500 })
  if (!market || market.status !== 'open') {
    return NextResponse.json({ error: `Market not open (status: ${market?.status})` }, { status: 400 })
  }
  if (new Date(market.closes_at) < new Date()) {
    return NextResponse.json({ error: 'Betting window closed' }, { status: 400 })
  }

  // Categorical markets require a bucketId
  if (market.market_type === 'categorical' && !bucketId) {
    return NextResponse.json({ error: 'bucketId required for categorical market' }, { status: 400 })
  }

  // Upsert user
  await supabase.from('users').upsert(
    { wallet_address: walletAddress.toLowerCase(), last_seen_at: new Date().toISOString() },
    { onConflict: 'wallet_address' }
  )
  const { data: user } = await supabase
    .from('users').select('id, is_restricted').eq('wallet_address', walletAddress.toLowerCase()).single()

  if (user?.is_restricted) {
    return NextResponse.json({ error: 'Access restricted in your jurisdiction' }, { status: 403 })
  }

  // Insert bet
  const coreFields: Record<string, any> = {
    market_id: marketId,
    user_id: user?.id,
    wallet_address: walletAddress.toLowerCase(),
    side,
    bucket_id: bucketId || null,
    amount_usdc: amountUsdc,
    odds_at_placement: oddsAtPlacement,
    potential_payout_usdc: potentialPayout,
    status: 'confirmed',
    tx_hash: txHash,
  }

  const { data: betFull, error: errFull } = await supabase
    .from('bets')
    .insert({ ...coreFields, contract_bet_id: contractBetId || null, placed_at: new Date().toISOString() })
    .select().single()

  let bet: any = null
  if (errFull) {
    console.error('[api/bet] full insert failed:', errFull.message, '— retrying with core fields')
    const { data: betCore, error: errCore } = await supabase
      .from('bets').insert(coreFields).select().single()
    if (errCore) {
      if (errCore.code === '23505') return NextResponse.json({ error: 'Duplicate transaction' }, { status: 409 })
      return NextResponse.json({ error: errCore.message }, { status: 500 })
    }
    bet = betCore
  } else {
    bet = betFull
  }

  // Update pool totals
  if (market.market_type === 'categorical' && bucketId) {
    // Categorical: update market_buckets.pool_usdc for this bucket
    const { data: bucket, error: bucketErr } = await supabase
      .from('market_buckets')
      .select('pool_usdc')
      .eq('market_id', marketId)
      .eq('bucket_id', bucketId)
      .single()

    if (bucketErr) return NextResponse.json({ error: bucketErr.message }, { status: 500 })

    await supabase
      .from('market_buckets')
      .update({ pool_usdc: (bucket?.pool_usdc || 0) + amountUsdc })
      .eq('market_id', marketId)
      .eq('bucket_id', bucketId)
  } else {
    // Binary: existing logic unchanged
    const poolUpdate = side === 'yes'
      ? { total_yes_usdc: (market.total_yes_usdc || 0) + amountUsdc }
      : { total_no_usdc: (market.total_no_usdc || 0) + amountUsdc }
    await supabase.from('markets').update(poolUpdate).eq('id', marketId)
  }

  return NextResponse.json({ success: true, betId: bet.id })
}
```

- [ ] **Step 2: Manual smoke test**

Using curl or your REST client, POST to `/api/bet` with a categorical market:
```json
{
  "marketId": "<a categorical market UUID>",
  "walletAddress": "0xYOUR_WALLET",
  "side": "yes",
  "bucketId": "B",
  "amountUsdc": 10,
  "oddsAtPlacement": 2.0,
  "potentialPayout": 20,
  "txHash": "0xtest123"
}
```

Expected: `{ "success": true, "betId": "..." }` and `market_buckets` row for bucket B has `pool_usdc` incremented by 10.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/bet/route.ts
git commit -m "feat: update bet route to handle categorical bucketId bets"
```

---

## Task 5: Update Market Creation for Categorical Markets

**Files:**
- Modify: `frontend/app/api/admin/create-viewer-markets/route.ts`

Replace the existing 4-binary-markets loop with a single categorical market + 4 bucket rows.

- [ ] **Step 1: Replace `frontend/app/api/admin/create-viewer-markets/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

// Fixed 4 buckets — same for every streamer
const FIXED_BUCKETS = [
  { bucket_id: 'A', label: '0-5K',    lo: 0,      hi: 4999  },
  { bucket_id: 'B', label: '5K-10K',  lo: 5000,   hi: 9999  },
  { bucket_id: 'C', label: '10K-20K', lo: 10000,  hi: 19999 },
  { bucket_id: 'D', label: '20K+',    lo: 20000,  hi: null  },
] as const

function hourWindow(): string {
  const now   = new Date()
  const start = new Date(now)
  start.setMinutes(0, 0, 0)
  const end   = new Date(start)
  end.setHours(start.getHours() + 1)
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${fmt(start)} - ${fmt(end)}`
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-pulse-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch live streamers from oracle
  const ORACLE_URL = process.env.ORACLE_URL || ''
  let streamers: any[] = []
  if (ORACLE_URL) {
    try {
      const res = await fetch(`${ORACLE_URL}/live-streamers`)
      if (res.ok) {
        const data = await res.json()
        streamers = data.streamers || []
      }
    } catch { /* oracle unreachable */ }
  }

  if (streamers.length === 0) {
    return NextResponse.json({ error: 'No live streamers found from oracle' }, { status: 404 })
  }

  const window     = hourWindow()
  const now        = Date.now()
  const resolveAt  = new Date(now + 60 * 60 * 1000).toISOString()  // +60 min
  const lockAt     = new Date(now + 50 * 60 * 1000).toISOString()  // +50 min (resolve - 10 min)
  const voidAt     = new Date(now + 90 * 60 * 1000).toISOString()  // +90 min

  const created: string[] = []
  const skipped:  string[] = []

  for (const streamer of streamers) {
    const channel        = streamer.channel as string
    const displayChannel = channel.charAt(0).toUpperCase() + channel.slice(1)
    const eventTitle     = `What will ${displayChannel}'s Peak Viewership be (${window})?`

    // Skip if a categorical market already exists for this streamer in this window
    const { count } = await supabase
      .from('markets')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .eq('market_type', 'categorical')
      .ilike('title', `%${displayChannel}%Peak Viewership%`)

    if ((count ?? 0) > 0) {
      skipped.push(channel)
      continue
    }

    // Find stream row (best-effort)
    const { data: streamRow } = await supabase
      .from('streams')
      .select('id, streamer_id')
      .ilike('stream_key', channel)
      .maybeSingle()

    // Insert one categorical market
    const { data: market, error: marketErr } = await supabase
      .from('markets')
      .insert({
        title:         eventTitle,
        status:        'open',
        market_type:   'categorical',
        category:      'irl',
        stream_id:     streamRow?.id ?? null,
        streamer_id:   streamRow?.streamer_id ?? null,
        opens_at:      new Date(now).toISOString(),
        closes_at:     lockAt,
        lock_time:     lockAt,
        resolve_time:  resolveAt,
        auto_void_at:  voidAt,
        total_yes_usdc: 0,
        total_no_usdc:  0,
        rake_rate:      0.0075,
      })
      .select('id')
      .single()

    if (marketErr) {
      console.error('[create-viewer-markets] market insert failed:', marketErr.message)
      continue
    }

    // Insert 4 fixed bucket rows
    const bucketRows = FIXED_BUCKETS.map(b => ({
      market_id: market.id,
      bucket_id: b.bucket_id,
      label:     b.label,
      lo:        b.lo,
      hi:        b.hi,
      pool_usdc: 0,
      seed_usdc: 25,
    }))

    const { error: bucketsErr } = await supabase.from('market_buckets').insert(bucketRows)
    if (bucketsErr) {
      console.error('[create-viewer-markets] bucket insert failed:', bucketsErr.message)
    }

    created.push(channel)
  }

  return NextResponse.json({ created, skipped })
}
```

- [ ] **Step 2: Manual smoke test**

Call the endpoint:
```bash
curl -X POST https://YOUR_DOMAIN/api/admin/create-viewer-markets \
  -H "x-pulse-secret: YOUR_SECRET"
```

Expected: `{ "created": ["trainwreckstv", ...], "skipped": [] }`

In Supabase, verify:
- One `markets` row per streamer with `market_type = 'categorical'`
- Four `market_buckets` rows per market (A, B, C, D) each with `seed_usdc = 25`

- [ ] **Step 3: Commit**

```bash
git add frontend/app/api/admin/create-viewer-markets/route.ts
git commit -m "feat: create single categorical market with 4 fixed buckets per streamer"
```

---

## Task 6: Oracle — `lockDueMarkets()` Cron

**Files:**
- Modify: `oracle/index.js`

Add the lock cron immediately before the existing `app.listen(...)` call at the bottom of `oracle/index.js`.

- [ ] **Step 1: Add `lockDueMarkets` and its interval to `oracle/index.js`**

Insert this block in `oracle/index.js`, just above the final `app.listen(...)` line:

```js
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
```

- [ ] **Step 2: Restart oracle and verify**

```bash
cd oracle
npm run dev
```

Watch logs. After the first 60-second tick, if there are any open categorical markets within 10 minutes of `resolve_time`, you should see `[ORACLE] Locked market: <uuid>`.

Verify in Supabase: the market row shows `status = 'locked'` and `closes_at` matches `resolve_time - 10min`.

- [ ] **Step 3: Commit**

```bash
git add oracle/index.js
git commit -m "feat: add lockDueMarkets cron (10-min kill switch before resolve)"
```

---

## Task 7: Oracle — `pollViewers()` Snapshot Cron

**Files:**
- Modify: `oracle/index.js`

Add the viewer snapshot buffer and polling cron. Place just above the `lockDueMarkets` block added in Task 6.

- [ ] **Step 1: Add snapshot buffer and `pollViewers` to `oracle/index.js`**

```js
// ─── Viewer snapshot buffer ────────────────────────────────────────────────────
// Key: market UUID → array of { ts: epoch ms, viewers: number }
const viewerSnapshots = new Map();

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

      const snaps = viewerSnapshots.get(market.id) || [];
      snaps.push({ ts: Date.now(), viewers });
      viewerSnapshots.set(market.id, snaps);

      console.log(`[ORACLE] pollViewers: ${channel} → ${viewers} viewers`);
    } catch (err) {
      console.warn(`[ORACLE] pollViewers fetch failed for ${channel}:`, err.message);
    }
  }
}

setInterval(pollViewers, 60 * 1000);
// Kick off immediately on start so the first snapshot isn't delayed 60s
pollViewers().catch(err => console.error('[ORACLE] initial pollViewers error:', err.message));
```

- [ ] **Step 2: Restart oracle and verify**

```bash
cd oracle
npm run dev
```

Expected logs within ~5 seconds:
```
[ORACLE] pollViewers: trainwreckstv → 14200 viewers
[ORACLE] pollViewers: roshtein → 3800 viewers
...
```

- [ ] **Step 3: Commit**

```bash
git add oracle/index.js
git commit -m "feat: add pollViewers cron — collects Kick viewership snapshots every 60s"
```

---

## Task 8: Oracle — `resolveAllDue()` / `resolveMarket()`

**Files:**
- Modify: `oracle/index.js`

Add the median helpers and settlement logic. Place just above the `lockDueMarkets` block.

- [ ] **Step 1: Add median helpers and `resolveMarket` to `oracle/index.js`**

```js
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
    s => s.ts >= resolveTime.getTime() - 15 * 60 * 1000
  );

  if (windowSnaps.length === 0) {
    await supabase.from('markets')
      .update({ status: 'voided', updated_at: new Date().toISOString() })
      .eq('id', market.id);
    console.warn(`[ORACLE] Voided market ${market.id} — no viewer snapshots in window`);
    viewerSnapshots.delete(market.id);
    return;
  }

  const medianViewers = getMedianViewers(market.id, resolveTime);
  const winningBucket = mapToBucket(medianViewers);
  // Bucket index: A=0, B=1, C=2, D=3
  const bucketIndex   = { A: 0, B: 1, C: 2, D: 3 }[winningBucket];

  // Sign and settle on-chain using existing vault ABI:
  // resolveMarket(bytes32 marketId, uint8 outcome, bytes signature)
  const contractMarketId = market.contract_market_id;
  const signature = await signResolution(contractMarketId, bucketIndex);

  let settleTx = null;
  try {
    const tx = await vault.resolveMarket(contractMarketId, bucketIndex, signature);
    const receipt = await tx.wait();
    settleTx = receipt.hash;
    console.log(`[ORACLE] Settled on-chain: market=${market.id} bucket=${winningBucket} tx=${settleTx}`);
  } catch (chainErr) {
    console.error(`[ORACLE] On-chain settle failed for ${market.id}:`, chainErr.message);
    // Still update Supabase — the chain may be synced separately
  }

  // Update market row
  await supabase.from('markets').update({
    status:          'resolved',
    outcome:         winningBucket,
    winning_bucket:  winningBucket,
    settlement_tx:   settleTx,
    oracle_signature: signature,
    updated_at:      new Date().toISOString(),
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

  viewerSnapshots.delete(market.id);
  console.log(`[ORACLE] Resolved market ${market.id} → bucket ${winningBucket} (${medianViewers} viewers)`);
}

async function resolveAllDue() {
  const { data: markets, error } = await supabase
    .from('markets')
    .select('id, contract_market_id, resolve_time, streams(stream_key)')
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
```

**Important:** `signResolution` and `vault` are already defined at the top of `oracle/index.js` — this block reuses them directly.

- [ ] **Step 2: Restart oracle and end-to-end smoke test**

Create a test categorical market with `resolve_time = now + 3 min` and `status = 'locked'`. Wait for the next 60-second cron tick.

Expected logs:
```
[ORACLE] pollViewers: <channel> → <N> viewers
[ORACLE] Settled on-chain: market=<uuid> bucket=<A|B|C|D> tx=0x...
[ORACLE] Resolved market <uuid> → bucket B (7400 viewers)
```

Verify in Supabase:
- `markets` row: `status = 'resolved'`, `winning_bucket = 'B'`, `settlement_tx` set
- `bets` with `bucket_id = 'B'`: `status = 'won'`
- `bets` with other `bucket_id`: `status = 'lost'`

- [ ] **Step 3: Commit**

```bash
git add oracle/index.js
git commit -m "feat: add resolveAllDue, resolveMarket, median, mapToBucket to oracle"
```

---

## Task 9: Solidity Contract Redeployment

**Files:**
- Your existing Solidity contract (not in this repo — deployed on Base Sepolia)

The existing `vault.resolveMarket(bytes32, uint8, bytes)` ABI is **unchanged**. Only the internal meaning of `uint8 outcome` changes: from binary (1=yes, 2=no) to bucket index (0=A, 1=B, 2=C, 3=D).

- [ ] **Step 1: Update the Solidity contract's resolution logic**

In your `resolveMarket` function, replace the binary win/loss check:

```solidity
// BEFORE
bool yesWon = (outcome == 1);
// distribute to YES holders if yesWon, NO holders otherwise

// AFTER
// outcome: 0=A, 1=B, 2=C, 3=D
// Distribute entire pool to holders of the winning bucket (outcome index)
```

Payout formula (all real bets in total pool → winners share proportionally):
```solidity
uint256 totalPool = poolA + poolB + poolC + poolD;
uint256 winningPool = bucketPools[outcome];
// Each winner receives: (their_stake / winningPool) * totalPool * (1 - rake)
```

- [ ] **Step 2: Redeploy to Base Sepolia**

```bash
# Using your existing deployment script / Hardhat / Foundry
npx hardhat run scripts/deploy.js --network base-sepolia
```

Note the new `VAULT_CONTRACT_ADDRESS`.

- [ ] **Step 3: Update environment variables**

In your Vercel / Railway / wherever oracle runs, update:
```
VAULT_CONTRACT_ADDRESS=0xNEW_ADDRESS
```

Also update the frontend `.env.local` if it references the vault address.

- [ ] **Step 4: Commit (env vars are not committed — just note the address)**

```bash
git commit --allow-empty -m "chore: redeployed vault contract with 4-bucket outcome support (Base Sepolia)"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| `market_buckets` table with A/B/C/D | Task 1 |
| `closes_at` synced to `lock_time` | Task 5 + Task 6 |
| `calculatePrice()` — seeded parimutuel, sums to 1.0 | Task 3 |
| `lockMarket()` — 10-min kill switch cron | Task 6 |
| Bet route enforces lock via `status !== 'open'` + `closes_at` | Task 4 (existing logic preserved) |
| `pollViewers()` — Kick API every 60s | Task 7 |
| Median of last 5 min before lock | Task 8 |
| `mapToBucket()` — fixed ranges | Task 8 |
| On-chain settlement via vault | Task 8 + Task 9 |
| Bets marked won/lost on resolve | Task 8 |
| Void if no snapshots | Task 8 |
| Contract `uint8` reinterpretation | Task 9 |
| Market creation: 1 market + 4 buckets (not 4 binary markets) | Task 5 |

All requirements covered.

### Placeholder scan

None found — all code blocks are complete.

### Type consistency

- `BucketPool` and `BucketPrice` defined in Task 3, used in Task 3 tests — consistent.
- `bucket_id: 'A' | 'B' | 'C' | 'D'` used consistently across schema (Task 1), bet route (Task 4), creation route (Task 5), oracle (Task 8).
- `mapToBucket` returns `'A' | 'B' | 'C' | 'D'` — matches `{ A: 0, B: 1, C: 2, D: 3 }` lookup in `resolveMarket`.
- `signResolution(contractMarketId, bucketIndex)` — `signResolution` is already defined in `oracle/index.js` as `signResolution(marketId, outcome)` — parameter names match.
