-- ═══════════════════════════════════════════════════════════════════════════
-- COMBINED MIGRATION: Apply all pending migrations
-- Run this in Supabase SQL Editor to enable TWAP/VWAP mode for WHEEL
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- MIGRATION 005: Flywheel Failure Tracking + Trading Route
-- ============================================================================

-- Add failure tracking columns to user_flywheel_state
ALTER TABLE user_flywheel_state
ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_failure_reason TEXT,
ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS total_failures INTEGER DEFAULT 0;

-- Add trading_route column to user_token_config
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'user_token_config' AND column_name = 'trading_route') THEN
    ALTER TABLE user_token_config ADD COLUMN trading_route TEXT DEFAULT 'auto';
    ALTER TABLE user_token_config ADD CONSTRAINT user_token_config_trading_route_check
      CHECK (trading_route IN ('bags', 'jupiter', 'auto'));
  END IF;
END $$;

-- Add last_graduation_check to track when we last checked bonding status
ALTER TABLE user_tokens
ADD COLUMN IF NOT EXISTS last_graduation_check TIMESTAMPTZ;

-- Create index for efficient queries on paused tokens
CREATE INDEX IF NOT EXISTS idx_flywheel_state_paused
ON user_flywheel_state(paused_until)
WHERE paused_until IS NOT NULL;

-- ============================================================================
-- MIGRATION 007: TWAP/VWAP and Dynamic Mode Support
-- ============================================================================

-- Migrate existing 'smart' mode tokens to 'dynamic'
UPDATE user_token_config
SET algorithm_mode = 'dynamic'
WHERE algorithm_mode = 'smart';

-- Drop old constraint and add new one with updated modes
ALTER TABLE user_token_config
DROP CONSTRAINT IF EXISTS user_token_config_algorithm_mode_check;

ALTER TABLE user_token_config
ADD CONSTRAINT user_token_config_algorithm_mode_check
CHECK (algorithm_mode IN ('simple', 'rebalance', 'twap_vwap', 'dynamic'));

-- Add TWAP/VWAP configuration columns
ALTER TABLE user_token_config
ADD COLUMN IF NOT EXISTS twap_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS twap_slices INT DEFAULT 5,
ADD COLUMN IF NOT EXISTS twap_window_minutes INT DEFAULT 30,
ADD COLUMN IF NOT EXISTS vwap_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS vwap_participation_rate INT DEFAULT 10,
ADD COLUMN IF NOT EXISTS vwap_min_volume_usd DECIMAL(20,2) DEFAULT 1000;

-- Add Dynamic Fee Reinvestment configuration columns
ALTER TABLE user_token_config
ADD COLUMN IF NOT EXISTS dynamic_fee_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS reserve_percent_normal INT DEFAULT 10,
ADD COLUMN IF NOT EXISTS reserve_percent_adverse INT DEFAULT 20,
ADD COLUMN IF NOT EXISTS min_sell_percent INT DEFAULT 10,
ADD COLUMN IF NOT EXISTS max_sell_percent INT DEFAULT 30,
ADD COLUMN IF NOT EXISTS buyback_boost_on_dump BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS pause_on_extreme_volatility BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS volatility_pause_threshold INT DEFAULT 15;

-- Add market condition tracking to flywheel state
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'user_flywheel_state' AND column_name = 'market_condition') THEN
    ALTER TABLE user_flywheel_state ADD COLUMN market_condition TEXT DEFAULT 'normal';
    ALTER TABLE user_flywheel_state ADD CONSTRAINT user_flywheel_state_market_condition_check
      CHECK (market_condition IN ('pump', 'dump', 'ranging', 'normal', 'extreme_volatility'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'user_flywheel_state' AND column_name = 'previous_market_condition') THEN
    ALTER TABLE user_flywheel_state ADD COLUMN previous_market_condition TEXT DEFAULT 'normal';
    ALTER TABLE user_flywheel_state ADD CONSTRAINT user_flywheel_state_prev_condition_check
      CHECK (previous_market_condition IN ('pump', 'dump', 'ranging', 'normal', 'extreme_volatility'));
  END IF;
END $$;

ALTER TABLE user_flywheel_state
ADD COLUMN IF NOT EXISTS last_condition_change_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reserve_balance_sol DECIMAL(20,9) DEFAULT 0,
ADD COLUMN IF NOT EXISTS twap_queue JSONB DEFAULT '[]';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_flywheel_state_market_condition
ON user_flywheel_state(market_condition);

CREATE INDEX IF NOT EXISTS idx_user_token_config_algorithm_mode
ON user_token_config(algorithm_mode);

-- ============================================================================
-- UPDATE WHEEL TOKEN TO TWAP/VWAP MODE
-- ============================================================================

UPDATE user_token_config
SET algorithm_mode = 'twap_vwap',
    twap_enabled = true,
    twap_slices = 5,
    twap_window_minutes = 30,
    vwap_enabled = true,
    vwap_participation_rate = 10,
    vwap_min_volume_usd = 1000
WHERE user_token_id IN (
  SELECT id FROM user_tokens
  WHERE token_mint_address = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'
);

-- Verify
SELECT
  ut.token_symbol,
  utc.algorithm_mode,
  utc.twap_enabled,
  utc.flywheel_active
FROM user_tokens ut
JOIN user_token_config utc ON utc.user_token_id = ut.id
WHERE ut.token_mint_address = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS';
