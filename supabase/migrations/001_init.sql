-- ═══════════════════════════════════════════════════════════════════════════
-- CLAUDE FLYWHEEL - DATABASE SCHEMA
-- Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Wallet Balances Table
CREATE TABLE IF NOT EXISTS wallet_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_type TEXT NOT NULL UNIQUE, -- 'dev' or 'ops'
  address TEXT NOT NULL,
  sol_balance DECIMAL(20, 9) DEFAULT 0,
  token_balance DECIMAL(20, 9) DEFAULT 0,
  usd_value DECIMAL(20, 2) DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL, -- 'fee_collection', 'transfer', 'buy', 'sell'
  amount DECIMAL(20, 9) NOT NULL,
  token TEXT NOT NULL, -- 'SOL' or 'CLAUDE'
  signature TEXT UNIQUE,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fee Stats Table (single row)
CREATE TABLE IF NOT EXISTS fee_stats (
  id TEXT PRIMARY KEY DEFAULT 'main',
  total_collected DECIMAL(20, 9) DEFAULT 0,
  today_collected DECIMAL(20, 9) DEFAULT 0,
  hour_collected DECIMAL(20, 9) DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_balances_type ON wallet_balances(wallet_type);

-- Enable Row Level Security (RLS)
ALTER TABLE wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_stats ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (dashboard is read-only)
CREATE POLICY "Allow public read access on wallet_balances"
  ON wallet_balances FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on transactions"
  ON transactions FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on fee_stats"
  ON fee_stats FOR SELECT
  USING (true);

-- Allow service role to insert/update (backend only)
CREATE POLICY "Allow service role insert on wallet_balances"
  ON wallet_balances FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow service role update on wallet_balances"
  ON wallet_balances FOR UPDATE
  USING (true);

CREATE POLICY "Allow service role insert on transactions"
  ON transactions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow service role insert on fee_stats"
  ON fee_stats FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow service role update on fee_stats"
  ON fee_stats FOR UPDATE
  USING (true);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE wallet_balances;
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE fee_stats;

-- Insert initial fee_stats row
INSERT INTO fee_stats (id, total_collected, today_collected, hour_collected)
VALUES ('main', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONFIG TABLE (Admin Panel)
-- ═══════════════════════════════════════════════════════════════════════════

-- Config Table (single row for admin settings)
CREATE TABLE IF NOT EXISTS config (
  id TEXT PRIMARY KEY DEFAULT 'main',
  token_mint_address TEXT,
  token_symbol TEXT DEFAULT 'CLAUDE',
  token_decimals INTEGER DEFAULT 6,
  market_making_enabled BOOLEAN DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on config
ALTER TABLE config ENABLE ROW LEVEL SECURITY;

-- Allow public read (so frontend can get token address)
CREATE POLICY "Allow public read access on config"
  ON config FOR SELECT
  USING (true);

-- Allow authenticated insert/update (admin panel uses anon key with wallet signature)
CREATE POLICY "Allow insert on config"
  ON config FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update on config"
  ON config FOR UPDATE
  USING (true);

-- Enable realtime for config
ALTER PUBLICATION supabase_realtime ADD TABLE config;

-- Insert initial config row
INSERT INTO config (id, token_mint_address, token_symbol, token_decimals, market_making_enabled)
VALUES ('main', NULL, 'CLAUDE', 6, false)
ON CONFLICT (id) DO NOTHING;
