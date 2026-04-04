# 4-Bucket Viewership Market — Design Spec

**Date:** 2026-04-04
**Project:** pulse-control
**Status:** Approved

---

## Overview

Adapt the existing binary (YES/NO) prediction market into a single categorical market with 4 mutually exclusive viewer-count buckets for Kick.com streamers. A user buys YES shares on exactly one bucket. The bucket whose range contains the median peak viewership wins; all others lose.

**Fixed buckets (all streamers):**

| ID | Label    | Range          |
|----|----------|----------------|
| A  | 0-5K     | 0 – 4,999      |
| B  | 5K-10K   | 5,000 – 9,999  |
| C  | 10K-20K  | 10,000 – 19,999|
| D  | 20K+     | 20,000+        |

---

## Architecture

- **Pricing model:** Seeded parimutuel. Each bucket is seeded with 25 virtual USDC at creation (100 total). Prices are `(pool_usdc + seed_usdc) / total_effective_pool`. Prices always sum to 1.0. Seeds are excluded from payouts.
- **On-chain settlement:** One `factory.createMarket()` per categorical market. Settlement calls `factory.settleMarket(marketId, uint8 winningBucket)` where 0=A, 1=B, 2=C, 3=D.
- **Viewership data:** Kick public API (`https://kick.com/api/v2/channels/{channel}`) polled every 60 seconds by the oracle service.
- **Lock mechanism:** Active cron in oracle locks markets exactly 10 minutes before `resolve_time`. Bet route enforces defensively via `status !== 'open'` and `closes_at < now()`.
- **Median window:** Snapshots collected between `resolve_time - 15min` and `resolve_time - 10min` (last 5 minutes before the lock). Median of those snapshots determines the winning bucket.

---

## Schema Changes

### New table: `market_buckets`

```sql
CREATE TABLE market_buckets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id    UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  bucket_id    CHAR(1) NOT NULL CHECK (bucket_id IN ('A','B','C','D')),
  label        TEXT NOT NULL,
  lo           INTEGER NOT NULL,
  hi           INTEGER,               -- NULL = unbounded (bucket D)
  pool_usdc    NUMERIC(18,6) NOT NULL DEFAULT 0,
  seed_usdc    NUMERIC(18,6) NOT NULL DEFAULT 25,
  UNIQUE (market_id, bucket_id)
);
```

### `markets` table additions

```sql
ALTER TABLE markets
  ADD COLUMN market_type    TEXT         NOT NULL DEFAULT 'binary',
  ADD COLUMN resolve_time   TIMESTAMPTZ,
  ADD COLUMN lock_time      TIMESTAMPTZ,
  ADD COLUMN winning_bucket CHAR(1);
```

`closes_at` is kept and synced to `lock_time` so existing frontend/bet logic requires no changes.

### `bets` table addition

```sql
ALTER TABLE bets
  ADD COLUMN bucket_id CHAR(1) CHECK (bucket_id IN ('A','B','C','D'));
```

`side` remains `'yes'` for all categorical bets.

---

## `calculatePrice()`

Location: `frontend/lib/utils.ts`

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

**Properties:**
- All 4 prices start at 0.25 at open (equal seeds, zero real bets).
- Prices always sum to 1.0.
- Payout formula for winner: `sum(real pool) * 0.9925 / winner_pool_usdc`. Seeds never enter the payout numerator.

---

## `lockMarket()`

Location: `oracle/index.ts` — cron, runs every 60 seconds.

```ts
async function lockDueMarkets() {
  const lockCutoff = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { data: markets } = await supabase
    .from('markets')
    .select('id, resolve_time')
    .eq('status', 'open')
    .eq('market_type', 'categorical')
    .lte('resolve_time', lockCutoff)

  for (const market of markets ?? []) {
    const lockTime = new Date(
      new Date(market.resolve_time).getTime() - 10 * 60 * 1000
    ).toISOString()

    await supabase.from('markets').update({
      status:    'locked',
      lock_time: lockTime,
      closes_at: lockTime,
    }).eq('id', market.id).eq('status', 'open')
  }
}

setInterval(lockDueMarkets, 60_000)
```

The bet route requires no changes — its existing `status !== 'open'` and `closes_at < now()` checks provide a second enforcement layer.

---

## `resolveMarket()`

Location: `oracle/index.ts` — cron, runs every 60 seconds.

### Viewer snapshot collection

```ts
const viewerSnapshots = new Map<string, { ts: number; viewers: number }[]>()

async function pollViewers() {
  const { data: markets } = await supabase
    .from('markets')
    .select('id, streams(stream_key), resolve_time')
    .in('status', ['open', 'locked'])
    .eq('market_type', 'categorical')

  for (const market of markets ?? []) {
    const channel = market.streams?.stream_key
    if (!channel) continue
    try {
      const res = await fetch(`https://kick.com/api/v2/channels/${channel}`)
      const data = await res.json()
      const viewers: number = data?.livestream?.viewer_count ?? 0
      const snaps = viewerSnapshots.get(market.id) ?? []
      snaps.push({ ts: Date.now(), viewers })
      viewerSnapshots.set(market.id, snaps)
    } catch { /* skip on API error */ }
  }
}

setInterval(pollViewers, 60_000)
```

### Median helper

```ts
function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function getMedianViewers(marketId: string, resolveTime: Date): number {
  const windowStart = resolveTime.getTime() - 15 * 60 * 1000
  const windowEnd   = resolveTime.getTime() - 10 * 60 * 1000
  const values = (viewerSnapshots.get(marketId) ?? [])
    .filter(s => s.ts >= windowStart && s.ts <= windowEnd)
    .map(s => s.viewers)
  return median(values)
}
```

### Bucket mapping

```ts
function mapToBucket(viewers: number): 'A' | 'B' | 'C' | 'D' {
  if (viewers <  5_000) return 'A'
  if (viewers < 10_000) return 'B'
  if (viewers < 20_000) return 'C'
  return 'D'
}
```

### Settlement

```ts
async function resolveMarket(market: any) {
  const resolveTime    = new Date(market.resolve_time)
  const snapshotCount  = (viewerSnapshots.get(market.id) ?? [])
    .filter(s => s.ts >= resolveTime.getTime() - 15 * 60 * 1000).length

  // Void if no data
  if (snapshotCount === 0) {
    await supabase.from('markets').update({ status: 'voided' }).eq('id', market.id)
    app.log.warn('Voided market %s — no viewer snapshots', market.id)
    return
  }

  const medianViewers = getMedianViewers(market.id, resolveTime)
  const winningBucket = mapToBucket(medianViewers)
  const bucketIndex   = { A: 0, B: 1, C: 2, D: 3 }[winningBucket]

  const tx      = await factory.settleMarket(market.on_chain_id, bucketIndex)
  const receipt = await tx.wait(1)

  await supabase.from('markets').update({
    status:         'resolved',
    outcome:        winningBucket,
    winning_bucket: winningBucket,
    settlement_tx:  receipt.hash,
    settled_at:     new Date().toISOString(),
  }).eq('id', market.id)

  await supabase.from('bets')
    .update({ status: 'won', settled_at: new Date().toISOString() })
    .eq('market_id', market.id)
    .eq('bucket_id', winningBucket)
    .eq('status', 'confirmed')

  await supabase.from('bets')
    .update({ status: 'lost', settled_at: new Date().toISOString() })
    .neq('bucket_id', winningBucket)
    .eq('market_id', market.id)
    .eq('status', 'confirmed')

  viewerSnapshots.delete(market.id)
  app.log.info('Resolved market %s → bucket %s (%d viewers)', market.id, winningBucket, medianViewers)
}

async function resolveAllDue() {
  const { data: markets } = await supabase
    .from('markets')
    .select('id, on_chain_id, resolve_time, streams(stream_key)')
    .eq('status', 'locked')
    .eq('market_type', 'categorical')
    .lte('resolve_time', new Date().toISOString())

  for (const market of markets ?? []) {
    try { await resolveMarket(market) }
    catch (err: any) {
      app.log.error('Resolve failed for market %s: %s', market.id, err.message)
    }
  }
}

setInterval(resolveAllDue, 60_000)
```

---

## Solidity Contract Change

```solidity
// Before
function settleMarket(uint256 marketId, bool yesWon) external;

// After
function settleMarket(uint256 marketId, uint8 winningBucket) external;
// 0 = A (0-5K), 1 = B (5K-10K), 2 = C (10K-20K), 3 = D (20K+)
```

Updated ABI in `oracle/index.ts`:

```ts
"function settleMarket(uint256 marketId, uint8 winningBucket) external",
```

---

## Market Creation Changes

`create-viewer-markets/route.ts` and `oracle/index.ts handleStreamLive()` need to:

1. Insert one `markets` row with:
   - `market_type = 'categorical'`
   - `resolve_time = now + 60min` (matching current 1-hour window)
   - `lock_time = resolve_time - 10min`
   - `closes_at = lock_time` (so existing bet route enforcement requires no changes)
2. Insert exactly 4 `market_buckets` rows (A/B/C/D) with fixed labels, `lo`/`hi` bounds, `seed_usdc = 25`.
3. Remove the existing loop that creates 4 separate binary markets per streamer.

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| No Kick API snapshots in median window | Market voided, bets refunded via existing void chain |
| Kick API returns 0 viewers (stream ended) | Median = 0 → maps to bucket A — correct behaviour |
| Oracle cron misfires, lock fires late | `closes_at` timestamp on bet route catches any late POSTs |
| Two concurrent bets on same bucket | Each writes to `market_buckets.pool_usdc` for its own bucket row — no contention |
| Oracle process restarts mid-market | In-memory `viewerSnapshots` Map is cleared. If restart happens during the 5-min median window, `snapshotCount = 0` and the market voids. Mitigation: keep the oracle process stable via a process manager (e.g. PM2); for higher reliability, persist snapshots to a `viewer_snapshots` Supabase table instead of memory (future improvement). |

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/lib/utils.ts` | Add `calculatePrice()` |
| `frontend/app/api/bet/route.ts` | Accept `bucketId`, write to `market_buckets.pool_usdc`, store `bucket_id` on bet |
| `frontend/app/api/admin/create-viewer-markets/route.ts` | Create one categorical market + 4 bucket rows |
| `oracle/index.ts` | Add `lockDueMarkets()`, `pollViewers()`, `resolveAllDue()`, update `settleMarket` ABI |
| Supabase migrations | New `market_buckets` table, 3 columns on `markets`, 1 column on `bets` |
| Solidity contract | `settleMarket(uint256, uint8)` replaces `settleMarket(uint256, bool)` |
