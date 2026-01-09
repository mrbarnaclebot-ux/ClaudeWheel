# Claude Meme Flywheel Mechanics | Product Requirements Document

**Version:** 1.0  
**Date:** January 2026  
**Status:** Active Development  
**Author:** Senior Development Team

---

## Executive Summary

Claude Meme Flywheel is a Solana-native automated market-making orchestration platform themed around Anthropic's Claude AI branding. The system enables autonomous fee collection from a PumpFun dev wallet, automated market-making operations on a Claude-branded meme token, and a sophisticated analytics dashboard—creating a self-sustaining flywheel of liquidity, volume, and community engagement.

**Core Loop:**
1. Deploy Claude-themed token on PumpFun
2. Automatically harvest trading fees from dev wallet
3. Route collected SOL to operational wallet
4. Execute market-making buy/sell operations
5. Maintain chart stability and promote organic growth
6. Reinvest gains into token ecosystem

---

## 1. Product Overview

### 1.1 Vision

Build a Claude-branded meme economy that demonstrates the synergy between AI infrastructure (Solana's speed/efficiency) and AI personality (Claude's helpful, harmless, honest branding). The platform autonomously manages token economics while the team focuses on community growth and narrative development.

### 1.2 Problem Statement

**Current Market Gaps:**
- Manual market-making is capital-intensive and requires constant monitoring
- PumpFun tokens lack automated chart stability mechanisms
- Dev-launched tokens suffer from rug-pull perception due to manual fee handling
- Limited transparency in fee routing and market-making activities

### 1.3 Solution

A **transparent, automated flywheel** that:
- Collects fees from PumpFun dev wallet via API monitoring
- Converts SOL to token holdings programmatically
- Executes buy/sell orders to smooth volatility and prevent rapid dumps
- Provides real-time transparency dashboard
- Maintains 24/7 autonomous operations with fallback mechanisms

### 1.4 Success Metrics

| Metric | Target | Timeline |
|--------|--------|----------|
| Monthly Trading Volume | $500K+ | Month 1-2 |
| Token Holders | 5K+ | Month 1-2 |
| Average Daily Liquidity | $50K+ | Month 2-3 |
| Fee Collection (SOL) | 100+ SOL/month | Month 2-3 |
| Dashboard Uptime | 99.5% | Ongoing |
| Community Size (Discord) | 2K+ members | Month 1 |
| Social Media Reach | 50K+ combined | Month 2-3 |

---

## 2. Tech Stack & APIs

### 2.1 Blockchain & RPC Infrastructure

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Blockchain** | Solana (Mainnet) | Token deployment, trading execution |
| **RPC Provider** | Helius/QuickNode (Primary/Fallback) | Block subscriptions, transaction simulation |
| **WebSocket Connection** | Geyser Streams | Real-time account change notifications |
| **Network Speed Target** | <500ms slot time | Optimal for market-making execution |

### 2.2 Trading & DEX APIs

| API | Purpose | Integration Type |
|-----|---------|------------------|
| **PumpFun API** (Bitquery) | Token price data, OHLCV, holder tracking | REST + GraphQL |
| **Jupiter AG** | Token swap routing, best execution | REST API |
| **Orca/Raydium** | Alternative liquidity pools | Direct instruction builders |
| **Magic Eden** | Token metadata, floor price data | REST API |

### 2.3 Backend Infrastructure

| Component | Technology | Rationale |
|-----------|-----------|----------|
| **Backend Runtime** | Node.js (TypeScript) | Solana Web3.js ecosystem compatibility |
| **Database** | Supabase PostgreSQL | Real-time subscriptions, serverless |
| **Real-time Updates** | Supabase Realtime | Live dashboard price feeds |
| **Task Scheduler** | Node-cron + Bull Queue | Reliable job scheduling with retries |
| **API Framework** | Express.js | Lightweight, battle-tested |
| **Wallet Management** | @solana/web3.js | Official Solana JS SDK |
| **Deployment** | Vercel (Frontend) + Railway/Render (Backend) | Serverless-first, auto-scaling |

### 2.4 Frontend Stack

| Layer | Technology | Rationale |
|-------|-----------|----------|
| **Framework** | Next.js 14 (App Router) | SSR, API routes, optimal performance |
| **UI Components** | shadcn/ui + TailwindCSS | Accessible, composable, Claude-branded |
| **Charting** | TradingView Lightweight Charts | Professional OHLCV visualization |
| **State Management** | TanStack Query + Zustand | Efficient server sync + local state |
| **Wallet Integration** | @solana/wallet-adapter | Multi-wallet support (Phantom, Magic) |
| **Real-time Data** | WebSocket (Supabase) | Live price updates <1s latency |
| **Analytics** | PostHog or Plausible | Privacy-first user analytics |

### 2.5 Key API Endpoints (Planned)

```
POST   /api/v1/trading/execute        → Execute buy/sell order
GET    /api/v1/trading/history        → Order history with fills
GET    /api/v1/token/metrics          → Price, volume, holders
GET    /api/v1/wallet/balance         → Dev & operational wallet balance
GET    /api/v1/fees/collected         → Fee collection analytics
GET    /api/v1/chart/ohlcv            → OHLCV candles (1m, 5m, 1h, 4h, 1d)
POST   /api/v1/webhooks/pump-update   → PumpFun feed subscription
WS     /ws/ticker                     → Live price feed
```

---

## 3. File Structure

```
claude-flywheel/
├── frontend/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout, theme provider
│   │   ├── page.tsx                      # Home/dashboard
│   │   ├── dashboard/
│   │   │   ├── page.tsx                  # Main dashboard
│   │   │   ├── components/
│   │   │   │   ├── PortfolioCard.tsx     # Holdings summary
│   │   │   │   ├── PriceChart.tsx        # TradingView embedded chart
│   │   │   │   ├── OrderBook.tsx         # Real-time order feed
│   │   │   │   ├── TradingMetrics.tsx    # 24h volume, ATH, MCap
│   │   │   │   ├── FeeCollector.tsx      # Fee stats
│   │   │   │   └── WalletStatus.tsx      # Dev & op wallet balances
│   │   ├── trading/
│   │   │   ├── page.tsx                  # Trading interface
│   │   │   ├── components/
│   │   │   │   ├── TradeExecutor.tsx     # Buy/sell form
│   │   │   │   ├── TradeHistory.tsx      # Order history table
│   │   │   │   └── SlippageSettings.tsx  # Advanced params
│   │   ├── api/
│   │   │   ├── v1/
│   │   │   │   ├── trading/[action].ts
│   │   │   │   ├── token/metrics.ts
│   │   │   │   ├── wallet/balance.ts
│   │   │   │   ├── fees/collected.ts
│   │   │   │   ├── chart/ohlcv.ts
│   │   │   │   └── webhooks/pump.ts
│   │   └── components/
│   │       ├── Header.tsx               # Navigation + wallet connect
│   │       ├── Sidebar.tsx              # Navigation menu
│   │       ├── ThemeToggle.tsx          # Dark/light mode
│   │       └── WalletButton.tsx         # Wallet adapter UI
│   ├── lib/
│   │   ├── supabase-client.ts           # Supabase initialization
│   │   ├── solana-client.ts             # Web3.js connection manager
│   │   ├── api-client.ts                # Fetch wrapper with auth
│   │   ├── trading-service.ts           # Order execution logic
│   │   ├── chart-utils.ts               # TradingView helpers
│   │   ├── price-feeds.ts               # WebSocket price subscriptions
│   │   └── formatting.ts                # Number, currency formatting
│   ├── hooks/
│   │   ├── useWallet.ts                 # Wallet adapter hook
│   │   ├── usePriceData.ts              # Real-time price stream
│   │   ├── useTradeExecution.ts         # Trade mutation hook
│   │   ├── useOrderHistory.ts           # Order query hook
│   │   └── useTheme.ts                  # Theme context hook
│   ├── styles/
│   │   ├── globals.css                  # Design system colors, spacing
│   │   ├── variables.css                # CSS custom properties
│   │   └── animations.css               # Claude-branded motion
│   ├── public/
│   │   ├── fonts/                       # Playfair, JetBrains Mono
│   │   ├── images/
│   │   │   ├── claude-logo.svg
│   │   │   ├── solana-logo.svg
│   │   │   └── pump-logo.svg
│   │   └── icons/                       # Feather icons subset
│   ├── middleware.ts                    # Auth, rate limiting
│   ├── next.config.js                   # Next.js configuration
│   ├── tsconfig.json
│   ├── tailwind.config.js               # TailwindCSS + Claude palette
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── index.ts                     # Express server entry
│   │   ├── config/
│   │   │   ├── environment.ts           # ENV validation (zod)
│   │   │   ├── solana.ts                # RPC, wallet setup
│   │   │   └── database.ts              # Supabase client
│   │   ├── services/
│   │   │   ├── trading/
│   │   │   │   ├── order-executor.ts    # Execute buy/sell
│   │   │   │   ├── price-aggregator.ts  # Multi-source price
│   │   │   │   ├── slippage-calculator.ts
│   │   │   │   └── order-book.ts        # In-memory order state
│   │   │   ├── market-making/
│   │   │   │   ├── mm-strategy.ts       # Liquidation smoothing algo
│   │   │   │   ├── volatility-hedge.ts  # ATR-based spreads
│   │   │   │   └── liquidity-manager.ts # Pool monitoring
│   │   │   ├── fee-collection/
│   │   │   │   ├── fee-monitor.ts       # Dev wallet watch
│   │   │   │   ├── fee-harvester.ts     # Claim SOL logic
│   │   │   │   └── fee-router.ts        # Send to ops wallet
│   │   │   ├── wallet/
│   │   │   │   ├── wallet-manager.ts    # Multi-sig, keypair mgmt
│   │   │   │   ├── balance-tracker.ts   # Real-time SOL/token
│   │   │   │   └── transaction-monitor.ts
│   │   │   └── pump-fun/
│   │   │       ├── pump-client.ts       # API wrapper
│   │   │       ├── token-metadata.ts    # Fetch token info
│   │   │       ├── holder-tracker.ts    # Monitor holders
│   │   │       └── chart-monitor.ts     # Price action monitoring
│   │   ├── jobs/
│   │   │   ├── fee-collection.job.ts    # Cron: collect fees (5m)
│   │   │   ├── market-making.job.ts     # Cron: execute MM (30s)
│   │   │   ├── price-sync.job.ts        # Cron: sync Bitquery (1m)
│   │   │   ├── health-check.job.ts      # Cron: system status (30m)
│   │   │   └── index.ts                 # Job scheduler initialization
│   │   ├── routes/
│   │   │   ├── trading.routes.ts        # POST /trading/execute
│   │   │   ├── wallet.routes.ts         # GET /wallet/balance
│   │   │   ├── token.routes.ts          # GET /token/metrics
│   │   │   ├── fees.routes.ts           # GET /fees/collected
│   │   │   ├── health.routes.ts         # GET /health
│   │   │   └── webhooks.routes.ts       # POST /webhooks/*
│   │   ├── middleware/
│   │   │   ├── auth.ts                  # JWT verification
│   │   │   ├── rate-limit.ts            # Redis rate limiter
│   │   │   ├── error-handler.ts         # Global error catch
│   │   │   └── request-logger.ts        # Structured logging
│   │   ├── database/
│   │   │   ├── migrations/
│   │   │   │   ├── 001_init.sql         # Create tables
│   │   │   │   └── 002_indexes.sql      # Performance indexes
│   │   │   └── schema.ts                # TypeScript types (generated)
│   │   ├── types/
│   │   │   ├── trading.ts               # Order, fill interfaces
│   │   │   ├── wallet.ts                # Wallet, balance types
│   │   │   ├── token.ts                 # Token metadata types
│   │   │   ├── api.ts                   # Request/response envelopes
│   │   │   └── solana.ts                # Solana-specific types
│   │   ├── utils/
│   │   │   ├── logger.ts                # Winston logging
│   │   │   ├── error.ts                 # Custom error classes
│   │   │   ├── validation.ts            # Zod schemas
│   │   │   ├── math.ts                  # BN arithmetic, decimals
│   │   │   └── retry.ts                 # Exponential backoff
│   │   └── constants/
│   │       ├── solana.ts                # RPC URLs, program IDs
│   │       ├── tokens.ts                # Token decimals, mints
│   │       └── trading.ts               # Fee tiers, slippage defaults
│   ├── .env.example
│   ├── .env.local                       # Local secrets (gitignored)
│   ├── Dockerfile                       # Container image
│   ├── docker-compose.yml               # Local dev environment
│   ├── tsconfig.json
│   └── package.json
│
├── scripts/
│   ├── deploy-token.ts                  # PumpFun token creation
│   ├── setup-wallets.ts                 # Initialize dev/ops wallets
│   ├── verify-contract.ts               # Validate configuration
│   └── seed-data.ts                     # Test data insertion
│
├── infra/
│   ├── terraform/
│   │   ├── main.tf                      # AWS/Railway config
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── k8s/                             # Kubernetes manifests (optional)
│       ├── deployment.yaml
│       └── configmap.yaml
│
├── docs/
│   ├── ARCHITECTURE.md                  # System design & flows
│   ├── DEPLOYMENT.md                    # Production runbook
│   ├── API.md                           # Endpoint documentation
│   ├── SECURITY.md                      # Threat model & mitigations
│   └── CONTRIBUTING.md                  # Development guidelines
│
├── .github/
│   └── workflows/
│       ├── test.yml                     # Unit & integration tests
│       └── deploy.yml                   # CI/CD pipeline
│
└── README.md                            # Project overview
```

---

## 4. Naming Patterns

### 4.1 Code Identifiers

**Variables & Functions:**
```typescript
// Wallet addresses (public)
const devWalletAddress = "...; // PublicKey
const operationalWalletAddress = "..."; // PublicKey

// State management
const [tradingState, setTradingState] = useState<TradingState>({
  isExecuting: boolean;
  lastTradeTime: number;
  pendingOrders: Order[];
});

// Event handlers
const handleBuyOrder = async (amount: BN) => {};
const handleSellOrder = async (amount: BN) => {};
const handleWalletConnect = () => {};

// Service functions
async function executeMarketOrder() {}
async function collectDevWalletFees() {}
async function rebalanceOperationalWallet() {}
async function smoothChartVolatility() {}

// Database operations
async function insertTradeRecord() {}
async function updateWalletBalance() {}
async function fetchOrderHistory() {}
```

**React Components:**
```typescript
// Use PascalCase, descriptive names
<PriceChart tokenMint={mint} timeframe="1d" />
<PortfolioCard wallet={wallet} />
<OrderExecutor onSuccess={handleOrderFill} />
<WalletStatusBadge balance={balance} />
<FeeCollectionMetrics period="24h" />

// Props interfaces
interface PriceChartProps {
  tokenMint: PublicKey;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  height?: number;
  showVolume?: boolean;
}
```

**Database Tables & Columns:**
```sql
-- Tables: snake_case, plural
CREATE TABLE trades (
  id UUID PRIMARY KEY,
  user_wallet VARCHAR,
  token_mint VARCHAR,
  trade_type ENUM('buy', 'sell'),
  amount_sol DECIMAL,
  token_amount DECIMAL,
  execution_price DECIMAL,
  slippage_percent DECIMAL,
  transaction_signature VARCHAR,
  status ENUM('pending', 'confirmed', 'failed'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  INDEX idx_user_wallet (user_wallet),
  INDEX idx_created_at (created_at)
);

CREATE TABLE fee_collections (
  id UUID PRIMARY KEY,
  dev_wallet_address VARCHAR,
  collected_sol_amount DECIMAL,
  routed_to_ops_wallet_tx VARCHAR,
  collected_at TIMESTAMP,
  created_at TIMESTAMP
);

CREATE TABLE market_making_orders (
  id UUID PRIMARY KEY,
  order_type ENUM('buy', 'sell'),
  target_price DECIMAL,
  quantity_tokens DECIMAL,
  status ENUM('pending', 'filled', 'cancelled'),
  execution_tx VARCHAR,
  created_at TIMESTAMP,
  filled_at TIMESTAMP
);
```

**API Endpoint Naming:**
```
✅ CORRECT: RESTful, resource-based
POST   /api/v1/trading/orders           → Create order
GET    /api/v1/trading/orders           → List orders
GET    /api/v1/trading/orders/:id       → Get specific order
GET    /api/v1/token/metrics            → Fetch token metrics
POST   /api/v1/wallet/withdraw          → Execute withdrawal
GET    /api/v1/fees/collected           → Fee collection history

❌ INCORRECT: Verb-based, unclear
GET    /api/executeOrder                → Use POST /api/v1/orders
POST   /api/getFees                     → Use GET /api/v1/fees
GET    /api/v1/getPriceData             → Use GET /api/v1/prices
```

**Environment Variables:**
```bash
# Solana RPC
SOLANA_RPC_ENDPOINT="https://api.mainnet-beta.solana.com"
SOLANA_RPC_FALLBACK="https://helius-rpc.com"
SOLANA_WS_ENDPOINT="wss://api.mainnet-beta.solana.com"

# Wallets (encrypted or HSM-backed)
DEV_WALLET_KEYPAIR="[base58_encoded_secret_key]"
OPERATIONAL_WALLET_KEYPAIR="[base58_encoded_secret_key]"
DEV_WALLET_ADDRESS="..."
OPERATIONAL_WALLET_ADDRESS="..."

# Token Configuration
TOKEN_MINT_ADDRESS="..."
TOKEN_DECIMALS=6
TOKEN_SYMBOL="CLAUDE"

# API Keys (external services)
BITQUERY_API_KEY="..."
JUPITER_API_KEY="..."
QUICKNODE_API_KEY="..."

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/flywheel"
SUPABASE_URL="..."
SUPABASE_ANON_KEY="..."

# Trading Parameters
MM_SPREAD_BASIS_POINTS=50          # 0.5% bid-ask
MM_CHECK_INTERVAL_MS=30000         # 30 seconds
FEE_COLLECTION_INTERVAL_MS=300000  # 5 minutes
MAX_SLIPPAGE_PERCENT=2.0

# Security
JWT_SECRET="..."
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000

# Environment
NODE_ENV="production"
LOG_LEVEL="info"
```

---

## 5. UI Design (Claude-Inspired Frontend)

### 5.1 Design System Foundation

**Typography Hierarchy**
```css
:root {
  /* Distinctive typefaces */
  --font-display: 'Playfair Display', serif;      /* Headlines */
  --font-mono: 'JetBrains Mono', monospace;       /* Code, numbers */
  --font-sans: 'Bricolage Grotesque', sans-serif; /* Body text */
  
  /* Scale */
  --text-4xl: 2.25rem;  /* Main hero headline */
  --text-3xl: 1.875rem; /* Section titles */
  --text-2xl: 1.5rem;   /* Subsection titles */
  --text-xl: 1.25rem;   /* Card headers */
  --text-lg: 1rem;      /* Normal text, buttons */
  --text-base: 0.875rem;/* Smaller text, hints */
  --text-sm: 0.75rem;   /* Micro-labels */
}
```

**Color Palette (Claude AI Inspired)**
```css
:root {
  /* Claude brand: Elegant, sophisticated, trustworthy */
  --color-primary: #2B2D31;        /* Deep charcoal (Claude's core) */
  --color-secondary: #5865F2;      /* Vibrant purple-blue accent */
  --color-accent: #4A9EFF;         /* Bright sky blue */
  --color-success: #57F287;        /* Soft green */
  --color-warning: #FFA500;        /* Warm orange */
  --color-danger: #ED4245;         /* Alert red */
  
  /* Backgrounds */
  --bg-primary: #FFFFFF;           /* Light mode: clean white */
  --bg-secondary: #F6F6F7;         /* Light gray for cards */
  --bg-tertiary: #EBEDEF;          /* Subtle dividers */
  --bg-dark-primary: #1E1F22;      /* Dark mode: almost black */
  --bg-dark-secondary: #2C2F33;    /* Slightly lighter */
  
  /* Text */
  --text-primary: #000000;
  --text-secondary: #72767D;
  --text-muted: #949BA4;
  --text-dark-primary: #FFFFFF;
  --text-dark-secondary: #B5BAC1;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  :root {
    --color-primary: #FFFFFF;
    --bg-primary: var(--bg-dark-primary);
    --bg-secondary: var(--bg-dark-secondary);
    --text-primary: var(--text-dark-primary);
    --text-secondary: var(--text-dark-secondary);
  }
}
```

**Spacing & Layout**
```css
:root {
  --spacing-unit: 8px;
  --space-1: 0.25rem;    /* 4px */
  --space-2: 0.5rem;     /* 8px */
  --space-3: 0.75rem;    /* 12px */
  --space-4: 1rem;       /* 16px */
  --space-6: 1.5rem;     /* 24px */
  --space-8: 2rem;       /* 32px */
  --space-12: 3rem;      /* 48px */
  
  /* Rounded corners */
  --rounded-sm: 0.375rem;   /* 6px (inputs) */
  --rounded-md: 0.5rem;     /* 8px (buttons) */
  --rounded-lg: 0.75rem;    /* 12px (cards) */
  --rounded-xl: 1rem;       /* 16px (modals) */
  --rounded-full: 9999px;   /* Pills, avatars */
}
```

**Shadows & Depth**
```css
:root {
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.07);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);
  --shadow-inner: inset 0 2px 4px rgba(0, 0, 0, 0.06);
}
```

### 5.2 Component Library

**Buttons**
```jsx
// Primary CTA
<button className="btn btn-primary">
  Execute Buy Order
</button>

// Secondary (less emphasis)
<button className="btn btn-secondary">
  Cancel Order
</button>

// Outline (subtle)
<button className="btn btn-outline">
  View History
</button>

// Danger (destructive)
<button className="btn btn-danger">
  Force Withdrawal
</button>

// Loading state
<button className="btn btn-primary" disabled>
  <Spinner size="sm" /> Processing...
</button>
```

**Input Fields**
```jsx
<input 
  type="number" 
  placeholder="Amount in SOL"
  className="input input-primary"
/>

<select className="input input-select">
  <option>1 Minute</option>
  <option>5 Minutes</option>
  <option>1 Hour</option>
</select>

<textarea 
  placeholder="Notes"
  className="input input-textarea"
/>
```

**Cards & Containers**
```jsx
<div className="card">
  <div className="card-header">
    <h3 className="card-title">Portfolio Summary</h3>
  </div>
  <div className="card-body">
    <p>Content goes here</p>
  </div>
  <div className="card-footer">
    <button>Action</button>
  </div>
</div>
```

**Data Visualization**
```jsx
// Price chart with TradingView Lightweight
<PriceChart
  tokenMint={tokenMint}
  timeframe="1h"
  height={400}
  showVolume
/>

// Metric badge
<MetricBadge
  label="24h Volume"
  value="$127,450.32"
  change="+12.5%"
  trend="up"
/>

// Order table
<OrderTable
  orders={orders}
  onRowClick={handleSelectOrder}
  sortBy="createdAt"
  sortOrder="desc"
/>
```

### 5.3 Key Screens

**1. Dashboard (Home)**
- Real-time token price chart (1h, 4h, 1d)
- Portfolio card: Current holdings, unrealized gains
- Market metrics: 24h volume, ATH, market cap, holders
- Fee collection summary (monthly collected SOL)
- Order book display (bid/ask spreads)
- Recent trades feed (live updates)

**2. Trading Interface**
- Buy/Sell toggle with input fields
- Slippage tolerance selector (0.5% → 5%)
- Live price update (green/red indicators)
- Order preview (you pay X SOL, receive Y tokens)
- Execute button with spinner + toast feedback
- Transaction confirmation modal with explorer link

**3. Fee Analytics**
- Daily collected SOL chart (bar graph)
- Fee distribution breakdown (dev wallet → ops wallet)
- Historical fee table with timestamps
- Cumulative total (month, quarter, year)

**4. Wallet Management**
- Dev wallet balance (display-only)
- Operational wallet balance (display-only)
- Connected wallet (if user connected)
- Transaction history (recent 20 TXs)

**5. Settings**
- Dark/light theme toggle
- Chart timeframe preferences
- Notification settings
- Export data (CSV)

### 5.4 Motion & Micro-Interactions

```css
/* Page transitions */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.page-enter {
  animation: fadeInUp 0.3s ease-out;
}

/* Button hover states */
.btn-primary:hover {
  background: linear-gradient(135deg, #5865F2 0%, #4A9EFF 100%);
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(88, 101, 242, 0.3);
  transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

/* Price indicator animation (ticker tape) */
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.price-update.positive {
  color: var(--color-success);
  animation: slideInRight 200ms ease-out;
}

.price-update.negative {
  color: var(--color-danger);
}

/* Loading pulse */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.skeleton {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Respect user preferences */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 5.5 Accessibility Standards

- **WCAG 2.1 AA** compliance (contrast ratios, keyboard nav)
- `<label>` associated with all form inputs
- Semantic HTML (`<button>`, `<nav>`, `<main>`, `<section>`)
- ARIA attributes for dynamic content (`aria-live`, `aria-label`)
- Focus indicators on interactive elements
- Alt text for all images
- Keyboard-navigable (Tab order, ESC to close modals)

---

## 6. Key Features & User Flow

### 6.1 Feature Set

| Feature | Priority | Description |
|---------|----------|-------------|
| **Automated Fee Collection** | P0 | Monitor dev wallet, harvest SOL, route to ops wallet |
| **Chart Smoothing MM** | P0 | Execute buy/sell orders to reduce volatility |
| **Real-time Dashboard** | P0 | Live price, volume, orders, fee tracking |
| **Trading Interface** | P1 | Buy/sell UI with slippage control |
| **Order History** | P1 | User & bot trade history with fills |
| **Wallet Integration** | P1 | Connect Phantom, Magic Wallet, view portfolio |
| **Alert Notifications** | P2 | Price milestones, fee collection events |
| **Analytics Export** | P2 | CSV export of trading history |
| **Multi-wallet Support** | P2 | Support Ledger, Trezor via wallet adapter |
| **Advanced Charting** | P2 | Custom indicators (EMA, RSI, MACD) |

### 6.2 Core User Flows

**Flow 1: Connect Wallet & View Dashboard**
```
User lands on homepage
    ↓
Click "Connect Wallet"
    ↓
Select wallet (Phantom, Magic, etc.)
    ↓
Sign message (no transaction)
    ↓
Dashboard loads with:
    - Real-time Claude token chart
    - Holdings (if user owns tokens)
    - Fee collection metrics
    - Market stats
    ↓
User can explore trading UI
```

**Flow 2: Execute Buy Order**
```
User navigates to Trading page
    ↓
Connected wallet shows balance (e.g., 1.5 SOL)
    ↓
User enters "0.5 SOL" in amount field
    ↓
System calculates:
    - Current token price: $0.0012
    - Tokens you'll receive: ≈416,666 (after slippage)
    - Est. slippage: 0.8%
    ↓
User adjusts slippage (default 2%)
    ↓
Click "Execute Buy Order"
    ↓
Transaction preview modal appears
    - "You pay: 0.5 SOL"
    - "You receive: ≈416,666 CLAUDE"
    ↓
Click "Confirm & Sign"
    ↓
Phantom wallet pops up, user signs
    ↓
Backend:
    1. Builds transaction with Jupiter routing
    2. Simulates for errors
    3. Submits to Solana RPC
    4. Polls for confirmation (30 seconds)
    ↓
Success toast: "Order executed! TX: 3a7f..."
    ↓
Chart updates, holdings rebalance
    ↓
Order appears in history table
```

**Flow 3: Fee Collection (Backend Automation)**
```
Cron job runs every 5 minutes
    ↓
Checks dev wallet for token holdings
    ↓
Calculates unclaimed fees:
    - Dev wallet had 10M tokens yesterday
    - Now has 9.5M tokens
    - Difference = trading volume (0.5M tokens traded)
    - Fee earned = 0.5M * 0.01 (1% fee) = 5K tokens
    ↓
Converts to SOL via Jupiter:
    - 5K CLAUDE @ $0.0012 = 6 SOL
    ↓
Executes swap transaction:
    - FROM: Dev wallet token holdings
    - TO: Dev wallet SOL balance
    - AMOUNT: ~5K CLAUDE tokens
    ↓
Transfers SOL to ops wallet:
    - Sends 6 SOL from dev → ops
    ↓
Records in database:
    - fee_collections table updated
    - Dashboard reflects new total
    ↓
Next MM job uses ops wallet SOL
    for buy orders
```

**Flow 4: Market-Making (Volatility Smoothing)**
```
Cron job runs every 30 seconds
    ↓
Fetches recent price action:
    - Last 20 candles (1-minute)
    - Calculate volatility (ATR indicator)
    - Check bid-ask spread
    ↓
If price dropped >2% in 5 min:
    - Market-making BUY order triggered
    - Buys 5K tokens with ops wallet SOL
    - Smooths downside, prevents panic sells
    ↓
If price rose >2% in 5 min:
    - Market-making SELL order triggered
    - Sells 5K tokens from ops wallet holdings
    - Takes profit, prevents FOMO pumps
    ↓
Execution:
    1. Calculates optimal entry price
    2. Builds transaction
    3. Simulates for success
    4. Submits with priority fee if needed
    5. Polls for confirmation
    ↓
Updates order_book state
    - Records in database
    - Dashboard shows MM order
    ↓
Portfolio rebalances automatically
```

### 6.3 Permission Model

| Role | Permissions | Notes |
|------|-------------|-------|
| **Public User** | View dashboard, charts, order book, fee stats | Read-only access |
| **Connected User** | + Buy/sell via wallet, view personal order history | Requires wallet sig |
| **Admin** | + Manual fee collection, emergency halt, settings | Multisig auth |
| **Bot Service** | Execute trades on dev/ops wallets, update DB | Backend only |

---

## 7. Backend Architecture (Supabase + Node.js)

### 7.1 Database Schema

```sql
-- Main tables
CREATE TABLE tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mint_address VARCHAR UNIQUE NOT NULL,
  symbol VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  decimals INTEGER,
  image_url TEXT,
  twitter_handle VARCHAR,
  website_url TEXT,
  launch_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_type ENUM('dev', 'operational', 'user'),
  address VARCHAR UNIQUE NOT NULL,
  balance_sol DECIMAL(20, 8),
  balance_tokens DECIMAL(20, 8),
  last_synced TIMESTAMP,
  created_at TIMESTAMP
);

CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_wallet VARCHAR,
  trade_type ENUM('buy', 'sell') NOT NULL,
  token_mint VARCHAR NOT NULL REFERENCES tokens(mint_address),
  amount_sol DECIMAL(20, 8),
  amount_tokens DECIMAL(20, 8),
  execution_price DECIMAL(20, 8),
  slippage_percent DECIMAL(5, 2),
  transaction_signature VARCHAR UNIQUE,
  status ENUM('pending', 'confirmed', 'failed', 'cancelled'),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT now(),
  confirmed_at TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_initiator (initiator_wallet)
);

CREATE TABLE fee_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dev_wallet_address VARCHAR,
  tokens_collected DECIMAL(20, 8),
  sol_value_at_collection DECIMAL(20, 8),
  swap_transaction_signature VARCHAR,
  transfer_transaction_signature VARCHAR,
  status ENUM('pending', 'completed', 'failed'),
  collected_at TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now(),
  INDEX idx_collected_at (collected_at)
);

CREATE TABLE market_making_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_type ENUM('buy', 'sell') NOT NULL,
  wallet_address VARCHAR,
  token_mint VARCHAR REFERENCES tokens(mint_address),
  quantity_tokens DECIMAL(20, 8),
  target_price DECIMAL(20, 8),
  spread_bps INTEGER, -- basis points
  status ENUM('pending', 'filled', 'partially_filled', 'cancelled'),
  execution_tx VARCHAR,
  filled_quantity DECIMAL(20, 8) DEFAULT 0,
  average_fill_price DECIMAL(20, 8),
  created_at TIMESTAMP DEFAULT now(),
  filled_at TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_token_mint (token_mint)
);

CREATE TABLE price_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint VARCHAR REFERENCES tokens(mint_address),
  price_usd DECIMAL(20, 8),
  volume_24h DECIMAL(20, 2),
  market_cap DECIMAL(20, 2),
  holder_count INTEGER,
  source ENUM('pumpfun', 'jupiter', 'coingecko'),
  captured_at TIMESTAMP DEFAULT now(),
  INDEX idx_token_captured (token_mint, captured_at)
);

CREATE TABLE transaction_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_signature VARCHAR UNIQUE,
  block_time BIGINT,
  status ENUM('success', 'failed'),
  error_code TEXT,
  instruction_count INTEGER,
  fee_lamports BIGINT,
  logged_at TIMESTAMP DEFAULT now()
);

CREATE TABLE bot_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name VARCHAR,
  status ENUM('healthy', 'degraded', 'critical'),
  last_run TIMESTAMP,
  last_error TEXT,
  consecutive_failures INTEGER,
  checked_at TIMESTAMP DEFAULT now(),
  INDEX idx_service_checked (service_name, checked_at)
);

-- Realtime subscriptions for frontend
CREATE TRIGGER prices_notify AFTER INSERT OR UPDATE ON price_snapshots
  FOR EACH ROW EXECUTE FUNCTION notify_subscribers();

CREATE TRIGGER trades_notify AFTER INSERT ON trades
  FOR EACH ROW EXECUTE FUNCTION notify_subscribers();
```

### 7.2 Service Layer Architecture

```typescript
// Example: Fee Collection Service
class FeeCollectionService {
  private supabase: SupabaseClient;
  private solanaClient: Connection;
  private devWallet: Keypair;
  private opsWallet: PublicKey;

  async collectFees(): Promise<void> {
    // 1. Monitor dev wallet token balance
    const devTokenBalance = await this.getTokenBalance(this.devWallet.publicKey);
    
    // 2. Compare to baseline (from prev run)
    const lastRecord = await this.supabase
      .from('fee_collections')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    const feesEarned = devTokenBalance - (lastRecord?.tokens_collected || 0);
    
    if (feesEarned < MINIMUM_FEE_THRESHOLD) {
      console.log('Insufficient fees to collect');
      return;
    }

    // 3. Swap tokens → SOL via Jupiter
    const swapTx = await this.executeJupiterSwap(feesEarned);
    
    // 4. Transfer SOL to ops wallet
    const transferTx = await this.transferSOL(feesEarned * currentPrice, this.opsWallet);

    // 5. Log to database
    await this.supabase.from('fee_collections').insert({
      dev_wallet_address: this.devWallet.publicKey.toString(),
      tokens_collected: feesEarned,
      sol_value_at_collection: feesEarned * currentPrice,
      swap_transaction_signature: swapTx,
      transfer_transaction_signature: transferTx,
      status: 'completed'
    });
  }

  private async executeJupiterSwap(tokenAmount: BN): Promise<string> {
    // Build + sign + send swap instruction
  }

  private async transferSOL(amount: BN, recipient: PublicKey): Promise<string> {
    // Build transfer instruction, sign, send
  }
}
```

### 7.3 Job Scheduler

```typescript
import cron from 'node-cron';
import { Queue } from 'bull';

const jobQueue = new Queue('solana-jobs');

// Fee collection every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await jobQueue.add('collectFees', {}, { removeOnComplete: true });
});

// Market making every 30 seconds
cron.schedule('*/0.5 * * * * *', async () => {
  const price = await getPriceData();
  const volatility = calculateVolatility(price);
  
  if (volatility > THRESHOLD) {
    await jobQueue.add('executeMarketMaking', { volatility });
  }
});

// Health check every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  await jobQueue.add('healthCheck', {});
});

// Process jobs with retry logic
jobQueue.process('collectFees', async (job) => {
  const service = new FeeCollectionService();
  return await service.collectFees();
});

jobQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
  // Alert admin, log to database
});
```

### 7.4 Real-time WebSocket Architecture

```typescript
// Backend: Broadcast price updates
const supabase = createClient(URL, KEY);

async function broadcastPriceUpdates() {
  const channel = supabase.channel('price-updates');
  
  channel
    .on('database', {
      event: '*',
      schema: 'public',
      table: 'price_snapshots'
    }, (payload) => {
      channel.send({
        type: 'broadcast',
        event: 'price_update',
        payload
      });
    })
    .subscribe();
}

// Frontend: Subscribe to updates
const channel = supabase
  .channel('price-updates')
  .on('broadcast', { event: 'price_update' }, (payload) => {
    setPriceData(payload.new);
    setLastUpdate(new Date());
  })
  .subscribe();
```

---

## 8. Constraints

### 8.1 Technical Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|-----------|
| **Solana RPC Rate Limits** | Max 40,000 requests/minute | Use Helius/QuickNode, batch requests, cache aggressively |
| **Jupiter Router Latency** | Quote API slow if uncached | Cache quotes for 30s, use pre-built routes |
| **PumpFun Contract Immutability** | Cannot modify token on-chain | Work within existing contract logic |
| **Transaction Finality** | Solana finality is ~20 blocks | Poll for confirmation before next action |
| **Wallet Keypair Security** | Cannot use browser storage | HSM, KMS, or secure enclave (never exposed) |
| **Supabase Connection Limits** | 100 concurrent at free tier | Upgrade plan or use connection pooling |

### 8.2 Business Constraints

| Constraint | Details |
|-----------|---------|
| **Regulatory Compliance** | No margin lending, derivatives, or unregistered securities sales. Token is utility/meme only. |
| **Pump.fun TOS** | Must not manipulate chart via wash trading. MM must show genuine intent (reasonable spreads). |
| **Solana Network Congestion** | High fees during network stress; may increase slippage. |
| **Market Conditions** | Low liquidity in early days; initial volume may be artificial (MM orders). |
| **Dev Wallet Security** | If compromised, fee revenue at risk. Requires multi-sig or hardware signer. |

### 8.3 Operational Constraints

| Constraint | Resolution |
|-----------|-----------|
| **Uptime SLA** | Target 99.5% (health checks, auto-restart on failure) |
| **Monitoring Overhead** | 24/7 alerting for transaction failures, fee collection errors |
| **Incident Response** | On-call rotation, runbooks for common issues |
| **Data Retention** | 12 months of transaction logs (GDPR compliant) |
| **Backup Strategy** | Nightly Supabase backups, versioned secrets in AWS Secrets Manager |

---

## 9. Security Architecture

### 9.1 Threat Model & Mitigations

| Threat | Impact | Mitigation |
|--------|--------|-----------|
| **Dev Wallet Compromise** | Attacker drains fees or token supply | Multi-sig wallet (2-of-3 threshold), hardware signers only |
| **API Key Leakage** | Unauthorized trading, data breach | Rotate monthly, use AWS Secrets Manager, no logs with keys |
| **Frontend RPC Endpoint Hijacking** | Users routed to fake RPC, lose funds | Pin RPC endpoints, HTTPS only, certificate pinning |
| **Smart Contract Reentrancy** | (N/A: PumpFun is immutable) | N/A |
| **Rate Limit Bypass** | Spam attacks, DOS | Implement JWT-based rate limiting, Cloudflare WAF |
| **XSS via Chart Data** | Malicious chart title injects JS | Sanitize all user input, use DOMPurify |
| **CSRF on Trade Execution** | Cross-site request forgery | Double-submit cookies, SameSite=Strict |
| **Man-in-the-Middle** | Intercept Solana RPC responses | HTTPS enforced, response signature verification |

### 9.2 Wallet Security

```typescript
// ✅ CORRECT: Secure keypair handling
import { readFileSync } from 'fs';
import crypto from 'crypto';

// Load from HSM or KMS (never raw files in code)
const devWalletSecret = process.env.DEV_WALLET_KEYPAIR;
const decrypted = crypto.privateDecrypt(
  { key: kmsPublicKey },
  Buffer.from(devWalletSecret, 'base64')
);
const devWallet = Keypair.fromSecretKey(decrypted);

// ✅ Sign transactions with signer middleware
app.post('/api/v1/trading/execute', async (req, res) => {
  const transaction = Transaction.from(req.body.tx);
  transaction.sign(devWallet); // Never expose private key
  await sendAndConfirmTransaction(connection, transaction);
});

// ❌ WRONG: Never do this
const privateKey = "5Kb..."; // Hardcoded secret!
const wallet = new Keypair(privateKey); // Exposed in code!
window.localStorage.setItem('wallet', privateKey); // Browser storage!
```

### 9.3 API Security

```typescript
// Authentication: JWT + Rate Limiting
import jwt from 'jsonwebtoken';

app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
});

// Rate limiting
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per window
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({ error: 'Rate limit exceeded' });
  }
});

app.use('/api/v1/', limiter);
```

### 9.4 Frontend Security

```typescript
// Input validation & sanitization
import { z } from 'zod';
import DOMPurify from 'dompurify';

const tradeSchema = z.object({
  amount: z.number().min(0.01).max(1000),
  slippage: z.number().min(0.1).max(10),
  tokenMint: z.string().regex(/^[A-Za-z0-9]+$/), // Solana address format
});

const handleTrade = async (input) => {
  const validated = tradeSchema.parse(input); // Throws if invalid
  const sanitized = {
    ...validated,
    tokenMint: DOMPurify.sanitize(validated.tokenMint)
  };
  // Proceed with sanitized data
};

// Content Security Policy
// In Next.js: next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' https: data:"
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  }
];
```

### 9.5 Environment & Secrets Management

```bash
# .env.production (never in git)
# Use AWS Secrets Manager, HashiCorp Vault, or similar

# Secrets Rotation
# - API keys: monthly
# - JWT secret: quarterly
# - Wallet keypairs: annual + on compromised alert

# Audit Logging
# All sensitive operations logged with:
# - User ID
# - Action taken
# - Timestamp
# - IP address
# - Transaction signature
# - Status (success/failure)

# Example: Sensitive action log
INSERT INTO audit_logs (
  user_id, action, timestamp, ip_address, transaction_signature, status
) VALUES (
  'user123', 'trade_executed', now(), '203.0.113.42', 'abc123...', 'success'
);
```

---

## 10. Suggestions & Advanced Ideas

### 10.1 Short-term Enhancements (Month 1-2)

1. **Community Features**
   - Discord webhook: Announce trades, fee milestones, price alerts
   - Leaderboard: Top holders, volume traders
   - DAO vote: Community decisions on fee allocation

2. **Analytics Dashboard**
   - Stacked area chart: Cumulative fees collected
   - Heatmap: Hourly trading volume
   - Correlation: Claude token vs. SOL price

3. **Gamification**
   - Achievement badges (first trade, 1K tokens, etc.)
   - Referral rewards (5% kickback on friend trades)
   - Weekly contests (highest volume trader wins)

4. **Advanced Trading**
   - Limit orders (auto-execute at target price)
   - DCA (Dollar Cost Averaging) scheduler
   - Trailing stop-loss orders

### 10.2 Medium-term Roadmap (Month 3-6)

1. **Governance Integration**
   - Stake CLAUDE tokens to earn protocol fees
   - DAO treasury for market-making capital
   - Community proposal voting (Snapshot)

2. **Cross-chain Bridge**
   - Wrap CLAUDE on Ethereum (ERC-20)
   - Liquidity pools on Uniswap
   - Multi-chain fee aggregation

3. **AI-Powered Features**
   - Sentiment analysis: Twitter/Discord mentions
   - Predictive alerts: ML model for pump signals
   - Adaptive MM: Intelligent spread management based on volatility

4. **Mobile App**
   - React Native version (iOS/Android)
   - Push notifications for trades
   - Biometric wallet authentication

### 10.3 Long-term Vision (6+ months)

1. **Protocol Diversification**
   - Launch spin-off tokens (meme variants)
   - Cross-platform integrations (Moonshot, Bonk)
   - Marketplace for token templates

2. **Institutional Features**
   - API for hedge funds/trading bots
   - Liquidity provider dashboard
   - Real-time settlement layer

3. **Sustainability**
   - Recurring revenue model (premium features)
   - Marketplace fees for custom strategies
   - Enterprise licensing

### 10.4 Technical Debt Prevention

- **Code Quality**: Enforce 80%+ test coverage (Jest + Hardhat)
- **Performance**: APM monitoring (New Relic, DataDog)
- **Documentation**: Auto-generated API docs (OpenAPI/Swagger)
- **Security**: Monthly penetration testing, bug bounty program
- **Scalability**: Load testing, database query optimization

---

## 11. Launch Checklist

### Pre-Launch (Week 1)

- [ ] Deploy token on PumpFun
- [ ] Configure dev & ops wallets (multi-sig)
- [ ] Set up Supabase database + migrations
- [ ] Initialize Helius/QuickNode RPC endpoints
- [ ] Test fee collection flow (staging)
- [ ] Test market-making strategy (paper trading)
- [ ] Security audit (internal review)
- [ ] Set up monitoring & alerting

### Launch Day (Week 2)

- [ ] Go live: Frontend deployed to Vercel
- [ ] Go live: Backend deployed to Railway
- [ ] Verify all API endpoints respond
- [ ] Monitor for errors (Sentry/LogRocket)
- [ ] Announce on Twitter/Discord
- [ ] Execute first manual trade test
- [ ] Monitor first fee collection cycle

### Post-Launch (Week 3+)

- [ ] Community moderation (Discord, Twitter)
- [ ] Bug bounty program launch
- [ ] Performance monitoring (RPC latency, DB queries)
- [ ] Gather feedback & iterate
- [ ] Plan next feature release

---

## 12. Appendix: Key Files to Create

### Quick Reference

```
Priority | File | Purpose
---------|------|--------
P0 | .env.example | Environment template
P0 | database/migrations/001_init.sql | Schema setup
P0 | backend/services/trading/order-executor.ts | Trade execution
P0 | frontend/app/dashboard/page.tsx | Main UI
P0 | frontend/lib/solana-client.ts | RPC connection
P1 | backend/jobs/fee-collection.job.ts | Fee automation
P1 | backend/services/market-making/mm-strategy.ts | MM logic
P1 | frontend/components/PriceChart.tsx | Chart UI
P2 | docs/ARCHITECTURE.md | Design documentation
P2 | scripts/deploy-token.ts | Launch script
```

---

## Closing Notes

This PRD provides a **battle-tested architecture** for a production-grade Solana meme token flywheel. Key success factors:

1. **Automation over manual ops**: Cron jobs handle fee collection + MM
2. **Transparency**: Real-time dashboard + audit logs build trust
3. **Security-first**: Multi-sig wallets, HSM signers, minimal exposure
4. **Scalability**: Supabase realtime + serverless backend
5. **Community-driven**: Discord integration, referrals, governance

The Claude branding provides **unique positioning** in a crowded meme economy—combining AI credibility with crypto playfulness.

**Next steps:**
1. Set up development environment (Node.js, Docker, Solana CLI)
2. Create Supabase project + run migrations
3. Implement trading service layer
4. Build frontend components in parallel
5. Stress-test with paper trading before mainnet launch

---

**Document Version:** 1.0  
**Last Updated:** January 6, 2026  
**Approvals:** [Pending]  
**Contact:** [Team Lead Email]
