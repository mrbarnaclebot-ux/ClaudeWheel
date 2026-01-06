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
