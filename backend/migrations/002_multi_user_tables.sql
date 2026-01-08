-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 002: MULTI-USER TABLES
-- Tables for multi-user platform operation
-- Run this AFTER 001_core_tables.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing tables if they exist (clean slate)
-- Comment these out if you want to preserve existing data
-- Order matters due to foreign key constraints (drop in reverse dependency order)
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS pending_token_launches CASCADE;
DROP TABLE IF EXISTS user_transactions CASCADE;
DROP TABLE IF EXISTS user_claim_history CASCADE;
DROP TABLE IF EXISTS user_flywheel_state CASCADE;
DROP TABLE IF EXISTS user_token_config CASCADE;
DROP TABLE IF EXISTS user_tokens CASCADE;
DROP TABLE IF EXISTS telegram_users CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- USERS TABLE
-- Platform users (wallet-based authentication)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  wallet_address TEXT UNIQUE NOT NULL,
  display_name TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- TELEGRAM USERS TABLE
-- Telegram bot users (linked to platform users)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS telegram_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Telegram identity
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,

  -- Link to platform user (optional)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER TOKENS TABLE
-- Tokens registered by users for flywheel automation
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Token info
  token_mint_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_name TEXT,
  token_image TEXT,
  token_decimals INTEGER DEFAULT 9,

  -- Wallet addresses (public keys)
  dev_wallet_address TEXT NOT NULL,
  ops_wallet_address TEXT NOT NULL,

  -- Encrypted private keys (AES-256-GCM)
  dev_wallet_private_key_encrypted TEXT NOT NULL,
  dev_encryption_iv TEXT NOT NULL,
  dev_encryption_auth_tag TEXT NOT NULL,
  ops_wallet_private_key_encrypted TEXT NOT NULL,
  ops_encryption_iv TEXT NOT NULL,
  ops_encryption_auth_tag TEXT NOT NULL,

  -- Status flags
  is_active BOOLEAN DEFAULT true,
  is_graduated BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  is_suspended BOOLEAN DEFAULT false,
  suspend_reason TEXT,

  -- Risk management
  risk_level TEXT DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high')),
  daily_trade_limit_sol DECIMAL DEFAULT 10,
  max_position_size_sol DECIMAL DEFAULT 5,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(user_id, token_mint_address)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER TOKEN CONFIG TABLE
-- Per-token flywheel configuration
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_token_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE,

  -- Flywheel settings
  flywheel_active BOOLEAN DEFAULT false,
  market_making_enabled BOOLEAN DEFAULT false,
  auto_claim_enabled BOOLEAN DEFAULT true,

  -- Fee settings
  fee_threshold_sol DECIMAL DEFAULT 0.1,

  -- Trading parameters
  min_buy_amount_sol DECIMAL DEFAULT 0.01,
  max_buy_amount_sol DECIMAL DEFAULT 0.1,
  max_sell_amount_tokens DECIMAL DEFAULT 1000000,
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
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_token_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER FLYWHEEL STATE TABLE
-- Per-token flywheel cycle state
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_flywheel_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE,

  -- Cycle tracking
  cycle_phase TEXT DEFAULT 'buy',
  buy_count INTEGER DEFAULT 0,
  sell_count INTEGER DEFAULT 0,

  -- Sell phase tracking
  sell_phase_token_snapshot DECIMAL DEFAULT 0,
  sell_amount_per_tx DECIMAL DEFAULT 0,

  -- Last activity
  last_trade_at TIMESTAMPTZ,

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_token_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER CLAIM HISTORY TABLE
-- Records all fee claims for users
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_claim_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE,

  -- Claim amounts
  amount_sol DECIMAL NOT NULL,
  amount_usd DECIMAL DEFAULT 0,

  -- Fee split
  platform_fee_sol DECIMAL DEFAULT 0,
  user_received_sol DECIMAL DEFAULT 0,

  -- Transaction
  transaction_signature TEXT,
  platform_fee_signature TEXT,

  -- Timing
  claimed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- USER TRANSACTIONS TABLE
-- Records all trading transactions for users
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_token_id UUID NOT NULL REFERENCES user_tokens(id) ON DELETE CASCADE,

  -- Transaction details
  type TEXT NOT NULL, -- 'buy', 'sell', 'claim', 'transfer'
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
-- PENDING TOKEN LAUNCHES TABLE
-- Telegram token launch workflow state
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pending_token_launches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,

  -- Token info
  token_name TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  token_description TEXT,
  token_image_url TEXT,

  -- Dev wallet (for receiving deposits and launching)
  dev_wallet_address TEXT NOT NULL,
  dev_wallet_private_key_encrypted TEXT NOT NULL,
  dev_encryption_iv TEXT NOT NULL,
  dev_encryption_auth_tag TEXT NOT NULL,

  -- Ops wallet (for trading after launch)
  ops_wallet_address TEXT NOT NULL,
  ops_wallet_private_key_encrypted TEXT NOT NULL,
  ops_encryption_iv TEXT NOT NULL,
  ops_encryption_auth_tag TEXT NOT NULL,

  -- Launch status
  status TEXT DEFAULT 'awaiting_deposit', -- 'awaiting_deposit', 'launching', 'completed', 'failed', 'expired', 'refunded'
  deposit_received_sol DECIMAL DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,

  -- Result
  token_mint_address TEXT,
  user_token_id UUID REFERENCES user_tokens(id) ON DELETE SET NULL,

  -- Timing
  expires_at TIMESTAMPTZ NOT NULL,
  launched_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT LOG TABLE
-- Platform-wide audit trail
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event type
  event_type TEXT NOT NULL, -- 'launch_started', 'deposit_received', 'launch_completed', 'launch_failed', 'refund_issued', etc.

  -- Related entities (optional)
  pending_launch_id UUID REFERENCES pending_token_launches(id) ON DELETE SET NULL,
  user_token_id UUID REFERENCES user_tokens(id) ON DELETE SET NULL,
  telegram_id BIGINT,

  -- Event details
  details JSONB,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

-- Users
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

-- Telegram users
CREATE INDEX IF NOT EXISTS idx_telegram_users_telegram_id ON telegram_users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_telegram_users_user_id ON telegram_users(user_id);

-- User tokens
CREATE INDEX IF NOT EXISTS idx_user_tokens_user ON user_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tokens_mint ON user_tokens(token_mint_address);
CREATE INDEX IF NOT EXISTS idx_user_tokens_active ON user_tokens(is_active);
CREATE INDEX IF NOT EXISTS idx_user_tokens_suspended ON user_tokens(is_suspended);
CREATE INDEX IF NOT EXISTS idx_user_tokens_dev_wallet ON user_tokens(dev_wallet_address);

-- User token config
CREATE INDEX IF NOT EXISTS idx_user_token_config_token ON user_token_config(user_token_id);
CREATE INDEX IF NOT EXISTS idx_user_token_config_active ON user_token_config(flywheel_active);

-- User flywheel state
CREATE INDEX IF NOT EXISTS idx_user_flywheel_state_token ON user_flywheel_state(user_token_id);

-- User claim history
CREATE INDEX IF NOT EXISTS idx_user_claim_history_token ON user_claim_history(user_token_id);
CREATE INDEX IF NOT EXISTS idx_user_claim_history_claimed ON user_claim_history(claimed_at DESC);

-- User transactions
CREATE INDEX IF NOT EXISTS idx_user_transactions_token ON user_transactions(user_token_id);
CREATE INDEX IF NOT EXISTS idx_user_transactions_type ON user_transactions(type);
CREATE INDEX IF NOT EXISTS idx_user_transactions_created ON user_transactions(created_at DESC);

-- Pending launches
CREATE INDEX IF NOT EXISTS idx_pending_launches_telegram ON pending_token_launches(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_pending_launches_status ON pending_token_launches(status);
CREATE INDEX IF NOT EXISTS idx_pending_launches_expires ON pending_token_launches(expires_at);
CREATE INDEX IF NOT EXISTS idx_pending_launches_dev_wallet ON pending_token_launches(dev_wallet_address);

-- Audit log
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_launch ON audit_log(pending_launch_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_token ON audit_log(user_token_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_token_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flywheel_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_claim_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_token_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
DROP POLICY IF EXISTS "Allow service role all" ON users;
CREATE POLICY "Allow service role all" ON users FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON telegram_users;
CREATE POLICY "Allow service role all" ON telegram_users FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON user_tokens;
CREATE POLICY "Allow service role all" ON user_tokens FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON user_token_config;
CREATE POLICY "Allow service role all" ON user_token_config FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON user_flywheel_state;
CREATE POLICY "Allow service role all" ON user_flywheel_state FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON user_claim_history;
CREATE POLICY "Allow service role all" ON user_claim_history FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON user_transactions;
CREATE POLICY "Allow service role all" ON user_transactions FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON pending_token_launches;
CREATE POLICY "Allow service role all" ON pending_token_launches FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow service role all" ON audit_log;
CREATE POLICY "Allow service role all" ON audit_log FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE REALTIME
-- ═══════════════════════════════════════════════════════════════════════════

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
  ALTER PUBLICATION supabase_realtime ADD TABLE user_flywheel_state;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE pending_token_launches;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
