# ClaudeWheel Market Making Algorithms

A comprehensive guide to the market making (MM) algorithms available in ClaudeWheel, their mechanics, profitability analysis, and potential future improvements.

---

## Table of Contents

1. [Overview](#overview)
2. [Current Algorithms](#current-algorithms)
   - [Simple Mode](#1-simple-mode)
   - [Turbo Lite Mode](#2-turbo-lite-mode)
   - [Transaction Reactive Mode](#3-transaction-reactive-mode)
3. [Profitability Analysis](#profitability-analysis)
4. [Potential Future Algorithms](#potential-future-algorithms)
5. [Configuration Reference](#configuration-reference)

---

## Overview

ClaudeWheel provides automated market making for Solana tokens on Bags.fm. The MM engine executes trades on behalf of token creators to:

- **Generate trading volume** - Makes the token appear active
- **Provide liquidity** - Enables smoother trades for other users
- **Support price discovery** - Facilitates market dynamics
- **Manage token distribution** - Controls supply in circulation

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ClaudeWheel Backend                       │
├─────────────────────────────────────────────────────────────┤
│  Multi-Flywheel Job (1 min interval)                        │
│  ├── Simple Algorithm                                       │
│  ├── Turbo Lite Algorithm                                   │
│  └── (excludes transaction_reactive)                        │
├─────────────────────────────────────────────────────────────┤
│  WebSocket Reactive Service (real-time)                     │
│  └── Transaction Reactive Algorithm                         │
├─────────────────────────────────────────────────────────────┤
│  Bags SDK → Quote & Swap Execution                          │
│  Privy → Delegated Wallet Signing                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Current Algorithms

### 1. Simple Mode

**Status:** ✅ Fully Implemented
**Best For:** Low-maintenance volume generation, new tokens

#### How It Works

Executes a fixed cycle of **5 buys followed by 5 sells**, with one trade per job run (every ~1 minute).

```
Cycle: BUY → BUY → BUY → BUY → BUY → SELL → SELL → SELL → SELL → SELL → (repeat)
```

#### Trade Sizing

- **Buy amount:** `available_SOL × buy_percent%` (default 20%)
- **Sell amount:** `token_balance × sell_percent%` (default 20%)

#### Execution Flow

```
1. Check cycle phase (buy or sell)
2. If BUY phase:
   - Get SOL balance (minus 0.01 reserve)
   - Calculate: buy_amount = available_SOL × 20%
   - Execute swap via Bags SDK
   - Increment buy_count
   - After 5 buys → switch to SELL phase
3. If SELL phase:
   - Get token balance
   - Calculate: sell_amount = token_balance × 20%
   - Execute swap via Bags SDK
   - Increment sell_count
   - After 5 sells → switch to BUY phase
```

#### Example Cycle

Starting with 1 SOL and 0 tokens:

| Trade | Phase | Action | Amount | Result |
|-------|-------|--------|--------|--------|
| 1 | Buy | Buy tokens | 0.20 SOL | 0.80 SOL, ~2000 tokens |
| 2 | Buy | Buy tokens | 0.16 SOL | 0.64 SOL, ~3600 tokens |
| 3 | Buy | Buy tokens | 0.13 SOL | 0.51 SOL, ~4900 tokens |
| 4 | Buy | Buy tokens | 0.10 SOL | 0.41 SOL, ~5900 tokens |
| 5 | Buy | Buy tokens | 0.08 SOL | 0.33 SOL, ~6700 tokens |
| 6 | Sell | Sell tokens | 1340 tokens | ~0.40 SOL, 5360 tokens |
| 7 | Sell | Sell tokens | 1072 tokens | ~0.46 SOL, 4288 tokens |
| ... | ... | ... | ... | ... |

#### Pros & Cons

| Pros | Cons |
|------|------|
| Simple and predictable | Slow cycle (~10+ minutes) |
| Low risk per trade | Visible pattern to observers |
| Easy to understand | Not responsive to market |
| Minimal configuration | May miss opportunities |

#### Configuration

```typescript
{
  algorithm_mode: 'simple',
  buy_percent: 20,      // 1-100
  sell_percent: 20,     // 1-100
  slippage_bps: 300,    // basis points (3%)
}
```

---

### 2. Turbo Lite Mode

**Status:** ✅ Fully Implemented
**Best For:** Rapid volume generation, completing cycles quickly

#### How It Works

Executes **all buys rapidly (8 trades), then all sells (8 trades)** in a single job run with configurable delays between trades.

```
Single Job Run:
BUY×8 (rapid) → SELL×8 (rapid) → Cycle Complete

Total time: ~1-2 minutes instead of 16+ minutes
```

#### Key Features

- **Advisory locks** prevent concurrent execution
- **State persistence** for crash recovery
- **Emergency sell** triggers if SOL drops below 0.1
- **Batch state updates** reduce DB writes

#### Execution Flow

```
1. Acquire advisory lock (skip if another instance running)
2. BUY PHASE:
   - Execute 8 rapid buys with delays
   - Track tokens purchased
   - Stop early if SOL < 0.1 (emergency)
3. SELL PHASE:
   - Sell exactly what was bought (tokens_bought / 8 per trade)
   - Or sell ALL tokens if emergency mode triggered
4. Reset state for next cycle
5. Release lock
```

#### Example Cycle

```
Time 0:00   - Buy 1/8: 0.20 SOL → tokens
Time 0:00.5 - Buy 2/8: 0.16 SOL → tokens
Time 0:01   - Buy 3/8: 0.13 SOL → tokens
...
Time 0:03.5 - Buy 8/8: Complete
Time 0:04   - Sell 1/8: tokens → SOL
...
Time 0:07.5 - Sell 8/8: Complete

Total cycle: ~8 seconds (vs 16 minutes in simple mode)
```

#### Emergency Sell Feature

If SOL balance drops below 0.1 during buy phase:
1. Stop buying immediately
2. Sell **ALL** held tokens (not just what was bought)
3. Recover SOL to continue operations

#### Pros & Cons

| Pros | Cons |
|------|------|
| Fast cycle completion | Higher short-term exposure |
| More volume per minute | More complex state management |
| Emergency protection | Can hit rate limits |
| Configurable timing | Requires more SOL reserve |

#### Configuration

```typescript
{
  algorithm_mode: 'turbo_lite',
  buy_percent: 20,
  sell_percent: 20,
  slippage_bps: 300,
  turbo_cycle_size_buys: 8,        // trades per buy phase
  turbo_cycle_size_sells: 8,       // trades per sell phase
  turbo_inter_token_delay_ms: 500, // delay between trades
  turbo_global_rate_limit: 30,     // max trades per minute
  turbo_batch_state_updates: true, // reduce DB writes
}
```

---

### 3. Transaction Reactive Mode

**Status:** ✅ Fully Implemented
**Best For:** Market making, liquidity provision, price stabilization

#### How It Works

Monitors the blockchain via WebSocket for trades on your token, then **counter-trades** to provide liquidity:

- Someone **buys** → We **sell** (take profit, add sell pressure)
- Someone **sells** → We **buy** (buy the dip, add buy pressure)

```
┌─────────────────────────────────────────────────────────────┐
│  Helius WebSocket (logsSubscribe)                           │
│  └── Detects swap on monitored token                        │
│      └── Parse: trade_type (buy/sell), sol_amount           │
│          └── If sol_amount >= minTriggerSol                 │
│              └── Calculate response_percent                 │
│                  └── Execute counter-trade                  │
└─────────────────────────────────────────────────────────────┘
```

#### Response Formula

```
response_percent = min(sol_amount × scale_percent, max_response_percent)
```

#### Example Scenarios

**Config:** `minTriggerSol=0.1, scalePercent=25, maxResponsePercent=80`

| Market Trade | Detection | Response % | Our Action |
|--------------|-----------|------------|------------|
| Buy 0.1 SOL | BUY detected | 2.5% | SELL 2.5% of token balance |
| Buy 0.2 SOL | BUY detected | 5% | SELL 5% of token balance |
| Buy 1.0 SOL | BUY detected | 25% | SELL 25% of token balance |
| Buy 4.0 SOL | BUY detected | 80% (capped) | SELL 80% of token balance |
| Sell 0.5 SOL | SELL detected | 12.5% | BUY with 12.5% of SOL |

#### Technical Implementation

1. **WebSocket Connection** to Helius RPC
2. **logsSubscribe** for token mint address
3. **Transaction Parsing:**
   - Fetch full transaction via `getParsedTransaction`
   - Analyze pre/post balances to determine trade direction
   - Calculate SOL amount from balance changes
4. **Own Transaction Filter:** Skip if feePayer is ops or dev wallet
5. **Cooldown:** Configurable delay between reactive trades
6. **Deduplication:** Track processed signatures

#### Detection Logic

```typescript
// Determine trade type from balance changes:
// - Trader gained tokens + lost SOL → BUY (we counter with SELL)
// - Trader lost tokens + gained SOL → SELL (we counter with BUY)

if (tokenChange > 0 && solChange < 0) {
  tradeType = 'buy'   // Market bought, we sell
} else if (tokenChange < 0 && solChange > 0) {
  tradeType = 'sell'  // Market sold, we buy
}
```

#### Pros & Cons

| Pros | Cons |
|------|------|
| Real-time response (~200-500ms) | Loses in trending markets |
| True market making | Complex detection logic |
| Adaptive to market | WebSocket maintenance |
| Smooths price action | Not designed for profit |

#### Configuration

```typescript
{
  algorithm_mode: 'transaction_reactive',
  reactive_enabled: true,
  reactive_min_trigger_sol: 0.1,    // minimum trade to trigger
  reactive_scale_percent: 25,        // multiplier for response
  reactive_max_response_percent: 80, // cap on response size
  reactive_cooldown_ms: 5000,        // delay between trades
  slippage_bps: 300,
}
```

---

## Profitability Analysis

### Summary Table

| Algorithm | Profit Potential | Risk Level | Best Market Condition |
|-----------|------------------|------------|----------------------|
| Simple | Neutral | Low | Any (volume generation) |
| Turbo Lite | Neutral | Medium | Any (fast volume) |
| Reactive | Negative in trends | High | Range-bound only |

### Detailed Analysis

#### Simple & Turbo Lite

These algorithms are **not designed for profit**. They are volume generators:

**What happens:**
- Buy phase: Accumulate tokens, spend SOL
- Sell phase: Sell tokens, recover SOL
- Net effect: Trading fees lost, spread costs incurred

**Economic reality:**
```
Starting: 1 SOL
After 1 cycle: ~0.97 SOL (lost ~3% to fees/slippage)
After 10 cycles: ~0.74 SOL
```

**Use case:** Token creators who want active markets and are willing to pay for volume.

#### Transaction Reactive

This is a **mean-reversion / market-making** strategy:

**Profitable scenario (range-bound):**
```
Price oscillates $0.10 ↔ $0.12
- Buy at $0.10, sell at $0.12 = profit
- Repeat = accumulate gains
```

**Unprofitable scenario (trending):**
```
Uptrend: $0.10 → $0.15 → $0.20
- We keep selling as price rises
- Miss upside, end with SOL while token moons

Downtrend: $0.20 → $0.15 → $0.10
- We keep buying as price falls
- Accumulate depreciating asset
```

**Key insight:** Similar to being an LP, except:
- LPs earn trading fees → this doesn't
- LPs suffer impermanent loss → this does too

---

## Potential Future Algorithms

### 1. Momentum Following

**Concept:** Trade WITH the trend instead of against it.

```
If price trending UP → Buy (ride the wave)
If price trending DOWN → Sell (avoid the dump)
```

**Implementation idea:**
```typescript
{
  algorithm_mode: 'momentum',
  lookback_period_ms: 60000,      // 1 minute
  trend_threshold_percent: 2,     // 2% move = trend
  position_size_percent: 10,
}

// Logic:
// 1. Track price over lookback period
// 2. If price up > threshold → BUY
// 3. If price down > threshold → SELL
// 4. If sideways → do nothing
```

**Pros:**
- Profits in trending markets
- Avoids buying falling knives
- Avoids selling during pumps

**Cons:**
- Loses in choppy/sideways markets
- Requires reliable price feed
- May chase false breakouts

---

### 2. Grid Trading

**Concept:** Place orders at fixed price intervals, profit from oscillation.

```
Grid levels: $0.10, $0.11, $0.12, $0.13, $0.14
- Price drops to $0.10 → Buy
- Price rises to $0.12 → Sell
- Profit = grid spacing
```

**Implementation idea:**
```typescript
{
  algorithm_mode: 'grid',
  grid_spacing_percent: 5,        // 5% between levels
  num_grid_levels: 10,
  order_size_percent: 10,         // % of balance per level
}

// Logic:
// 1. Define price grid around current price
// 2. Track which levels we've bought at
// 3. When price hits lower level → Buy
// 4. When price hits higher level → Sell
// 5. Profit from the spread
```

**Pros:**
- Profits from any oscillation
- No trend prediction needed
- Systematic and predictable

**Cons:**
- Capital intensive (funds locked at each level)
- Loses if price breaks out of range
- Requires active management of grid

---

### 3. TWAP (Time-Weighted Average Price)

**Concept:** Execute large orders gradually to minimize market impact.

```
Goal: Buy 10 SOL worth of tokens
Execution: 10 buys of 1 SOL each, spread over time
```

**Implementation idea:**
```typescript
{
  algorithm_mode: 'twap',
  target_amount_sol: 10,
  num_slices: 20,
  interval_ms: 30000,             // 30 seconds
  direction: 'buy' | 'sell',
}

// Logic:
// 1. Calculate slice_size = target / num_slices
// 2. Every interval, execute one slice
// 3. Stop when target reached
```

**Pros:**
- Minimizes slippage on large orders
- Predictable execution
- Good for accumulation/distribution

**Cons:**
- Not adaptive to market conditions
- Slow execution
- Telegraphs intentions

---

### 4. VWAP (Volume-Weighted Average Price)

**Concept:** Execute more when volume is high, less when low.

```
High volume hour → Execute larger portion
Low volume hour → Execute smaller portion
```

**Implementation idea:**
```typescript
{
  algorithm_mode: 'vwap',
  target_amount_sol: 10,
  execution_window_hours: 24,
  volume_lookback_days: 7,
}

// Logic:
// 1. Analyze historical volume by hour
// 2. Weight execution proportionally
// 3. Execute more during high-volume periods
```

**Pros:**
- Better execution prices
- Blends with natural market activity
- Professional-grade algorithm

**Cons:**
- Requires historical volume data
- Complex implementation
- May not apply to low-liquidity tokens

---

### 5. Spread Capture (True Market Making)

**Concept:** Profit from bid-ask spread by providing liquidity.

```
Current price: $0.100
Our bid: $0.099 (buy order)
Our ask: $0.101 (sell order)
Spread captured: $0.002 per round trip
```

**Implementation idea:**
```typescript
{
  algorithm_mode: 'spread_capture',
  spread_percent: 2,              // 1% each side
  rebalance_threshold: 20,        // rebalance if >20% imbalanced
  inventory_target_percent: 50,   // target 50% tokens, 50% SOL
}

// Logic:
// 1. Quote both sides of the market
// 2. When filled on one side, quote the other
// 3. Rebalance inventory if too skewed
// 4. Profit = spread - fees
```

**Pros:**
- Actually profitable if spread > fees
- True liquidity provision
- Earns from both directions

**Cons:**
- Requires very active quoting
- Inventory risk
- Complex position management
- Needs tight spreads to compete

---

### 6. Mean Reversion with Bands

**Concept:** Trade when price deviates from moving average.

```
Price > Upper Band → Sell (overbought)
Price < Lower Band → Buy (oversold)
Price in Middle → Hold
```

**Implementation idea:**
```typescript
{
  algorithm_mode: 'mean_reversion',
  lookback_periods: 20,
  band_multiplier: 2,             // Bollinger bands style
  position_size_percent: 15,
}

// Logic:
// 1. Calculate moving average
// 2. Calculate standard deviation
// 3. Upper band = MA + (std × multiplier)
// 4. Lower band = MA - (std × multiplier)
// 5. Trade on band touches
```

**Pros:**
- Statistical edge in ranging markets
- Clear entry/exit signals
- Works well for mean-reverting assets

**Cons:**
- Fails in trending markets
- Requires sufficient price history
- May trigger rarely in low-volume tokens

---

### 7. Arbitrage Detection

**Concept:** Profit from price differences across venues.

```
Bags.fm price: $0.10
Jupiter price: $0.105
Action: Buy on Bags, sell on Jupiter
Profit: 5% minus fees
```

**Implementation idea:**
```typescript
{
  algorithm_mode: 'arbitrage',
  venues: ['bags', 'jupiter', 'raydium'],
  min_spread_percent: 1,
  max_trade_size_sol: 5,
}

// Logic:
// 1. Monitor prices across venues
// 2. When spread > threshold + fees
// 3. Execute simultaneous buy/sell
// 4. Capture spread
```

**Pros:**
- Risk-free profit (in theory)
- Pure alpha generation
- No directional exposure

**Cons:**
- Highly competitive
- Requires fast execution
- May not exist for small tokens
- Complex multi-venue integration

---

## Configuration Reference

### Common Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `algorithm_mode` | enum | 'simple' | Algorithm to use |
| `buy_percent` | int | 20 | % of SOL to use per buy |
| `sell_percent` | int | 20 | % of tokens to sell per trade |
| `slippage_bps` | int | 300 | Slippage tolerance (basis points) |
| `flywheel_active` | bool | true | Enable/disable MM |

### Turbo Lite Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `turbo_cycle_size_buys` | int | 8 | Buys per cycle |
| `turbo_cycle_size_sells` | int | 8 | Sells per cycle |
| `turbo_inter_token_delay_ms` | int | 500 | Delay between trades |
| `turbo_global_rate_limit` | int | 30 | Max trades/minute |
| `turbo_batch_state_updates` | bool | true | Batch DB writes |

### Reactive Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `reactive_enabled` | bool | false | Enable reactive mode |
| `reactive_min_trigger_sol` | decimal | 0.1 | Min trade to trigger |
| `reactive_scale_percent` | int | 25 | Response multiplier |
| `reactive_max_response_percent` | int | 80 | Max response size |
| `reactive_cooldown_ms` | int | 5000 | Delay between trades |

---

## Summary

**For Volume Generation:** Use **Simple** or **Turbo Lite**
- Predictable, low risk
- Accept ~3% loss per cycle as cost of doing business

**For Market Support:** Use **Transaction Reactive**
- Provides liquidity
- Smooths price action
- Not designed for profit

**For Profit:** Consider implementing:
1. **Grid Trading** - Profit from oscillation
2. **Momentum** - Ride trends
3. **Spread Capture** - True market making

---

*Last updated: January 2025*
