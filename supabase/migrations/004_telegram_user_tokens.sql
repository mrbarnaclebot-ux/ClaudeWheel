-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 004: TELEGRAM USER TOKENS LINK
-- Adds telegram_user_id to user_tokens for Telegram bot token tracking
-- ═══════════════════════════════════════════════════════════════════════════

-- Add telegram_user_id column to link user_tokens to telegram_users
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS telegram_user_id UUID REFERENCES telegram_users(id) ON DELETE SET NULL;

-- Add launched_via_telegram flag to track tokens created via Telegram bot
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS launched_via_telegram BOOLEAN DEFAULT FALSE;

-- Create index for efficient queries by telegram_user_id
CREATE INDEX IF NOT EXISTS idx_user_tokens_telegram_user ON user_tokens(telegram_user_id);

-- Create index for launched_via_telegram
CREATE INDEX IF NOT EXISTS idx_user_tokens_launched_telegram ON user_tokens(launched_via_telegram) WHERE launched_via_telegram = TRUE;
