-- Migration 001: performance_stats table + record_performance RPC
--
-- Run this once in your Supabase project via the SQL editor or CLI.

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS performance_stats (
  provider          TEXT             NOT NULL,
  tier              TEXT             NOT NULL,
  task_type         TEXT             NOT NULL,
  total_requests    INTEGER          NOT NULL DEFAULT 0,
  avg_latency_ms    DOUBLE PRECISION NOT NULL DEFAULT 0,
  avg_confidence    DOUBLE PRECISION NOT NULL DEFAULT 0,
  escalation_count  INTEGER          NOT NULL DEFAULT 0,
  avg_cost_usd      DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  PRIMARY KEY (provider, tier, task_type)
);

-- ── RPC: record_performance ───────────────────────────────────────────────────
--
-- Atomically upserts one performance observation using rolling average formula:
--   newAvg = (oldAvg * totalRequests + newValue) / (totalRequests + 1)
--
-- All arithmetic executes inside a single statement, so concurrent calls for
-- the same (provider, tier, task_type) key are serialised by PostgreSQL's
-- row-level lock on the conflicting tuple — no application-level locking needed.

CREATE OR REPLACE FUNCTION record_performance(
  p_provider    TEXT,
  p_tier        TEXT,
  p_task_type   TEXT,
  p_latency_ms  DOUBLE PRECISION,
  p_confidence  DOUBLE PRECISION,
  p_escalated   BOOLEAN,
  p_cost_usd    DOUBLE PRECISION
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO performance_stats (
    provider, tier, task_type,
    total_requests,
    avg_latency_ms,
    avg_confidence,
    escalation_count,
    avg_cost_usd,
    updated_at
  ) VALUES (
    p_provider, p_tier, p_task_type,
    1,
    p_latency_ms,
    p_confidence,
    CASE WHEN p_escalated THEN 1 ELSE 0 END,
    p_cost_usd,
    NOW()
  )
  ON CONFLICT (provider, tier, task_type) DO UPDATE SET
    avg_latency_ms   = (performance_stats.avg_latency_ms  * performance_stats.total_requests + p_latency_ms)  / (performance_stats.total_requests + 1),
    avg_confidence   = (performance_stats.avg_confidence  * performance_stats.total_requests + p_confidence)  / (performance_stats.total_requests + 1),
    avg_cost_usd     = (performance_stats.avg_cost_usd    * performance_stats.total_requests + p_cost_usd)    / (performance_stats.total_requests + 1),
    escalation_count = performance_stats.escalation_count + CASE WHEN p_escalated THEN 1 ELSE 0 END,
    total_requests   = performance_stats.total_requests   + 1,
    updated_at       = NOW();
END;
$$;
