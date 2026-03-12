-- Migration 004: Add model_id tracking and Together AI support
--
-- Changes:
--   1. Add model_id column to performance_stats
--   2. Backfill model_id from existing (provider, tier) combinations
--   3. Migrate primary key from (provider, tier, task_type) → (model_id, task_type)
--   4. Update record_performance() RPC to accept p_model_id
--   5. Add model_id to request_logs for per-model analytics

-- ── Step 1: Add model_id to performance_stats ─────────────────────────────────

ALTER TABLE performance_stats
  ADD COLUMN IF NOT EXISTS model_id TEXT;

-- ── Step 2: Backfill model_id from existing (provider, tier) combinations ─────
--
-- Maps known (provider, tier) pairs to canonical model IDs.
-- Any unknown combination falls back to "provider/tier" as a placeholder.

UPDATE performance_stats SET model_id = CASE
  WHEN provider = 'openai'    AND tier = 'cheap'    THEN 'gpt-4o-mini'
  WHEN provider = 'openai'    AND tier = 'balanced' THEN 'gpt-4o'
  WHEN provider = 'openai'    AND tier = 'premium'  THEN 'gpt-4o'
  WHEN provider = 'anthropic' AND tier = 'cheap'    THEN 'claude-haiku-4-5-20251001'
  WHEN provider = 'anthropic' AND tier = 'balanced' THEN 'claude-sonnet-4-6'
  WHEN provider = 'anthropic' AND tier = 'premium'  THEN 'claude-opus-4-6'
  ELSE provider || '/' || tier
END
WHERE model_id IS NULL;

-- ── Step 3: Make model_id NOT NULL ───────────────────────────────────────────

ALTER TABLE performance_stats
  ALTER COLUMN model_id SET NOT NULL;

-- ── Step 3b: Deduplicate rows that share (model_id, task_type) after backfill ─
--
-- openai/balanced and openai/premium both map to 'gpt-4o', which creates
-- duplicate (model_id, task_type) pairs. Merge duplicates by keeping the row
-- with the most total_requests; delete the lesser row(s).
--
-- If counts are tied, the row with the lower ctid (physical order) survives.

DELETE FROM performance_stats a
USING performance_stats b
WHERE a.model_id  = b.model_id
  AND a.task_type = b.task_type
  AND (
    a.total_requests < b.total_requests
    OR (a.total_requests = b.total_requests AND a.ctid < b.ctid)
  );

-- ── Step 4: Migrate primary key ──────────────────────────────────────────────

ALTER TABLE performance_stats
  DROP CONSTRAINT IF EXISTS performance_stats_pkey;

ALTER TABLE performance_stats
  ADD PRIMARY KEY (model_id, task_type);

-- Keep an index on (provider, tier) for display-oriented queries
CREATE INDEX IF NOT EXISTS performance_stats_provider_tier_idx
  ON performance_stats (provider, tier, task_type);

-- ── Step 5: Replace the record_performance() RPC ─────────────────────────────
--
-- New signature: p_model_id replaces the old (p_provider, p_tier) primary key.
-- Provider and tier are kept as denormalized columns for display queries.

CREATE OR REPLACE FUNCTION record_performance(
  p_model_id    TEXT,
  p_provider    TEXT,
  p_tier        TEXT,
  p_task_type   TEXT,
  p_latency_ms  DOUBLE PRECISION,
  p_confidence  DOUBLE PRECISION,
  p_escalated   BOOLEAN,
  p_cost_usd    DOUBLE PRECISION,
  p_alpha       DOUBLE PRECISION DEFAULT 0.2
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_escalated_num DOUBLE PRECISION := CASE WHEN p_escalated THEN 1.0 ELSE 0.0 END;
BEGIN
  INSERT INTO performance_stats (
    model_id, provider, tier, task_type,
    total_requests,
    avg_latency_ms,
    avg_confidence,
    escalation_rate,
    avg_cost_usd,
    updated_at
  ) VALUES (
    p_model_id, p_provider, p_tier, p_task_type,
    1,
    p_latency_ms,
    p_confidence,
    v_escalated_num,
    p_cost_usd,
    NOW()
  )
  ON CONFLICT (model_id, task_type) DO UPDATE SET
    avg_latency_ms  = p_alpha * p_latency_ms    + (1.0 - p_alpha) * performance_stats.avg_latency_ms,
    avg_confidence  = p_alpha * p_confidence    + (1.0 - p_alpha) * performance_stats.avg_confidence,
    escalation_rate = p_alpha * v_escalated_num + (1.0 - p_alpha) * performance_stats.escalation_rate,
    avg_cost_usd    = p_alpha * p_cost_usd      + (1.0 - p_alpha) * performance_stats.avg_cost_usd,
    total_requests  = performance_stats.total_requests + 1,
    updated_at      = NOW();
END;
$$;

-- ── Step 6: Add model_id to request_logs ─────────────────────────────────────
--
-- Nullable so existing rows are preserved. New rows will always populate it.

ALTER TABLE request_logs
  ADD COLUMN IF NOT EXISTS model_id TEXT;
