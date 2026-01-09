# Claude Wheel Revamp Plan

## Executive Summary

This document outlines a comprehensive cleanup and optimization plan for the Claude Wheel codebase. The analysis identified **2 critical security issues**, **3 high-priority bugs**, **15+ code quality improvements**, and significant opportunities for cleanup by removing legacy code.

**Priority Levels:**
- **P0 (Critical)**: Must fix immediately - security vulnerabilities
- **P1 (High)**: Should fix soon - functional bugs or significant issues
- **P2 (Medium)**: Fix when convenient - optimization and cleanup
- **P3 (Low)**: Nice to have - style and minor improvements

---

## Phase 1: Critical Security Fixes (P0)

### 1.1 Replace Math.random() with Cryptographic RNG

**Files:**
- `backend/src/utils/signature-verify.ts:69, 122`
- `backend/src/telegram/bot.ts:611` (filename generation)

**Current (INSECURE):**
```typescript
const nonce = Math.random().toString(36).substring(7)
```

`Math.random()` is not cryptographically secure. Nonces used for authentication must be unpredictable.

**Fixed:**
```typescript
import { randomBytes } from 'crypto'

function generateSecureNonce(): string {
  return randomBytes(16).toString('hex')
}

// Usage
const nonce = generateSecureNonce()
```

**Impact:** Weak nonces could potentially be predicted, compromising authentication security.

---

### 1.2 Clear Private Keys from Memory After Use

**File:** `backend/src/telegram/bot.ts`

**Problem:** Private keys stored in session remain in memory until garbage collected.

**Fix:** Clear immediately after encryption:
```typescript
// After encrypting dev wallet key (around line 1943-1944)
const devEncrypted = encrypt(data.devWalletPrivateKey)
data.devWalletPrivateKey = null // Clear immediately

// After encrypting ops wallet key (around line 1944)
const opsEncrypted = encrypt(data.opsWalletPrivateKey)
data.opsWalletPrivateKey = null // Clear immediately
```

---

## Phase 2: High Priority Bug Fixes (P1)

### 2.1 Fix Deposit Processing Race Condition

**File:** `backend/src/jobs/deposit-monitor.job.ts:110-132`

**Problem:** No atomic check-and-update. If running multiple instances, two processes can detect the same deposit and attempt to launch the token twice.

**Fix:** Use Supabase optimistic locking pattern:
```typescript
// Atomic status update with version check
const { data: updated, error } = await db
  .from('pending_token_launches')
  .update({
    deposit_received_sol: balance,
    status: 'launching',
    updated_at: new Date().toISOString(),
  })
  .eq('id', launch.id)
  .eq('status', 'awaiting_deposit') // Only update if still awaiting
  .select()
  .single()

// If no rows updated, another process got it first
if (!updated) {
  console.log(`Launch ${launch.id} already being processed by another instance`)
  continue
}
```

---

### 2.2 Fix Private Key Message Deletion Warning

**File:** `backend/src/telegram/bot.ts:1627-1632, 1682-1687, 1732-1736, 1776-1781`

**Problem:** If message deletion fails (e.g., in group chats), private key remains visible in chat history. User is not warned.

**Fix:** Warn user when deletion fails:
```typescript
try {
  await ctx.deleteMessage()
} catch (e) {
  // Warn user - their private key is still visible!
  await ctx.reply(
    '⚠️ *Security Warning*: I could not delete your private key message. ' +
    'Please manually delete it from this chat for security.',
    { parse_mode: 'Markdown' }
  )
}
```

---

### 2.3 Add Rate Limiting to Telegram Commands

**File:** `backend/src/telegram/bot.ts`

**Problem:** No per-user command throttling. Users can spam `/launch` creating many pending launches.

**Fix:** Add rate limiter middleware:
```typescript
const rateLimiter = new Map<number, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60000 // 1 minute
const MAX_COMMANDS_PER_WINDOW = 10

function checkRateLimit(userId: number): boolean {
  const now = Date.now()
  const userLimit = rateLimiter.get(userId)

  if (!userLimit || now > userLimit.resetAt) {
    rateLimiter.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (userLimit.count >= MAX_COMMANDS_PER_WINDOW) {
    return false
  }

  userLimit.count++
  return true
}

// Add middleware before commands
bot.use(async (ctx, next) => {
  if (ctx.from && !checkRateLimit(ctx.from.id)) {
    await ctx.reply('You are sending commands too quickly. Please wait a moment.')
    return
  }
  return next()
})
```

---

### 2.4 Fix Misleading Query Comment

**File:** `backend/src/jobs/deposit-monitor.job.ts:83`

**Current:**
```typescript
.lt('expires_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()) // Not expired
```

**Issue:** The comment "Not expired" is misleading. The query actually fetches ALL launches where `expires_at < now + 24h`, which includes both pending AND expired launches. The expired ones are handled correctly by `handleExpiredLaunch()` at line 101-104.

**Fix:** Update the comment for clarity:
```typescript
.lt('expires_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()) // Includes expired (processed separately below)
```

**Note:** This is NOT a functional bug - expired launches ARE processed correctly. Just misleading documentation.

## Phase 3: Remove Legacy Code (P1)

### 3.1 Delete Legacy Single-Token Services

**Files to DELETE:**
```
backend/src/services/market-maker.ts          # Legacy single-token MM
backend/src/services/fee-collector.ts         # Replaced by fast-claim.service.ts
backend/src/services/wallet-monitor.ts        # Superseded by multi-user services
backend/src/jobs/flywheel.job.ts              # Replaced by multi-flywheel.job.ts
backend/src/jobs/claim.job.ts                 # Replaced by fast-claim.job.ts
```

**Also delete associated test files:**
```
backend/src/services/market-maker.test.ts
backend/src/services/fee-collector.test.ts
backend/src/services/wallet-monitor.test.ts
```

### 3.2 Update index.ts to Remove Legacy References

**File:** `backend/src/index.ts`

**Remove imports and startup calls for:**
- `startFlywheelJob` / `stopFlywheelJob`
- `startClaimJob` / `stopClaimJob`
- Legacy wallet initialization for single-token mode
- Environment variable checks for legacy mode (`CLAIM_JOB_ENABLED`, `FLYWHEEL_JOB_ENABLED`)

### 3.3 Remove render.yaml

**File to DELETE:** `render.yaml`

Per user instructions: "Do not create render.yaml files because we configure render settings on the dashboard"

---

## Phase 4: Remove Mock Data (P1)

### 4.1 Remove Mock Data from Frontend

**File:** `frontend/lib/utils.ts:66-103`

**DELETE these exports:**
```typescript
// DELETE: Line 66-67
export const PLACEHOLDER_CA = 'UPDATE_AFTER_TOKEN_LAUNCH'

// DELETE: Lines 70-103
export const mockWalletData = { ... }
export const mockTransactions = [ ... ]
export const mockFeeStats = { ... }
```

### 4.2 Find and Remove Mock Data Usage

**Search for and update any imports of mock data:**
```bash
# Files that may import mock data
grep -r "mockWalletData\|mockTransactions\|mockFeeStats\|PLACEHOLDER_CA" frontend/
```

Replace with real API calls or remove unused components.

---

## Phase 5: Implement Structured Logging (P1)

### 5.1 Add Logging Library

**Add to `backend/package.json`:**
```json
"dependencies": {
  "pino": "^8.x",
  "pino-pretty": "^10.x"
}
```

### 5.2 Create Logger Module

**New file:** `backend/src/config/logger.ts`
```typescript
import pino from 'pino'
import { env } from './env'

export const logger = pino({
  level: env.isProd ? 'info' : 'debug',
  transport: env.isProd ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true }
  }
})

// Create child loggers for different modules
export const jobLogger = logger.child({ module: 'jobs' })
export const botLogger = logger.child({ module: 'telegram' })
export const tradeLogger = logger.child({ module: 'trading' })
export const claimLogger = logger.child({ module: 'claims' })
```

### 5.3 Replace console.log Calls

**Pattern to follow:**
```typescript
// Before
console.log(`📡 Checking ${count} pending launches...`)
console.error('Error:', error)

// After
import { jobLogger } from '../config/logger'

jobLogger.info({ count }, 'Checking pending launches')
jobLogger.error({ error }, 'Failed to process launch')
```

### 5.4 Files with High Console Usage (Priority Order)

1. `backend/src/index.ts` - ~50 calls
2. `backend/src/services/fast-claim.service.ts` - ~30 calls
3. `backend/src/services/multi-user-mm.service.ts` - ~25 calls
4. `backend/src/telegram/bot.ts` - ~40 calls
5. `backend/src/jobs/deposit-monitor.job.ts` - ~20 calls
6. All other services and routes

---

## Phase 6: Centralize Environment Config (P2)

### 6.1 Files Accessing process.env Directly

**Files to update:**
```
backend/src/jobs/balance-update.job.ts
backend/src/jobs/multi-flywheel.job.ts
backend/src/jobs/claim.job.ts (if not deleted)
backend/src/jobs/fast-claim.job.ts
backend/src/index.ts
backend/src/services/fast-claim.service.ts
```

### 6.2 Add Missing Variables to env.ts

**File:** `backend/src/config/env.ts`

**Add:**
```typescript
// Job configuration
balanceUpdateIntervalSeconds: z.coerce.number().default(300),
multiUserFlywheelIntervalMinutes: z.coerce.number().default(1),
fastClaimThresholdSol: z.coerce.number().default(0.15),
fastClaimMaxConcurrent: z.coerce.number().default(5),
fastClaimBatchDelayMs: z.coerce.number().default(500),
depositMonitorEnabled: z.boolean().default(true),
balanceUpdateJobEnabled: z.boolean().default(true),
```

### 6.3 Update All Direct process.env Access

**Pattern:**
```typescript
// Before
const interval = parseInt(process.env.BALANCE_UPDATE_INTERVAL_SECONDS || '300', 10)

// After
import { env } from '../config/env'
const interval = env.balanceUpdateIntervalSeconds
```

---

## Phase 7: Fix Type Safety Issues (P2)

### 7.1 Replace `any` Types

**Files with excessive `any` usage:**

| File | Location | Fix |
|------|----------|-----|
| `telegram/bot.ts` | Session data | Create `TelegramSession` interface |
| `telegram/bot.ts` | Button arrays | Use `InlineKeyboardButton[][]` |
| `routes/admin.routes.ts` | Token mapping | Create proper DTOs |
| `routes/user-token.routes.ts` | Config validation | Use Zod schemas |
| `services/bags-fm.ts` | Quote/swap data | Create `JupiterQuote` interface |
| `services/fast-claim.service.ts` | Error handling | Use `Error` type with type guards |

### 7.2 Create Missing Type Definitions

**New file:** `backend/src/types/telegram.ts`
```typescript
export interface LaunchWizardData {
  step: 'name' | 'symbol' | 'description' | 'image' | 'socials' | 'confirm'
  tokenName?: string
  tokenSymbol?: string
  tokenDescription?: string
  tokenImageUrl?: string
  twitterUrl?: string
  telegramUrl?: string
  websiteUrl?: string
  discordUrl?: string
}

export interface RegisterWizardData {
  step: 'mint' | 'confirm' | 'dev_key' | 'ops_key' | 'final_confirm'
  tokenMint?: string
  tokenInfo?: TokenInfo
  devWalletPrivateKey?: string
  opsWalletPrivateKey?: string
}

export interface TelegramSession {
  launchData?: LaunchWizardData
  registerData?: RegisterWizardData
}
```

---

## Phase 8: Fix Transaction Confirmation Inconsistency (P2)

### 8.1 Create Unified Transaction Utility

**New file:** `backend/src/utils/transaction.ts`
```typescript
import { Connection, Transaction, Keypair, SendOptions } from '@solana/web3.js'

interface SendTransactionOptions {
  skipPreflight?: boolean
  maxRetries?: number
  retryDelayMs?: number[]
}

export async function sendAndConfirmTransactionWithRetry(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  options: SendTransactionOptions = {}
): Promise<string> {
  const {
    skipPreflight = false, // Default to safe mode
    maxRetries = 4,
    retryDelayMs = [5000, 10000, 15000, 20000]
  } = options

  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const signature = await connection.sendTransaction(transaction, signers, {
        skipPreflight,
        preflightCommitment: 'confirmed'
      })

      const confirmation = await connection.confirmTransaction(signature, 'confirmed')

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      return signature
    } catch (error) {
      lastError = error as Error
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, retryDelayMs[attempt] || 5000))
      }
    }
  }

  throw lastError || new Error('Transaction failed after max retries')
}
```

### 8.2 Update Services to Use Unified Utility

**Files to update:**
- `backend/src/services/fast-claim.service.ts`
- `backend/src/services/multi-user-mm.service.ts`
- `backend/src/services/token-launcher.ts`

---

## Phase 9: Persist Flywheel State (P2)

### 9.1 Problem: In-Memory Cooldown Lost on Restart

**File:** `backend/src/services/multi-user-mm.service.ts:69-71`

**Current:**
```typescript
private lastTradeTime: Map<string, number> = new Map()
```

### 9.2 Solution: Use Database for State

**Update `user_flywheel_state` table:**
```sql
ALTER TABLE user_flywheel_state ADD COLUMN last_trade_at TIMESTAMPTZ;
```

**Update service:**
```typescript
private async getLastTradeTime(tokenId: string): Promise<number> {
  const { data } = await supabase
    .from('user_flywheel_state')
    .select('last_trade_at')
    .eq('user_token_id', tokenId)
    .single()

  return data?.last_trade_at ? new Date(data.last_trade_at).getTime() : 0
}

private async recordTradeTimestamp(tokenId: string): Promise<void> {
  await supabase
    .from('user_flywheel_state')
    .update({ last_trade_at: new Date().toISOString() })
    .eq('user_token_id', tokenId)
}
```

---

## Phase 10: Standardize Error Handling (P2)

### 10.1 Create Error Types

**New file:** `backend/src/types/errors.ts`
```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, context)
    this.name = 'ValidationError'
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(`${resource} not found${id ? `: ${id}` : ''}`, 'NOT_FOUND', 404)
    this.name = 'NotFoundError'
  }
}

export class BlockchainError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'BLOCKCHAIN_ERROR', 500, context)
    this.name = 'BlockchainError'
  }
}
```

### 10.2 Standardize Return Types

**Pattern to follow:**
```typescript
// Before - inconsistent returns
function getData(): Data | null | undefined | [] {}

// After - consistent Result type
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: AppError }

function getData(): Result<Data> {
  try {
    // ...
    return { success: true, data }
  } catch (error) {
    return { success: false, error: new AppError(error.message, 'GET_DATA_ERROR') }
  }
}
```

---

## Phase 11: Clean Up Commented Code (P3)

### 11.1 Files with Commented Code to Remove

```
backend/src/jobs/claim.job.ts (if not deleted)
  - Line with setTimeout

backend/src/services/*.ts
  - Search for // TODO, // FIXME, // HACK
  - Remove or address each one
```

### 11.2 Resolve or Remove TODO Comments

**File:** `frontend/lib/utils.ts:66`
```typescript
// TODO: Update this after launching your token on PumpFun
```
**Action:** Remove along with `PLACEHOLDER_CA` constant

---

## Phase 12: Improve Test Coverage (P3)

### 12.1 Critical Services Needing Tests

**Priority order:**
1. `backend/src/services/fast-claim.service.ts` - Core fee claiming logic
2. `backend/src/services/token-launcher.ts` - Token launch flow
3. `backend/src/telegram/bot.ts` - Wizard flows
4. `backend/src/jobs/deposit-monitor.job.ts` - Deposit detection

### 12.2 Test File Locations

```
backend/src/services/fast-claim.service.test.ts
backend/src/services/token-launcher.test.ts
backend/src/telegram/bot.test.ts
backend/src/jobs/deposit-monitor.job.test.ts
```

---

## Implementation Checklist

### Phase 1: Critical Security Fixes (P0) ✅ COMPLETE
- [x] Replace Math.random() with crypto.randomBytes() in signature-verify.ts
- [x] Replace Math.random() with crypto.randomBytes() in bot.ts (filename generation)
- [x] Clear private keys from memory after encryption in bot.ts

### Phase 2: High Priority Bug Fixes (P1) ✅ COMPLETE
- [x] Add atomic deposit processing with optimistic locking (deposit-monitor.job.ts)
- [x] Add warning when private key message deletion fails (4 locations in bot.ts)
- [x] Add rate limiting middleware to Telegram commands
- [x] Fix misleading comment in deposit-monitor.job.ts:83

### Phase 3: Remove Legacy Code (P1) ✅ COMPLETE
- [x] Delete market-maker.ts and its test
- [x] Delete fee-collector.ts and its test
- [x] Delete wallet-monitor.ts and its test
- [x] Delete flywheel.job.ts
- [x] Delete claim.job.ts
- [x] Update index.ts to remove legacy imports and startup calls
- [x] Delete render.yaml
- [x] Delete inventory-manager.ts (additional legacy file found)
- [x] Delete twap-executor.ts (additional legacy file found)

### Phase 4: Remove Mock Data (P1) ✅ COMPLETE
- [x] Remove mock data exports from frontend/lib/utils.ts
- [x] Search for and update any components importing mock data
- [x] Update utils.test.ts to remove mock data tests

### Phase 5: Implement Structured Logging (P1) ✅ COMPLETE
- [x] Add pino and pino-pretty dependencies
- [x] Create logger module (backend/src/utils/logger.ts)
- [x] Replace console.log in index.ts
- [x] Replace console.log in fast-claim.service.ts
- [x] Replace console.log in multi-user-mm.service.ts
- [x] Replace console.log in telegram/bot.ts
- [x] Replace console.log in deposit-monitor.job.ts
- [x] Replace console.log in remaining files (28+ files updated)

### Phase 6: Centralize Environment Config (P2) ✅ COMPLETE
- [x] Add missing job config variables to env.ts
- [x] Add LOG_LEVEL, HELIUS_API_KEY, ENCRYPTION_MASTER_KEY
- [x] Add job enable flags (FAST_CLAIM_JOB_ENABLED, etc.)
- [x] Add job configuration variables (intervals, thresholds, batch sizes)
- [x] Export all new config values with proper typing

### Phase 7: Fix Type Safety (P2) ✅ COMPLETE
- [x] Use existing TelegramSession interface (already defined in bot.ts)
- [x] Replace `as any` casts in bot.ts with proper types
- [x] Replace `as any` casts in admin.routes.ts
- [x] Create proper types for bags-fm.ts quote/swap responses (RawQuoteResponse)
- [x] Add null checks for optional properties in wizard handlers

### Phase 8: Fix Transaction Confirmation (P2) ✅ COMPLETE
- [x] Create unified transaction utility (backend/src/utils/transaction.ts)
- [x] Update fast-claim.service.ts to use unified utility
- [x] Update multi-user-mm.service.ts to use unified utility
- [x] token-launcher.ts uses Bags SDK's built-in function (appropriate)

### Phase 9: Persist Flywheel Cooldown State (P2) ✅ COMPLETE
- [x] Verified last_trade_at column already exists in user_flywheel_state
- [x] Updated multi-user-mm.service.ts to read cooldown from DB on startup
- [x] In-memory cache seeded from DB when not present (survives restarts)

### Phase 10: Standardize Error Handling (P2) ✅ COMPLETE
- [x] Created error types (backend/src/types/errors.ts)
- [x] Added AppError, ValidationError, NotFoundError, BlockchainError, etc.
- [x] Added Result<T> type with success/failure helpers
- [x] Exported from types/index.ts for easy import

### Phase 11: Clean Up Code (P3) ✅ COMPLETE
- [x] Remove PLACEHOLDER_CA constant from frontend/lib/utils.ts
- [x] No remaining TODO/FIXME/HACK comments found in codebase
- [x] No commented-out code blocks found - codebase is clean

### Phase 12: Improve Test Coverage (P3) ✅ TESTS PASSING
- [x] Verify existing tests pass after changes (14/14 tests passing)
- [ ] Add tests for fast-claim.service.ts
- [ ] Add tests for token-launcher.ts
- [ ] Add tests for Telegram bot wizard flows
- [ ] Add tests for deposit-monitor.job.ts

---

## Corrections Made After Deep Re-Analysis

The following items were originally identified as critical bugs but were found to be non-issues after deeper analysis:

1. **Expired Launch Query (deposit-monitor.job.ts:83)** - Originally thought to prevent expired launches from being processed. Actually works correctly - the query fetches both pending and expired launches, and expired ones are handled by `handleExpiredLaunch()`.

2. **Broadcast Promise.all (bot-alerts.service.ts)** - Originally thought to have unhandled promise rejections. Actually handles errors correctly - each promise in the map has try/catch that returns a result object.

3. **Session Race Condition** - Downgraded from P0 to P2. The code handles this by checking `launchData` before `registerData`, so one wizard always takes precedence.

---

## Notes

- All changes should be made in feature branches and tested before merging
- Run `npm run build` after each phase to ensure TypeScript compiles
- Run existing tests after each phase to ensure no regressions
- The legacy services have dependencies in index.ts - clean up imports after deletion
- Database migrations should be run in a transaction when possible
- Multi-instance deployments should prioritize the deposit race condition fix
