-- ============================================================================
-- MIGRATION 008: Percentage-Based Trading
-- ============================================================================
-- Simplifies market making to use percentage of current balance per trade
-- Replaces TWAP/VWAP and Dynamic modes with simpler approach:
--   - buy_percent: % of SOL balance to use for each buy (default 20%)
--   - sell_percent: % of token balance to use for each sell (default 20%)
-- ============================================================================

-- Add percentage-based trading columns to user_token_config
ALTER TABLE user_token_config
ADD COLUMN IF NOT EXISTS buy_percent INTEGER DEFAULT 20,
ADD COLUMN IF NOT EXISTS sell_percent INTEGER DEFAULT 20;

-- Add check constraints to ensure valid percentages (1-100)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints
                 WHERE constraint_name = 'user_token_config_buy_percent_check') THEN
    ALTER TABLE user_token_config ADD CONSTRAINT user_token_config_buy_percent_check
      CHECK (buy_percent >= 1 AND buy_percent <= 100);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.check_constraints
                 WHERE constraint_name = 'user_token_config_sell_percent_check') THEN
    ALTER TABLE user_token_config ADD CONSTRAINT user_token_config_sell_percent_check
      CHECK (sell_percent >= 1 AND sell_percent <= 100);
  END IF;
END $$;

-- Migrate all tokens to use simple algorithm mode (if not already)
UPDATE user_token_config
SET algorithm_mode = 'simple'
WHERE algorithm_mode IN ('twap_vwap', 'dynamic', 'rebalance');

-- Update the algorithm_mode constraint to only allow 'simple'
ALTER TABLE user_token_config
DROP CONSTRAINT IF EXISTS user_token_config_algorithm_mode_check;

ALTER TABLE user_token_config
ADD CONSTRAINT user_token_config_algorithm_mode_check
CHECK (algorithm_mode = 'simple');

-- Verify the migration
SELECT
  ut.token_symbol,
  utc.algorithm_mode,
  utc.buy_percent,
  utc.sell_percent,
  utc.flywheel_active
FROM user_tokens ut
JOIN user_token_config utc ON utc.user_token_id = ut.id
WHERE ut.token_mint_address = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS';
