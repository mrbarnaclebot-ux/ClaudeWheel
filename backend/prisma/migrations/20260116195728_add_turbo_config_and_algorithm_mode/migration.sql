-- AlterTable
ALTER TABLE "privy_token_config"
ADD COLUMN "algorithm_mode" TEXT,
ADD COLUMN "turbo_job_interval_seconds" INTEGER DEFAULT 15,
ADD COLUMN "turbo_cycle_size_buys" INTEGER DEFAULT 8,
ADD COLUMN "turbo_cycle_size_sells" INTEGER DEFAULT 8,
ADD COLUMN "turbo_inter_token_delay_ms" INTEGER DEFAULT 200,
ADD COLUMN "turbo_global_rate_limit" INTEGER DEFAULT 60,
ADD COLUMN "turbo_confirmation_timeout" INTEGER DEFAULT 45,
ADD COLUMN "turbo_batch_state_updates" BOOLEAN DEFAULT true;
