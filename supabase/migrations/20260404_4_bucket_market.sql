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
