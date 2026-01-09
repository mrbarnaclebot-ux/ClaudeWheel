-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: PRIVY TRANSACTIONS AND CLAIM HISTORY
-- Adds missing tables for tracking Privy token transactions and fee claims
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVY TRANSACTIONS TABLE
-- Records all buy/sell/transfer transactions for Privy tokens
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS privy_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    privy_token_id UUID NOT NULL REFERENCES privy_user_tokens(id) ON DELETE CASCADE,

    -- Transaction details
    type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'transfer', 'claim')),
    amount DECIMAL(30, 9) NOT NULL,           -- Amount in native units (SOL for buy, tokens for sell)
    amount_usd DECIMAL(20, 2),                -- USD value at time of transaction
    message TEXT,                              -- Human-readable message

    -- Blockchain info
    signature TEXT UNIQUE,                    -- Solana transaction signature
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),

    -- Trade details (for buy/sell)
    input_mint TEXT,                          -- Input token mint
    output_mint TEXT,                         -- Output token mint
    input_amount DECIMAL(30, 9),              -- Amount spent
    output_amount DECIMAL(30, 9),             -- Amount received
    price_per_token DECIMAL(30, 15),          -- Price at execution
    slippage_bps INTEGER,                     -- Actual slippage

    -- Route info
    trading_route TEXT CHECK (trading_route IN ('bags', 'jupiter', 'auto')),

    -- Error tracking
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRIVY CLAIM HISTORY TABLE
-- Records all fee claims for Privy tokens with platform fee tracking
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS privy_claim_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    privy_token_id UUID NOT NULL REFERENCES privy_user_tokens(id) ON DELETE CASCADE,

    -- Claim amounts (support both column names for compatibility)
    amount_sol DECIMAL(20, 9),                     -- Total fees claimed (alias: total_amount_sol)
    total_amount_sol DECIMAL(20, 9),               -- Total fees claimed
    amount_usd DECIMAL(20, 2),                     -- USD value at time of claim
    platform_fee_sol DECIMAL(20, 9) NOT NULL,      -- 10% platform fee
    user_received_sol DECIMAL(20, 9) NOT NULL,     -- 90% to user ops wallet

    -- Transaction signatures (support both column names for compatibility)
    transaction_signature TEXT,                    -- Bags.fm claim tx signature (alias: claim_signature)
    claim_signature TEXT,                          -- Bags.fm claim tx signature
    transfer_signature TEXT,                       -- Platform fee transfer tx signature

    -- Status
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,                        -- When claim was executed
    completed_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════════
-- ADD MISSING COLUMNS TO PRIVY_FLYWHEEL_STATE
-- ═══════════════════════════════════════════════════════════════════════════

-- Add last_checked_at if not exists (tracks when token was last checked for trading)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'privy_flywheel_state' AND column_name = 'last_checked_at'
    ) THEN
        ALTER TABLE privy_flywheel_state ADD COLUMN last_checked_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add last_check_result if not exists (tracks result of last check)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'privy_flywheel_state' AND column_name = 'last_check_result'
    ) THEN
        ALTER TABLE privy_flywheel_state ADD COLUMN last_check_result TEXT;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════════

-- Privy transactions indexes
CREATE INDEX IF NOT EXISTS idx_privy_tx_token ON privy_transactions(privy_token_id);
CREATE INDEX IF NOT EXISTS idx_privy_tx_type ON privy_transactions(type);
CREATE INDEX IF NOT EXISTS idx_privy_tx_status ON privy_transactions(status);
CREATE INDEX IF NOT EXISTS idx_privy_tx_created ON privy_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_privy_tx_signature ON privy_transactions(signature) WHERE signature IS NOT NULL;

-- Privy claim history indexes
CREATE INDEX IF NOT EXISTS idx_privy_claims_token ON privy_claim_history(privy_token_id);
CREATE INDEX IF NOT EXISTS idx_privy_claims_status ON privy_claim_history(status);
CREATE INDEX IF NOT EXISTS idx_privy_claims_created ON privy_claim_history(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE privy_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE privy_claim_history ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- Service role (backend) has full access
-- ═══════════════════════════════════════════════════════════════════════════

CREATE POLICY "Service role full access" ON privy_transactions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON privy_claim_history FOR ALL USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- ENABLE REALTIME FOR LIVE UPDATES
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE privy_transactions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE privy_claim_history;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS FOR DOCUMENTATION
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE privy_transactions IS 'All trading transactions for Privy tokens (buys, sells, transfers)';
COMMENT ON TABLE privy_claim_history IS 'Fee claim history with platform fee tracking (10% platform, 90% user)';

COMMENT ON COLUMN privy_transactions.amount IS 'Transaction amount in native units (SOL for buys, tokens for sells)';
COMMENT ON COLUMN privy_transactions.trading_route IS 'Route used: bags (pre-graduation), jupiter (post-graduation), auto';
COMMENT ON COLUMN privy_claim_history.platform_fee_sol IS '10% platform fee sent to WHEEL ops wallet';
COMMENT ON COLUMN privy_claim_history.user_received_sol IS '90% of claimed fees sent to user ops wallet';
