-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: PRIVY INTEGRATION
-- Adds tables for Privy authentication and embedded wallet management
-- Replaces encrypted private key storage with Privy delegated signing
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVY USERS TABLE
-- Store Privy user mappings with multiple authentication methods
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS privy_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    privy_user_id TEXT NOT NULL UNIQUE,  -- Privy's user ID (did:privy:xxx)

    -- Link methods (at least one required)
    telegram_id BIGINT UNIQUE,           -- Telegram user ID
    email TEXT UNIQUE,                   -- Email (for web users)
    wallet_address TEXT UNIQUE,          -- External wallet link (if any)

    -- User metadata
    telegram_username TEXT,
    display_name TEXT,

    -- Delegation status
    wallets_delegated BOOLEAN DEFAULT false,  -- True if user has delegated wallet signing

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVY WALLETS TABLE
-- Store Privy embedded wallet addresses (no private keys!)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS privy_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    privy_user_id TEXT NOT NULL REFERENCES privy_users(privy_user_id) ON DELETE CASCADE,

    -- Wallet info
    wallet_type TEXT NOT NULL CHECK (wallet_type IN ('dev', 'ops')),
    wallet_address TEXT NOT NULL UNIQUE,
    privy_wallet_id TEXT NOT NULL,       -- Privy's wallet ID

    -- Chain info
    chain_type TEXT DEFAULT 'solana',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(privy_user_id, wallet_type)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVY USER TOKENS TABLE
-- Link tokens to Privy wallets (replaces encrypted key storage)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS privy_user_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    privy_user_id TEXT NOT NULL REFERENCES privy_users(privy_user_id) ON DELETE CASCADE,

    -- Token info
    token_mint_address TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    token_name TEXT,
    token_image TEXT,
    token_decimals INTEGER DEFAULT 6,

    -- Wallet references (no private keys stored!)
    dev_wallet_id UUID NOT NULL REFERENCES privy_wallets(id),
    ops_wallet_id UUID NOT NULL REFERENCES privy_wallets(id),

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_graduated BOOLEAN DEFAULT false,
    launched_via_telegram BOOLEAN DEFAULT false,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(privy_user_id, token_mint_address)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVY PENDING LAUNCHES TABLE
-- Pending token launches for Telegram (references Privy wallets)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS privy_pending_launches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    privy_user_id TEXT NOT NULL REFERENCES privy_users(privy_user_id),

    -- Token metadata
    token_name TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    token_description TEXT,
    token_image_url TEXT,
    twitter_url TEXT,
    telegram_url TEXT,
    website_url TEXT,
    discord_url TEXT,

    -- Wallet references
    dev_wallet_id UUID NOT NULL REFERENCES privy_wallets(id),
    ops_wallet_id UUID NOT NULL REFERENCES privy_wallets(id),

    -- Launch status
    status TEXT DEFAULT 'awaiting_deposit' CHECK (status IN (
        'awaiting_deposit', 'launching', 'completed', 'failed', 'expired', 'refunded'
    )),

    -- Deposit tracking
    deposit_address TEXT NOT NULL,       -- Dev wallet address for deposits
    min_deposit_sol DECIMAL(20, 9) DEFAULT 0.5,

    -- Timing
    expires_at TIMESTAMPTZ NOT NULL,
    launched_at TIMESTAMPTZ,

    -- Retry tracking
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,

    -- Result
    token_mint_address TEXT,             -- Set after successful launch

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVY TOKEN CONFIG TABLE
-- Per-token market making configuration for Privy tokens
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS privy_token_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    privy_token_id UUID NOT NULL REFERENCES privy_user_tokens(id) ON DELETE CASCADE UNIQUE,

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

    -- Trading route preference
    trading_route TEXT DEFAULT 'auto' CHECK (trading_route IN ('bags', 'jupiter', 'auto')),

    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVY FLYWHEEL STATE TABLE
-- Per-token algorithm state for recovery after restarts
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS privy_flywheel_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    privy_token_id UUID NOT NULL REFERENCES privy_user_tokens(id) ON DELETE CASCADE UNIQUE,

    -- Cycle tracking
    cycle_phase TEXT DEFAULT 'buy' CHECK (cycle_phase IN ('buy', 'sell')),
    buy_count INTEGER DEFAULT 0,
    sell_count INTEGER DEFAULT 0,
    sell_phase_token_snapshot DECIMAL(30, 9) DEFAULT 0,
    sell_amount_per_tx DECIMAL(30, 9) DEFAULT 0,
    last_trade_at TIMESTAMPTZ,

    -- Failure tracking
    consecutive_failures INTEGER DEFAULT 0,
    last_failure_reason TEXT,
    last_failure_at TIMESTAMPTZ,
    paused_until TIMESTAMPTZ,
    total_failures INTEGER DEFAULT 0,

    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════

-- Privy users indexes
CREATE INDEX IF NOT EXISTS idx_privy_users_telegram ON privy_users(telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_privy_users_email ON privy_users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_privy_users_wallet ON privy_users(wallet_address) WHERE wallet_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_privy_users_active ON privy_users(is_active) WHERE is_active = true;

-- Privy wallets indexes
CREATE INDEX IF NOT EXISTS idx_privy_wallets_address ON privy_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_privy_wallets_user ON privy_wallets(privy_user_id);

-- Privy user tokens indexes
CREATE INDEX IF NOT EXISTS idx_privy_tokens_mint ON privy_user_tokens(token_mint_address);
CREATE INDEX IF NOT EXISTS idx_privy_tokens_user ON privy_user_tokens(privy_user_id);
CREATE INDEX IF NOT EXISTS idx_privy_tokens_active ON privy_user_tokens(is_active) WHERE is_active = true;

-- Privy pending launches indexes
CREATE INDEX IF NOT EXISTS idx_privy_pending_status ON privy_pending_launches(status) WHERE status = 'awaiting_deposit';
CREATE INDEX IF NOT EXISTS idx_privy_pending_user ON privy_pending_launches(privy_user_id);
CREATE INDEX IF NOT EXISTS idx_privy_pending_expires ON privy_pending_launches(expires_at) WHERE status = 'awaiting_deposit';

-- Privy token config indexes
CREATE INDEX IF NOT EXISTS idx_privy_config_token ON privy_token_config(privy_token_id);
CREATE INDEX IF NOT EXISTS idx_privy_config_active ON privy_token_config(flywheel_active) WHERE flywheel_active = true;

-- Privy flywheel state indexes
CREATE INDEX IF NOT EXISTS idx_privy_flywheel_token ON privy_flywheel_state(privy_token_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE privy_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE privy_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE privy_user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE privy_pending_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE privy_token_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE privy_flywheel_state ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- Service role (backend) has full access
-- Frontend queries go through backend API
-- ═══════════════════════════════════════════════════════════════════════════

-- Privy users policies
CREATE POLICY "Service role full access" ON privy_users FOR ALL USING (true);

-- Privy wallets policies
CREATE POLICY "Service role full access" ON privy_wallets FOR ALL USING (true);

-- Privy user tokens policies
CREATE POLICY "Service role full access" ON privy_user_tokens FOR ALL USING (true);

-- Privy pending launches policies
CREATE POLICY "Service role full access" ON privy_pending_launches FOR ALL USING (true);

-- Privy token config policies
CREATE POLICY "Service role full access" ON privy_token_config FOR ALL USING (true);

-- Privy flywheel state policies
CREATE POLICY "Service role full access" ON privy_flywheel_state FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE REALTIME FOR LIVE UPDATES
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE privy_users;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE privy_wallets;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE privy_user_tokens;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE privy_pending_launches;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE privy_token_config;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE privy_flywheel_state;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- Reuses update_updated_at_column() function from 003_multi_user.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER update_privy_users_updated_at BEFORE UPDATE ON privy_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_privy_user_tokens_updated_at BEFORE UPDATE ON privy_user_tokens
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_privy_pending_launches_updated_at BEFORE UPDATE ON privy_pending_launches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_privy_token_config_updated_at BEFORE UPDATE ON privy_token_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_privy_flywheel_state_updated_at BEFORE UPDATE ON privy_flywheel_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE privy_users IS 'Privy authenticated users with multiple login methods (Telegram, email, wallet)';
COMMENT ON TABLE privy_wallets IS 'Privy embedded wallets - no private keys stored, signing delegated to Privy';
COMMENT ON TABLE privy_user_tokens IS 'User token registrations linked to Privy wallets';
COMMENT ON TABLE privy_pending_launches IS 'Pending token launches awaiting deposit confirmation';
COMMENT ON TABLE privy_token_config IS 'Per-token flywheel and market making configuration';
COMMENT ON TABLE privy_flywheel_state IS 'Flywheel algorithm state for cycle recovery';

COMMENT ON COLUMN privy_users.privy_user_id IS 'Privy DID format: did:privy:xxx';
COMMENT ON COLUMN privy_users.wallets_delegated IS 'True when user has delegated wallet signing to backend';
COMMENT ON COLUMN privy_wallets.privy_wallet_id IS 'Privy internal wallet identifier for signing API';
COMMENT ON COLUMN privy_wallets.wallet_type IS 'dev = token creator wallet, ops = trading operations wallet';
COMMENT ON COLUMN privy_user_tokens.is_graduated IS 'Token has graduated from Bags.fm bonding curve';
COMMENT ON COLUMN privy_user_tokens.launched_via_telegram IS 'Token was launched through Telegram Mini App';
COMMENT ON COLUMN privy_pending_launches.status IS 'awaiting_deposit -> launching -> completed/failed/expired/refunded';
COMMENT ON COLUMN privy_flywheel_state.cycle_phase IS 'Current phase: buy (5 buys) then sell (5 sells)';
COMMENT ON COLUMN privy_flywheel_state.paused_until IS 'Exponential backoff pause time after failures';
