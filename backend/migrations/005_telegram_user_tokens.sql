-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 005: TELEGRAM USER TOKENS LINK
-- Adds telegram_user_id to user_tokens for Telegram bot token tracking
-- Run this AFTER 002_multi_user_tables.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Add telegram_user_id column to link user_tokens to telegram_users
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS telegram_user_id UUID REFERENCES telegram_users(id) ON DELETE SET NULL;

-- Add launched_via_telegram flag to track tokens created via Telegram bot
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS launched_via_telegram BOOLEAN DEFAULT FALSE;

-- Create index for efficient queries by telegram_user_id
CREATE INDEX IF NOT EXISTS idx_user_tokens_telegram_user ON user_tokens(telegram_user_id);

-- Create index for launched_via_telegram
CREATE INDEX IF NOT EXISTS idx_user_tokens_launched_telegram ON user_tokens(launched_via_telegram) WHERE launched_via_telegram = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Run this to verify the migration was successful:
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'user_tokens'
--   AND column_name IN ('telegram_user_id', 'launched_via_telegram');
-- ═══════════════════════════════════════════════════════════════════════════
