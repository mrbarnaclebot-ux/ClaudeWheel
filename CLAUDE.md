# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

ClaudeWheel (Claude Flywheel) is an autonomous market-making engine for Solana tokens. It automates fee collection from Bags.fm and reinvests proceeds through market-making operations.

**Platform supports two authentication systems:**
- **Legacy (Supabase)**: Wallet signature authentication with encrypted private keys
- **Privy (TMA)**: Telegram Mini App authentication with delegated signing (no private keys stored)

Both systems run in parallel with independent databases and job runners.

## Repository Structure

```
ClaudeWheel/
├── backend/              # Express + TypeScript API server
│   ├── prisma/           # Prisma schema and migrations (Privy system)
│   │   └── schema.prisma
│   └── src/
│       ├── config/       # Environment, Solana, database configuration
│       ├── jobs/         # Cron jobs (flywheel, claims, deposits)
│       ├── routes/       # Express API routes (including privy-*.routes.ts)
│       ├── services/     # Business logic (market-maker, privy, fee-collector)
│       ├── telegram/     # Telegram bot handlers
│       ├── websocket/    # Admin WebSocket server
│       ├── types/        # TypeScript type definitions
│       ├── utils/        # Helper functions (logger, signature-verify, transaction)
│       ├── scripts/      # Utility scripts (database audit, migrations)
│       └── index.ts      # Server entry point
├── frontend/             # Next.js 14 + TypeScript web app
│   ├── app/
│   │   ├── admin/        # Admin dashboard (views, components, stores)
│   │   │   ├── _components/  # Admin UI components
│   │   │   ├── _hooks/       # Admin hooks (useWebSocket)
│   │   │   ├── _lib/         # Admin utilities (adminApi, queryClient)
│   │   │   ├── _stores/      # Zustand stores
│   │   │   └── _types/       # Admin type definitions
│   │   ├── dashboard/    # User token dashboard
│   │   ├── components/   # Shared React components
│   │   ├── providers/    # Auth and wallet providers
│   │   ├── onboarding/   # User onboarding flow
│   │   ├── docs/         # Documentation page
│   │   └── privacy/      # Privacy policy page
│   └── lib/              # Utilities and API clients
├── supabase/             # Legacy database migrations
│   └── migrations/       # SQL migration files
├── docs/                 # Project documentation
└── .github/              # GitHub workflows and CI/CD
```

## Development Commands

### Backend (run from `/backend`)

```bash
npm run dev          # Start dev server with hot reload (tsx watch)
npm run build        # Compile TypeScript
npm run start        # Run compiled JS
npm run test         # Run tests with Vitest
npm run test:watch   # Run tests in watch mode
npm run lint         # Run ESLint

# Prisma commands
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run migrations
npm run db:studio    # Open Prisma Studio
```

### Frontend (run from `/frontend`)

```bash
npm run dev          # Start Next.js dev server
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests with Vitest
npm run lint         # Run Next.js linting
```

## Tech Stack

### Backend

| Technology              | Purpose                    | Version |
| ----------------------- | -------------------------- | ------- |
| Express.js              | API framework              | 4.21.2  |
| TypeScript              | Language                   | 5.7.2   |
| @solana/web3.js         | Blockchain                 | 1.98.0  |
| Supabase                | Legacy database            | 2.47.12 |
| Prisma                  | Privy database ORM         | 6.19.1  |
| @privy-io/server-auth   | Privy authentication       | 1.32.5  |
| @bagsfm/bags-sdk        | Bags.fm integration        | 1.2.4   |
| Telegraf                | Telegram bot               | 4.16.3  |
| node-cron               | Job scheduling             | 3.0.3   |
| Pino                    | Structured logging         | 10.1.0  |
| Zod                     | Runtime validation         | 3.24.1  |
| Vitest                  | Testing                    | 2.1.8   |

### Frontend

| Technology            | Purpose                | Version |
| --------------------- | ---------------------- | ------- |
| Next.js               | Framework (App Router) | 14.2.21 |
| React                 | UI library             | 18.3.1  |
| Tailwind CSS          | Styling                | 3.4.17  |
| Zustand               | Client state           | 5.0.9   |
| TanStack Query        | Server state           | 5.90.16 |
| Solana Wallet Adapter | Wallet integration     | -       |
| Recharts              | Charts                 | 3.6.0   |
| Framer Motion         | Animation              | 11.15.0 |
| Vitest                | Testing                | 2.1.8   |

## Core Jobs & Automation

| Job                    | Frequency       | Purpose                                                                           |
| ---------------------- | --------------- | --------------------------------------------------------------------------------- |
| Multi-Flywheel         | Every 1 min     | Market-making cycles for legacy user tokens (5 buy → 5 sell pattern)              |
| Privy Flywheel         | Every 1 min     | Market-making cycles for Privy user tokens (delegated signing)                    |
| WHEEL Flywheel         | Every 1 min     | Market-making for platform WHEEL token (0% platform fee)                          |
| Fast Claim             | Configurable*   | Claims accumulated fees when threshold (0.15 SOL) is reached                      |
| WHEEL Claim            | Every 30 sec    | Claims WHEEL token fees (0.05 SOL threshold, 0% platform fee)                     |
| Balance Update         | Every 5 min     | Updates cached wallet balances (batched requests)                                 |
| Deposit Monitor        | Every 30 sec    | Watches for SOL deposits on pending token launches (both legacy and Privy)        |

*Fast Claim interval is configurable via admin dashboard (10-300 seconds, default 30s).

Jobs can be enabled/disabled via environment variables and manually triggered for testing.

## Key Architecture Patterns

### Dual Database Strategy

**Legacy System (Supabase)**:
- Wallet signature authentication
- Encrypted private keys stored in database (AES-256-GCM)
- Tables: `users`, `user_tokens`, `user_token_config`, `user_flywheel_state`
- Backend decrypts keys for transaction signing

**Privy System (Render Postgres + Prisma)**:
- Privy JWT token authentication
- **No private keys stored** - uses delegated signing
- Tables: `PrivyUser`, `PrivyWallet`, `PrivyUserToken`, `PrivyTokenConfig`, etc.
- Backend delegates signing to Privy API via `PRIVY_AUTHORIZATION_KEY`

### Privy Delegated Signing

Privy embedded wallets use server-side delegated signing:
1. User authenticates via TMA and delegates wallet authority to ClaudeWheel
2. Backend stores only wallet addresses (no private keys)
3. When signing needed, backend calls Privy API with authorization key
4. Privy signs transaction on user's behalf

Key service: `backend/src/services/privy.service.ts`
- `signAndSendSolanaTransaction()` - Sign and broadcast in one call
- `signSolanaTransaction()` - Sign only
- `verifyAuthToken()` - Validate Privy JWT

### TMA Authentication Flow

1. User opens Telegram Mini App
2. Privy SDK authenticates user (Telegram, email, or wallet)
3. Backend verifies Privy auth token
4. If new user: `needsOnboarding: true` → TMA creates embedded wallets
5. User delegates wallet signing to ClaudeWheel
6. Backend calls `POST /api/users/complete-onboarding` to store wallet IDs

### Backend Services

- Services are singleton instances exported from their modules
- Jobs use `node-cron` for scheduling automated tasks
- Admin WebSocket provides real-time updates to the dashboard
- Structured logging with Pino using emoji prefixes

### Discord Error Reporting

All errors are automatically sent to a Discord webhook with rich context:
- **Rate limiting**: Same error only sent once per configurable interval (default 60s)
- **Deduplication**: Errors hashed by message + stack + module to prevent spam
- **Rich embeds**: Formatted with module, operation, stack trace, system info
- **Severity levels**: Error (red), Fatal (dark red), Warning (orange), Critical (magenta)
- **Global handlers**: Uncaught exceptions and unhandled rejections auto-reported

Key files:
- `backend/src/services/discord-error.service.ts` - Core Discord integration
- `backend/src/utils/logger.ts` - Logger utilities with Discord hooks

Usage in code:
```typescript
import { logErrorWithDiscord, logFatalWithDiscord, reportToDiscord } from '../utils/logger'

// Log error and send to Discord
await logErrorWithDiscord(loggers.myModule, error, 'Operation failed', {
  userId: 'user123',
  tokenMint: 'mint...',
  additionalInfo: { context: 'value' }
})

// For critical errors (bypasses rate limit)
await logFatalWithDiscord(loggers.myModule, error, 'Critical failure', context)

// Report to Discord without local logging
reportToDiscord(error, { module: 'myModule', operation: 'task' })
```

Admin endpoints:
- `GET /api/admin/discord/stats` - Get reporting stats
- `POST /api/admin/discord/test` - Send test error to verify webhook

### Frontend State

- Zustand stores in `_stores/` directories for local state
- TanStack Query for API data fetching and caching
- Supabase real-time subscriptions for live updates
- Wallet context via Solana Wallet Adapter providers

### Multi-User Architecture

- Platform-level fee collection (10% of claims, 90% to user)
- Independent token & configuration per user
- Separate flywheel cycles for legacy vs Privy tokens

### Security

- AES-256-GCM encryption for legacy private keys
- Privy system stores NO private keys (delegated signing)
- Wallet signature verification for admin endpoints
- Row-level security (RLS) in Supabase
- Service role key required for backend operations

## API Routes

### Status Endpoints (Public)

- `GET /api/status/health` - Health check
- `GET /api/status/wallets` - Wallet balances
- `GET /api/status/transactions` - Transaction history

### Admin Endpoints (Signature-authenticated)

- `GET /api/admin/nonce` - Get signature nonce
- `POST /api/admin/config` - Update configuration
- `GET /api/admin/jobs` - Job status
- `POST /api/admin/jobs/:job/trigger` - Manually trigger job
- `GET /api/admin/settings` - Get platform settings (includes WHEEL trading config)
- `POST /api/admin/settings` - Update platform settings
- `GET /api/admin/wheel` - Get WHEEL token status (live wallet balances from Solana)

### Legacy User Token Endpoints

- `GET /api/user/tokens` - List user's tokens
- `POST /api/user/tokens` - Register new token
- `GET /api/user/tokens/:tokenId` - Token details
- `PUT /api/user/tokens/:tokenId/config` - Update token config
- `POST /api/user/tokens/:tokenId/claim` - Claim fees
- `POST /api/user/tokens/:tokenId/sell` - Manual sell

### Privy Authentication Endpoints

- `POST /api/privy/verify` - Verify Privy auth token, check onboarding status
- `GET /api/privy/status` - Check if Privy is configured

### Privy User Endpoints

- `POST /api/users/complete-onboarding` - Complete TMA onboarding
- `GET /api/users/profile` - Get user profile and wallets
- `GET /api/users/onboarding-status` - Check if user is onboarded
- `PUT /api/users/profile` - Update display name
- `POST /api/users/update-delegation` - Update wallet delegation status

### Privy Token Endpoints

- `GET /api/privy/tokens` - List user's Privy tokens
- `POST /api/privy/tokens` - Register existing token
- `GET /api/privy/tokens/:tokenId` - Token details
- `PUT /api/privy/tokens/:tokenId/config` - Update token config

### Privy Launch Endpoints

- `POST /api/privy/launches` - Create pending token launch
- `GET /api/privy/launches/pending` - Get current pending launch
- `GET /api/privy/launches/history` - Get launch history
- `GET /api/privy/launches/:id` - Get launch status
- `DELETE /api/privy/launches/:id` - Cancel pending launch
- `POST /api/privy/launches/upload-image` - Upload token image

### Bags.fm Proxy Endpoints

- `GET /api/bags/token/:mint` - Token info
- `GET /api/bags/fees/:mint` - Fee statistics
- `GET /api/bags/claimable/:wallet` - Claimable fees
- `POST /api/bags/claim` - Claim fees

## Database Schema

### Legacy (Supabase)

| Table                    | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `wallet_balances`        | Platform Dev/Ops wallet state                           |
| `transactions`           | Fee collection & trading history                        |
| `fee_stats`              | Aggregated fee metrics                                  |
| `config`                 | Platform configuration (includes WHEEL trading limits)  |
| `users`                  | Wallet-based user accounts                              |
| `user_tokens`            | User's registered tokens with encrypted dev wallet keys |
| `user_token_config`      | Per-token market-making configuration                   |
| `user_flywheel_state`    | Algorithm state for recovery after restarts             |
| `pending_token_launches` | Legacy token launches awaiting deposit                  |
| `telegram_users`         | Telegram bot user mappings                              |

### Privy (Prisma)

| Table                 | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `PrivyUser`           | Privy-authenticated users (telegramId, delegation)   |
| `PrivyWallet`         | Embedded wallets (dev/ops, NO private keys stored)   |
| `PrivyUserToken`      | Token registrations for Privy users                  |
| `PrivyTokenConfig`    | Per-token market-making configuration                |
| `PrivyFlywheelState`  | Algorithm state with failure tracking                |
| `PrivyPendingLaunch`  | Token launches awaiting deposit (with devBuy option) |
| `PrivyTransaction`    | Trade history with routing and pricing info          |
| `PrivyClaimHistory`   | Fee claims with 10/90 platform split tracking        |

## Environment Configuration

### Core Variables

| Variable                | Purpose                                 |
| ----------------------- | --------------------------------------- |
| `PORT`                  | Server port (default: 3001)             |
| `NODE_ENV`              | development/production/test             |
| `SOLANA_RPC_URL`        | Solana RPC endpoint                     |
| `SOLANA_WS_URL`         | Solana WebSocket URL                    |
| `HELIUS_API_KEY`        | Helius API access                       |
| `TOKEN_MINT_ADDRESS`    | Default token for single-token mode     |

### Legacy (Supabase) Variables

| Variable                | Purpose                            |
| ----------------------- | ---------------------------------- |
| `SUPABASE_URL`          | Supabase project URL               |
| `SUPABASE_SERVICE_KEY`  | Supabase service role key          |
| `ENCRYPTION_MASTER_KEY` | AES-256 key (hex string, 32 bytes) |

### Privy Variables

| Variable                  | Purpose                                     |
| ------------------------- | ------------------------------------------- |
| `PRIVY_APP_ID`            | Privy application ID                        |
| `PRIVY_APP_SECRET`        | Privy API secret                            |
| `PRIVY_AUTHORIZATION_KEY` | Hex-encoded key for delegated wallet signing|
| `PRIVY_DATABASE_URL`      | Render Postgres connection string           |
| `TMA_URL`                 | Telegram Mini App URL for notifications     |

### Other Variables

| Variable                | Purpose                                 |
| ----------------------- | --------------------------------------- |
| `BAGS_FM_API_KEY`       | Bags.fm API access                      |
| `TELEGRAM_BOT_TOKEN`    | Bot token from @BotFather               |
| `PLATFORM_FEE_PERCENTAGE` | Platform fee (default: 10%)           |
| `ENABLE_*_JOB`          | Flags to enable/disable individual jobs |

### Discord Error Reporting Variables

| Variable                          | Purpose                                              |
| --------------------------------- | ---------------------------------------------------- |
| `DISCORD_ERROR_WEBHOOK_URL`       | Discord webhook URL for error notifications          |
| `DISCORD_ERROR_RATE_LIMIT_SECONDS`| Min seconds between same error (default: 60)         |
| `DISCORD_ERROR_ENABLED`           | Enable/disable Discord error reporting (default: true)|

## Admin Dashboard Settings

The admin dashboard at `/admin` provides configuration for various platform settings.

### Platform Settings (`/api/admin/settings`)

| Setting                  | Type    | Description                                           |
| ------------------------ | ------- | ----------------------------------------------------- |
| `fastClaimIntervalSeconds` | number | Fast claim job interval (10-300 seconds)             |
| `fastClaimEnabled`       | boolean | Enable/disable fast claim job                         |
| `flywheelJobEnabled`     | boolean | Enable/disable flywheel job                           |
| `wheelMinBuySol`         | number  | WHEEL token minimum buy amount (in SOL)               |
| `wheelMaxBuySol`         | number  | WHEEL token maximum buy amount (in SOL)               |
| `wheelMinSellSol`        | number  | WHEEL token minimum sell amount (in SOL)              |
| `wheelMaxSellSol`        | number  | WHEEL token maximum sell amount (in SOL)              |

### WHEEL Token Special Handling

- WHEEL token (platform token) is excluded from platform fees (0% fee vs 10% for others)
- WHEEL wallet balances are fetched LIVE from Solana on each request (not cached)
- WHEEL has separate claim threshold (0.05 SOL) vs regular tokens (0.15 SOL)
- Dev wallet maintains 0.1 SOL reserve, transfers excess to ops wallet after claims

## Key Files

### Core Services

| File                                            | Purpose                                   |
| ----------------------------------------------- | ----------------------------------------- |
| `backend/src/index.ts`                          | Server entry point, route registration    |
| `backend/src/config/env.ts`                     | Environment validation schema (Zod)       |
| `backend/src/config/prisma.ts`                  | Prisma client configuration               |
| `backend/src/config/database.ts`                | Supabase client configuration             |
| `backend/src/services/discord-error.service.ts` | Discord webhook error reporting           |
| `backend/src/utils/logger.ts`                   | Pino logging with Discord integration     |

### Market Making

| File                                               | Purpose                                |
| -------------------------------------------------- | -------------------------------------- |
| `backend/src/services/multi-user-mm.service.ts`    | Core market-making (legacy + Privy)    |
| `backend/src/services/fast-claim.service.ts`       | Fee claiming automation                |
| `backend/src/services/token-launcher.ts`           | Token launch on Bags.fm                |
| `backend/src/jobs/deposit-monitor.job.ts`          | Monitors deposits, triggers launches   |

### Privy Integration

| File                                            | Purpose                                |
| ----------------------------------------------- | -------------------------------------- |
| `backend/src/services/privy.service.ts`         | Privy auth & delegated signing         |
| `backend/src/routes/privy-auth.routes.ts`       | Privy authentication endpoints         |
| `backend/src/routes/privy-users.routes.ts`      | User profile and onboarding            |
| `backend/src/routes/privy-tokens.routes.ts`     | Privy token management                 |
| `backend/src/routes/privy-launches.routes.ts`   | Token launch endpoints                 |
| `backend/prisma/schema.prisma`                  | Privy database schema                  |

### Admin & Frontend

| File                                            | Purpose                                |
| ----------------------------------------------- | -------------------------------------- |
| `backend/src/routes/admin.routes.ts`            | Admin API endpoints                    |
| `backend/src/telegram/bot.ts`                   | Telegram bot (notification-only)       |
| `frontend/app/admin/_stores/adminStore.ts`      | Admin UI state                         |
| `frontend/app/admin/_lib/adminApi.ts`           | Admin API client with types            |
| `frontend/app/admin/_components/views/SettingsView.tsx` | Admin settings configuration UI |
| `frontend/app/components/PriceChart.tsx`        | DexScreener price chart component      |
| `frontend/lib/api.ts`                           | API client utilities                   |

## Testing Conventions

- Test files use `.test.ts` suffix and co-locate with source files
- Use Vitest's `describe/it/expect` syntax
- Backend tests mock external services (Supabase, Solana RPC, Privy)
- Frontend tests use Testing Library for component testing

## Code Style

- TypeScript strict mode enabled
- Functional patterns preferred over classes (except singleton services)
- Async/await for all asynchronous operations
- Zod schemas for runtime validation of external data
- Structured logging with Pino using emoji prefixes for visual clarity
- Section headers with ASCII art separators in larger files

## Planned Changes

The following changes are planned but not yet implemented:

1. **Per-Token Platform Fees**: Make platform fee percentage configurable per token (currently hardcoded 10%). Add `platform_fee_percentage` column to config tables.

2. **Remove Jupiter Service**: Since Bags SDK handles routing through Jupiter automatically for graduated tokens, the separate `jupiter.service.ts` can be removed and `multi-user-mm.service.ts` refactored to use Bags SDK directly.

3. **Simplify Trading Route**: The `trading_route` config option (bags/jupiter/auto) can be deprecated since Bags SDK auto-routes.

## Claude Rules

After completing a task that involves tool use, provide a quick summary of the work you've done

<default_to_action>
By default, implement changes rather than only suggesting them, If the user's intent is unclear, infer the most useful likely action and procceed, using tools to discover any missing details instead of guessing try to infer the user's intent about whether a tool call (e.g. file edit or read) is intended or not, and act accordingly.
</default_to_action>

<use_parallel_tool_calls>
If you intend to call multiple tools and there are no dependencies
between the tool calls, make all of the independent tool calls in
parallel. Prioritize calling tools simultaneously whenever the
actions can be done in parallel rather than sequentially. For
example, when reading 3 files, run 3 tool calls in parallel to read
all 3 files into context at the same time. Maximize use of parallel
tool calls where possible to increase speed and efficiency.
However, if some tool calls depend on previous calls to inform
dependent values like the parameters, do not call these tools in
parallel and instead call them sequentially. Never use placeholders
or guess missing parameters in tool calls.
</use_parallel_tool_calls>

<investigate_before_answering>
Never speculate about code you have not opened. If the user
references a specific file, you MUST read the file before
answering. Make sure to investigate and read relevant files BEFORE
answering questions about the codebase. Never make any claims about
code before investigating unless you are certain of the correct
answer - give grounded and hallucination-free answers.
</investigate_before_answering>
