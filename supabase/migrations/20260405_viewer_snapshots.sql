-- Persist oracle viewer snapshots so resolution survives oracle restarts
CREATE TABLE IF NOT EXISTS viewer_snapshots (
  id         BIGSERIAL PRIMARY KEY,
  market_id  UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  ts         BIGINT NOT NULL,        -- epoch ms matching oracle in-memory format
  viewers    INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_viewer_snapshots_market_ts
  ON viewer_snapshots(market_id, ts);
