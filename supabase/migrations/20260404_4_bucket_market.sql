-- 4-bucket categorical prediction market schema
-- Task 1: see docs/superpowers/plans/2026-04-04-4-bucket-viewership-market.md

BEGIN;

-- 1. New table: market_buckets
CREATE TABLE IF NOT EXISTS market_buckets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id    UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  bucket_id    CHAR(1) NOT NULL CHECK (bucket_id IN ('A','B','C','D')),
  label        TEXT NOT NULL,
  lo           INTEGER NOT NULL,
  hi           INTEGER,                            -- NULL = unbounded (bucket D: 20K+)
  pool_usdc    NUMERIC(18,6) NOT NULL DEFAULT 0,
  -- House seed per bucket (25 USDC × 4 = 100 total). Used only for pricing
  -- (price = (pool+seed)/total_effective). Excluded from winner payouts.
  seed_usdc    NUMERIC(18,6) NOT NULL DEFAULT 25,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (market_id, bucket_id)
);

CREATE INDEX IF NOT EXISTS idx_market_buckets_market_id ON market_buckets(market_id);

-- 2. Extend markets table
ALTER TABLE markets
  ADD COLUMN IF NOT EXISTS market_type    TEXT NOT NULL DEFAULT 'binary'
    CHECK (market_type IN ('binary', 'categorical')),
  ADD COLUMN IF NOT EXISTS resolve_time   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lock_time      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS winning_bucket CHAR(1)
    CHECK (winning_bucket IN ('A','B','C','D'));

ALTER TABLE markets
  ADD CONSTRAINT chk_markets_lock_before_resolve
    CHECK (lock_time IS NULL OR resolve_time IS NULL OR lock_time < resolve_time);

-- 3. Extend bets table
ALTER TABLE bets
  ADD COLUMN IF NOT EXISTS bucket_id CHAR(1) CHECK (bucket_id IN ('A','B','C','D'));
-- Note: a composite FK (market_id, bucket_id) -> market_buckets is not added here
-- because bucket_id is nullable (binary bets have no bucket). Referential integrity
-- for categorical bets is enforced at the application layer (api/bet/route.ts).

COMMIT;
