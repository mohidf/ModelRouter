-- 006_user_history.sql
-- Per-user prompt history stored server-side.

CREATE TABLE IF NOT EXISTS user_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt     TEXT        NOT NULL,
  result     JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own history"
  ON user_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_user_history_user_id_created ON user_history(user_id, created_at DESC);
