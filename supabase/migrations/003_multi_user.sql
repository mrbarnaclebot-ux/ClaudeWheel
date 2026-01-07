-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 003: MULTI-USER SUPPORT
-- Adds tables for multi-user token market-making platform
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- USERS TABLE
-- Wallet-based authentication (wallet address is primary identifier)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL UNIQUE,
  display_name TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- USER TOKENS TABLE
-- Stores registered tokens with encrypted dev wallet private keys
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Token info
  token_mint_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_name TEXT,
  token_image TEXT,
  token_decimals INTEGER DEFAULT 6,

  -- Dev wallet (encrypted private key)
  dev_wallet_address TEXT NOT NULL,
  dev_wallet_private_key_encrypted TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  encryption_auth_tag TEXT NOT NULL,

  -- Ops wallet (receives claimed fees, executes trades)
  ops_wallet_address TEXT NOT NULL,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_graduated BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, token_mint_address)
);

CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tokens_token_mint ON user_tokens(token_mint_address);
CREATE INDEX IF NOT EXISTS idx_user_tokens_active ON user_tokens(is_active) WHERE is_active = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- USER TOKEN CONFIG TABLE
-- Per-user market making configuration (mirrors global config structure)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_token_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE UNIQUE,

  -- Automation toggles
  flywheel_active BOOLEAN DEFAULT false,
  market_making_enabled BOOLEAN DEFAULT false,
  auto_claim_enabled BOOLEAN DEFAULT true,

  -- Fee collection settings
  fee_threshold_sol DECIMAL(20, 9) DEFAULT 0.01,

  -- Market making settings
  min_buy_amount_sol DECIMAL(20, 9) DEFAULT 0.01,
  max_buy_amount_sol DECIMAL(20, 9) DEFAULT 0.1,
  max_sell_amount_tokens DECIMAL(30, 9) DEFAULT 1000000,
  buy_interval_minutes INTEGER DEFAULT 5,
  slippage_bps INTEGER DEFAULT 300,

  -- Algorithm settings
  algorithm_mode TEXT DEFAULT 'simple' CHECK (algorithm_mode IN ('simple', 'smart', 'rebalance')),
  target_sol_allocation INTEGER DEFAULT 30 CHECK (target_sol_allocation >= 0 AND target_sol_allocation <= 100),
  target_token_allocation INTEGER DEFAULT 70 CHECK (target_token_allocation >= 0 AND target_token_allocation <= 100),
  rebalance_threshold INTEGER DEFAULT 10 CHECK (rebalance_threshold >= 1 AND rebalance_threshold <= 50),
  use_twap BOOLEAN DEFAULT true,
  twap_threshold_usd DECIMAL(20, 2) DEFAULT 50,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_token_config_user_token_id ON user_token_config(user_token_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER FLYWHEEL STATE TABLE
-- Per-user algorithm state for recovery after restarts
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_flywheel_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE UNIQUE,

  cycle_phase TEXT DEFAULT 'buy' CHECK (cycle_phase IN ('buy', 'sell')),
  buy_count INTEGER DEFAULT 0,
  sell_count INTEGER DEFAULT 0,
  sell_phase_token_snapshot DECIMAL(30, 9) DEFAULT 0,
  sell_amount_per_tx DECIMAL(30, 9) DEFAULT 0,
  last_trade_at TIMESTAMPTZ,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_flywheel_state_user_token_id ON user_flywheel_state(user_token_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER WALLET BALANCES TABLE
-- Tracks dev and ops wallet balances per user token
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_wallet_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('dev', 'ops')),
  address TEXT NOT NULL,
  sol_balance DECIMAL(20, 9) DEFAULT 0,
  token_balance DECIMAL(30, 9) DEFAULT 0,
  usd_value DECIMAL(20, 2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_token_id, wallet_type)
);

CREATE INDEX IF NOT EXISTS idx_user_wallet_balances_user_token_id ON user_wallet_balances(user_token_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER TRANSACTIONS TABLE
-- Trade history per user token
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('fee_claim', 'transfer', 'buy', 'sell')),
  amount DECIMAL(30, 9) NOT NULL,
  amount_usd DECIMAL(20, 2),
  token TEXT NOT NULL,
  from_address TEXT,
  to_address TEXT,
  signature TEXT UNIQUE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_transactions_user_token_id ON user_transactions(user_token_id);
CREATE INDEX IF NOT EXISTS idx_user_transactions_created_at ON user_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_transactions_type ON user_transactions(type);
CREATE INDEX IF NOT EXISTS idx_user_transactions_status ON user_transactions(status);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER CLAIM HISTORY TABLE
-- Tracks fee claiming operations
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_claim_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE,

  -- Claim amounts
  claimed_amount_sol DECIMAL(20, 9) NOT NULL DEFAULT 0,
  claimed_amount_usd DECIMAL(20, 2),

  -- Transaction signatures
  claim_signature TEXT,
  transfer_signature TEXT,

  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'claiming', 'claimed', 'transferring', 'completed', 'failed')),
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_claim_history_user_token_id ON user_claim_history(user_token_id);
CREATE INDEX IF NOT EXISTS idx_user_claim_history_created_at ON user_claim_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_claim_history_status ON user_claim_history(status);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER FEE STATS TABLE
-- Aggregated fee statistics per user token
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_fee_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE UNIQUE,

  total_claimed_sol DECIMAL(20, 9) DEFAULT 0,
  total_claimed_usd DECIMAL(20, 2) DEFAULT 0,
  total_claims_count INTEGER DEFAULT 0,
  last_claim_at TIMESTAMPTZ,

  -- Lifetime fees from Bags.fm
  lifetime_fees_sol DECIMAL(20, 9) DEFAULT 0,
  lifetime_fees_usd DECIMAL(20, 2) DEFAULT 0,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_fee_stats_user_token_id ON user_fee_stats(user_token_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_token_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flywheel_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_claim_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_fee_stats ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- Users can only read their own data
-- Service role (backend) can read/write all data
-- ═══════════════════════════════════════════════════════════════════════════

-- Users table: Public read for user lookup, service role write
CREATE POLICY "Users: public read" ON users FOR SELECT USING (true);
CREATE POLICY "Users: service role insert" ON users FOR INSERT WITH CHECK (true);
CREATE POLICY "Users: service role update" ON users FOR UPDATE USING (true);
CREATE POLICY "Users: service role delete" ON users FOR DELETE USING (true);

-- User tokens: Owner read, service role all
CREATE POLICY "User tokens: service role all" ON user_tokens FOR ALL USING (true);

-- User token config: Owner read, service role all
CREATE POLICY "User token config: service role all" ON user_token_config FOR ALL USING (true);

-- User flywheel state: Service role all
CREATE POLICY "User flywheel state: service role all" ON user_flywheel_state FOR ALL USING (true);

-- User wallet balances: Service role all
CREATE POLICY "User wallet balances: service role all" ON user_wallet_balances FOR ALL USING (true);

-- User transactions: Service role all
CREATE POLICY "User transactions: service role all" ON user_transactions FOR ALL USING (true);

-- User claim history: Service role all
CREATE POLICY "User claim history: service role all" ON user_claim_history FOR ALL USING (true);

-- User fee stats: Service role all
CREATE POLICY "User fee stats: service role all" ON user_fee_stats FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE REALTIME FOR LIVE UPDATES
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE users;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_tokens;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_token_config;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_wallet_balances;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_transactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_claim_history;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE user_fee_stats;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTION: Update updated_at timestamp
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_tokens_updated_at BEFORE UPDATE ON user_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_token_config_updated_at BEFORE UPDATE ON user_token_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_flywheel_state_updated_at BEFORE UPDATE ON user_flywheel_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_wallet_balances_updated_at BEFORE UPDATE ON user_wallet_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_fee_stats_updated_at BEFORE UPDATE ON user_fee_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
