-- Run these in the Supabase SQL editor (Dashboard → SQL Editor)
-- Apply in order — all statements are idempotent (safe to re-run).

-- ── 1. Setup wizard tracking ───────────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN NOT NULL DEFAULT false;

-- Backfill: existing users have already completed setup
UPDATE profiles SET setup_completed = true WHERE setup_completed = false;

-- ── 2. Plan column (set by Stripe webhook) ─────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- ── 3. Deprecated columns — kept for backward compat, not used ────────────
-- whatsapp_* columns from prior WhatsApp integration (Twilio)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_phone      TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_connected  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_briefing_sent  TIMESTAMPTZ;
-- telegram_chat_id from even older integration
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_chat_id    TEXT;

-- ── 4. Telegram connections (new — python-telegram-bot) ────────────────────
CREATE TABLE IF NOT EXISTS telegram_connections (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  chat_id           TEXT,                     -- Telegram chat ID (set after /verify)
  username          TEXT,                     -- Telegram @username or first name
  verification_code TEXT,                     -- 6-digit code, cleared after use
  verified_at       TIMESTAMPTZ,              -- NULL = pending, non-NULL = connected
  last_briefing_sent TIMESTAMPTZ,             -- dedup: last time scheduler sent
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Indexes for the two most common lookups
CREATE INDEX IF NOT EXISTS telegram_connections_chat_id_idx
  ON telegram_connections (chat_id);

CREATE INDEX IF NOT EXISTS telegram_connections_code_idx
  ON telegram_connections (verification_code)
  WHERE verification_code IS NOT NULL;

-- Row Level Security — users can only see their own connection
ALTER TABLE telegram_connections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can read own telegram connection"
    ON telegram_connections FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ── 5. Gmail push notification tracking ────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail_history_id   TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gmail_watch_expiry TIMESTAMPTZ;

-- ── 5b. Command bar daily usage tracking (free-plan limit) ─────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cmd_daily_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cmd_daily_date  DATE;

-- ── 6. Automations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_id      TEXT        NOT NULL,
  name             TEXT        NOT NULL,
  description      TEXT,
  schedule         TEXT,
  field_values     JSONB       NOT NULL DEFAULT '{}',
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  last_run_at      TIMESTAMPTZ,
  run_count        INTEGER     NOT NULL DEFAULT 0,
  items_processed  INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automations_user_id_idx   ON automations (user_id);
CREATE INDEX IF NOT EXISTS automations_active_idx    ON automations (is_active) WHERE is_active = true;

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can manage own automations"
    ON automations FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ── 6. Automation execution logs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_logs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id  UUID        REFERENCES automations(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status         TEXT        NOT NULL DEFAULT 'success',  -- success | error | skipped
  items_processed INTEGER    NOT NULL DEFAULT 0,
  message        TEXT,
  ran_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_logs_automation_id_idx ON automation_logs (automation_id);
CREATE INDEX IF NOT EXISTS automation_logs_user_id_idx       ON automation_logs (user_id);

ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "Users can read own automation logs"
    ON automation_logs FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "Service role can insert automation logs"
    ON automation_logs FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "No direct updates to automation logs"
    ON automation_logs FOR UPDATE USING (false);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "No direct deletes to automation logs"
    ON automation_logs FOR DELETE USING (false);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;