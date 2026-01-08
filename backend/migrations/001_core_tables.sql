-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 001: CORE TABLES
-- Base tables for single-token flywheel operation
-- Run this FIRST in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFIG TABLE
-- Stores flywheel configuration (single-token mode)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS config (
  id TEXT PRIMARY KEY DEFAULT 'main',

  -- Token configuration
  token_mint_address TEXT,
  token_symbol TEXT DEFAULT 'TOKEN',
  token_decimals INTEGER DEFAULT 9,

  -- Flywheel settings
  flywheel_active BOOLEAN DEFAULT false,
  market_making_enabled BOOLEAN DEFAULT false,
  fee_collection_enabled BOOLEAN DEFAULT true,

  -- Wallet configuration
  ops_wallet_address TEXT,

  -- Fee settings
  fee_threshold_sol DECIMAL DEFAULT 0.1,
  fee_percentage DECIMAL DEFAULT 100,

  -- Trading parameters
  min_buy_amount_sol DECIMAL DEFAULT 0.01,
  max_buy_amount_sol DECIMAL DEFAULT 0.1,
  buy_interval_minutes INTEGER DEFAULT 5,
  slippage_bps INTEGER DEFAULT 300,

  -- Algorithm settings
  algorithm_mode TEXT DEFAULT 'simple',
  target_sol_allocation DECIMAL DEFAULT 50,
  target_token_allocation DECIMAL DEFAULT 50,
  rebalance_threshold DECIMAL DEFAULT 10,
  use_twap BOOLEAN DEFAULT false,
  twap_threshold_usd DECIMAL DEFAULT 100,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config if not exists
INSERT INTO config (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- FLYWHEEL STATE TABLE
-- Tracks current flywheel cycle state (single-token mode)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS flywheel_state (
  id TEXT PRIMARY KEY DEFAULT 'main',

  -- Cycle tracking
  cycle_phase TEXT DEFAULT 'buy',
  buy_count INTEGER DEFAULT 0,
  sell_count INTEGER DEFAULT 0,

  -- Sell phase tracking
  sell_phase_token_snapshot DECIMAL DEFAULT 0,
  sell_amount_per_tx DECIMAL DEFAULT 0,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default state if not exists
INSERT INTO flywheel_state (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRANSACTIONS TABLE
-- Records all flywheel transactions (single-token mode)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Transaction details
  type TEXT NOT NULL, -- 'buy', 'sell', 'fee_transfer', 'claim'
  amount DECIMAL NOT NULL,
  token TEXT,
  signature TEXT,

  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'success', 'failed'
  message TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- WALLET BALANCES TABLE
-- Caches wallet balances (single-token mode)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_balances (
  id TEXT PRIMARY KEY,

  -- Balances
  sol_balance DECIMAL DEFAULT 0,
  token_balance DECIMAL DEFAULT 0,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- FEE STATS TABLE
-- Tracks fee collection statistics (single-token mode)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fee_stats (
  id TEXT PRIMARY KEY DEFAULT 'main',

  -- Totals
  total_collected_sol DECIMAL DEFAULT 0,
  total_collected_usd DECIMAL DEFAULT 0,
  collection_count INTEGER DEFAULT 0,

  -- Last collection
  last_collection_at TIMESTAMPTZ,
  last_collection_amount DECIMAL DEFAULT 0,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default stats if not exists
INSERT INTO fee_stats (id) VALUES ('main') ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE config ENABLE ROW LEVEL SECURITY;
ALTER TABLE flywheel_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_stats ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "Allow service role all" ON config;
CREATE POLICY "Allow service role all" ON config FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON flywheel_state;
CREATE POLICY "Allow service role all" ON flywheel_state FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON transactions;
CREATE POLICY "Allow service role all" ON transactions FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON wallet_balances;
CREATE POLICY "Allow service role all" ON wallet_balances FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON fee_stats;
CREATE POLICY "Allow service role all" ON fee_stats FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE REALTIME
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE config;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE flywheel_state;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
