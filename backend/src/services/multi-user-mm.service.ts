// ═══════════════════════════════════════════════════════════════════════════
// MULTI-USER MARKET MAKING SERVICE
// Orchestrates market making across all users with active flywheels
// Uses Prisma/Privy for data storage and delegated signing
// ═══════════════════════════════════════════════════════════════════════════

import { PublicKey, VersionedTransaction, Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { sendTransactionWithPrivySigning } from '../utils/transaction'
import bs58 from 'bs58'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { getConnection, getBalance, getTokenBalance } from '../config/solana'
import { bagsFmService } from './bags-fm'
// Jupiter service removed - Bags SDK handles graduated token routing internally
import { loggers } from '../utils/logger'
import {
  UserTokenConfig,
  UserFlywheelState,
  PrivyTokenWithConfig,
  getPrivyTokensForFlywheel,
  getPrivyFlywheelState,
  updatePrivyFlywheelState,
} from './user-token.service'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const BUYS_PER_CYCLE = 5
const SELLS_PER_CYCLE = 5

// Platform WHEEL token - excluded from platform fees
const PLATFORM_WHEEL_TOKEN_MINT = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'

// Fee collection settings
const DEV_WALLET_MIN_RESERVE_SOL = 0.05 // Keep minimum SOL in dev wallet for claiming (covers tx fees + rent for claim accounts)
const MIN_FEE_THRESHOLD_SOL = 0.01 // Minimum SOL to trigger fee collection

// Failure tracking settings
const MAX_CONSECUTIVE_FAILURES = 5 // Pause flywheel after this many consecutive failures
const PAUSE_DURATION_MINUTES = 30 // How long to pause after failures

export interface TradeResult {
  userTokenId: string
  tokenMint: string
  tokenSymbol: string
  tradeType: 'buy' | 'sell'
  success: boolean
  amount: number
  signature?: string
  error?: string
}

export interface FlywheelCycleResult {
  totalTokensProcessed: number
  tradesExecuted: number
  tradesFailed: number
  results: TradeResult[]
  startedAt: string
  completedAt: string
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

// Postgres advisory lock namespace for turbo mode (prevents concurrent execution)
const TURBO_LOCK_NAMESPACE = 1337

class MultiUserMMService {
  private isRunning = false
  private lastRunAt: Date | null = null
  private tradesThisMinute = 0
  private lastTradeMinute = 0

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVISORY LOCK HELPERS (Prevent concurrent turbo execution on same token)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Hash token ID to 32-bit integer for Postgres advisory lock
   */
  private hashTokenId(tokenId: string): number {
    let hash = 0
    for (let i = 0; i < tokenId.length; i++) {
      hash = ((hash << 5) - hash) + tokenId.charCodeAt(i)
      hash |= 0 // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Try to acquire advisory lock for a token (non-blocking)
   * Returns true if lock acquired, false if already locked
   */
  private async acquireTurboLock(tokenId: string): Promise<boolean> {
    if (!isPrismaConfigured()) return true // Allow execution if no DB

    try {
      const lockKey = this.hashTokenId(tokenId)
      const result = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>`
        SELECT pg_try_advisory_lock(${TURBO_LOCK_NAMESPACE}::int, ${lockKey}::int)
      `
      return result[0].pg_try_advisory_lock
    } catch (error) {
      loggers.flywheel.warn({ tokenId, error: String(error) }, 'Failed to acquire advisory lock, proceeding anyway')
      return true // Fail-open to allow execution
    }
  }

  /**
   * Release advisory lock for a token
   */
  private async releaseTurboLock(tokenId: string): Promise<void> {
    if (!isPrismaConfigured()) return

    try {
      const lockKey = this.hashTokenId(tokenId)
      await prisma.$queryRaw`
        SELECT pg_advisory_unlock(${TURBO_LOCK_NAMESPACE}::int, ${lockKey}::int)
      `
    } catch (error) {
      loggers.flywheel.warn({ tokenId, error: String(error) }, 'Failed to release advisory lock')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FAILURE TRACKING (Prisma-based)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if flywheel is paused due to repeated failures
   */
  private async isFlywheelPaused(state: UserFlywheelState, tokenId: string): Promise<boolean> {
    if (!state.paused_until) return false

    const pausedUntil = new Date(state.paused_until).getTime()
    const now = Date.now()

    if (now < pausedUntil) {
      return true
    }

    // Pause period has expired, reset it
    await this.clearPauseState(tokenId)
    return false
  }

  /**
   * Record a trade failure and potentially pause the flywheel
   */
  private async recordFailure(tokenId: string, reason: string): Promise<void> {
    if (!isPrismaConfigured()) return

    try {
      // Get current failure count
      const currentState = await prisma.privyFlywheelState.findUnique({
        where: { privyTokenId: tokenId },
        select: { consecutiveFailures: true, totalFailures: true },
      })

      const consecutiveFailures = (currentState?.consecutiveFailures || 0) + 1
      const totalFailures = (currentState?.totalFailures || 0) + 1

      const updates: {
        consecutiveFailures: number
        totalFailures: number
        lastFailureReason: string
        lastFailureAt: Date
        pausedUntil?: Date
      } = {
        consecutiveFailures,
        totalFailures,
        lastFailureReason: reason,
        lastFailureAt: new Date(),
      }

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        const pauseUntil = new Date(Date.now() + PAUSE_DURATION_MINUTES * 60 * 1000)
        updates.pausedUntil = pauseUntil

        loggers.flywheel.warn({
          tokenId,
          consecutiveFailures,
          pauseUntil: pauseUntil.toISOString(),
          reason,
        }, 'Pausing flywheel due to repeated failures')
      }

      await prisma.privyFlywheelState.update({
        where: { privyTokenId: tokenId },
        data: updates,
      })

      loggers.flywheel.debug({
        tokenId,
        consecutiveFailures,
        reason,
      }, 'Recorded trade failure')
    } catch (error) {
      loggers.flywheel.error({ tokenId, error: String(error) }, 'Failed to record failure')
    }
  }

  /**
   * Clear failure count after successful trade
   */
  private async clearFailures(tokenId: string): Promise<void> {
    if (!isPrismaConfigured()) return

    try {
      await prisma.privyFlywheelState.update({
        where: { privyTokenId: tokenId },
        data: {
          consecutiveFailures: 0,
          lastFailureReason: null,
          pausedUntil: null,
        },
      })
    } catch (error) {
      loggers.flywheel.warn({ tokenId, error: String(error) }, 'Failed to clear failures')
    }
  }

  /**
   * Clear pause state (called when pause period expires)
   */
  private async clearPauseState(tokenId: string): Promise<void> {
    if (!isPrismaConfigured()) return

    try {
      await prisma.privyFlywheelState.update({
        where: { privyTokenId: tokenId },
        data: {
          pausedUntil: null,
          consecutiveFailures: 0,
        },
      })

      loggers.flywheel.info({ tokenId }, 'Flywheel pause period expired, resuming')
    } catch (error) {
      loggers.flywheel.warn({ tokenId, error: String(error) }, 'Failed to clear pause state')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRADING ROUTE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Determine which trading route to use
   * Note: Bags SDK handles routing internally, including Jupiter for graduated tokens
   */
  private getTradingRoute(_token: PrivyTokenWithConfig, _config: UserTokenConfig): 'bags' {
    // Bags SDK handles all routing internally, including Jupiter for graduated tokens
    // The trading_route config is now deprecated - all trades go through Bags SDK
    return 'bags'
  }

  /**
   * Get trade quote from Bags SDK
   * Bags SDK automatically routes to Jupiter for graduated tokens
   */
  private async getTradeQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    side: 'buy' | 'sell',
    slippageBps: number
  ): Promise<{ rawQuoteResponse: unknown; outputAmount: number } | null> {
    const quote = await bagsFmService.getTradeQuote(inputMint, outputMint, amount, side, slippageBps)
    if (!quote) return null
    return { rawQuoteResponse: quote.rawQuoteResponse, outputAmount: quote.outputAmount }
  }

  /**
   * Generate swap transaction from Bags SDK
   */
  private async generateSwapTx(
    walletAddress: string,
    quoteResponse: unknown
  ): Promise<{ transaction: string; lastValidBlockHeight: number } | null> {
    return bagsFmService.generateSwapTransaction(walletAddress, quoteResponse as any)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN FLYWHEEL CYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run flywheel cycle for all Privy user tokens
   */
  async runFlywheelCycle(maxTradesPerMinute: number = 30): Promise<FlywheelCycleResult> {
    if (this.isRunning) {
      loggers.flywheel.warn('Flywheel cycle already in progress, skipping')
      return {
        totalTokensProcessed: 0,
        tradesExecuted: 0,
        tradesFailed: 0,
        results: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }
    }

    this.isRunning = true
    const startedAt = new Date().toISOString()
    const results: TradeResult[] = []

    loggers.flywheel.info('Starting flywheel cycle')

    try {
      // Reset rate limit counter if new minute
      const currentMinute = Math.floor(Date.now() / 60000)
      if (currentMinute !== this.lastTradeMinute) {
        this.tradesThisMinute = 0
        this.lastTradeMinute = currentMinute
      }

      // Get all active flywheel tokens
      const tokens = await getPrivyTokensForFlywheel()
      loggers.flywheel.info({ tokenCount: tokens.length }, 'Found tokens with active flywheels')

      for (const token of tokens) {
        // Get algorithm-specific rate limit
        const config = token.privy_token_config
        const algorithmMode = config?.algorithm_mode ?? 'simple'
        const tokenRateLimit = algorithmMode === 'turbo_lite'
          ? (config?.turbo_global_rate_limit ?? 30)  // Conservative default: 30 trades/min
          : maxTradesPerMinute

        // Check rate limit
        if (this.tradesThisMinute >= tokenRateLimit) {
          loggers.flywheel.warn({
            tokenSymbol: token.token_symbol,
            algorithm: algorithmMode,
            rateLimit: tokenRateLimit,
            tradesThisMinute: this.tradesThisMinute
          }, 'Rate limit reached for this algorithm, skipping token')
          continue
        }

        try {
          const result = await this.processToken(token)
          if (result) {
            results.push(result)
            if (result.success) {
              this.tradesThisMinute++
            }
          }

          // Algorithm-specific delay between tokens
          const interTokenDelay = algorithmMode === 'turbo_lite'
            ? (config?.turbo_inter_token_delay_ms ?? 500)  // Conservative default: 500ms
            : 500
          await this.sleep(interTokenDelay)
        } catch (error: any) {
          loggers.flywheel.error({
            tokenSymbol: token.token_symbol,
            tokenMint: token.token_mint_address,
            error: String(error),
          }, 'Unexpected error processing token')
          results.push({
            userTokenId: token.id,
            tokenMint: token.token_mint_address,
            tokenSymbol: token.token_symbol,
            tradeType: 'buy',
            success: false,
            amount: 0,
            error: error.message,
          })
        }
      }
    } finally {
      this.isRunning = false
      this.lastRunAt = new Date()
    }

    const completedAt = new Date().toISOString()
    const tradesExecuted = results.filter(r => r.success).length

    loggers.flywheel.info({ tradesExecuted, totalTrades: results.length }, 'Flywheel cycle completed')

    return {
      totalTokensProcessed: results.length,
      tradesExecuted,
      tradesFailed: results.filter(r => !r.success).length,
      results,
      startedAt,
      completedAt,
    }
  }

  /**
   * Process a single token's flywheel
   */
  private async processToken(token: PrivyTokenWithConfig): Promise<TradeResult | null> {
    const baseResult = {
      userTokenId: token.id,
      tokenMint: token.token_mint_address,
      tokenSymbol: token.token_symbol,
    }

    const connection = getConnection()
    const config = token.privy_token_config

    // Get or initialize flywheel state
    let state = token.privy_flywheel_state || await getPrivyFlywheelState(token.id)
    if (!state) {
      // Initialize state if not exists
      if (isPrismaConfigured()) {
        await prisma.privyFlywheelState.create({
          data: {
            privyTokenId: token.id,
            cyclePhase: 'buy',
            buyCount: 0,
            sellCount: 0,
            consecutiveFailures: 0,
            totalFailures: 0,
          },
        })
      }
      state = await getPrivyFlywheelState(token.id)
    }

    if (!state) {
      return { ...baseResult, tradeType: 'buy', success: false, amount: 0, error: 'Failed to get flywheel state' }
    }

    // Check if flywheel is paused due to repeated failures
    if (await this.isFlywheelPaused(state, token.id)) {
      const pausedUntil = state.paused_until ? new Date(state.paused_until).toLocaleTimeString() : 'unknown'
      loggers.flywheel.info({
        tokenSymbol: token.token_symbol,
        pausedUntil,
        consecutiveFailures: state.consecutive_failures,
        lastFailureReason: state.last_failure_reason,
      }, 'Flywheel paused due to repeated failures, skipping')
      return null
    }

    // Collect fees from dev wallet to ops wallet
    await this.collectFees(token, connection)

    // Get ops wallet address for trading
    const opsWalletAddress = token.ops_wallet?.wallet_address
    if (!opsWalletAddress) {
      return { ...baseResult, tradeType: 'buy', success: false, amount: 0, error: 'Ops wallet not found' }
    }

    // Route to appropriate algorithm based on config
    // Note: All trading goes through Bags SDK which handles routing internally
    const algorithmMode = config.algorithm_mode ?? 'simple'

    switch (algorithmMode) {
      case 'simple':
        return this.runSimpleAlgorithm(token, config, state, opsWalletAddress, connection, baseResult)
      case 'turbo_lite':
        return this.runTurboLiteAlgorithm(token, config, state, opsWalletAddress, connection, baseResult)
      case 'transaction_reactive':
        // Reactive mode trades are triggered by the reactive monitor job, not the flywheel
        // Skip periodic flywheel trades - just collect fees
        loggers.flywheel.debug({ tokenSymbol: token.token_symbol }, 'Transaction reactive mode - skipping flywheel trade (handled by reactive monitor)')
        return null
      case 'rebalance':
      case 'twap_vwap':
      case 'dynamic':
        loggers.flywheel.warn({ tokenSymbol: token.token_symbol, algorithm: algorithmMode }, 'Algorithm not implemented, falling back to simple')
        return this.runSimpleAlgorithm(token, config, state, opsWalletAddress, connection, baseResult)
      default:
        loggers.flywheel.error({ tokenSymbol: token.token_symbol, algorithm: algorithmMode }, 'Unknown algorithm mode')
        return this.runSimpleAlgorithm(token, config, state, opsWalletAddress, connection, baseResult)
    }
  }

  /**
   * Transfer excess SOL from dev wallet to ops wallet using Privy signing
   * NOTE: This is just a balance sweep - NO platform fee is taken here.
   * Platform fees are only taken from actual Bags.fm fee claims in fast-claim.service.ts
   */
  private async collectFees(
    token: PrivyTokenWithConfig,
    connection: Connection
  ): Promise<{ collected: boolean; amount: number; signature?: string }> {
    try {
      const devWalletAddress = token.dev_wallet?.wallet_address
      const opsWalletAddress = token.ops_wallet?.wallet_address

      if (!devWalletAddress || !opsWalletAddress) {
        loggers.flywheel.warn({ tokenSymbol: token.token_symbol }, 'Missing wallet addresses for balance sweep')
        return { collected: false, amount: 0 }
      }

      // Get dev wallet SOL balance
      const devPubkey = new PublicKey(devWalletAddress)
      const devBalance = await getBalance(devPubkey)
      loggers.flywheel.debug({ tokenSymbol: token.token_symbol, devBalance, devWallet: devWalletAddress }, 'Dev wallet balance')

      // Calculate transfer amount (keep minimum reserve)
      const transferAmount = devBalance - DEV_WALLET_MIN_RESERVE_SOL

      if (transferAmount < MIN_FEE_THRESHOLD_SOL) {
        loggers.flywheel.debug({ tokenSymbol: token.token_symbol, devBalance }, 'Dev wallet balance too low for sweep')
        return { collected: false, amount: 0 }
      }

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, transferAmount }, 'Sweeping dev wallet balance to ops (no platform fee)')

      // Transfer 100% to user's ops wallet (no platform fee - that's handled in fast-claim)
      const userOpsPubkey = new PublicKey(opsWalletAddress)
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: devPubkey,
          toPubkey: userOpsPubkey,
          lamports: Math.floor(transferAmount * LAMPORTS_PER_SOL),
        })
      )
      tx.feePayer = devPubkey

      const result = await sendTransactionWithPrivySigning(
        connection,
        tx,
        devWalletAddress,
        { commitment: 'confirmed', logContext: { service: 'flywheel', type: 'balance-sweep', tokenSymbol: token.token_symbol } }
      )

      if (result.success) {
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, transferAmount, signature: result.signature }, 'Balance sweep successful')
        await this.recordTransaction(token.id, 'transfer', transferAmount, result.signature!)
        return { collected: true, amount: transferAmount, signature: result.signature }
      } else {
        loggers.flywheel.error({ tokenSymbol: token.token_symbol, error: result.error }, 'Balance sweep failed')
        return { collected: false, amount: 0 }
      }
    } catch (error: any) {
      loggers.flywheel.error({ tokenSymbol: token.token_symbol, error: String(error) }, 'Balance sweep failed')
      return { collected: false, amount: 0 }
    }
  }

  /**
   * Simple algorithm: 5 buys then 5 sells using percentage of current balance
   * All trading goes through Bags SDK which handles routing internally
   */
  private async runSimpleAlgorithm(
    token: PrivyTokenWithConfig,
    config: UserTokenConfig,
    state: UserFlywheelState,
    opsWalletAddress: string,
    connection: Connection,
    baseResult: { userTokenId: string; tokenMint: string; tokenSymbol: string }
  ): Promise<TradeResult | null> {
    const tokenMint = new PublicKey(token.token_mint_address)
    const opsWalletPubkey = new PublicKey(opsWalletAddress)

    // Get percentage settings (default 20%)
    const buyPercent = config.buy_percent || 20
    const sellPercent = config.sell_percent || 20

    if (state.cycle_phase === 'buy') {
      // Check SOL balance
      const solBalance = await getBalance(opsWalletPubkey)
      const minReserve = 0.01 // Reserve for tx fees
      const availableForTrade = Math.max(0, solBalance - minReserve)

      // Calculate buy amount as percentage of available balance
      const buyAmount = availableForTrade * (buyPercent / 100)

      if (buyAmount < 0.001 || solBalance < minReserve + 0.001) {
        const message = `Insufficient SOL for buy (have ${solBalance.toFixed(4)}, need at least ${(minReserve + 0.001).toFixed(4)})`
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, solBalance, buyAmount }, 'Insufficient SOL for buy')
        await this.updateFlywheelCheck(token.id, 'insufficient_sol')
        return null
      }

      const lamports = Math.floor(buyAmount * 1e9)

      loggers.flywheel.info({
        tokenSymbol: token.token_symbol,
        buyAmount,
        buyPercent,
        solBalance,
        buyCount: state.buy_count,
        maxBuys: BUYS_PER_CYCLE,
      }, 'Executing BUY')

      // Get quote from Bags SDK (handles routing internally)
      const quote = await this.getTradeQuote(
        SOL_MINT,
        token.token_mint_address,
        lamports,
        'buy',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        // Quote failures are temporary (e.g., token not indexed yet) - don't trigger pause
        loggers.flywheel.info({ tokenSymbol: token.token_symbol }, 'Quote failed (temporary, no pause)')
        await this.updateFlywheelCheck(token.id, 'quote_failed')
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: 'Failed to get quote' }
      }

      const signature = await this.executeSwapWithPrivySigning(connection, opsWalletAddress, quote.rawQuoteResponse)

      if (!signature) {
        // Actual swap failures should trigger pause mechanism
        await this.recordFailure(token.id, 'Swap failed')
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: 'Swap failed' }
      }

      // Clear failures on success
      await this.clearFailures(token.id)

      // Update state
      const newBuyCount = state.buy_count + 1
      const shouldSwitchToSell = newBuyCount >= BUYS_PER_CYCLE

      await updatePrivyFlywheelState(token.id, {
        cycle_phase: shouldSwitchToSell ? 'sell' : 'buy',
        buy_count: shouldSwitchToSell ? 0 : newBuyCount,
        sell_count: 0,
        last_trade_at: new Date().toISOString(),
      })

      await this.recordTransaction(token.id, 'buy', buyAmount, signature)
      await this.updateFlywheelCheck(token.id, 'traded')

      return { ...baseResult, tradeType: 'buy', success: true, amount: buyAmount, signature }

    } else {
      // SELL phase - use percentage of current token balance
      const tokenBalance = await getTokenBalance(opsWalletPubkey, tokenMint)
      const sellAmount = tokenBalance * (sellPercent / 100)

      if (tokenBalance < 1 || sellAmount < 1) {
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, tokenBalance, sellAmount }, 'Insufficient tokens for sell, switching to buy phase')
        await this.updateFlywheelCheck(token.id, 'no_tokens')
        await updatePrivyFlywheelState(token.id, { cycle_phase: 'buy', sell_count: 0 })
        return null
      }

      const tokenUnits = Math.floor(sellAmount * Math.pow(10, token.token_decimals))

      loggers.flywheel.info({
        tokenSymbol: token.token_symbol,
        sellAmount,
        sellPercent,
        tokenBalance,
        sellCount: state.sell_count,
        maxSells: SELLS_PER_CYCLE,
      }, 'Executing SELL')

      const quote = await this.getTradeQuote(
        token.token_mint_address,
        SOL_MINT,
        tokenUnits,
        'sell',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        // Quote failures are temporary (e.g., token not indexed yet) - don't trigger pause
        loggers.flywheel.info({ tokenSymbol: token.token_symbol }, 'Quote failed (temporary, no pause)')
        await this.updateFlywheelCheck(token.id, 'quote_failed')
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellAmount, error: 'Failed to get quote' }
      }

      const signature = await this.executeSwapWithPrivySigning(connection, opsWalletAddress, quote.rawQuoteResponse)

      if (!signature) {
        // Actual swap failures should trigger pause mechanism
        await this.recordFailure(token.id, 'Swap failed')
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellAmount, error: 'Swap failed' }
      }

      // Clear failures on success
      await this.clearFailures(token.id)

      // Update state
      const newSellCount = state.sell_count + 1
      const shouldSwitchToBuy = newSellCount >= SELLS_PER_CYCLE

      await updatePrivyFlywheelState(token.id, {
        cycle_phase: shouldSwitchToBuy ? 'buy' : 'sell',
        buy_count: 0,
        sell_count: shouldSwitchToBuy ? 0 : newSellCount,
        last_trade_at: new Date().toISOString(),
      })

      await this.recordTransaction(token.id, 'sell', sellAmount, signature)
      await this.updateFlywheelCheck(token.id, 'traded')

      return { ...baseResult, tradeType: 'sell', success: true, amount: sellAmount, signature }
    }
  }

  /**
   * Turbo Lite Algorithm - Rapid Batch Execution
   *
   * Executes ALL buys rapidly (300ms apart), then ALL sells in a single job run.
   * This minimizes price exposure by completing the full cycle in ~1-2 minutes
   * instead of 16+ minutes with the one-trade-per-job approach.
   *
   * Key features:
   * - 8 rapid buys with 300ms delays
   * - Track exact tokens purchased during buy phase
   * - 8 rapid sells, each selling exactly tokens_bought/8
   * - Postgres advisory locks prevent concurrent execution
   * - State persistence after each trade for crash recovery
   * - All trading goes through Bags SDK which handles routing internally
   */
  private async runTurboLiteAlgorithm(
    token: PrivyTokenWithConfig,
    config: UserTokenConfig,
    state: UserFlywheelState,
    opsWalletAddress: string,
    connection: Connection,
    baseResult: { userTokenId: string; tokenMint: string; tokenSymbol: string }
  ): Promise<TradeResult | null> {
    const cycleStartTime = Date.now()
    const tokenMint = new PublicKey(token.token_mint_address)
    const opsWalletPubkey = new PublicKey(opsWalletAddress)

    // Get turbo mode configuration with defaults
    const turboCycleSizeBuys = config.turbo_cycle_size_buys ?? 8
    const turboCycleSizeSells = config.turbo_cycle_size_sells ?? 8
    const interTradeDelayMs = config.turbo_inter_token_delay_ms ?? 500  // Conservative default: 500ms

    // Batching: when enabled (default), only persist state at phase boundaries instead of after every trade
    // This reduces DB writes from ~40 per cycle to ~4 per cycle
    const batchStateUpdates = config.turbo_batch_state_updates ?? true

    // Get percentage settings
    const buyPercent = config.buy_percent || 20

    // Try to acquire advisory lock - skip if another instance is running
    const lockAcquired = await this.acquireTurboLock(token.id)
    if (!lockAcquired) {
      loggers.flywheel.info({ tokenSymbol: token.token_symbol }, '🚀 [Turbo Lite] Another instance running, skipping')
      return null
    }

    try {
      // Check if Bags.fm API is rate limited before starting
      if (bagsFmService.isRateLimited()) {
        loggers.flywheel.warn({
          tokenSymbol: token.token_symbol,
          resetTime: bagsFmService.getRateLimitResetTime(),
        }, '🚀 [Turbo Lite] Bags.fm API rate limited, skipping token')
        return null
      }

      // Resume from saved state if mid-cycle
      let rapidBuysCompleted = state.rapid_buys_completed ?? 0
      let rapidSellsCompleted = state.rapid_sells_completed ?? 0
      let tokensBoughtThisCycle = state.tokens_bought_this_cycle ?? 0
      let solSpentThisCycle = state.sol_spent_this_cycle ?? 0
      let emergencySellAll = false // Flag to sell ALL tokens when SOL < 0.1

      loggers.flywheel.info({
        tokenSymbol: token.token_symbol,
        rapidBuysCompleted,
        rapidSellsCompleted,
        tokensBoughtThisCycle,
        solSpentThisCycle,
        turboCycleSizeBuys,
        turboCycleSizeSells,
      }, '🚀 [Turbo Lite] Starting rapid execution cycle')

      // ═══════════════════════════════════════════════════════════════════
      // BUY PHASE - Execute remaining buys rapidly
      // ═══════════════════════════════════════════════════════════════════
      if (rapidBuysCompleted < turboCycleSizeBuys) {
        // Get initial token balance to track purchases
        const initialTokenBalance = await getTokenBalance(opsWalletPubkey, tokenMint)

        // Consecutive failure tracking to prevent infinite loops
        let consecutiveQuoteFailures = 0
        const maxConsecutiveQuoteFailures = 5  // Allow more transient failures before pausing

        while (rapidBuysCompleted < turboCycleSizeBuys) {
          // Check SOL balance
          const solBalance = await getBalance(opsWalletPubkey)
          const minReserve = 0.01
          const availableForTrade = Math.max(0, solBalance - minReserve)

          // If SOL balance < 0.1, stop buying early and trigger emergency sell of ALL tokens
          if (solBalance < 0.1) {
            emergencySellAll = true
            loggers.flywheel.info({
              tokenSymbol: token.token_symbol,
              solBalance,
              rapidBuysCompleted,
              turboCycleSizeBuys,
            }, '🚨 [Turbo Lite] Low SOL (<0.1), triggering emergency sell of ALL tokens')
            break
          }

          // Calculate buy amount
          const buyAmount = availableForTrade * (buyPercent / 100)
          if (buyAmount < 0.001) {
            loggers.flywheel.info({
              tokenSymbol: token.token_symbol,
              solBalance,
              buyAmount,
              rapidBuysCompleted,
            }, '🚀 [Turbo Lite] Insufficient SOL for buy, ending buy phase early')
            break
          }

          const lamports = Math.floor(buyAmount * 1e9)

          loggers.flywheel.info({
            tokenSymbol: token.token_symbol,
            buyAmount,
            buyPercent,
            solBalance,
            progress: `${rapidBuysCompleted + 1}/${turboCycleSizeBuys}`,
          }, `🚀 [Turbo Lite] Buy ${rapidBuysCompleted + 1}/${turboCycleSizeBuys}`)

          // Get quote from Bags SDK (handles routing internally)
          const quote = await this.getTradeQuote(
            SOL_MINT,
            token.token_mint_address,
            lamports,
            'buy',
            config.slippage_bps
          )

          if (!quote?.rawQuoteResponse) {
            consecutiveQuoteFailures++
            loggers.flywheel.warn({
              tokenSymbol: token.token_symbol,
              consecutiveFailures: consecutiveQuoteFailures,
              maxAllowed: maxConsecutiveQuoteFailures,
            }, '🚀 [Turbo Lite] Quote failed')

            // Break out of loop if too many consecutive failures
            if (consecutiveQuoteFailures >= maxConsecutiveQuoteFailures) {
              loggers.flywheel.error({
                tokenSymbol: token.token_symbol,
                consecutiveQuoteFailures,
              }, '🚀 [Turbo Lite] Max consecutive quote failures in buy phase, pausing token')
              await this.recordFailure(token.id, `Turbo buy: ${consecutiveQuoteFailures} consecutive quote failures`)
              // Persist state before returning so we can resume later
              await updatePrivyFlywheelState(token.id, {
                rapid_buys_completed: rapidBuysCompleted,
                sol_spent_this_cycle: solSpentThisCycle,
                last_trade_at: new Date().toISOString(),
              })
              break // Exit buy loop - will skip to sell phase or end cycle
            }

            // Increasing delay based on consecutive failures
            await this.sleep(interTradeDelayMs * consecutiveQuoteFailures)
            continue // Skip this buy, try next
          }

          // Reset consecutive failures on successful quote
          consecutiveQuoteFailures = 0

          const signature = await this.executeSwapWithPrivySigning(
            connection,
            opsWalletAddress,
            quote.rawQuoteResponse
          )

          if (signature) {
            rapidBuysCompleted++
            solSpentThisCycle += buyAmount
            await this.recordTransaction(token.id, 'buy', buyAmount, signature)
            if (!batchStateUpdates) {
              await this.clearFailures(token.id)
            }

            loggers.flywheel.info({
              tokenSymbol: token.token_symbol,
              signature,
              rapidBuysCompleted,
              solSpentThisCycle,
            }, `🚀 [Turbo Lite] Buy ${rapidBuysCompleted}/${turboCycleSizeBuys} complete`)
          } else {
            loggers.flywheel.warn({
              tokenSymbol: token.token_symbol,
              rapidBuysCompleted,
            }, '🚀 [Turbo Lite] Buy swap failed, continuing')
            if (!batchStateUpdates) {
              await this.recordFailure(token.id, 'Turbo buy swap failed')
            }
          }

          // Persist state after each trade only when batching is disabled
          // When batching is enabled, state is persisted at phase boundaries
          if (!batchStateUpdates) {
            await updatePrivyFlywheelState(token.id, {
              rapid_buys_completed: rapidBuysCompleted,
              sol_spent_this_cycle: solSpentThisCycle,
              last_trade_at: new Date().toISOString(),
            })
          }

          // Delay between trades
          if (rapidBuysCompleted < turboCycleSizeBuys) {
            await this.sleep(interTradeDelayMs)
          }
        }

        // Calculate tokens bought by checking balance difference
        const finalTokenBalance = await getTokenBalance(opsWalletPubkey, tokenMint)
        tokensBoughtThisCycle = finalTokenBalance - initialTokenBalance

        loggers.flywheel.info({
          tokenSymbol: token.token_symbol,
          initialTokenBalance,
          finalTokenBalance,
          tokensBoughtThisCycle,
          rapidBuysCompleted,
          solSpentThisCycle,
        }, '✅ [Turbo Lite] Buy phase complete')

        // Save tokens bought for sell phase
        await updatePrivyFlywheelState(token.id, {
          rapid_buys_completed: rapidBuysCompleted,
          tokens_bought_this_cycle: tokensBoughtThisCycle,
          sol_spent_this_cycle: solSpentThisCycle,
        })
      }

      // ═══════════════════════════════════════════════════════════════════
      // SELL PHASE - Sell exactly what was bought (or ALL tokens in emergency mode)
      // ═══════════════════════════════════════════════════════════════════
      if (emergencySellAll || (tokensBoughtThisCycle > 0 && rapidSellsCompleted < turboCycleSizeSells)) {
        // In emergency mode, sell ALL tokens; otherwise sell only what was bought this cycle
        const currentTokenBalance = await getTokenBalance(opsWalletPubkey, tokenMint)
        const tokensToSell = emergencySellAll ? currentTokenBalance : tokensBoughtThisCycle
        const sellAmountPerTrade = tokensToSell / turboCycleSizeSells

        // Consecutive failure tracking to prevent infinite loops
        let consecutiveQuoteFailures = 0
        const maxConsecutiveQuoteFailures = 5  // Allow more transient failures before pausing

        if (emergencySellAll) {
          loggers.flywheel.info({
            tokenSymbol: token.token_symbol,
            currentTokenBalance,
            sellAmountPerTrade,
            turboCycleSizeSells,
          }, '🚨 [Turbo Lite] Emergency sell: liquidating ALL held tokens')
        } else {
          loggers.flywheel.info({
            tokenSymbol: token.token_symbol,
            tokensBoughtThisCycle,
            sellAmountPerTrade,
            rapidSellsCompleted,
            turboCycleSizeSells,
          }, '🚀 [Turbo Lite] Starting sell phase')
        }

        while (rapidSellsCompleted < turboCycleSizeSells) {
          // Check if we have enough tokens
          const currentTokenBalance = await getTokenBalance(opsWalletPubkey, tokenMint)
          if (currentTokenBalance < sellAmountPerTrade || sellAmountPerTrade < 1) {
            loggers.flywheel.info({
              tokenSymbol: token.token_symbol,
              currentTokenBalance,
              sellAmountPerTrade,
              rapidSellsCompleted,
            }, '🚀 [Turbo Lite] Insufficient tokens for sell, ending sell phase')
            break
          }

          const tokenUnits = Math.floor(sellAmountPerTrade * Math.pow(10, token.token_decimals))

          loggers.flywheel.info({
            tokenSymbol: token.token_symbol,
            sellAmount: sellAmountPerTrade,
            currentTokenBalance,
            progress: `${rapidSellsCompleted + 1}/${turboCycleSizeSells}`,
          }, `🚀 [Turbo Lite] Sell ${rapidSellsCompleted + 1}/${turboCycleSizeSells}`)

          // Get quote from Bags SDK (handles routing internally)
          const quote = await this.getTradeQuote(
            token.token_mint_address,
            SOL_MINT,
            tokenUnits,
            'sell',
            config.slippage_bps
          )

          if (!quote?.rawQuoteResponse) {
            consecutiveQuoteFailures++
            loggers.flywheel.warn({
              tokenSymbol: token.token_symbol,
              consecutiveFailures: consecutiveQuoteFailures,
              maxAllowed: maxConsecutiveQuoteFailures,
            }, '🚀 [Turbo Lite] Quote failed')

            // Break out of loop if too many consecutive failures
            if (consecutiveQuoteFailures >= maxConsecutiveQuoteFailures) {
              loggers.flywheel.error({
                tokenSymbol: token.token_symbol,
                consecutiveQuoteFailures,
              }, '🚀 [Turbo Lite] Max consecutive quote failures in sell phase, pausing token')
              await this.recordFailure(token.id, `Turbo sell: ${consecutiveQuoteFailures} consecutive quote failures`)
              // Persist state before returning so we can resume later
              await updatePrivyFlywheelState(token.id, {
                rapid_sells_completed: rapidSellsCompleted,
                last_trade_at: new Date().toISOString(),
              })
              break // Exit sell loop
            }

            // Increasing delay based on consecutive failures
            await this.sleep(interTradeDelayMs * consecutiveQuoteFailures)
            continue // Skip this sell, try next
          }

          // Reset consecutive failures on successful quote
          consecutiveQuoteFailures = 0

          const signature = await this.executeSwapWithPrivySigning(
            connection,
            opsWalletAddress,
            quote.rawQuoteResponse
          )

          if (signature) {
            rapidSellsCompleted++
            await this.recordTransaction(token.id, 'sell', sellAmountPerTrade, signature)
            if (!batchStateUpdates) {
              await this.clearFailures(token.id)
            }

            loggers.flywheel.info({
              tokenSymbol: token.token_symbol,
              signature,
              rapidSellsCompleted,
            }, `🚀 [Turbo Lite] Sell ${rapidSellsCompleted}/${turboCycleSizeSells} complete`)
          } else {
            loggers.flywheel.warn({
              tokenSymbol: token.token_symbol,
              rapidSellsCompleted,
            }, '🚀 [Turbo Lite] Sell swap failed, continuing')
            if (!batchStateUpdates) {
              await this.recordFailure(token.id, 'Turbo sell swap failed')
            }
          }

          // Persist state after each trade only when batching is disabled
          // When batching is enabled, state is persisted at phase boundaries
          if (!batchStateUpdates) {
            await updatePrivyFlywheelState(token.id, {
              rapid_sells_completed: rapidSellsCompleted,
              last_trade_at: new Date().toISOString(),
            })
          }

          // Delay between trades
          if (rapidSellsCompleted < turboCycleSizeSells) {
            await this.sleep(interTradeDelayMs)
          }
        }

        loggers.flywheel.info({
          tokenSymbol: token.token_symbol,
          rapidSellsCompleted,
        }, '✅ [Turbo Lite] Sell phase complete')
      }

      // ═══════════════════════════════════════════════════════════════════
      // CYCLE COMPLETE - Reset state for next cycle
      // ═══════════════════════════════════════════════════════════════════
      const cycleTimeMs = Date.now() - cycleStartTime
      const totalTrades = rapidBuysCompleted + rapidSellsCompleted

      loggers.flywheel.info({
        tokenSymbol: token.token_symbol,
        rapidBuysCompleted,
        rapidSellsCompleted,
        totalTrades,
        tokensBoughtThisCycle,
        solSpentThisCycle,
        cycleTimeMs,
        cycleTimeFormatted: `${(cycleTimeMs / 1000).toFixed(1)}s`,
      }, `🎉 [Turbo Lite] Cycle complete in ${(cycleTimeMs / 1000).toFixed(1)}s`)

      // Reset rapid execution state for next cycle
      // When batching is enabled, this is the only state persistence for the entire cycle
      // (apart from the buy phase boundary update)
      await updatePrivyFlywheelState(token.id, {
        cycle_phase: 'buy',
        buy_count: 0,
        sell_count: 0,
        rapid_buys_completed: 0,
        rapid_sells_completed: 0,
        tokens_bought_this_cycle: 0,
        sol_spent_this_cycle: 0,
        last_trade_at: new Date().toISOString(),
        // Clear failure tracking at cycle completion when batching is enabled
        ...(batchStateUpdates && totalTrades > 0 ? { consecutive_failures: 0 } : {}),
      })

      await this.updateFlywheelCheck(token.id, 'turbo_cycle_complete')

      // Return result summarizing the cycle
      return {
        ...baseResult,
        tradeType: rapidSellsCompleted > 0 ? 'sell' : 'buy',
        success: totalTrades > 0,
        amount: solSpentThisCycle,
        signature: `turbo_cycle_${totalTrades}_trades_${cycleTimeMs}ms`,
      }

    } finally {
      // Always release the lock
      await this.releaseTurboLock(token.id)
    }
  }

  /**
   * Execute swap with Privy delegated signing
   * Uses sign-only + self-broadcast pattern for reliability
   * All swaps go through Bags SDK which returns bs58-encoded transactions
   */
  private async executeSwapWithPrivySigning(
    connection: Connection,
    walletAddress: string,
    quoteResponse: unknown,
    maxRetries: number = 3
  ): Promise<string | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Get fresh swap transaction for each attempt (fresh blockhash each time)
      const swapData = await this.generateSwapTx(walletAddress, quoteResponse)

      if (!swapData) {
        loggers.flywheel.error({ attempt }, 'Failed to get swap transaction')
        return null
      }

      // Deserialize the transaction (Bags SDK returns bs58-encoded transactions)
      let transaction: VersionedTransaction
      try {
        const txBuffer = bs58.decode(swapData.transaction)
        transaction = VersionedTransaction.deserialize(txBuffer)
      } catch (error) {
        loggers.flywheel.error({ error: String(error) }, 'Failed to deserialize transaction')
        return null
      }

      // Use sendTransactionWithPrivySigning utility (sign-only + self-broadcast)
      const result = await sendTransactionWithPrivySigning(connection, transaction, walletAddress, {
        maxRetries: 1, // We handle retries ourselves with fresh transactions
        logContext: { service: 'flywheel', attempt: attempt + 1 },
      })

      if (result.success && result.signature) {
        loggers.flywheel.info({ signature: result.signature, attempt: attempt + 1 }, 'Swap executed successfully')
        return result.signature
      }

      // Check if error is retryable
      const errorMsg = result.error || 'Unknown error'
      if (errorMsg.includes('Blockhash') || errorMsg.includes('blockhash') || errorMsg.includes('block height')) {
        loggers.flywheel.warn({ attempt: attempt + 1, maxRetries, error: errorMsg }, 'Blockhash issue, retrying with fresh transaction')
        await new Promise(resolve => setTimeout(resolve, 300))
        continue
      }

      // Non-retryable error
      loggers.flywheel.error({ walletAddress, error: errorMsg, attempt: attempt + 1 }, 'Swap failed')
      return null
    }

    loggers.flywheel.error({ walletAddress, maxRetries }, 'Swap failed after all retries')
    return null
  }

  /**
   * Record transaction in Prisma database
   */
  private async recordTransaction(
    privyTokenId: string,
    type: 'buy' | 'sell' | 'transfer',
    amount: number,
    signature: string
  ): Promise<void> {
    if (!isPrismaConfigured()) return

    try {
      await prisma.privyTransaction.upsert({
        where: { signature },
        update: {}, // No update needed, just skip if exists
        create: {
          privyTokenId,
          type,
          amount,
          signature,
          status: 'confirmed',
        },
      })
      loggers.flywheel.info({ type, signature }, 'Recorded transaction')
    } catch (error: any) {
      loggers.flywheel.error({ type, error: String(error) }, 'Failed to record transaction')
    }
  }

  /**
   * Update flywheel check status
   */
  private async updateFlywheelCheck(
    privyTokenId: string,
    checkResult: string
  ): Promise<void> {
    if (!isPrismaConfigured()) return

    try {
      await prisma.privyFlywheelState.update({
        where: { privyTokenId },
        data: {
          lastCheckedAt: new Date(),
          lastCheckResult: checkResult,
        },
      })
    } catch {
      // Silently fail
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getLastRunAt(): Date | null {
    return this.lastRunAt
  }

  isJobRunning(): boolean {
    return this.isRunning
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTION REACTIVE MODE
  // Responds to large market transactions with counter-trades
  // Formula: response_% = min(sol_amount × scale_percent, max_response_percent)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute a reactive trade in response to a detected market transaction
   * @param privyTokenId - Token ID from database
   * @param detectedType - Type of transaction detected ('buy' or 'sell')
   * @param solAmount - SOL amount of the detected transaction
   * @param reactiveConfig - Reactive mode configuration
   */
  async executeReactiveTrade(
    privyTokenId: string,
    detectedType: 'buy' | 'sell',
    solAmount: number,
    reactiveConfig: {
      minTriggerSol: number
      scalePercent: number
      maxResponsePercent: number
      cooldownMs: number
    }
  ): Promise<TradeResult | null> {
    if (!isPrismaConfigured()) {
      return null
    }

    // Get token info with config and state
    const token = await prisma.privyUserToken.findUnique({
      where: { id: privyTokenId },
      include: {
        config: true,
        flywheelState: true,
        opsWallet: true,
      },
    })

    if (!token || !token.opsWallet || !token.config) {
      loggers.flywheel.error({ privyTokenId }, 'Token not found for reactive trade')
      return null
    }

    const baseResult = {
      userTokenId: token.id,
      tokenMint: token.tokenMintAddress,
      tokenSymbol: token.tokenSymbol,
    }

    // Check cooldown
    if (token.flywheelState?.lastReactiveTradeAt) {
      const timeSinceLastTrade = Date.now() - new Date(token.flywheelState.lastReactiveTradeAt).getTime()
      if (timeSinceLastTrade < reactiveConfig.cooldownMs) {
        loggers.flywheel.info({
          tokenSymbol: token.tokenSymbol,
          timeSinceLastTrade,
          cooldownMs: reactiveConfig.cooldownMs,
        }, '⏸️ Reactive trade on cooldown, skipping')
        return null
      }
    }

    // Try to acquire lock
    if (!await this.acquireTurboLock(token.id)) {
      loggers.flywheel.info({ tokenSymbol: token.tokenSymbol }, '🔒 Token locked, skipping reactive trade')
      return null
    }

    try {
      const connection = getConnection()
      const opsWalletAddress = token.opsWallet.walletAddress
      const opsWalletPubkey = new PublicKey(opsWalletAddress)
      const tokenMint = new PublicKey(token.tokenMintAddress)

      // Calculate response percentage: min(solAmount × scalePercent, maxResponsePercent)
      const responsePercent = Math.min(
        solAmount * reactiveConfig.scalePercent,
        reactiveConfig.maxResponsePercent
      )

      loggers.flywheel.info({
        tokenSymbol: token.tokenSymbol,
        detectedType,
        solAmount,
        responsePercent,
      }, `🎯 Executing reactive ${detectedType === 'buy' ? 'SELL' : 'BUY'} (${responsePercent}% response)`)

      // Counter-trade: if market buys, we sell; if market sells, we buy
      const tradeType: 'buy' | 'sell' = detectedType === 'buy' ? 'sell' : 'buy'
      const slippageBps = token.config.slippageBps

      let signature: string | null = null
      let tradeAmount = 0

      if (tradeType === 'sell') {
        // Sell tokens: get token balance and sell responsePercent%
        const tokenBalance = await getTokenBalance(opsWalletPubkey, tokenMint)
        if (tokenBalance <= 0) {
          loggers.flywheel.warn({ tokenSymbol: token.tokenSymbol }, 'No token balance for reactive sell')
          return { ...baseResult, tradeType, success: false, amount: 0, error: 'No token balance' }
        }

        tradeAmount = tokenBalance * (responsePercent / 100)
        if (tradeAmount < 1) {
          loggers.flywheel.debug({ tokenSymbol: token.tokenSymbol, tradeAmount }, 'Trade amount too small')
          return { ...baseResult, tradeType, success: false, amount: 0, error: 'Trade amount too small' }
        }

        // Convert to smallest units (token decimals) - same as simple algorithm
        const tokenUnits = Math.floor(tradeAmount * Math.pow(10, token.tokenDecimals))

        // Get quote for selling tokens
        const quote = await this.getTradeQuote(
          token.tokenMintAddress,
          SOL_MINT,
          tokenUnits,
          'sell',
          slippageBps
        )

        if (!quote) {
          return { ...baseResult, tradeType, success: false, amount: 0, error: 'Failed to get sell quote' }
        }

        signature = await this.executeSwapWithPrivySigning(connection, opsWalletAddress, quote.rawQuoteResponse)

      } else {
        // Buy tokens: get SOL balance and buy with responsePercent% of SOL
        const solBalance = await getBalance(opsWalletPubkey)
        const availableSol = Math.max(0, solBalance - 0.05) // Keep 0.05 SOL reserve
        if (availableSol <= 0.01) {
          loggers.flywheel.warn({ tokenSymbol: token.tokenSymbol }, 'Insufficient SOL for reactive buy')
          return { ...baseResult, tradeType, success: false, amount: 0, error: 'Insufficient SOL' }
        }

        tradeAmount = availableSol * (responsePercent / 100)
        if (tradeAmount < 0.01) {
          loggers.flywheel.debug({ tokenSymbol: token.tokenSymbol, tradeAmount }, 'Trade amount too small')
          return { ...baseResult, tradeType, success: false, amount: 0, error: 'Trade amount too small' }
        }

        // Convert to lamports - same as simple algorithm
        const lamports = Math.floor(tradeAmount * 1e9)

        // Get quote for buying tokens
        const quote = await this.getTradeQuote(
          SOL_MINT,
          token.tokenMintAddress,
          lamports,
          'buy',
          slippageBps
        )

        if (!quote) {
          return { ...baseResult, tradeType, success: false, amount: 0, error: 'Failed to get buy quote' }
        }

        signature = await this.executeSwapWithPrivySigning(connection, opsWalletAddress, quote.rawQuoteResponse)
      }

      // Update reactive trade state
      if (isPrismaConfigured()) {
        await prisma.privyFlywheelState.upsert({
          where: { privyTokenId: token.id },
          update: {
            lastReactiveTradeAt: new Date(),
            reactiveTradesCount: { increment: 1 },
          },
          create: {
            privyTokenId: token.id,
            lastReactiveTradeAt: new Date(),
            reactiveTradesCount: 1,
          },
        })
      }

      if (signature) {
        await this.recordTransaction(token.id, tradeType, tradeAmount, signature)
        loggers.flywheel.info({
          tokenSymbol: token.tokenSymbol,
          tradeType,
          tradeAmount,
          responsePercent,
          signature,
        }, `✅ Reactive ${tradeType} executed successfully`)

        return {
          ...baseResult,
          tradeType,
          success: true,
          amount: tradeAmount,
          signature,
        }
      }

      return { ...baseResult, tradeType, success: false, amount: 0, error: 'Swap execution failed' }

    } catch (error: any) {
      loggers.flywheel.error({
        tokenSymbol: token.tokenSymbol,
        error: String(error),
      }, 'Reactive trade failed')
      return {
        ...baseResult,
        tradeType: detectedType === 'buy' ? 'sell' : 'buy',
        success: false,
        amount: 0,
        error: error.message,
      }
    } finally {
      await this.releaseTurboLock(token.id)
    }
  }
}

export const multiUserMMService = new MultiUserMMService()
