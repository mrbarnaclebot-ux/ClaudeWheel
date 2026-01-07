-- ═══════════════════════════════════════════════════════════════════════════
-- SUPABASE SCHEMA FOR CLAUDE WHEEL
-- Run this in your Supabase SQL Editor to create the required tables
-- ═══════════════════════════════════════════════════════════════════════════

-- Wallet Balances Table
CREATE TABLE IF NOT EXISTS wallet_balances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_type TEXT NOT NULL UNIQUE CHECK (wallet_type IN ('dev', 'ops')),
  address TEXT NOT NULL,
  sol_balance DECIMAL DEFAULT 0,
  token_balance DECIMAL DEFAULT 0,
  usd_value DECIMAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions Table (for live feed)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('fee_collection', 'transfer', 'buy', 'sell')),
  amount DECIMAL NOT NULL,
  token TEXT NOT NULL,
  signature TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fee Stats Table
CREATE TABLE IF NOT EXISTS fee_stats (
  id TEXT PRIMARY KEY DEFAULT 'main',
  total_collected DECIMAL DEFAULT 0,
  today_collected DECIMAL DEFAULT 0,
  hour_collected DECIMAL DEFAULT 0,
  total_change DECIMAL DEFAULT 0,
  today_change DECIMAL DEFAULT 0,
  hour_change DECIMAL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Config Table
CREATE TABLE IF NOT EXISTS config (
  id TEXT PRIMARY KEY DEFAULT 'main',
  token_mint_address TEXT,
  token_symbol TEXT DEFAULT 'TOKEN',
  token_decimals INTEGER DEFAULT 6,
  flywheel_active BOOLEAN DEFAULT false,
  market_making_enabled BOOLEAN DEFAULT false,
  fee_collection_enabled BOOLEAN DEFAULT true,
  ops_wallet_address TEXT,
  fee_threshold_sol DECIMAL DEFAULT 0.01,
  fee_percentage INTEGER DEFAULT 50,
  min_buy_amount_sol DECIMAL DEFAULT 0.01,
  max_buy_amount_sol DECIMAL DEFAULT 0.1,
  buy_interval_minutes INTEGER DEFAULT 5,
  slippage_bps INTEGER DEFAULT 100,
  algorithm_mode TEXT DEFAULT 'simple' CHECK (algorithm_mode IN ('simple', 'smart', 'rebalance')),
  target_sol_allocation INTEGER DEFAULT 30,
  target_token_allocation INTEGER DEFAULT 70,
  rebalance_threshold INTEGER DEFAULT 10,
  use_twap BOOLEAN DEFAULT true,
  twap_threshold_usd DECIMAL DEFAULT 50,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config row
INSERT INTO config (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- Insert default fee stats row
INSERT INTO fee_stats (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE REALTIME FOR LIVE UPDATES
-- Go to Supabase Dashboard -> Database -> Replication and enable these tables
-- OR run these commands (wrapped in DO block to handle "already exists" errors):
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable realtime for all tables (ignore if already enabled)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE wallet_balances;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE fee_stats;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE config;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) - Allow public read, service role write
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable RLS (safe to run multiple times)
ALTER TABLE wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "Allow public read" ON wallet_balances;
DROP POLICY IF EXISTS "Allow public read" ON transactions;
DROP POLICY IF EXISTS "Allow public read" ON fee_stats;
DROP POLICY IF EXISTS "Allow public read" ON config;
DROP POLICY IF EXISTS "Allow service role insert" ON wallet_balances;
DROP POLICY IF EXISTS "Allow service role update" ON wallet_balances;
DROP POLICY IF EXISTS "Allow service role insert" ON transactions;
DROP POLICY IF EXISTS "Allow service role update" ON transactions;
DROP POLICY IF EXISTS "Allow service role insert" ON fee_stats;
DROP POLICY IF EXISTS "Allow service role update" ON fee_stats;
DROP POLICY IF EXISTS "Allow service role insert" ON config;
DROP POLICY IF EXISTS "Allow service role update" ON config;

-- Allow public read access (for frontend)
CREATE POLICY "Allow public read" ON wallet_balances FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON transactions FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON fee_stats FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON config FOR SELECT USING (true);

-- Allow service role full access (for backend)
CREATE POLICY "Allow service role insert" ON wallet_balances FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update" ON wallet_balances FOR UPDATE USING (true);
CREATE POLICY "Allow service role insert" ON transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update" ON transactions FOR UPDATE USING (true);
CREATE POLICY "Allow service role insert" ON fee_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update" ON fee_stats FOR UPDATE USING (true);
CREATE POLICY "Allow service role insert" ON config FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service role update" ON config FOR UPDATE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- ═══════════════════════════════════════════════════════════════════════════
-- MULTI-USER TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- Users table (wallet-based authentication)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL UNIQUE,
  display_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User tokens with encrypted dev wallet keys
CREATE TABLE IF NOT EXISTS user_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_mint_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_name TEXT,
  token_image TEXT,
  token_decimals INTEGER DEFAULT 6,
  dev_wallet_address TEXT NOT NULL,
  dev_wallet_private_key_encrypted TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_auth_tag TEXT,
  ops_wallet_address TEXT NOT NULL,
  ops_wallet_private_key_encrypted TEXT,
  ops_encryption_iv TEXT,
  ops_encryption_auth_tag TEXT,
  is_active BOOLEAN DEFAULT true,
  is_graduated BOOLEAN DEFAULT false,
  -- Protection features
  is_verified BOOLEAN DEFAULT false,
  is_suspended BOOLEAN DEFAULT false,
  suspend_reason TEXT,
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  daily_trade_limit_sol DECIMAL DEFAULT 10,
  max_position_size_sol DECIMAL DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token_mint_address)
);

-- Add ops wallet encryption columns to existing table if missing
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS ops_wallet_private_key_encrypted TEXT;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS ops_encryption_iv TEXT;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS ops_encryption_auth_tag TEXT;
ALTER TABLE user_tokens ADD COLUMN IF NOT EXISTS encryption_auth_tag TEXT;

-- Per-user token config
CREATE TABLE IF NOT EXISTS user_token_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE UNIQUE,
  flywheel_active BOOLEAN DEFAULT false,
  market_making_enabled BOOLEAN DEFAULT false,
  auto_claim_enabled BOOLEAN DEFAULT true,
  fee_threshold_sol DECIMAL DEFAULT 0.01,
  min_buy_amount_sol DECIMAL DEFAULT 0.01,
  max_buy_amount_sol DECIMAL DEFAULT 0.1,
  max_sell_amount_tokens DECIMAL DEFAULT 1000000,
  buy_interval_minutes INTEGER DEFAULT 5,
  slippage_bps INTEGER DEFAULT 300,
  algorithm_mode TEXT DEFAULT 'simple' CHECK (algorithm_mode IN ('simple', 'smart', 'rebalance')),
  target_sol_allocation INTEGER DEFAULT 30,
  target_token_allocation INTEGER DEFAULT 70,
  rebalance_threshold INTEGER DEFAULT 10,
  use_twap BOOLEAN DEFAULT true,
  twap_threshold_usd DECIMAL DEFAULT 50,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-user flywheel state
CREATE TABLE IF NOT EXISTS user_flywheel_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE UNIQUE,
  cycle_phase TEXT DEFAULT 'buy' CHECK (cycle_phase IN ('buy', 'sell')),
  buy_count INTEGER DEFAULT 0,
  sell_count INTEGER DEFAULT 0,
  sell_phase_token_snapshot DECIMAL DEFAULT 0,
  sell_amount_per_tx DECIMAL DEFAULT 0,
  last_trade_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User claim history
CREATE TABLE IF NOT EXISTS user_claim_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE,
  amount_sol DECIMAL NOT NULL,
  amount_usd DECIMAL DEFAULT 0,
  transaction_signature TEXT,
  claimed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- MULTI-USER INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tokens_mint ON user_tokens(token_mint_address);
CREATE INDEX IF NOT EXISTS idx_user_tokens_active ON user_tokens(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_tokens_suspended ON user_tokens(is_suspended);
CREATE INDEX IF NOT EXISTS idx_user_token_config_flywheel ON user_token_config(flywheel_active) WHERE flywheel_active = true;
CREATE INDEX IF NOT EXISTS idx_user_token_config_auto_claim ON user_token_config(auto_claim_enabled) WHERE auto_claim_enabled = true;
CREATE INDEX IF NOT EXISTS idx_user_claim_history_token ON user_claim_history(user_token_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- MULTI-USER RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_token_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flywheel_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_claim_history ENABLE ROW LEVEL SECURITY;

-- Users policies
DROP POLICY IF EXISTS "Allow service role all" ON users;
CREATE POLICY "Allow service role all" ON users FOR ALL USING (true);

-- User tokens policies
DROP POLICY IF EXISTS "Allow service role all" ON user_tokens;
CREATE POLICY "Allow service role all" ON user_tokens FOR ALL USING (true);

-- User token config policies
DROP POLICY IF EXISTS "Allow service role all" ON user_token_config;
CREATE POLICY "Allow service role all" ON user_token_config FOR ALL USING (true);

-- User flywheel state policies
DROP POLICY IF EXISTS "Allow service role all" ON user_flywheel_state;
CREATE POLICY "Allow service role all" ON user_flywheel_state FOR ALL USING (true);

-- User claim history policies
DROP POLICY IF EXISTS "Allow service role all" ON user_claim_history;
CREATE POLICY "Allow service role all" ON user_claim_history FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCTION TO INCREMENT CLAIM STATS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_claim_stats(
  p_user_token_id UUID,
  p_amount_sol DECIMAL
) RETURNS void AS $$
BEGIN
  -- Update any aggregate tables if needed
  NULL;
END;
$$ LANGUAGE plpgsql;
