-- Atomic increment for market_buckets.pool_usdc
-- Used by the bet route to avoid read-modify-write race conditions
CREATE OR REPLACE FUNCTION increment_bucket_pool(
  p_market_id UUID,
  p_bucket_id CHAR(1),
  p_amount    NUMERIC
) RETURNS void
LANGUAGE sql
AS $$
  UPDATE market_buckets
  SET pool_usdc = pool_usdc + p_amount
  WHERE market_id = p_market_id AND bucket_id = p_bucket_id;
$$;
