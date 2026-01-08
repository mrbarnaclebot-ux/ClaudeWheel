-- ═══════════════════════════════════════════════════════════════════════════
-- USER WALLET BALANCES TABLE
-- Tracks dev and ops wallet balances for each user token
-- Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing tables if they exist (clean slate)
-- Comment these out if you want to preserve existing data
DROP TABLE IF EXISTS user_wallet_balance_history CASCADE;
DROP TABLE IF EXISTS user_wallet_balances CASCADE;

-- Per-user token wallet balances (cached from Solana blockchain)
CREATE TABLE user_wallet_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE,

  -- Dev wallet balances (fees accumulate here)
  dev_sol_balance DECIMAL DEFAULT 0,
  dev_token_balance DECIMAL DEFAULT 0,
  dev_usd_value DECIMAL DEFAULT 0,

  -- Ops wallet balances (trading happens here)
  ops_sol_balance DECIMAL DEFAULT 0,
  ops_token_balance DECIMAL DEFAULT 0,
  ops_usd_value DECIMAL DEFAULT 0,

  -- Total claimable fees from Bags.fm (separate from wallet balance)
  claimable_fees_sol DECIMAL DEFAULT 0,
  claimable_fees_usd DECIMAL DEFAULT 0,

  -- SOL price at time of update (for USD calculations)
  sol_price_usd DECIMAL DEFAULT 0,

  -- Metadata
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  update_count INTEGER DEFAULT 0,

  UNIQUE(user_token_id)
);

-- Balance history for tracking over time (optional - for analytics)
CREATE TABLE user_wallet_balance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE,

  -- Snapshot of balances
  dev_sol_balance DECIMAL DEFAULT 0,
  dev_token_balance DECIMAL DEFAULT 0,
  ops_sol_balance DECIMAL DEFAULT 0,
  ops_token_balance DECIMAL DEFAULT 0,
  claimable_fees_sol DECIMAL DEFAULT 0,
  sol_price_usd DECIMAL DEFAULT 0,

  -- When this snapshot was taken
  snapshot_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_user_wallet_balances_token ON user_wallet_balances(user_token_id);
CREATE INDEX IF NOT EXISTS idx_user_wallet_balances_updated ON user_wallet_balances(last_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_wallet_balance_history_token ON user_wallet_balance_history(user_token_id);
CREATE INDEX IF NOT EXISTS idx_user_wallet_balance_history_snapshot ON user_wallet_balance_history(snapshot_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE user_wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wallet_balance_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role all" ON user_wallet_balances;
CREATE POLICY "Allow service role all" ON user_wallet_balances FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON user_wallet_balance_history;
CREATE POLICY "Allow service role all" ON user_wallet_balance_history FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE REALTIME
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_wallet_balances;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION: Upsert wallet balance (called by backend)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION upsert_wallet_balance(
  p_user_token_id UUID,
  p_dev_sol DECIMAL,
  p_dev_token DECIMAL,
  p_ops_sol DECIMAL,
  p_ops_token DECIMAL,
  p_claimable_fees DECIMAL,
  p_sol_price DECIMAL
) RETURNS void AS $$
DECLARE
  v_dev_usd DECIMAL;
  v_ops_usd DECIMAL;
  v_claimable_usd DECIMAL;
BEGIN
  -- Calculate USD values
  v_dev_usd := p_dev_sol * p_sol_price;
  v_ops_usd := p_ops_sol * p_sol_price;
  v_claimable_usd := p_claimable_fees * p_sol_price;

  -- Upsert balance record
  INSERT INTO user_wallet_balances (
    user_token_id,
    dev_sol_balance, dev_token_balance, dev_usd_value,
    ops_sol_balance, ops_token_balance, ops_usd_value,
    claimable_fees_sol, claimable_fees_usd,
    sol_price_usd,
    last_updated_at, update_count
  ) VALUES (
    p_user_token_id,
    p_dev_sol, p_dev_token, v_dev_usd,
    p_ops_sol, p_ops_token, v_ops_usd,
    p_claimable_fees, v_claimable_usd,
    p_sol_price,
    NOW(), 1
  )
  ON CONFLICT (user_token_id) DO UPDATE SET
    dev_sol_balance = p_dev_sol,
    dev_token_balance = p_dev_token,
    dev_usd_value = v_dev_usd,
    ops_sol_balance = p_ops_sol,
    ops_token_balance = p_ops_token,
    ops_usd_value = v_ops_usd,
    claimable_fees_sol = p_claimable_fees,
    claimable_fees_usd = v_claimable_usd,
    sol_price_usd = p_sol_price,
    last_updated_at = NOW(),
    update_count = user_wallet_balances.update_count + 1;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION: Save balance snapshot (for history)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION save_balance_snapshot(
  p_user_token_id UUID
) RETURNS void AS $$
BEGIN
  INSERT INTO user_wallet_balance_history (
    user_token_id,
    dev_sol_balance, dev_token_balance,
    ops_sol_balance, ops_token_balance,
    claimable_fees_sol, sol_price_usd,
    snapshot_at
  )
  SELECT
    user_token_id,
    dev_sol_balance, dev_token_balance,
    ops_sol_balance, ops_token_balance,
    claimable_fees_sol, sol_price_usd,
    NOW()
  FROM user_wallet_balances
  WHERE user_token_id = p_user_token_id;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════
-- CLEANUP: Delete old history (keep last 30 days)
-- Run this periodically via cron or scheduled function
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_old_balance_history() RETURNS void AS $$
BEGIN
  DELETE FROM user_wallet_balance_history
  WHERE snapshot_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
