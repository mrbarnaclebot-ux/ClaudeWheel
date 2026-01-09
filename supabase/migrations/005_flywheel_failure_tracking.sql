-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 005: FLYWHEEL FAILURE TRACKING
-- Adds columns to track consecutive failures and auto-pause functionality
-- ═══════════════════════════════════════════════════════════════════════════

-- Add failure tracking columns to user_flywheel_state
ALTER TABLE user_flywheel_state
ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_failure_reason TEXT,
ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS total_failures INTEGER DEFAULT 0;

-- Add trading_route column to user_token_config to specify which exchange to use
-- 'bags' = Bags.fm bonding curve (default for unbonded)
-- 'jupiter' = Jupiter aggregator (for graduated/bonded tokens)
-- 'auto' = Automatically detect based on is_graduated status
ALTER TABLE user_token_config
ADD COLUMN IF NOT EXISTS trading_route TEXT DEFAULT 'auto'
CHECK (trading_route IN ('bags', 'jupiter', 'auto'));

-- Add last_graduation_check to track when we last checked bonding status
ALTER TABLE user_tokens
ADD COLUMN IF NOT EXISTS last_graduation_check TIMESTAMPTZ;

-- Create index for efficient queries on paused tokens
CREATE INDEX IF NOT EXISTS idx_flywheel_state_paused
ON user_flywheel_state(paused_until)
WHERE paused_until IS NOT NULL;

-- Function to reset failure count when a trade succeeds
COMMENT ON COLUMN user_flywheel_state.consecutive_failures IS
'Number of consecutive trade failures. Reset to 0 on successful trade.';

COMMENT ON COLUMN user_flywheel_state.paused_until IS
'Flywheel is paused until this timestamp due to repeated failures. NULL means not paused.';

COMMENT ON COLUMN user_token_config.trading_route IS
'Which exchange to use: bags (bonding curve), jupiter (graduated), or auto (detect based on is_graduated).';
