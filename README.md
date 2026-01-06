# Claude Flywheel

> Autonomous Market Making Visualization Platform for Solana

A stunning Claude Code-themed dashboard that visualizes an automated fee collection and market-making flywheel for a Solana meme token.

![Status: Active](https://img.shields.io/badge/Status-Active-success)
![Solana](https://img.shields.io/badge/Solana-Mainnet-blueviolet)
![Next.js](https://img.shields.io/badge/Next.js-14-black)

## Overview

Claude Flywheel is a **read-only dashboard** that displays the autonomous operation of:

1. **Fee Collection** - PumpFun creator fees collected every minute from dev wallet
2. **Transfers** - SOL routed from dev wallet to operational wallet
3. **Market Making** - Automated buy/sell orders to maintain chart stability

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   DEV WALLET    │────▶│   OPS WALLET    │────▶│     TOKEN       │
│   (Fees)        │     │   (Trading)     │◀────│   (Market)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                        FLYWHEEL
```

## Features

- **Mesmerizing Flywheel Animation** - Particles flowing between wallet nodes
- **Real-time Wallet Balances** - Dev and Ops wallet SOL/token holdings
- **Live Transaction Feed** - Fee collections, buys, sells, transfers
- **Token Info Panel** - Contract address with copy + DexScreener chart
- **Fee Collection Stats** - Total, daily, hourly metrics with trends
- **Claude Code Theme** - Dark terminal aesthetic with warm coral accents

## Tech Stack

### Frontend
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** + Custom Design System
- **Framer Motion** (Animations)
- **Supabase** (Real-time updates)

### Backend
- **Node.js** + Express
- **@solana/web3.js** (Blockchain)
- **Jupiter API** (Swaps)
- **node-cron** (Automation)

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Solana wallet keypairs (for production)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-repo/claude-flywheel.git
cd claude-flywheel

# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

### Development

```bash
# Start frontend (from /frontend)
npm run dev
# Opens at http://localhost:3000

# Start backend (from /backend)
npm run dev
# API at http://localhost:3001
```

### Configuration

Copy `.env.example` to `.env` in the backend folder and configure:

```env
# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Wallet Keys (Base58 encoded)
DEV_WALLET_PRIVATE_KEY=your_dev_wallet_key
OPS_WALLET_PRIVATE_KEY=your_ops_wallet_key

# Token
TOKEN_MINT_ADDRESS=your_token_mint_address

# Supabase (optional, for real-time)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key
```

## Project Structure

```
claude-flywheel/
├── frontend/                    # Next.js dashboard
│   ├── app/
│   │   ├── components/
│   │   │   ├── FlywheelAnimation.tsx
│   │   │   ├── WalletCard.tsx
│   │   │   ├── TokenInfo.tsx
│   │   │   ├── TransactionFeed.tsx
│   │   │   ├── FeeStats.tsx
│   │   │   └── Header.tsx
│   │   ├── globals.css          # Design system
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── lib/
│       └── utils.ts
│
├── backend/                     # Node.js automation
│   └── src/
│       ├── config/
│       │   ├── env.ts
│       │   └── solana.ts
│       ├── services/
│       │   ├── fee-collector.ts
│       │   ├── market-maker.ts
│       │   └── wallet-monitor.ts
│       ├── jobs/
│       │   └── flywheel.job.ts
│       ├── routes/
│       │   └── status.routes.ts
│       └── index.ts
│
└── README.md
```

## Design System

### Color Palette

| Variable | Hex | Usage |
|----------|-----|-------|
| `--bg-void` | `#06060a` | Page background |
| `--bg-card` | `#1a1a24` | Card backgrounds |
| `--accent-primary` | `#e8956a` | Claude coral accent |
| `--accent-cyan` | `#4ecdc4` | Secondary accent |
| `--success` | `#3fb950` | Buy/positive |
| `--error` | `#f85149` | Sell/negative |

### Typography

- **Display**: Outfit (headings)
- **Mono**: JetBrains Mono (data, code)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Flywheel status overview |
| `/api/status/wallets` | GET | Wallet balances |
| `/api/status/transactions` | GET | Recent transactions |
| `/api/status/health` | GET | Health check |

## Automation Flow

Every 1 minute, the backend:

1. **Checks** dev wallet for accumulated fees
2. **Transfers** SOL above threshold to ops wallet
3. **Executes** market making (buy/sell based on strategy)
4. **Logs** all transactions to database
5. **Broadcasts** updates to frontend via Supabase

## Security Notes

- Never commit private keys to git
- Use environment variables or secrets manager
- Consider hardware wallets for production
- Implement rate limiting on API endpoints
- Monitor for suspicious activity

## License

MIT

---

Built with ◈ by Claude Flywheel Team
