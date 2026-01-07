-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Add protection columns to user_tokens
-- Run this if you already have the user_tokens table and need to add protections
-- ═══════════════════════════════════════════════════════════════════════════

-- Add protection columns if they don't exist
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS suspend_reason TEXT;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'low';
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS daily_trade_limit_sol DECIMAL DEFAULT 10;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS max_position_size_sol DECIMAL DEFAULT 5;

-- Add constraint for risk_level if it doesn't exist
DO $$
BEGIN
  ALTER TABLE user_tokens ADD CONSTRAINT user_tokens_risk_level_check
    CHECK (risk_level IN ('low', 'medium', 'high'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Add index for suspended tokens
CREATE INDEX IF NOT EXISTS idx_user_tokens_suspended ON user_tokens(is_suspended);

-- Update existing tokens to have default values
UPDATE user_tokens
SET
  is_verified = COALESCE(is_verified, false),
  is_suspended = COALESCE(is_suspended, false),
  risk_level = COALESCE(risk_level, 'low'),
  daily_trade_limit_sol = COALESCE(daily_trade_limit_sol, 10),
  max_position_size_sol = COALESCE(max_position_size_sol, 5)
WHERE is_verified IS NULL
   OR is_suspended IS NULL
   OR risk_level IS NULL;
