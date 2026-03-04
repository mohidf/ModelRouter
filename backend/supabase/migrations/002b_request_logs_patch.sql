-- Migration 002b: patch request_logs to match expected schema
--
-- Run this if request_logs already existed before migration 002 was applied
-- and is missing the columns the app expects.

ALTER TABLE request_logs
  ADD COLUMN IF NOT EXISTS prompt      TEXT             NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider    TEXT             NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tier        TEXT             NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS task_type   TEXT             NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS latency_ms  DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence  DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_usd    DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated   BOOLEAN          NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW();

-- Indexes (safe to re-run)
CREATE INDEX IF NOT EXISTS request_logs_created_at_idx ON request_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS request_logs_routing_idx    ON request_logs (provider, tier, task_type);
