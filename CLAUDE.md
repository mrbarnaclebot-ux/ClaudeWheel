# CLAUDE.md

## Project Overview

ClaudeWheel is an autonomous market-making engine for Solana tokens on Bags.fm with fee collection and reinvestment.

**Dual Auth Systems:**
- **Legacy (Supabase)**: Wallet signature auth + encrypted private keys
- **Privy (TMA)**: Telegram Mini App + delegated signing (no keys stored)

## Repository Structure

```
backend/           # Express + TS API (port 3001)
├── prisma/        # Prisma schema (Privy system)
├── src/
│   ├── config/    # env, solana, database
│   ├── jobs/      # cron (flywheel, claims, deposits)
│   ├── routes/    # 9 route files
│   ├── services/  # 17 services
│   ├── telegram/  # bot handlers
│   └── utils/     # logger, transactions
frontend/          # Next.js 14 Admin (port 3000)
└── app/admin/     # dashboard views, stores
tma/               # Next.js 14 Telegram Mini App (port 3002)
└── src/app/
    ├── dashboard/ # token list
    ├── token/[id]/ # details + settings
    ├── launch/    # token launch wizard
    └── mm/        # MM-only mode
```

## Commands

**Backend** (`/backend`): `npm run dev|build|test` | `npm run db:generate|push|migrate|studio`
**Frontend** (`/frontend`): `npm run dev|build`
**TMA** (`/tma`): `npm run dev|build`

## Tech Stack

**Backend**: Express, TypeScript, @solana/web3.js, Prisma, Supabase, @privy-io/server-auth, @bagsfm/bags-sdk, Telegraf, Pino, Zod
**Frontend/TMA**: Next.js 14, React, Tailwind, Zustand, TanStack Query, @privy-io/react-auth

## Core Jobs

| Job | Interval | Purpose |
|-----|----------|---------|
| Multi-Flywheel | 1 min | MM for all active tokens |
| Fast Claim | 30 sec | Claims fees ≥0.15 SOL (10% platform, 90% user) |
| Balance Update | 5 min | Update cached wallet balances |
| Deposit Monitor | 30 sec | Watch deposits, trigger activations |

Jobs: `MULTI_USER_FLYWHEEL_ENABLED`, `FAST_CLAIM_JOB_ENABLED`, etc.

## MM Algorithm Modes

- **simple**: 5 buys → 5 sells (default)
- **turbo_lite**: 8 buys → 8 sells with rate limits, auto-switches to sell if SOL <0.1
- **rebalance**: Token/SOL ratio balancing

Stored in `PrivyTokenConfig.algorithm_mode`, executed by `multi-user-mm.service.ts`

### Adding New MM Mode - Checklist

**Backend (3 validation schemas):**
- [ ] `privy-mm.routes.ts:75` - startMmSchema
- [ ] `privy-launches.routes.ts:196` - launch schema
- [ ] `privy-tokens.routes.ts:597` - config update schema

**Deposit Monitor (2 config creators):**
- [ ] `deposit-monitor.job.ts:719` - `activateMmToken()`
- [ ] `deposit-monitor.job.ts:323` - `handleSuccessfulLaunch()`

**Flywheel:**
- [ ] `multi-user-mm.service.ts:422` - Add switch case + algorithm function

**Prisma (if new fields):**
- [ ] `prisma/schema.prisma:158` - Add fields to PrivyTokenConfig
- [ ] Run `npm run db:migrate`

**TMA Frontend (3 type definitions):**
- [ ] `mm/page.tsx:14` - AlgorithmMode type
- [ ] `token/[id]/page.tsx` - type + display helpers
- [ ] `token/[id]/settings/page.tsx` - type + config panel

**Common Pitfalls:**
1. Missing one of 3 validation schemas → 400 errors
2. Missing deposit monitor function → "Failed to activate MM"
3. Missing default values → algorithm crash
4. Frontend types don't match backend → silent failures

## Architecture

### Dual Database
- **Legacy (Supabase)**: `users`, `user_tokens`, `user_token_config` - encrypted keys
- **Privy (Prisma)**: `PrivyUser`, `PrivyWallet`, `PrivyUserToken`, `PrivyTokenConfig` - NO keys

### Privy Delegated Signing
1. User delegates wallet via TMA
2. Backend stores only wallet addresses
3. Signing via Privy API with `PRIVY_AUTHORIZATION_KEY`

Key service: `privy.service.ts` → `signAndSendSolanaTransaction()`, `verifyAuthToken()`

### TMA Auth Flow
1. User opens TMA → Privy auth → Backend verifies token
2. If new: create embedded wallets → delegate to ClaudeWheel
3. Complete via `POST /api/users/complete-onboarding`

## API Routes

**Public**: `/api/status`, `/api/status/health|wallets|transactions`

**Admin** (signature auth): `/api/admin/config|tokens|platform-settings|flywheel|fast-claim|wheel`

**Privy Auth**: `/api/privy/verify|status`

**Users**: `/api/users/complete-onboarding|profile|onboarding-status`

**Tokens**: `/api/privy/tokens` - CRUD, claim, transactions, claimable

**Launches**: `/api/privy/launches` - create, upload-image, pending, history, devbuy

**MM-Only**: `/api/privy/mm/start|pending|withdraw`

**Bags Proxy**: `/api/bags/token|fees|claimable|quote|dashboard`

## Database Schema

### Legacy (Supabase)
`wallet_balances`, `transactions`, `fee_stats`, `config`, `users`, `user_tokens`, `user_token_config`, `user_flywheel_state`

### Privy (Prisma)
**Users**: `PrivyUser`, `PrivyWallet`, `AdminRole`
**Tokens**: `PrivyUserToken`, `PrivyTokenConfig`, `PrivyFlywheelState`
**Launches**: `PrivyPendingLaunch`, `PrivyMmPending`
**History**: `PrivyTransaction`, `PrivyClaimHistory`
**Platform**: `PlatformConfig`, `PlatformWalletBalance`, `AuditLog`
**Telegram**: `TelegramUser`, `BotStatus`

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/services/multi-user-mm.service.ts` | Core MM (flywheel) |
| `backend/src/services/privy.service.ts` | Privy auth + signing |
| `backend/src/jobs/deposit-monitor.job.ts` | Deposit → activation |
| `backend/src/services/fast-claim.service.ts` | Fee claiming |
| `backend/prisma/schema.prisma` | Privy database |
| `tma/src/app/mm/page.tsx` | MM-only mode UI |
| `tma/src/app/token/[id]/settings/page.tsx` | Token config UI |

## Environment Variables

**Core**: `PORT`, `NODE_ENV`, `SOLANA_RPC_URL`, `HELIUS_API_KEY`
**Legacy**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ENCRYPTION_MASTER_KEY`
**Privy**: `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_AUTHORIZATION_KEY`, `PRIVY_DATABASE_URL`
**Other**: `BAGS_FM_API_KEY`, `TELEGRAM_BOT_TOKEN`, `DISCORD_ERROR_WEBHOOK_URL`

## TMA Pages

| Path | Purpose |
|------|---------|
| `/onboarding` | Create wallets, delegate signing |
| `/dashboard` | Token list, balances |
| `/token/[id]` | Details, MM status, trading |
| `/token/[id]/settings` | Algorithm config |
| `/launch` | Token launch wizard |
| `/mm` | MM-only mode |

**Token Sources**: `launched` (wizard), `registered` (imported), `mm_only` (no claiming)

## Code Style
- TypeScript strict, functional patterns, async/await
- Zod for runtime validation
- Pino logging with emoji prefixes
- Vitest for testing

## Claude Rules

<default_to_action>
Implement changes rather than suggesting. Infer user intent and proceed with tool calls.
</default_to_action>

<use_parallel_tool_calls>
Run independent tool calls in parallel. Never use placeholders.
</use_parallel_tool_calls>

<investigate_before_answering>
Never speculate - read files before answering. Grounded, hallucination-free answers.
</investigate_before_answering>
