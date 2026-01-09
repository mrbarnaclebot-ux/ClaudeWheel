# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

ClaudeWheel (Claude Flywheel) is an autonomous market-making engine for Solana tokens. It automates fee collection from Bags.fm and reinvests proceeds through market-making operations. The platform supports both single-token and multi-user modes with Telegram bot integration for token launches.

## Repository Structure

```
ClaudeWheel/
├── backend/          # Express + TypeScript API server
│   ├── src/
│   │   ├── config/      # Environment and Solana configuration
│   │   ├── jobs/        # Cron jobs (flywheel, claims, deposits)
│   │   ├── routes/      # Express API routes
│   │   ├── services/    # Business logic (market-maker, fee-collector, etc.)
│   │   ├── telegram/    # Telegram bot handlers
│   │   ├── websocket/   # Admin WebSocket server
│   │   └── index.ts     # Server entry point
│   └── migrations/      # Supabase SQL migrations
├── frontend/         # Next.js 14 + TypeScript web app
│   ├── app/
│   │   ├── admin/       # Admin dashboard (views, components, stores)
│   │   ├── dashboard/   # User token dashboard
│   │   ├── components/  # Shared React components
│   │   └── providers/   # Auth and wallet providers
│   └── lib/             # Utilities and API clients
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
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Blockchain**: Solana via @solana/web3.js
- **APIs**: Bags.fm SDK for fee claiming
- **Bot**: Telegraf for Telegram integration
- **Testing**: Vitest
- **Validation**: Zod

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **State**: Zustand for global state, TanStack Query for server state
- **Wallet**: Solana Wallet Adapter
- **Charts**: Recharts
- **Animation**: Framer Motion
- **Testing**: Vitest + Testing Library

## Key Architecture Patterns

### Backend Services
- Services are singleton instances exported from their modules
- Jobs use `node-cron` for scheduling automated tasks
- Wallet operations use encrypted private keys stored in Supabase
- Admin WebSocket provides real-time updates to the dashboard

### Frontend State
- Zustand stores in `_stores/` directories for local state
- TanStack Query for API data fetching and caching
- Wallet context via Solana Wallet Adapter providers

### API Routes
- `/api/status` - Public health and status endpoints
- `/api/admin` - Admin operations (signature-authenticated)
- `/api/auth` - Wallet-based authentication
- `/api/user` - User token management
- `/api/bags` - Bags.fm data endpoints

## Environment Configuration

Backend requires these key environment variables (see `backend/.env.example`):
- `SOLANA_RPC_URL` - Solana RPC endpoint
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` - Database access
- `ENCRYPTION_MASTER_KEY` - For multi-user wallet encryption
- `BAGS_FM_API_KEY` - Bags.fm API access
- `TELEGRAM_BOT_TOKEN` - Telegram bot token

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
- Console logging with emoji prefixes for visual clarity in backend logs
