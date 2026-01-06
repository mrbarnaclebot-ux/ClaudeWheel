-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY UPDATE: Restrict Config Table Writes
--
-- This migration removes the permissive INSERT/UPDATE policies on the config
-- table that allowed any client (including anonymous) to modify configuration.
--
-- After this migration:
-- - Public/anon users can READ config (for dashboard display)
-- - Only the service role (backend) can INSERT/UPDATE config
-- - Frontend admin panel must go through the backend API with wallet signature
-- ═══════════════════════════════════════════════════════════════════════════

-- Create config table if it doesn't exist (in case 001_init wasn't run)
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

-- Create public read policy if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'config' AND policyname = 'Allow public read access on config'
  ) THEN
    CREATE POLICY "Allow public read access on config"
      ON config FOR SELECT
      USING (true);
  END IF;
END $$;

-- Insert initial config row if not exists
INSERT INTO config (id, token_mint_address, token_symbol, token_decimals, market_making_enabled)
VALUES ('main', NULL, 'CLAUDE', 6, false)
ON CONFLICT (id) DO NOTHING;

-- Enable realtime for config if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'config'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE config;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Ignore if publication doesn't exist or table already added
  NULL;
END $$;

-- Drop the existing permissive INSERT/UPDATE policies
DROP POLICY IF EXISTS "Allow insert on config" ON config;
DROP POLICY IF EXISTS "Allow update on config" ON config;

-- Create new restrictive policies that only allow service role
-- Note: Service role bypasses RLS, so these policies only block anon/authenticated

-- Block all inserts from non-service roles
CREATE POLICY "Restrict insert on config to service role"
  ON config FOR INSERT
  WITH CHECK (false);

-- Block all updates from non-service roles
CREATE POLICY "Restrict update on config to service role"
  ON config FOR UPDATE
  USING (false);

-- Add new columns to config table if they don't exist
-- These support the new algorithm settings
DO $$
BEGIN
  -- Fee collection settings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='flywheel_active') THEN
    ALTER TABLE config ADD COLUMN flywheel_active BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='fee_collection_enabled') THEN
    ALTER TABLE config ADD COLUMN fee_collection_enabled BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='ops_wallet_address') THEN
    ALTER TABLE config ADD COLUMN ops_wallet_address TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='fee_threshold_sol') THEN
    ALTER TABLE config ADD COLUMN fee_threshold_sol DECIMAL(20, 9) DEFAULT 0.1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='fee_percentage') THEN
    ALTER TABLE config ADD COLUMN fee_percentage INTEGER DEFAULT 100;
  END IF;

  -- Market making settings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='min_buy_amount_sol') THEN
    ALTER TABLE config ADD COLUMN min_buy_amount_sol DECIMAL(20, 9) DEFAULT 0.01;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='max_buy_amount_sol') THEN
    ALTER TABLE config ADD COLUMN max_buy_amount_sol DECIMAL(20, 9) DEFAULT 0.1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='buy_interval_minutes') THEN
    ALTER TABLE config ADD COLUMN buy_interval_minutes INTEGER DEFAULT 60;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='slippage_bps') THEN
    ALTER TABLE config ADD COLUMN slippage_bps INTEGER DEFAULT 500;
  END IF;

  -- Algorithm settings
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='algorithm_mode') THEN
    ALTER TABLE config ADD COLUMN algorithm_mode TEXT DEFAULT 'simple';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='target_sol_allocation') THEN
    ALTER TABLE config ADD COLUMN target_sol_allocation INTEGER DEFAULT 30;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='target_token_allocation') THEN
    ALTER TABLE config ADD COLUMN target_token_allocation INTEGER DEFAULT 70;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='rebalance_threshold') THEN
    ALTER TABLE config ADD COLUMN rebalance_threshold INTEGER DEFAULT 10;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='use_twap') THEN
    ALTER TABLE config ADD COLUMN use_twap BOOLEAN DEFAULT true;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='config' AND column_name='twap_threshold_usd') THEN
    ALTER TABLE config ADD COLUMN twap_threshold_usd DECIMAL(20, 2) DEFAULT 50;
  END IF;
END $$;

-- Add comment explaining the security model
COMMENT ON TABLE config IS 'Flywheel configuration. Writes are restricted to service role (backend API). Frontend must use wallet signature verification to update via backend.';
