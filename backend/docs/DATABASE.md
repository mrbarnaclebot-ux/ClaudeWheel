# Database Schema Documentation

This document describes the complete database schema for the ClaudeWheel platform.

## Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          CORE TABLES (Single-Token)                     │
├─────────────────────────────────────────────────────────────────────────┤
│  config ──────── flywheel_state                                         │
│     │                                                                   │
│     └──────────── transactions                                          │
│                       │                                                 │
│  fee_stats ──────────┘                                                  │
│  wallet_balances                                                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          MULTI-USER TABLES                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  users ◄───────────── telegram_users                                    │
│    │                       │                                            │
│    ▼                       ▼                                            │
│  user_tokens ◄──── pending_token_launches                               │
│    │                       │                                            │
│    ├── user_token_config   │                                            │
│    ├── user_flywheel_state │                                            │
│    ├── user_claim_history  │                                            │
│    ├── user_transactions   │                                            │
│    └── user_wallet_balances│                                            │
│                            │                                            │
│  audit_log ◄───────────────┘                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Tables

### `config`
Stores global flywheel configuration for single-token mode.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (default: 'main') |
| `token_mint_address` | TEXT | Token mint address |
| `token_symbol` | TEXT | Token symbol |
| `flywheel_active` | BOOLEAN | Whether flywheel is active |
| `market_making_enabled` | BOOLEAN | Whether market making is enabled |
| `fee_threshold_sol` | DECIMAL | Minimum SOL to trigger fee collection |
| `algorithm_mode` | TEXT | 'simple' or 'rebalance' |
| `min_buy_amount_sol` | DECIMAL | Minimum buy amount |
| `max_buy_amount_sol` | DECIMAL | Maximum buy amount |
| `slippage_bps` | INTEGER | Slippage tolerance in basis points |

### `flywheel_state`
Tracks current flywheel cycle state.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT | Primary key (default: 'main') |
| `cycle_phase` | TEXT | 'buy' or 'sell' |
| `buy_count` | INTEGER | Buys in current cycle |
| `sell_count` | INTEGER | Sells in current cycle |
| `sell_phase_token_snapshot` | DECIMAL | Token balance at sell phase start |
| `sell_amount_per_tx` | DECIMAL | Amount to sell per transaction |

### `transactions`
Records all flywheel transactions.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `type` | TEXT | 'buy', 'sell', 'fee_transfer', 'claim' |
| `amount` | DECIMAL | Transaction amount |
| `signature` | TEXT | Solana transaction signature |
| `status` | TEXT | 'pending', 'success', 'failed' |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

## Multi-User Tables

### `users`
Platform users (wallet-based authentication).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `wallet_address` | TEXT | Solana wallet address (unique) |
| `display_name` | TEXT | Optional display name |
| `is_active` | BOOLEAN | Account active status |

### `telegram_users`
Telegram bot users, optionally linked to platform users.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `telegram_id` | BIGINT | Telegram user ID (unique) |
| `telegram_username` | TEXT | Telegram username |
| `user_id` | UUID | FK to `users` (optional) |

### `user_tokens`
Tokens registered by users for flywheel automation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK to `users` |
| `token_mint_address` | TEXT | Token mint address |
| `token_symbol` | TEXT | Token symbol |
| `dev_wallet_address` | TEXT | Dev wallet public key |
| `ops_wallet_address` | TEXT | Ops wallet public key |
| `dev_wallet_private_key_encrypted` | TEXT | AES-256-GCM encrypted private key |
| `dev_encryption_iv` | TEXT | Encryption IV |
| `dev_encryption_auth_tag` | TEXT | Encryption auth tag |
| `is_active` | BOOLEAN | Token active status |
| `is_suspended` | BOOLEAN | Admin suspension flag |
| `risk_level` | TEXT | 'low', 'medium', 'high' |

### `user_token_config`
Per-token flywheel configuration.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_token_id` | UUID | FK to `user_tokens` (unique) |
| `flywheel_active` | BOOLEAN | Flywheel enabled |
| `market_making_enabled` | BOOLEAN | Market making enabled |
| `auto_claim_enabled` | BOOLEAN | Auto-claim fees |
| `fee_threshold_sol` | DECIMAL | Claim threshold |
| `min_buy_amount_sol` | DECIMAL | Minimum buy |
| `max_buy_amount_sol` | DECIMAL | Maximum buy |
| `slippage_bps` | INTEGER | Slippage tolerance |
| `algorithm_mode` | TEXT | 'simple' or 'rebalance' |

### `user_claim_history`
Records all fee claims for users.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_token_id` | UUID | FK to `user_tokens` |
| `amount_sol` | DECIMAL | Total claimed SOL |
| `amount_usd` | DECIMAL | USD value at claim time |
| `platform_fee_sol` | DECIMAL | Platform fee (10%) |
| `user_received_sol` | DECIMAL | User received (90%) |
| `transaction_signature` | TEXT | Claim transaction |
| `platform_fee_signature` | TEXT | Fee transfer transaction |
| `claimed_at` | TIMESTAMPTZ | Claim timestamp |

### `pending_token_launches`
Telegram token launch workflow state.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `telegram_user_id` | UUID | FK to `telegram_users` |
| `token_name` | TEXT | Token name |
| `token_symbol` | TEXT | Token symbol |
| `token_description` | TEXT | Token description |
| `token_image_url` | TEXT | Token image URL |
| `dev_wallet_address` | TEXT | Generated dev wallet |
| `ops_wallet_address` | TEXT | Generated ops wallet |
| `status` | TEXT | 'awaiting_deposit', 'launching', 'completed', 'failed', 'expired', 'refunded' |
| `deposit_received_sol` | DECIMAL | Deposited amount |
| `token_mint_address` | TEXT | Result mint address |
| `expires_at` | TIMESTAMPTZ | Expiration time (24h) |

### `audit_log`
Platform-wide audit trail.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `event_type` | TEXT | Event type |
| `pending_launch_id` | UUID | FK to pending launches |
| `user_token_id` | UUID | FK to user tokens |
| `telegram_id` | BIGINT | Telegram user ID |
| `details` | JSONB | Event details |
| `created_at` | TIMESTAMPTZ | Event timestamp |

---

## Balance Tables

### `user_wallet_balances`
Cached wallet balances for each user token (updated periodically).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_token_id` | UUID | FK to `user_tokens` (unique) |
| `dev_sol_balance` | DECIMAL | Dev wallet SOL |
| `dev_token_balance` | DECIMAL | Dev wallet token balance |
| `dev_usd_value` | DECIMAL | Dev wallet USD value |
| `ops_sol_balance` | DECIMAL | Ops wallet SOL |
| `ops_token_balance` | DECIMAL | Ops wallet token balance |
| `ops_usd_value` | DECIMAL | Ops wallet USD value |
| `claimable_fees_sol` | DECIMAL | Claimable fees from Bags.fm |
| `sol_price_usd` | DECIMAL | SOL price at update time |
| `last_updated_at` | TIMESTAMPTZ | Last update timestamp |

### `user_wallet_balance_history`
Historical balance snapshots for analytics.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_token_id` | UUID | FK to `user_tokens` |
| `dev_sol_balance` | DECIMAL | Snapshot values... |
| `snapshot_at` | TIMESTAMPTZ | Snapshot timestamp |

---

## Security

### Row Level Security (RLS)
All tables have RLS enabled with service role bypass policies. The backend uses the service role key to access data.

### Encryption
User wallet private keys are encrypted using AES-256-GCM with:
- `ENCRYPTION_MASTER_KEY` - 32-byte hex key from environment
- Per-record IV and auth tag stored alongside encrypted data

---

## Indexes

Performance indexes are created on:
- Foreign key columns
- Status/type columns used in filters
- Timestamp columns for ordering
- Wallet addresses for lookups

See individual migration files for complete index definitions.
