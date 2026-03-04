-- Migration 002: request_logs table
--
-- Records every completed routing decision for auditing and analytics.
-- Written after each request via a fire-and-forget insert in the router.

CREATE TABLE IF NOT EXISTS request_logs (
  id          BIGSERIAL        PRIMARY KEY,
  prompt      TEXT             NOT NULL,
  provider    TEXT             NOT NULL,
  tier        TEXT             NOT NULL,
  task_type   TEXT             NOT NULL,
  latency_ms  DOUBLE PRECISION NOT NULL,
  confidence  DOUBLE PRECISION NOT NULL,
  cost_usd    DOUBLE PRECISION NOT NULL,
  escalated   BOOLEAN          NOT NULL,
  created_at  TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- Index for time-series queries (most recent first)
CREATE INDEX IF NOT EXISTS request_logs_created_at_idx ON request_logs (created_at DESC);

-- Index for filtering by provider / tier / task type
CREATE INDEX IF NOT EXISTS request_logs_routing_idx   ON request_logs (provider, tier, task_type);
