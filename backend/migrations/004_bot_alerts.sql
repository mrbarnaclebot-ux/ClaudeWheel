-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 004: BOT ALERTS TABLES
-- Tables for user alert subscriptions and bot maintenance mode
-- Run this AFTER 003_user_wallet_balances.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TELEGRAM ALERT SUBSCRIBERS TABLE
-- Users who subscribe to downtime/maintenance alerts
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS telegram_alert_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Telegram identity (not linked to telegram_users since they can subscribe without launching)
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,

  -- Subscription status
  is_active BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_alert_subscribers_telegram_id ON telegram_alert_subscribers(telegram_id);
CREATE INDEX IF NOT EXISTS idx_alert_subscribers_active ON telegram_alert_subscribers(is_active);

-- ═══════════════════════════════════════════════════════════════════════════
-- BOT STATUS TABLE
-- Stores the current bot status (maintenance mode, etc.)
-- This is a singleton table - only one row with id='main'
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bot_status (
  id TEXT PRIMARY KEY DEFAULT 'main',

  -- Maintenance mode
  is_maintenance_mode BOOLEAN DEFAULT false,
  maintenance_reason TEXT,
  maintenance_started_at TIMESTAMPTZ,
  estimated_end_time TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO bot_status (id, is_maintenance_mode)
VALUES ('main', false)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- ADD BROADCAST EVENT TYPES TO AUDIT LOG
-- The audit_log table already exists, just documenting new event types:
-- - broadcast_maintenance_start
-- - broadcast_maintenance_end
-- - broadcast_announcement
-- ═══════════════════════════════════════════════════════════════════════════

-- No schema change needed for audit_log, just using new event_type values
