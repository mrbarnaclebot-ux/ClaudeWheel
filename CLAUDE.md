# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

ClaudeWheel (Claude Flywheel) is an autonomous market-making engine for Solana tokens. It automates fee collection from Bags.fm and reinvests proceeds through market-making operations. The platform supports both single-token and multi-user modes with Telegram bot integration for token launches.

## Repository Structure

```
ClaudeWheel/
├── backend/              # Express + TypeScript API server
│   └── src/
│       ├── config/       # Environment and Solana configuration
│       ├── jobs/         # Cron jobs (flywheel, claims, deposits)
│       ├── routes/       # Express API routes
│       ├── services/     # Business logic (market-maker, fee-collector, etc.)
│       ├── telegram/     # Telegram bot handlers
│       ├── websocket/    # Admin WebSocket server
│       ├── types/        # TypeScript type definitions
│       ├── utils/        # Helper functions (logger, signature-verify)
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
├── supabase/             # Database migrations and configuration
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
| Technology | Purpose | Version |
|------------|---------|---------|
| Express.js | API framework | 4.21.2 |
| TypeScript | Language | 5.7.2 |
| @solana/web3.js | Blockchain | 1.98.0 |
| Supabase | Database (PostgreSQL) | 2.47.12 |
| @bagsfm/bags-sdk | Bags.fm integration | 1.2.4 |
| Telegraf | Telegram bot | 4.16.3 |
| node-cron | Job scheduling | 3.0.3 |
| Pino | Structured logging | 10.1.0 |
| Zod | Runtime validation | 3.24.1 |
| Vitest | Testing | 2.1.8 |

### Frontend
| Technology | Purpose | Version |
|------------|---------|---------|
| Next.js | Framework (App Router) | 14.2.21 |
| React | UI library | 18.3.1 |
| Tailwind CSS | Styling | 3.4.17 |
| Zustand | Client state | 5.0.9 |
| TanStack Query | Server state | 5.90.16 |
| Solana Wallet Adapter | Wallet integration | - |
| Recharts | Charts | 3.6.0 |
| Framer Motion | Animation | 11.15.0 |
| Vitest | Testing | 2.1.8 |

## Core Jobs & Automation

| Job | Frequency | Purpose |
|-----|-----------|---------|
| Multi-Flywheel | Every 1 min | Executes market-making cycles for all active user tokens (5 buy → 5 sell pattern) |
| Fast Claim | Every 30 sec | Claims accumulated fees when threshold (0.15 SOL) is reached |
| Balance Update | Every 5 min | Updates cached wallet balances (batched requests) |
| Deposit Monitor | Continuous | Watches for SOL deposits on pending Telegram token launches |

Jobs can be enabled/disabled via environment variables and manually triggered for testing.

## Key Architecture Patterns

### Backend Services
- Services are singleton instances exported from their modules
- Jobs use `node-cron` for scheduling automated tasks
- Wallet operations use AES-256-GCM encrypted private keys stored in Supabase
- Admin WebSocket provides real-time updates to the dashboard
- Structured logging with Pino using emoji prefixes

### Frontend State
- Zustand stores in `_stores/` directories for local state
- TanStack Query for API data fetching and caching
- Supabase real-time subscriptions for live updates
- Wallet context via Solana Wallet Adapter providers

### Multi-User Architecture
- User authentication via Solana wallet signature
- Encrypted wallet key storage per user
- Independent token & configuration per user
- Platform-level fee collection (10% of claims, 90% to user)

### Security
- AES-256-GCM encryption for private keys
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

### User Token Endpoints
- `GET /api/user/tokens` - List user's tokens
- `POST /api/user/tokens` - Register new token
- `GET /api/user/tokens/:tokenId` - Token details
- `PUT /api/user/tokens/:tokenId/config` - Update token config
- `POST /api/user/tokens/:tokenId/claim` - Claim fees
- `POST /api/user/tokens/:tokenId/sell` - Manual sell

### Bags.fm Proxy Endpoints
- `GET /api/bags/token/:mint` - Token info
- `GET /api/bags/fees/:mint` - Fee statistics
- `GET /api/bags/claimable/:wallet` - Claimable fees
- `POST /api/bags/claim` - Claim fees

## Database Schema

Key tables in Supabase (see `/supabase/migrations`):

| Table | Purpose |
|-------|---------|
| `wallet_balances` | Dev/Ops wallet state |
| `transactions` | Fee collection & trading history |
| `fee_stats` | Aggregated fee metrics |
| `config` | Platform configuration |
| `users` | Wallet-based user accounts |
| `user_tokens` | User's registered tokens with encrypted dev wallet keys |
| `user_token_config` | Per-token market-making configuration |
| `user_flywheel_state` | Algorithm state for recovery after restarts |

## Environment Configuration

Backend requires these key environment variables (see `backend/.env.example`):

| Variable | Purpose |
|----------|---------|
| `PORT` | Server port (default: 3001) |
| `NODE_ENV` | development/production/test |
| `SOLANA_RPC_URL` | Solana RPC endpoint |
| `SOLANA_WS_URL` | Solana WebSocket URL |
| `HELIUS_API_KEY` | Helius API access |
| `TOKEN_MINT_ADDRESS` | Default token for single-token mode |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `ENCRYPTION_MASTER_KEY` | AES-256 key (hex string, 32 bytes) |
| `BAGS_FM_API_KEY` | Bags.fm API access |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `ENABLE_*_JOB` | Flags to enable/disable individual jobs |

## Key Files

| File | Purpose |
|------|---------|
| `backend/src/index.ts` | Server entry point, route registration |
| `backend/src/config/env.ts` | Environment validation schema (Zod) |
| `backend/src/services/multi-user-mm.service.ts` | Core market-making logic |
| `backend/src/services/fast-claim.service.ts` | Fee claiming automation |
| `backend/src/routes/admin.routes.ts` | Admin API endpoints |
| `backend/src/telegram/bot.ts` | Telegram bot commands & handlers |
| `frontend/app/admin/_stores/adminStore.ts` | Admin UI state |
| `frontend/lib/api.ts` | API client utilities |

## Testing Conventions

- Test files use `.test.ts` suffix and co-locate with source files
- Use Vitest's `describe/it/expect` syntax
- Backend tests mock external services (Supabase, Solana RPC)
- Frontend tests use Testing Library for component testing

## Code Style

- TypeScript strict mode enabled
- Functional patterns preferred over classes (except singleton services)
- Async/await for all asynchronous operations
- Zod schemas for runtime validation of external data
- Structured logging with Pino using emoji prefixes for visual clarity
- Section headers with ASCII art separators in larger files
