# ClaudeWheel Backend

Autonomous market-making engine for Bags.fm tokens on Solana.

## Features

- **Fee Collection**: Automated claiming of trading fees from Bags.fm
- **Market Making**: Buy/sell automation with configurable strategies
- **Multi-User Support**: Platform for multiple users to register tokens
- **Telegram Bot**: Token launch and management via Telegram
- **Admin Dashboard**: Real-time monitoring and control

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase project
- Solana RPC endpoint (Helius recommended)

### Installation

```bash
npm install
```

### Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (not anon) |
| `SOLANA_RPC_URL` | Solana RPC endpoint |
| `ENCRYPTION_MASTER_KEY` | 32-byte hex key for wallet encryption |
| `BAGS_FM_API_KEY` | Bags.fm API key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (from @BotFather) |

See `.env.example` for all available options.

### Database Setup

Run the SQL migrations in order in your Supabase SQL Editor:

1. `migrations/001_core_tables.sql`
2. `migrations/002_multi_user_tables.sql`
3. `migrations/003_user_wallet_balances.sql`

See [migrations/README.md](migrations/README.md) for details.

### Running

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Project Structure

```
backend/
├── src/
│   ├── config/         # Environment and Solana configuration
│   ├── jobs/           # Scheduled jobs (claim, flywheel, balance)
│   ├── routes/         # API endpoints
│   ├── services/       # Core business logic
│   ├── telegram/       # Telegram bot implementation
│   └── utils/          # Utilities (signature verification, etc.)
├── migrations/         # SQL database migrations
├── docs/               # Documentation
└── .env.example        # Environment variable template
```

## API Endpoints

### Public
- `GET /` - API info
- `GET /api/status` - System status
- `GET /api/status/health` - Health check

### Auth
- `POST /api/auth/nonce` - Get signing nonce
- `POST /api/auth/verify` - Verify wallet signature
- `GET /api/auth/user` - Get authenticated user

### User Tokens
- `GET /api/user/tokens` - List user tokens
- `POST /api/user/tokens` - Register new token
- `GET /api/user/tokens/:id` - Get token details
- `PUT /api/user/tokens/:id/config` - Update token config
- `POST /api/user/tokens/:id/claim` - Claim fees

### Admin (requires wallet signature)
- `GET /api/admin/platform-stats` - Platform statistics
- `POST /api/admin/fast-claim/trigger` - Trigger claim cycle
- `POST /api/admin/balance-update/trigger` - Trigger balance update

### Telegram
- `POST /telegram/webhook` - Telegram webhook endpoint

## Background Jobs

| Job | Interval | Description |
|-----|----------|-------------|
| Fast Claim | 30s | Claims fees when >= 0.15 SOL |
| Multi-User Flywheel | 60s | Runs market making for all active tokens |
| Deposit Monitor | 30s | Monitors pending token launches |
| Balance Update | 5m | Updates cached wallet balances |

Jobs can be controlled via environment variables:
- `FAST_CLAIM_JOB_ENABLED=true/false`
- `MULTI_USER_FLYWHEEL_ENABLED=true/false`
- `DEPOSIT_MONITOR_ENABLED=true/false`
- `BALANCE_UPDATE_JOB_ENABLED=true/false`

## Telegram Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/launch` | Start new token launch |
| `/register` | Register existing Bags.fm token |
| `/status` | View your active tokens |
| `/claim` | Claim pending fees |
| `/help` | Show help |

## Security

- Wallet private keys are encrypted with AES-256-GCM
- Admin endpoints require wallet signature verification
- Message expiration prevents replay attacks
- Row-level security on all database tables

## Documentation

- [Database Schema](docs/DATABASE.md)
- [Migration Guide](migrations/README.md)

## License

Proprietary - All rights reserved
