<p align="center">
  <img src="frontend/public/logo.png" alt="Claude Wheel Logo" width="120" height="120">
</p>

<h1 align="center">Claude Wheel</h1>

<p align="center">
  <strong>Autonomous Market Making Platform for Bags.fm Tokens</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#how-it-works">How It Works</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#documentation">Docs</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Solana-Mainnet-blueviolet?style=flat-square&logo=solana" alt="Solana">
  <img src="https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

---

## What is Claude Wheel?

Claude Wheel is an **autonomous market-making platform** built specifically for tokens launched on [Bags.fm](https://bags.fm). It automates fee claiming and executes strategic buy/sell cycles to maintain liquidity and support your token's market activity.

**Connect your token once, and let the flywheel work for you 24/7.**

### Key Benefits

- **Auto Fee Claiming** - Automatically claims accumulated trading fees from Bags.fm
- **Market Making** - Executes strategic 5-buy → 5-sell cycles to maintain chart activity
- **Multi-Token Support** - Manage multiple tokens from a single dashboard
- **Full Control** - Configure buy/sell amounts, intervals, and algorithm modes
- **Secure** - AES-256-GCM encrypted wallet keys, open-source code

---

## Features

### For Token Creators

| Feature | Description |
|---------|-------------|
| **Flywheel Automation** | 5 buys followed by 5 sells per cycle, randomized within your configured ranges |
| **Auto Fee Collection** | Claims fees from dev wallet and transfers to ops wallet automatically |
| **Real-time Dashboard** | Monitor your token's flywheel status, balances, and transaction history |
| **Algorithm Modes** | Simple (fixed cycles), Smart (coming soon), Rebalance (target allocations) |
| **Manual Controls** | Execute manual buys/sells from the dashboard when needed |

### Platform Features

| Feature | Description |
|---------|-------------|
| **Multi-User System** | Each user manages their own tokens independently |
| **Wallet Authentication** | Sign-in with your Solana wallet (Phantom, Solflare, etc.) |
| **Encrypted Key Storage** | Private keys encrypted with AES-256-GCM before storage |
| **Real-time Updates** | Live transaction feed and balance updates via Supabase |
| **Admin Panel** | Platform administrators can monitor all flywheels |

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           THE FLYWHEEL                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│    ┌──────────┐         ┌──────────┐         ┌──────────┐              │
│    │ BAGS.FM  │  fees   │   DEV    │ 90%     │   OPS    │              │
│    │  TRADES  │ ──────► │  WALLET  │ ──────► │  WALLET  │              │
│    └──────────┘         └──────────┘         └──────────┘              │
│                               │                    │                    │
│                               │ 10%                │                    │
│                               ▼                    │                    │
│                        ┌──────────┐                │                    │
│                        │ PLATFORM │                │                    │
│                        │   FEE    │                │                    │
│                        └──────────┘                │                    │
│                                                    │                    │
│    ┌──────────────────────────────────────────────┘                    │
│    │                                                                    │
│    ▼                                                                    │
│    ┌──────────────────────────────────────────────────────────┐        │
│    │                    FLYWHEEL CYCLE                         │        │
│    │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                │        │
│    │  │ BUY │ │ BUY │ │ BUY │ │ BUY │ │ BUY │  ← Phase 1     │        │
│    │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                │        │
│    │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │        │
│    │  │ SELL │ │ SELL │ │ SELL │ │ SELL │ │ SELL │ ← Phase 2 │        │
│    │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘          │        │
│    └──────────────────────────────────────────────────────────┘        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Fee Structure

| Fee Type | Amount | Description |
|----------|--------|-------------|
| **Platform Fee** | 10% | Applied to claimed trading fees (supports platform development) |
| **You Receive** | 90% | Transferred to your ops wallet for market making |
| **Network Fees** | ~0.000005 SOL | Standard Solana transaction fees |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Solana wallet (Phantom, Solflare, etc.)
- Supabase account (for database)
- Bags.fm token with dev wallet access

### Installation

```bash
# Clone the repository
git clone https://github.com/mrbarnaclebot-ux/ClaudeWheel.git
cd ClaudeWheel

# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

### Configuration

1. **Backend** - Copy `.env.example` to `.env` and configure:

```env
# Solana RPC
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Platform Wallet (receives 10% platform fees)
OPS_WALLET_PRIVATE_KEY=your_ops_wallet_key

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key

# Encryption (generate a secure 32-byte hex key)
ENCRYPTION_KEY=your_256_bit_encryption_key

# Platform Fee (default 10%)
PLATFORM_FEE_PERCENTAGE=10
```

2. **Database** - Run the schema in your Supabase SQL editor:

```bash
# Copy contents of backend/supabase-schema.sql
# Paste into Supabase SQL Editor and run
```

3. **Frontend** - Copy `.env.example` to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Running

```bash
# Terminal 1: Start backend
cd backend
npm run dev
# API runs at http://localhost:3001

# Terminal 2: Start frontend
cd frontend
npm run dev
# Opens at http://localhost:3000
```

---

## Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Smooth animations
- **Supabase** - Real-time subscriptions

### Backend
- **Node.js + Express** - API server
- **@solana/web3.js** - Blockchain interactions
- **Jupiter/Bags.fm API** - Token swaps
- **node-cron** - Job scheduling
- **Zod** - Runtime validation

### Security
- **AES-256-GCM** - Private key encryption
- **Wallet Signature Auth** - Sign-in verification
- **Row Level Security** - Supabase RLS policies

---

## Project Structure

```
ClaudeWheel/
├── frontend/                    # Next.js dashboard
│   ├── app/
│   │   ├── components/          # React components
│   │   ├── dashboard/           # User dashboard pages
│   │   ├── admin/               # Admin panel
│   │   ├── onboarding/          # Token setup wizard
│   │   └── docs/                # Documentation page
│   └── lib/
│       ├── api.ts               # API client
│       └── supabase.ts          # Supabase client
│
├── backend/                     # Node.js automation
│   └── src/
│       ├── config/              # Environment & Solana setup
│       ├── services/            # Core business logic
│       │   ├── multi-user-mm.service.ts    # Flywheel engine
│       │   ├── multi-user-claim.service.ts # Fee claiming
│       │   └── user-token.service.ts       # Token management
│       ├── jobs/                # Cron jobs
│       └── routes/              # API endpoints
│
└── README.md
```

---

## API Reference

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/status` | GET | Platform status |
| `GET /api/status/health` | GET | Health check |

### User Endpoints (Authenticated)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/user-tokens` | GET | List user's tokens |
| `POST /api/user-tokens` | POST | Register new token |
| `PATCH /api/user-tokens/:id/config` | PATCH | Update flywheel config |
| `GET /api/user-tokens/:id/activity` | GET | Get token activity |

### Admin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/admin/users` | GET | List all users |
| `GET /api/admin/tokens` | GET | List all tokens |
| `POST /api/admin/flywheel/toggle` | POST | Toggle flywheel |

---

## Documentation

Full documentation is available at `/docs` in the running application, covering:

- How the flywheel mechanism works
- Integration guide for token creators
- Security & encryption details
- Fee structure breakdown
- Terms of service
- Risk disclaimer

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Start

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## Security

- **Never** commit private keys or `.env` files
- Report security vulnerabilities via [GitHub Issues](https://github.com/mrbarnaclebot-ux/ClaudeWheel/issues)
- All private keys are encrypted with AES-256-GCM before storage
- Source code is open for community auditing

---

## Links

- **Website**: [Claude Wheel](https://claudewheel.com)
- **Bags.fm**: [bags.fm](https://bags.fm)
- **Twitter/X**: [@ClaudeWheel](https://x.com/i/communities/2008530158354063511)
- **Token CA**: `8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS`

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <strong>Built with care by the Claude Wheel Team</strong>
  <br>
  <sub>Autonomous market making for the Bags.fm ecosystem</sub>
</p>
