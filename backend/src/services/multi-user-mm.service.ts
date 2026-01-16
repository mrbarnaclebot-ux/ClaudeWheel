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
import { jupiterService } from './jupiter.service'
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

class MultiUserMMService {
  private isRunning = false
  private lastRunAt: Date | null = null
  private tradesThisMinute = 0
  private lastTradeMinute = 0

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
   */
  private getTradingRoute(token: PrivyTokenWithConfig, config: UserTokenConfig): 'bags' | 'jupiter' {
    if (config.trading_route === 'bags') return 'bags'
    if (config.trading_route === 'jupiter') return 'jupiter'
    return token.is_graduated ? 'jupiter' : 'bags'
  }

  /**
   * Get trade quote from appropriate exchange
   */
  private async getTradeQuote(
    route: 'bags' | 'jupiter',
    inputMint: string,
    outputMint: string,
    amount: number,
    side: 'buy' | 'sell',
    slippageBps: number
  ): Promise<{ rawQuoteResponse: unknown; outputAmount: number } | null> {
    if (route === 'jupiter') {
      const quote = await jupiterService.getTradeQuote(inputMint, outputMint, amount, slippageBps)
      if (!quote) return null
      return { rawQuoteResponse: quote.rawQuoteResponse, outputAmount: quote.outputAmount }
    } else {
      const quote = await bagsFmService.getTradeQuote(inputMint, outputMint, amount, side, slippageBps)
      if (!quote) return null
      return { rawQuoteResponse: quote.rawQuoteResponse, outputAmount: quote.outputAmount }
    }
  }

  /**
   * Generate swap transaction from appropriate exchange
   */
  private async generateSwapTx(
    route: 'bags' | 'jupiter',
    walletAddress: string,
    quoteResponse: unknown
  ): Promise<{ transaction: string; lastValidBlockHeight: number } | null> {
    if (route === 'jupiter') {
      return jupiterService.generateSwapTransaction(walletAddress, quoteResponse as any)
    } else {
      return bagsFmService.generateSwapTransaction(walletAddress, quoteResponse as any)
    }
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
          ? (config?.turbo_global_rate_limit ?? 60)
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
            ? (config?.turbo_inter_token_delay_ms ?? 200)
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

    // Determine trading route (auto-detect based on graduation)
    const tradingRoute = this.getTradingRoute(token, config)
    loggers.flywheel.debug({
      tokenSymbol: token.token_symbol,
      tradingRoute,
      isGraduated: token.is_graduated,
      configRoute: config.trading_route,
    }, 'Using trading route')

    // Collect fees from dev wallet to ops wallet
    await this.collectFees(token, connection)

    // Get ops wallet address for trading
    const opsWalletAddress = token.ops_wallet?.wallet_address
    if (!opsWalletAddress) {
      return { ...baseResult, tradeType: 'buy', success: false, amount: 0, error: 'Ops wallet not found' }
    }

    // Route to appropriate algorithm based on config
    const algorithmMode = config.algorithm_mode ?? 'simple'

    switch (algorithmMode) {
      case 'simple':
        return this.runSimpleAlgorithm(token, config, state, opsWalletAddress, connection, baseResult, tradingRoute)
      case 'turbo_lite':
        return this.runTurboLiteAlgorithm(token, config, state, opsWalletAddress, connection, baseResult, tradingRoute)
      case 'rebalance':
      case 'twap_vwap':
      case 'dynamic':
        loggers.flywheel.warn({ tokenSymbol: token.token_symbol, algorithm: algorithmMode }, 'Algorithm not implemented, falling back to simple')
        return this.runSimpleAlgorithm(token, config, state, opsWalletAddress, connection, baseResult, tradingRoute)
      default:
        loggers.flywheel.error({ tokenSymbol: token.token_symbol, algorithm: algorithmMode }, 'Unknown algorithm mode')
        return this.runSimpleAlgorithm(token, config, state, opsWalletAddress, connection, baseResult, tradingRoute)
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
   */
  private async runSimpleAlgorithm(
    token: PrivyTokenWithConfig,
    config: UserTokenConfig,
    state: UserFlywheelState,
    opsWalletAddress: string,
    connection: Connection,
    baseResult: { userTokenId: string; tokenMint: string; tokenSymbol: string },
    tradingRoute: 'bags' | 'jupiter' = 'bags'
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
        route: tradingRoute,
      }, 'Executing BUY')

      // Get quote
      const quote = await this.getTradeQuote(
        tradingRoute,
        SOL_MINT,
        token.token_mint_address,
        lamports,
        'buy',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        // Quote failures are temporary (e.g., token not indexed yet) - don't trigger pause
        const errorMsg = `Failed to get ${tradingRoute} quote`
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, route: tradingRoute }, 'Quote failed (temporary, no pause)')
        await this.updateFlywheelCheck(token.id, 'quote_failed')
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
      }

      const signature = await this.executeSwapWithPrivySigning(connection, opsWalletAddress, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        // Actual swap failures should trigger pause mechanism
        const errorMsg = `${tradingRoute} swap failed`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
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
        route: tradingRoute,
      }, 'Executing SELL')

      const quote = await this.getTradeQuote(
        tradingRoute,
        token.token_mint_address,
        SOL_MINT,
        tokenUnits,
        'sell',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        // Quote failures are temporary (e.g., token not indexed yet) - don't trigger pause
        const errorMsg = `Failed to get ${tradingRoute} quote`
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, route: tradingRoute }, 'Quote failed (temporary, no pause)')
        await this.updateFlywheelCheck(token.id, 'quote_failed')
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellAmount, error: errorMsg }
      }

      const signature = await this.executeSwapWithPrivySigning(connection, opsWalletAddress, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        // Actual swap failures should trigger pause mechanism
        const errorMsg = `${tradingRoute} swap failed`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellAmount, error: errorMsg }
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
   * Turbo Lite Algorithm - 3-5x speed improvement over Simple mode
   *
   * Key optimizations:
   * - Larger cycle sizes (8 buys/sells vs 5)
   * - Configurable job intervals (15s vs 60s - managed by job scheduler)
   * - Reduced inter-token delays (managed by caller)
   * - Batched database state updates (every 3 trades instead of every trade)
   */
  private async runTurboLiteAlgorithm(
    token: PrivyTokenWithConfig,
    config: UserTokenConfig,
    state: UserFlywheelState,
    opsWalletAddress: string,
    connection: Connection,
    baseResult: { userTokenId: string; tokenMint: string; tokenSymbol: string },
    tradingRoute: 'bags' | 'jupiter' = 'bags'
  ): Promise<TradeResult | null> {
    const tokenMint = new PublicKey(token.token_mint_address)
    const opsWalletPubkey = new PublicKey(opsWalletAddress)

    // Get turbo mode configuration with defaults
    const turboCycleSizeBuys = config.turbo_cycle_size_buys ?? 8
    const turboCycleSizeSells = config.turbo_cycle_size_sells ?? 8
    const turboBatchStateUpdates = config.turbo_batch_state_updates ?? true

    // Get percentage settings (same as simple mode)
    const buyPercent = config.buy_percent || 20
    const sellPercent = config.sell_percent || 20

    if (state.cycle_phase === 'buy') {
      // Check SOL balance
      const solBalance = await getBalance(opsWalletPubkey)
      const minReserve = 0.01 // Reserve for tx fees
      const availableForTrade = Math.max(0, solBalance - minReserve)

      // Calculate buy amount as percentage of available balance
      const buyAmount = availableForTrade * (buyPercent / 100)

      // If SOL balance < 0.1, switch to sell phase to recover funds
      if (solBalance < 0.1) {
        loggers.flywheel.info({
          tokenSymbol: token.token_symbol,
          solBalance,
          buyCount: state.buy_count
        }, '🚀 [Turbo Lite] Low SOL balance (<0.1), switching to sell phase')
        await updatePrivyFlywheelState(token.id, {
          cycle_phase: 'sell',
          buy_count: 0,
          sell_count: 0,
          last_trade_at: new Date().toISOString(),
        })
        await this.updateFlywheelCheck(token.id, 'low_sol_switch_to_sell')
        return null
      }

      if (buyAmount < 0.001 || solBalance < minReserve + 0.001) {
        const message = `🚀 [Turbo Lite] Insufficient SOL for buy (have ${solBalance.toFixed(4)}, need at least ${(minReserve + 0.001).toFixed(4)})`
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, solBalance, buyAmount }, message)
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
        maxBuys: turboCycleSizeBuys,
        route: tradingRoute,
      }, `🚀 [Turbo Lite] Executing BUY ${state.buy_count + 1}/${turboCycleSizeBuys}`)

      // Get quote
      const quote = await this.getTradeQuote(
        tradingRoute,
        SOL_MINT,
        token.token_mint_address,
        lamports,
        'buy',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        const errorMsg = `Failed to get ${tradingRoute} quote`
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, route: tradingRoute }, '🚀 [Turbo Lite] Quote failed (temporary, no pause)')
        await this.updateFlywheelCheck(token.id, 'quote_failed')
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
      }

      const signature = await this.executeSwapWithPrivySigning(connection, opsWalletAddress, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        const errorMsg = `${tradingRoute} swap failed`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
      }

      // Clear failures on success
      await this.clearFailures(token.id)

      // Update state - ALWAYS persist since each job run only does one trade per token
      // Batching doesn't work with the current execution model (state reloads from DB each run)
      const newBuyCount = state.buy_count + 1
      const shouldSwitchToSell = newBuyCount >= turboCycleSizeBuys

      await updatePrivyFlywheelState(token.id, {
        cycle_phase: shouldSwitchToSell ? 'sell' : 'buy',
        buy_count: shouldSwitchToSell ? 0 : newBuyCount,
        sell_count: 0,
        last_trade_at: new Date().toISOString(),
      })

      if (shouldSwitchToSell) {
        loggers.flywheel.info({ tokenSymbol: token.token_symbol }, '✅ [Turbo Lite] Buy phase complete, switching to sell')
      }

      await this.recordTransaction(token.id, 'buy', buyAmount, signature)
      await this.updateFlywheelCheck(token.id, 'traded')

      return { ...baseResult, tradeType: 'buy', success: true, amount: buyAmount, signature }

    } else {
      // SELL phase - use percentage of current token balance
      const tokenBalance = await getTokenBalance(opsWalletPubkey, tokenMint)
      const sellAmount = tokenBalance * (sellPercent / 100)

      if (tokenBalance < 1 || sellAmount < 1) {
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, tokenBalance, sellAmount }, '🚀 [Turbo Lite] Insufficient tokens for sell, switching to buy phase')
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
        maxSells: turboCycleSizeSells,
        route: tradingRoute,
      }, `🚀 [Turbo Lite] Executing SELL ${state.sell_count + 1}/${turboCycleSizeSells}`)

      const quote = await this.getTradeQuote(
        tradingRoute,
        token.token_mint_address,
        SOL_MINT,
        tokenUnits,
        'sell',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        const errorMsg = `Failed to get ${tradingRoute} quote`
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, route: tradingRoute }, '🚀 [Turbo Lite] Quote failed (temporary, no pause)')
        await this.updateFlywheelCheck(token.id, 'quote_failed')
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellAmount, error: errorMsg }
      }

      const signature = await this.executeSwapWithPrivySigning(connection, opsWalletAddress, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        const errorMsg = `${tradingRoute} swap failed`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellAmount, error: errorMsg }
      }

      // Clear failures on success
      await this.clearFailures(token.id)

      // Update state - ALWAYS persist since each job run only does one trade per token
      // Batching doesn't work with the current execution model (state reloads from DB each run)
      const newSellCount = state.sell_count + 1
      const shouldSwitchToBuy = newSellCount >= turboCycleSizeSells

      await updatePrivyFlywheelState(token.id, {
        cycle_phase: shouldSwitchToBuy ? 'buy' : 'sell',
        buy_count: 0,
        sell_count: shouldSwitchToBuy ? 0 : newSellCount,
        last_trade_at: new Date().toISOString(),
      })

      if (shouldSwitchToBuy) {
        loggers.flywheel.info({ tokenSymbol: token.token_symbol }, '🎉 [Turbo Lite] Sell phase complete, cycle finished')
      }

      await this.recordTransaction(token.id, 'sell', sellAmount, signature)
      await this.updateFlywheelCheck(token.id, 'traded')

      return { ...baseResult, tradeType: 'sell', success: true, amount: sellAmount, signature }
    }
  }

  /**
   * Execute swap with Privy delegated signing
   * Uses sign-only + self-broadcast pattern for reliability
   */
  private async executeSwapWithPrivySigning(
    connection: Connection,
    walletAddress: string,
    quoteResponse: unknown,
    route: 'bags' | 'jupiter',
    maxRetries: number = 3
  ): Promise<string | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Get fresh swap transaction for each attempt (fresh blockhash each time)
      const swapData = await this.generateSwapTx(route, walletAddress, quoteResponse)

      if (!swapData) {
        loggers.flywheel.error({ route, attempt }, 'Failed to get swap transaction')
        return null
      }

      // Deserialize the transaction
      let transaction: VersionedTransaction
      try {
        if (route === 'jupiter') {
          const txBuffer = Buffer.from(swapData.transaction, 'base64')
          transaction = VersionedTransaction.deserialize(txBuffer)
        } else {
          const txBuffer = bs58.decode(swapData.transaction)
          transaction = VersionedTransaction.deserialize(txBuffer)
        }
      } catch (error) {
        loggers.flywheel.error({ route, error: String(error) }, 'Failed to deserialize transaction')
        return null
      }

      // Use sendTransactionWithPrivySigning utility (sign-only + self-broadcast)
      const result = await sendTransactionWithPrivySigning(connection, transaction, walletAddress, {
        maxRetries: 1, // We handle retries ourselves with fresh transactions
        logContext: { service: 'flywheel', route, attempt: attempt + 1 },
      })

      if (result.success && result.signature) {
        loggers.flywheel.info({ route, signature: result.signature, attempt: attempt + 1 }, 'Swap executed successfully')
        return result.signature
      }

      // Check if error is retryable
      const errorMsg = result.error || 'Unknown error'
      if (errorMsg.includes('Blockhash') || errorMsg.includes('blockhash') || errorMsg.includes('block height')) {
        loggers.flywheel.warn({ route, attempt: attempt + 1, maxRetries, error: errorMsg }, 'Blockhash issue, retrying with fresh transaction')
        await new Promise(resolve => setTimeout(resolve, 300))
        continue
      }

      // Non-retryable error
      loggers.flywheel.error({ route, walletAddress, error: errorMsg, attempt: attempt + 1 }, 'Swap failed')
      return null
    }

    loggers.flywheel.error({ route, walletAddress, maxRetries }, 'Swap failed after all retries')
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
      await prisma.privyTransaction.create({
        data: {
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
}

export const multiUserMMService = new MultiUserMMService()
