-- Add Turbo Lite Rapid Execution State columns to privy_flywheel_state
-- These track progress through rapid batch buy/sell cycles

ALTER TABLE "privy_flywheel_state"
ADD COLUMN IF NOT EXISTS "rapid_buys_completed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "rapid_sells_completed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "tokens_bought_this_cycle" DECIMAL(30, 9) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "sol_spent_this_cycle" DECIMAL(20, 9) NOT NULL DEFAULT 0;
