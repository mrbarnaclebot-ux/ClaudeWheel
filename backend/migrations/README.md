# Database Migrations

This folder contains SQL migrations for the ClaudeWheel platform database (Supabase/PostgreSQL).

## Migration Order

Run these migrations **in order** in your Supabase SQL Editor:

| # | File | Description |
|---|------|-------------|
| 1 | `001_core_tables.sql` | Core tables for single-token flywheel (config, state, transactions) |
| 2 | `002_multi_user_tables.sql` | Multi-user platform tables (users, tokens, claims, launches) |
| 3 | `003_user_wallet_balances.sql` | Wallet balance caching and history |

## Fresh Install

For a fresh database, run all three migrations in order. Each migration includes:
- Table creation with proper constraints
- Indexes for performance
- Row Level Security (RLS) policies
- Realtime subscriptions where applicable

## Re-running Migrations

Each migration includes `DROP TABLE IF EXISTS ... CASCADE` statements at the top. This means:
- **Running a migration will DELETE existing data** in those tables
- Comment out the DROP statements if you want to preserve data
- For schema changes on existing data, use ALTER TABLE statements instead

## Tables Overview

### Core Tables (001)
- `config` - Flywheel configuration settings
- `flywheel_state` - Current flywheel cycle state
- `transactions` - Transaction history
- `wallet_balances` - Cached wallet balances
- `fee_stats` - Fee collection statistics

### Multi-User Tables (002)
- `users` - Platform users (wallet-based auth)
- `telegram_users` - Telegram bot users
- `user_tokens` - User-registered tokens
- `user_token_config` - Per-token flywheel config
- `user_flywheel_state` - Per-token cycle state
- `user_claim_history` - Fee claim records
- `user_transactions` - Per-user transaction history
- `pending_token_launches` - Telegram token launch workflow
- `audit_log` - Platform audit trail

### Balance Tables (003)
- `user_wallet_balances` - Cached dev/ops wallet balances per token
- `user_wallet_balance_history` - Historical balance snapshots

## Supabase Configuration

Make sure you're using the **service role key** (not anon key) in your backend `.env`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

The service role bypasses RLS policies, which is required for backend operations.
