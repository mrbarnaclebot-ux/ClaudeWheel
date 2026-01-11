-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Add TWAP/VWAP and Dynamic Mode Support
-- Adds new algorithm modes: twap_vwap and dynamic (replaces smart)
-- ═══════════════════════════════════════════════════════════════════════════

-- Step 1: Migrate existing 'smart' mode tokens to 'dynamic'
UPDATE user_token_config
SET algorithm_mode = 'dynamic'
WHERE algorithm_mode = 'smart';

-- Step 2: Drop old constraint and add new one with updated modes
ALTER TABLE user_token_config
DROP CONSTRAINT IF EXISTS user_token_config_algorithm_mode_check;

ALTER TABLE user_token_config
ADD CONSTRAINT user_token_config_algorithm_mode_check
CHECK (algorithm_mode IN ('simple', 'rebalance', 'twap_vwap', 'dynamic'));

-- Step 3: Add TWAP/VWAP configuration columns
ALTER TABLE user_token_config
ADD COLUMN IF NOT EXISTS twap_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS twap_slices INT DEFAULT 5 CHECK (twap_slices >= 1 AND twap_slices <= 20),
ADD COLUMN IF NOT EXISTS twap_window_minutes INT DEFAULT 30 CHECK (twap_window_minutes >= 5 AND twap_window_minutes <= 240),
ADD COLUMN IF NOT EXISTS twap_threshold_usd DECIMAL(20,2) DEFAULT 50,
ADD COLUMN IF NOT EXISTS vwap_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS vwap_participation_rate INT DEFAULT 10 CHECK (vwap_participation_rate >= 1 AND vwap_participation_rate <= 30),
ADD COLUMN IF NOT EXISTS vwap_min_volume_usd DECIMAL(20,2) DEFAULT 1000;

-- Step 4: Add Dynamic Fee Reinvestment configuration columns
ALTER TABLE user_token_config
ADD COLUMN IF NOT EXISTS dynamic_fee_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS reserve_percent_normal INT DEFAULT 10 CHECK (reserve_percent_normal >= 0 AND reserve_percent_normal <= 50),
ADD COLUMN IF NOT EXISTS reserve_percent_adverse INT DEFAULT 20 CHECK (reserve_percent_adverse >= 0 AND reserve_percent_adverse <= 50),
ADD COLUMN IF NOT EXISTS min_sell_percent INT DEFAULT 10 CHECK (min_sell_percent >= 1 AND min_sell_percent <= 50),
ADD COLUMN IF NOT EXISTS max_sell_percent INT DEFAULT 30 CHECK (max_sell_percent >= 5 AND max_sell_percent <= 100),
ADD COLUMN IF NOT EXISTS buyback_boost_on_dump BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS pause_on_extreme_volatility BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS volatility_pause_threshold INT DEFAULT 15;

-- Step 5: Add market condition tracking to flywheel state
ALTER TABLE user_flywheel_state
ADD COLUMN IF NOT EXISTS market_condition TEXT DEFAULT 'normal'
  CHECK (market_condition IN ('pump', 'dump', 'ranging', 'normal', 'extreme_volatility')),
ADD COLUMN IF NOT EXISTS previous_market_condition TEXT DEFAULT 'normal'
  CHECK (previous_market_condition IN ('pump', 'dump', 'ranging', 'normal', 'extreme_volatility')),
ADD COLUMN IF NOT EXISTS last_condition_change_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reserve_balance_sol DECIMAL(20,9) DEFAULT 0,
ADD COLUMN IF NOT EXISTS twap_queue JSONB DEFAULT '[]';

-- Step 6: Add comments for documentation
COMMENT ON COLUMN user_token_config.twap_enabled IS
'Enable TWAP execution for large trades (spreads execution over time)';
COMMENT ON COLUMN user_token_config.twap_slices IS
'Number of slices for TWAP execution (1-20)';
COMMENT ON COLUMN user_token_config.twap_window_minutes IS
'Time window for TWAP execution in minutes (5-240)';
COMMENT ON COLUMN user_token_config.twap_threshold_usd IS
'Minimum trade value in USD to trigger TWAP execution';
COMMENT ON COLUMN user_token_config.vwap_enabled IS
'Enable VWAP execution (scales trades to match market volume)';
COMMENT ON COLUMN user_token_config.vwap_participation_rate IS
'Target percentage of market volume for VWAP (1-30%)';
COMMENT ON COLUMN user_token_config.vwap_min_volume_usd IS
'Minimum 24h volume in USD to activate VWAP';
COMMENT ON COLUMN user_token_config.dynamic_fee_enabled IS
'Enable dynamic fee allocation based on market conditions';
COMMENT ON COLUMN user_token_config.reserve_percent_normal IS
'Percentage of fees to reserve during normal conditions';
COMMENT ON COLUMN user_token_config.reserve_percent_adverse IS
'Percentage of fees to reserve during adverse conditions (dump/high volatility)';
COMMENT ON COLUMN user_token_config.min_sell_percent IS
'Minimum percentage of token balance to sell during pump conditions (dynamic mode)';
COMMENT ON COLUMN user_token_config.max_sell_percent IS
'Maximum percentage of token balance to sell during pump conditions (dynamic mode)';
COMMENT ON COLUMN user_flywheel_state.market_condition IS
'Current detected market condition: pump, dump, ranging, normal, extreme_volatility';
COMMENT ON COLUMN user_flywheel_state.previous_market_condition IS
'Previous market condition for tracking transitions (used for reserve deployment)';
COMMENT ON COLUMN user_flywheel_state.reserve_balance_sol IS
'SOL held in reserve for adverse conditions';
COMMENT ON COLUMN user_flywheel_state.twap_queue IS
'Queue of pending TWAP trade slices (JSON array)';

-- Step 7: Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_flywheel_state_market_condition
ON user_flywheel_state(market_condition);

CREATE INDEX IF NOT EXISTS idx_user_token_config_algorithm_mode
ON user_token_config(algorithm_mode);

-- Step 8: Verify migration
DO $$
DECLARE
  smart_count INT;
BEGIN
  SELECT COUNT(*) INTO smart_count
  FROM user_token_config
  WHERE algorithm_mode = 'smart';

  IF smart_count > 0 THEN
    RAISE EXCEPTION 'Migration failed: % tokens still have smart mode', smart_count;
  END IF;
END $$;
