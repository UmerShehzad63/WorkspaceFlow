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