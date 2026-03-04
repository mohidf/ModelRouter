-- Migration 003: switch performance_stats to Exponential Moving Average (EMA)
--
-- Changes:
--   1. Replace escalation_count (raw integer sum) with escalation_rate (EMA float).
--   2. Recreate record_performance() with EMA update formula:
--        newAvg = alpha * newValue + (1 - alpha) * oldAvg
--      On first insert: averages are initialised directly from the incoming values.
--      alpha is passed per-call so it can be tuned without a schema migration.

-- ── Schema change ─────────────────────────────────────────────────────────────

ALTER TABLE performance_stats
  DROP COLUMN IF EXISTS escalation_count,
  ADD  COLUMN IF NOT EXISTS escalation_rate DOUBLE PRECISION NOT NULL DEFAULT 0;

-- ── Updated RPC ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION record_performance(
  p_provider    TEXT,
  p_tier        TEXT,
  p_task_type   TEXT,
  p_latency_ms  DOUBLE PRECISION,
  p_confidence  DOUBLE PRECISION,
  p_escalated   BOOLEAN,
  p_cost_usd    DOUBLE PRECISION,
  p_alpha       DOUBLE PRECISION DEFAULT 0.2   -- EMA smoothing factor (0 < alpha ≤ 1)
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_escalated_num DOUBLE PRECISION := CASE WHEN p_escalated THEN 1.0 ELSE 0.0 END;
BEGIN
  INSERT INTO performance_stats (
    provider, tier, task_type,
    total_requests,
    avg_latency_ms,
    avg_confidence,
    escalation_rate,
    avg_cost_usd,
    updated_at
  ) VALUES (
    p_provider, p_tier, p_task_type,
    1,
    p_latency_ms,
    p_confidence,
    v_escalated_num,
    p_cost_usd,
    NOW()
  )
  ON CONFLICT (provider, tier, task_type) DO UPDATE SET
    avg_latency_ms  = p_alpha * p_latency_ms   + (1.0 - p_alpha) * performance_stats.avg_latency_ms,
    avg_confidence  = p_alpha * p_confidence   + (1.0 - p_alpha) * performance_stats.avg_confidence,
    escalation_rate = p_alpha * v_escalated_num + (1.0 - p_alpha) * performance_stats.escalation_rate,
    avg_cost_usd    = p_alpha * p_cost_usd     + (1.0 - p_alpha) * performance_stats.avg_cost_usd,
    total_requests  = performance_stats.total_requests + 1,
    updated_at      = NOW();
END;
$$;
