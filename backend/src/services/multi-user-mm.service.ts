// ═══════════════════════════════════════════════════════════════════════════
// MULTI-USER MARKET MAKING SERVICE
// Orchestrates market making across all users with active flywheels
// ═══════════════════════════════════════════════════════════════════════════

import { Keypair, PublicKey, VersionedTransaction, Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { sendAndConfirmTransactionWithRetry, sendVersionedTransactionWithRetry, sendTransactionWithPrivySigning } from '../utils/transaction'
import bs58 from 'bs58'
import { supabase } from '../config/database'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { getConnection, getBalance, getTokenBalance, getOpsWallet } from '../config/solana'
import { env } from '../config/env'
import { bagsFmService } from './bags-fm'
import { jupiterService } from './jupiter.service'
import { PriceAnalyzer } from './price-analyzer'
import { loggers } from '../utils/logger'
import {
  UserToken,
  UserTokenConfig,
  UserFlywheelState,
  getTokensForFlywheel,
  getDecryptedOpsWallet,
  getDecryptedDevWallet,
  getTokenConfig,
  getFlywheelState,
  updateFlywheelState,
  updateGraduationStatus,
  // Privy-specific imports
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
const GRADUATION_CHECK_INTERVAL_MS = 5 * 60 * 1000 // Check graduation status every 5 minutes

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

  // Per-token price analyzer cache (for smart mode)
  private tokenAnalyzers: Map<string, PriceAnalyzer> = new Map()
  // Per-token trade cooldown tracking (token ID -> last trade timestamp)
  private lastTradeTime: Map<string, number> = new Map()
  // Cooldown period in milliseconds (5 minutes)
  private readonly SMART_MODE_COOLDOWN_MS = 5 * 60 * 1000

  /**
   * Get or create a PriceAnalyzer for a specific token
   */
  private getTokenPriceAnalyzer(tokenMint: string): PriceAnalyzer {
    if (!this.tokenAnalyzers.has(tokenMint)) {
      this.tokenAnalyzers.set(tokenMint, new PriceAnalyzer(tokenMint))
    }
    return this.tokenAnalyzers.get(tokenMint)!
  }

  /**
   * Check if trade cooldown is active for a token
   * Uses in-memory cache but falls back to DB if not cached
   */
  private async isCooldownActive(tokenId: string): Promise<boolean> {
    // Check in-memory cache first
    const lastTrade = this.lastTradeTime.get(tokenId)
    if (lastTrade) {
      return Date.now() - lastTrade < this.SMART_MODE_COOLDOWN_MS
    }

    // Fall back to DB if not cached (e.g., after restart)
    const dbLastTrade = await this.getLastTradeTimeFromDB(tokenId)
    if (dbLastTrade) {
      // Cache for future checks
      this.lastTradeTime.set(tokenId, dbLastTrade)
      return Date.now() - dbLastTrade < this.SMART_MODE_COOLDOWN_MS
    }

    return false
  }

  /**
   * Get last trade time from database
   */
  private async getLastTradeTimeFromDB(tokenId: string): Promise<number | null> {
    if (!supabase) return null

    try {
      const { data } = await supabase
        .from('user_flywheel_state')
        .select('last_trade_at')
        .eq('user_token_id', tokenId)
        .single()

      if (data?.last_trade_at) {
        return new Date(data.last_trade_at).getTime()
      }
    } catch (error) {
      loggers.flywheel.warn({ tokenId, error: String(error) }, 'Failed to fetch last trade time from DB')
    }

    return null
  }

  /**
   * Record a trade timestamp for cooldown tracking
   * Persists to both in-memory cache and database
   */
  private async recordTradeTimestamp(tokenId: string): Promise<void> {
    const now = Date.now()
    // Update in-memory cache
    this.lastTradeTime.set(tokenId, now)

    // Persist to database
    if (supabase) {
      try {
        await supabase
          .from('user_flywheel_state')
          .update({
            last_trade_at: new Date(now).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('user_token_id', tokenId)
      } catch (error) {
        loggers.flywheel.warn({ tokenId, error: String(error) }, 'Failed to persist trade timestamp to DB')
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FAILURE TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if flywheel is paused due to repeated failures
   */
  private async isFlywheelPaused(state: UserFlywheelState): Promise<boolean> {
    if (!state.paused_until) return false

    const pausedUntil = new Date(state.paused_until).getTime()
    const now = Date.now()

    if (now < pausedUntil) {
      return true
    }

    // Pause period has expired, reset it
    await this.clearPauseState(state.user_token_id)
    return false
  }

  /**
   * Record a trade failure and potentially pause the flywheel
   */
  private async recordFailure(tokenId: string, reason: string): Promise<void> {
    if (!supabase) return

    try {
      // Get current failure count
      const { data } = await supabase
        .from('user_flywheel_state')
        .select('consecutive_failures, total_failures')
        .eq('user_token_id', tokenId)
        .single()

      const consecutiveFailures = (data?.consecutive_failures || 0) + 1
      const totalFailures = (data?.total_failures || 0) + 1

      const updates: Record<string, unknown> = {
        consecutive_failures: consecutiveFailures,
        total_failures: totalFailures,
        last_failure_reason: reason,
        last_failure_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // Check if we should pause
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        const pauseUntil = new Date(Date.now() + PAUSE_DURATION_MINUTES * 60 * 1000)
        updates.paused_until = pauseUntil.toISOString()

        loggers.flywheel.warn({
          tokenId,
          consecutiveFailures,
          pauseUntil: pauseUntil.toISOString(),
          reason,
        }, 'Pausing flywheel due to repeated failures')
      }

      await supabase
        .from('user_flywheel_state')
        .update(updates)
        .eq('user_token_id', tokenId)

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
    if (!supabase) return

    try {
      await supabase
        .from('user_flywheel_state')
        .update({
          consecutive_failures: 0,
          last_failure_reason: null,
          paused_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_token_id', tokenId)
    } catch (error) {
      loggers.flywheel.warn({ tokenId, error: String(error) }, 'Failed to clear failures')
    }
  }

  /**
   * Clear pause state (called when pause period expires)
   */
  private async clearPauseState(tokenId: string): Promise<void> {
    if (!supabase) return

    try {
      await supabase
        .from('user_flywheel_state')
        .update({
          paused_until: null,
          consecutive_failures: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('user_token_id', tokenId)

      loggers.flywheel.info({ tokenId }, 'Flywheel pause period expired, resuming')
    } catch (error) {
      loggers.flywheel.warn({ tokenId, error: String(error) }, 'Failed to clear pause state')
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GRADUATION/BONDING STATUS DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check and update token graduation status
   * Graduated tokens have moved from bonding curve to DEX (Raydium, etc.)
   */
  private async checkAndUpdateGraduationStatus(token: UserToken): Promise<boolean> {
    // Check if we recently checked (avoid spamming APIs)
    if (token.created_at) {
      const lastCheck = await this.getLastGraduationCheck(token.id)
      if (lastCheck && Date.now() - lastCheck < GRADUATION_CHECK_INTERVAL_MS) {
        return token.is_graduated
      }
    }

    try {
      // Check if token has liquidity on Jupiter (indicates graduation)
      const hasJupiterLiquidity = await jupiterService.hasLiquidity(token.token_mint_address)

      // Also check DexScreener to confirm graduation
      const dexData = await this.checkDexScreenerGraduation(token.token_mint_address)

      const isGraduated = hasJupiterLiquidity || dexData.isGraduated

      // Update if status changed
      if (isGraduated !== token.is_graduated) {
        await updateGraduationStatus(token.id, isGraduated)
        loggers.flywheel.info({
          tokenSymbol: token.token_symbol,
          tokenMint: token.token_mint_address,
          isGraduated,
          hasJupiterLiquidity,
          dexGraduated: dexData.isGraduated,
        }, 'Token graduation status updated')
      }

      // Record check time
      await this.recordGraduationCheck(token.id)

      return isGraduated
    } catch (error) {
      loggers.flywheel.warn({
        tokenSymbol: token.token_symbol,
        error: String(error),
      }, 'Failed to check graduation status')
      return token.is_graduated
    }
  }

  /**
   * Check DexScreener for graduation status
   */
  private async checkDexScreenerGraduation(tokenMint: string): Promise<{ isGraduated: boolean; dexId?: string }> {
    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
        { signal: AbortSignal.timeout(5000) }
      )

      if (!response.ok) return { isGraduated: false }

      const data = await response.json() as { pairs?: Array<{ dexId: string; liquidity?: { usd: number } }> }

      if (!data.pairs || data.pairs.length === 0) return { isGraduated: false }

      // Get pair with highest liquidity
      const bestPair = data.pairs.reduce((best, pair) => {
        return (pair.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? pair : best
      }, data.pairs[0])

      // Bonding curve DEXes
      const bondingCurveDexes = ['pump', 'bags', 'moonshot', 'bonding']
      const dexId = (bestPair.dexId || '').toLowerCase()
      const isGraduated = !bondingCurveDexes.some(bc => dexId.includes(bc))

      return { isGraduated, dexId: bestPair.dexId }
    } catch {
      return { isGraduated: false }
    }
  }

  /**
   * Get last graduation check timestamp from database
   */
  private async getLastGraduationCheck(tokenId: string): Promise<number | null> {
    if (!supabase) return null

    try {
      const { data } = await supabase
        .from('user_tokens')
        .select('last_graduation_check')
        .eq('id', tokenId)
        .single()

      if (data?.last_graduation_check) {
        return new Date(data.last_graduation_check).getTime()
      }
    } catch {
      // Ignore - column may not exist yet
    }
    return null
  }

  /**
   * Record graduation check timestamp
   */
  private async recordGraduationCheck(tokenId: string): Promise<void> {
    if (!supabase) return

    try {
      await supabase
        .from('user_tokens')
        .update({ last_graduation_check: new Date().toISOString() })
        .eq('id', tokenId)
    } catch {
      // Ignore - column may not exist yet
    }
  }

  /**
   * Determine which trading route to use
   */
  private getTradingRoute(token: UserToken, config: UserTokenConfig): 'bags' | 'jupiter' {
    if (config.trading_route === 'bags') return 'bags'
    if (config.trading_route === 'jupiter') return 'jupiter'

    // Auto mode - use graduation status
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

  /**
   * Run flywheel cycle for all users with active flywheels
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

    loggers.flywheel.info('Starting multi-user flywheel cycle')

    try {
      // Reset rate limit counter if new minute
      const currentMinute = Math.floor(Date.now() / 60000)
      if (currentMinute !== this.lastTradeMinute) {
        this.tradesThisMinute = 0
        this.lastTradeMinute = currentMinute
      }

      // Get all active flywheel tokens
      const tokens = await getTokensForFlywheel()
      loggers.flywheel.info({ tokenCount: tokens.length }, 'Found tokens with active flywheels')

      for (const tokenWithConfig of tokens) {
        // Check rate limit
        if (this.tradesThisMinute >= maxTradesPerMinute) {
          loggers.flywheel.warn({ maxTradesPerMinute }, 'Rate limit reached, pausing until next cycle')
          break
        }

        try {
          const result = await this.processToken(tokenWithConfig, tokenWithConfig.config)
          if (result) {
            results.push(result)
            if (result.success) {
              this.tradesThisMinute++
            }
          }

          // Small delay between tokens
          await this.sleep(500)
        } catch (error: any) {
          loggers.flywheel.error({ tokenSymbol: tokenWithConfig.token_symbol, tokenMint: tokenWithConfig.token_mint_address, error: String(error) }, 'Unexpected error processing token')
          results.push({
            userTokenId: tokenWithConfig.id,
            tokenMint: tokenWithConfig.token_mint_address,
            tokenSymbol: tokenWithConfig.token_symbol,
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
   * Transfer excess SOL from dev wallet to ops wallet
   * NOTE: This is just a balance sweep - NO platform fee is taken here.
   * Platform fees are only taken from actual Bags.fm fee claims in fast-claim.service.ts
   */
  private async collectFees(
    token: UserToken,
    connection: Connection
  ): Promise<{ collected: boolean; amount: number; platformFeeSol: number; userAmountSol: number; signature?: string }> {
    try {
      // Get dev wallet (source of funds)
      const devWallet = await getDecryptedDevWallet(token.id)
      if (!devWallet) {
        loggers.flywheel.warn({ tokenSymbol: token.token_symbol, tokenId: token.id }, 'Could not decrypt dev wallet for balance sweep')
        return { collected: false, amount: 0, platformFeeSol: 0, userAmountSol: 0 }
      }

      // Get dev wallet SOL balance
      const devBalance = await getBalance(devWallet.publicKey)
      loggers.flywheel.debug({ tokenSymbol: token.token_symbol, devBalance, devWallet: devWallet.publicKey.toString() }, 'Dev wallet balance')

      // Calculate transfer amount (keep minimum reserve)
      const transferAmount = devBalance - DEV_WALLET_MIN_RESERVE_SOL

      if (transferAmount < MIN_FEE_THRESHOLD_SOL) {
        loggers.flywheel.debug({ tokenSymbol: token.token_symbol, devBalance, minRequired: MIN_FEE_THRESHOLD_SOL + DEV_WALLET_MIN_RESERVE_SOL }, 'Dev wallet balance too low for sweep')
        return { collected: false, amount: 0, platformFeeSol: 0, userAmountSol: 0 }
      }

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, transferAmount }, 'Sweeping dev wallet balance to ops (no platform fee)')

      // Transfer 100% to user's ops wallet (no platform fee - that's handled in fast-claim)
      const userOpsWalletAddress = new PublicKey(token.ops_wallet_address)
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: devWallet.publicKey,
          toPubkey: userOpsWalletAddress,
          lamports: Math.floor(transferAmount * LAMPORTS_PER_SOL),
        })
      )
      const result = await sendAndConfirmTransactionWithRetry(
        connection,
        tx,
        [devWallet],
        { commitment: 'confirmed', logContext: { service: 'flywheel', type: 'balance-sweep', tokenSymbol: token.token_symbol } }
      )

      if (result.success) {
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, transferAmount, signature: result.signature }, 'Balance sweep successful')
        await this.recordTransaction(token.id, 'transfer', transferAmount, result.signature!)
        return { collected: true, amount: transferAmount, platformFeeSol: 0, userAmountSol: transferAmount, signature: result.signature }
      } else {
        loggers.flywheel.error({ tokenSymbol: token.token_symbol, error: result.error }, 'Balance sweep failed')
        return { collected: false, amount: 0, platformFeeSol: 0, userAmountSol: 0 }
      }
    } catch (error: any) {
      loggers.flywheel.error({ tokenSymbol: token.token_symbol, error: String(error) }, 'Balance sweep failed')
      return { collected: false, amount: 0, platformFeeSol: 0, userAmountSol: 0 }
    }
  }

  /**
   * Process a single token's flywheel
   */
  private async processToken(
    token: UserToken,
    config: UserTokenConfig
  ): Promise<TradeResult | null> {
    const baseResult = {
      userTokenId: token.id,
      tokenMint: token.token_mint_address,
      tokenSymbol: token.token_symbol,
    }

    const connection = getConnection()

    // Get current flywheel state first
    let state = await getFlywheelState(token.id)
    if (!state) {
      // Initialize state if not exists
      await supabase?.from('user_flywheel_state').insert([{
        user_token_id: token.id,
        cycle_phase: 'buy',
        buy_count: 0,
        sell_count: 0,
        consecutive_failures: 0,
        total_failures: 0,
      }])
      state = await getFlywheelState(token.id)
    }

    if (!state) {
      return { ...baseResult, tradeType: 'buy', success: false, amount: 0, error: 'Failed to get flywheel state' }
    }

    // Check if flywheel is paused due to repeated failures
    if (await this.isFlywheelPaused(state)) {
      const pausedUntil = state.paused_until ? new Date(state.paused_until).toLocaleTimeString() : 'unknown'
      loggers.flywheel.info({
        tokenSymbol: token.token_symbol,
        pausedUntil,
        consecutiveFailures: state.consecutive_failures,
        lastFailureReason: state.last_failure_reason,
      }, 'Flywheel paused due to repeated failures, skipping')
      return null
    }

    // Check and update graduation status (for auto route detection)
    if (config.trading_route === 'auto') {
      const isGraduated = await this.checkAndUpdateGraduationStatus(token)
      // Update local token object with new status
      token.is_graduated = isGraduated
    }

    // Determine trading route
    const tradingRoute = this.getTradingRoute(token, config)
    loggers.flywheel.debug({
      tokenSymbol: token.token_symbol,
      tradingRoute,
      isGraduated: token.is_graduated,
      configRoute: config.trading_route,
    }, 'Using trading route')

    // Collect fees from dev wallet to ops wallet
    // This ensures ops wallet has SOL for trading
    await this.collectFees(token, connection)

    // Get ops wallet for trading (this wallet has the private key for signing trades)
    const opsWallet = await getDecryptedOpsWallet(token.id)
    if (!opsWallet) {
      return { ...baseResult, tradeType: 'buy', success: false, amount: 0, error: 'Failed to decrypt ops wallet' }
    }

    // Determine trade based on algorithm mode
    if (config.algorithm_mode === 'simple') {
      return this.runSimpleAlgorithm(token, config, state, opsWallet, connection, baseResult, tradingRoute)
    } else if (config.algorithm_mode === 'rebalance') {
      return this.runRebalanceAlgorithm(token, config, state, opsWallet, connection, baseResult, tradingRoute)
    } else {
      // Smart mode - signal-based trading with RSI, Bollinger Bands, and trend analysis
      return this.runSmartAlgorithm(token, config, state, opsWallet, connection, baseResult, tradingRoute)
    }
  }

  /**
   * Simple algorithm: 5 buys then 5 sells
   */
  private async runSimpleAlgorithm(
    token: UserToken,
    config: UserTokenConfig,
    state: UserFlywheelState,
    wallet: Keypair,
    connection: Connection,
    baseResult: { userTokenId: string; tokenMint: string; tokenSymbol: string },
    tradingRoute: 'bags' | 'jupiter' = 'bags'
  ): Promise<TradeResult | null> {
    const tokenMint = new PublicKey(token.token_mint_address)

    if (state.cycle_phase === 'buy') {
      // Check SOL balance
      const solBalance = await getBalance(wallet.publicKey)
      const minRequired = config.min_buy_amount_sol + 0.01 // reserve for fees

      if (solBalance < minRequired) {
        const message = `Insufficient SOL for buy (have ${solBalance.toFixed(4)}, need ${minRequired.toFixed(4)})`
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, solBalance, minRequired }, 'Insufficient SOL for buy')
        await this.updateFlywheelCheck(token.id, 'insufficient_sol')
        await this.logInfoMessage(token.id, message)
        return null
      }

      // Random amount within bounds
      const buyAmount = this.randomBetween(config.min_buy_amount_sol, config.max_buy_amount_sol)
      const lamports = Math.floor(buyAmount * 1e9)

      loggers.flywheel.info({
        tokenSymbol: token.token_symbol,
        buyAmount,
        buyCount: state.buy_count,
        maxBuys: BUYS_PER_CYCLE,
        route: tradingRoute,
      }, 'Executing BUY')

      // Get quote from appropriate exchange
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
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
      }

      const signature = await this.executeSwapWithRoute(connection, wallet, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        const errorMsg = `${tradingRoute} swap failed`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
      }

      // Clear failures on success
      await this.clearFailures(token.id)

      // Update state
      const newBuyCount = state.buy_count + 1
      const shouldSwitchToSell = newBuyCount >= BUYS_PER_CYCLE

      // If switching to sell, snapshot the token balance
      let tokenSnapshot = state.sell_phase_token_snapshot
      let sellPerTx = state.sell_amount_per_tx

      if (shouldSwitchToSell) {
        const tokenBalance = await getTokenBalance(wallet.publicKey, tokenMint)
        tokenSnapshot = tokenBalance
        sellPerTx = tokenBalance / SELLS_PER_CYCLE
      }

      await updateFlywheelState(token.id, {
        cycle_phase: shouldSwitchToSell ? 'sell' : 'buy',
        buy_count: shouldSwitchToSell ? 0 : newBuyCount,
        sell_count: 0,
        sell_phase_token_snapshot: tokenSnapshot,
        sell_amount_per_tx: sellPerTx,
        last_trade_at: new Date().toISOString(),
      })

      // Record transaction and update check status
      await this.recordTransaction(token.id, 'buy', buyAmount, signature)
      await this.updateFlywheelCheck(token.id, 'traded')

      return { ...baseResult, tradeType: 'buy', success: true, amount: buyAmount, signature }

    } else {
      // SELL phase
      const sellAmount = state.sell_amount_per_tx

      if (sellAmount <= 0) {
        const message = 'No tokens to sell, switching to buy phase'
        loggers.flywheel.info({ tokenSymbol: token.token_symbol }, 'No tokens to sell, switching to buy phase')
        await this.updateFlywheelCheck(token.id, 'no_tokens')
        await this.logInfoMessage(token.id, message)
        // Reset to buy phase
        await updateFlywheelState(token.id, { cycle_phase: 'buy', sell_count: 0 })
        return null
      }

      // Check token balance
      const tokenBalance = await getTokenBalance(wallet.publicKey, tokenMint)
      const actualSellAmount = Math.min(sellAmount, tokenBalance)

      if (actualSellAmount < 1) {
        const message = 'Insufficient tokens for sell, switching to buy phase'
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, tokenBalance }, 'Insufficient tokens for sell, switching to buy phase')
        await this.updateFlywheelCheck(token.id, 'insufficient_tokens')
        await this.logInfoMessage(token.id, message)
        await updateFlywheelState(token.id, { cycle_phase: 'buy', sell_count: 0 })
        return null
      }

      const tokenUnits = Math.floor(actualSellAmount * Math.pow(10, token.token_decimals))

      loggers.flywheel.info({
        tokenSymbol: token.token_symbol,
        sellAmount: actualSellAmount,
        sellCount: state.sell_count,
        maxSells: SELLS_PER_CYCLE,
        route: tradingRoute,
      }, 'Executing SELL')

      // Get quote from appropriate exchange
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
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'sell', success: false, amount: actualSellAmount, error: errorMsg }
      }

      const signature = await this.executeSwapWithRoute(connection, wallet, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        const errorMsg = `${tradingRoute} swap failed`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'sell', success: false, amount: actualSellAmount, error: errorMsg }
      }

      // Clear failures on success
      await this.clearFailures(token.id)

      // Update state
      const newSellCount = state.sell_count + 1
      const shouldSwitchToBuy = newSellCount >= SELLS_PER_CYCLE

      await updateFlywheelState(token.id, {
        cycle_phase: shouldSwitchToBuy ? 'buy' : 'sell',
        buy_count: 0,
        sell_count: shouldSwitchToBuy ? 0 : newSellCount,
        last_trade_at: new Date().toISOString(),
      })

      // Record transaction and update check status
      await this.recordTransaction(token.id, 'sell', actualSellAmount, signature)
      await this.updateFlywheelCheck(token.id, 'traded')

      return { ...baseResult, tradeType: 'sell', success: true, amount: actualSellAmount, signature }
    }
  }

  /**
   * Execute swap with the appropriate route
   */
  private async executeSwapWithRoute(
    connection: Connection,
    wallet: Keypair,
    quoteResponse: unknown,
    route: 'bags' | 'jupiter'
  ): Promise<string | null> {
    const swapData = await this.generateSwapTx(route, wallet.publicKey.toString(), quoteResponse)

    if (!swapData) {
      loggers.flywheel.error({ route }, 'Failed to get swap transaction')
      return null
    }

    // Deserialize the transaction - Jupiter uses base64, Bags uses base58
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

    // Use unified transaction utility for better retry handling
    const result = await sendVersionedTransactionWithRetry(
      connection,
      transaction,
      [wallet],
      {
        skipPreflight: true,
        maxRetries: 3,
        logContext: { service: 'flywheel', type: 'swap', route },
      }
    )

    if (!result.success) {
      loggers.flywheel.error({ route, error: result.error }, 'Swap transaction failed')
      return null
    }

    return result.signature || null
  }

  /**
   * Rebalance algorithm: maintain target SOL/token allocation
   */
  private async runRebalanceAlgorithm(
    token: UserToken,
    config: UserTokenConfig,
    state: UserFlywheelState,
    wallet: Keypair,
    connection: Connection,
    baseResult: { userTokenId: string; tokenMint: string; tokenSymbol: string },
    tradingRoute: 'bags' | 'jupiter' = 'bags'
  ): Promise<TradeResult | null> {
    const tokenMint = new PublicKey(token.token_mint_address)

    // Get current balances
    const solBalance = await getBalance(wallet.publicKey)
    const tokenBalance = await getTokenBalance(wallet.publicKey, tokenMint)

    // Get token price (approximate from a small quote)
    const priceQuote = await this.getTradeQuote(
      tradingRoute,
      SOL_MINT,
      token.token_mint_address,
      1e9, // 1 SOL
      'buy',
      100
    )

    if (!priceQuote) {
      const errorMsg = `Failed to get price quote via ${tradingRoute}`
      await this.recordFailure(token.id, errorMsg)
      return { ...baseResult, tradeType: 'buy', success: false, amount: 0, error: errorMsg }
    }

    const tokensPerSol = priceQuote.outputAmount / Math.pow(10, token.token_decimals)
    const tokenValueInSol = tokenBalance / tokensPerSol
    const totalValueSol = solBalance + tokenValueInSol

    // Calculate current allocation percentages
    const currentSolPct = (solBalance / totalValueSol) * 100
    const currentTokenPct = (tokenValueInSol / totalValueSol) * 100

    const targetSolPct = config.target_sol_allocation
    const targetTokenPct = config.target_token_allocation
    const threshold = config.rebalance_threshold

    loggers.flywheel.debug({ tokenSymbol: token.token_symbol, currentSolPct, targetSolPct, currentTokenPct, targetTokenPct }, 'Portfolio allocation')

    // Check if rebalance needed
    if (Math.abs(currentSolPct - targetSolPct) < threshold) {
      const message = `Portfolio balanced (SOL: ${currentSolPct.toFixed(1)}%, target: ${targetSolPct}%)`
      loggers.flywheel.info({ tokenSymbol: token.token_symbol, currentSolPct, targetSolPct }, 'Portfolio balanced')
      await this.updateFlywheelCheck(token.id, 'balanced')
      await this.logInfoMessage(token.id, message)
      return null
    }

    if (currentSolPct > targetSolPct + threshold) {
      // Too much SOL, buy tokens
      const excessSol = solBalance - (totalValueSol * targetSolPct / 100)
      const buyAmount = Math.min(excessSol * 0.5, config.max_buy_amount_sol) // Buy half the excess

      if (buyAmount < config.min_buy_amount_sol) {
        return null
      }

      const lamports = Math.floor(buyAmount * 1e9)

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, buyAmount, action: 'rebalance', route: tradingRoute }, 'Executing rebalance BUY')

      const quote = await this.getTradeQuote(
        tradingRoute,
        SOL_MINT,
        token.token_mint_address,
        lamports,
        'buy',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        const errorMsg = `Failed to get buy quote via ${tradingRoute}`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
      }

      const signature = await this.executeSwapWithRoute(connection, wallet, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        const errorMsg = `Rebalance buy swap failed via ${tradingRoute}`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
      }

      await this.clearFailures(token.id)
      await this.recordTransaction(token.id, 'buy', buyAmount, signature)
      await this.updateFlywheelCheck(token.id, 'traded')
      return { ...baseResult, tradeType: 'buy', success: true, amount: buyAmount, signature }

    } else if (currentTokenPct > targetTokenPct + threshold) {
      // Too many tokens, sell some
      const excessTokenValue = tokenValueInSol - (totalValueSol * targetTokenPct / 100)
      const sellTokens = Math.min(excessTokenValue * tokensPerSol * 0.5, tokenBalance * 0.2) // Sell half excess, max 20%

      if (sellTokens < 1) {
        return null
      }

      const tokenUnits = Math.floor(sellTokens * Math.pow(10, token.token_decimals))

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, sellAmount: sellTokens, action: 'rebalance', route: tradingRoute }, 'Executing rebalance SELL')

      const quote = await this.getTradeQuote(
        tradingRoute,
        token.token_mint_address,
        SOL_MINT,
        tokenUnits,
        'sell',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        const errorMsg = `Failed to get sell quote via ${tradingRoute}`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellTokens, error: errorMsg }
      }

      const signature = await this.executeSwapWithRoute(connection, wallet, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        const errorMsg = `Rebalance sell swap failed via ${tradingRoute}`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellTokens, error: errorMsg }
      }

      await this.clearFailures(token.id)
      await this.recordTransaction(token.id, 'sell', sellTokens, signature)
      await this.updateFlywheelCheck(token.id, 'traded')
      return { ...baseResult, tradeType: 'sell', success: true, amount: sellTokens, signature }
    }

    return null
  }

  /**
   * Smart algorithm: Signal-based trading using RSI, Bollinger Bands, and trend analysis
   */
  private async runSmartAlgorithm(
    token: UserToken,
    config: UserTokenConfig,
    state: UserFlywheelState,
    wallet: Keypair,
    connection: Connection,
    baseResult: { userTokenId: string; tokenMint: string; tokenSymbol: string },
    tradingRoute: 'bags' | 'jupiter' = 'bags'
  ): Promise<TradeResult | null> {
    const tokenMint = new PublicKey(token.token_mint_address)

    // Check trade cooldown
    if (await this.isCooldownActive(token.id)) {
      const remainingMs = this.SMART_MODE_COOLDOWN_MS - (Date.now() - (this.lastTradeTime.get(token.id) || 0))
      const remainingMin = Math.ceil(remainingMs / 60000)
      loggers.flywheel.debug({ tokenSymbol: token.token_symbol, remainingMin }, 'Smart mode cooldown active')
      return null
    }

    // Get the price analyzer for this token
    const analyzer = this.getTokenPriceAnalyzer(token.token_mint_address)

    // Fetch current price data
    const priceData = await analyzer.fetchCurrentPrice()
    if (!priceData) {
      loggers.flywheel.warn({ tokenSymbol: token.token_symbol }, 'No price data available, falling back to simple mode')
      return this.runSimpleAlgorithm(token, config, state, wallet, connection, baseResult, tradingRoute)
    }

    // Get trading signals
    const signals = analyzer.getTradingSignals()
    const optimalSignal = analyzer.getOptimalSignal()

    // Log smart mode analytics
    loggers.flywheel.info({
      tokenSymbol: token.token_symbol,
      price: priceData.price,
      priceChange24h: priceData.priceChange24h,
      trend: signals.trend?.trend,
      trendStrength: signals.trend?.strength,
      rsi: signals.trend?.rsi,
      volatility: signals.volatility?.volatility,
      isHighVolatility: signals.volatility?.isHighVolatility,
      signal: optimalSignal.action,
      confidence: optimalSignal.confidence,
      reasons: optimalSignal.reasons,
    }, 'Smart mode analysis')

    // Determine if we should trade
    const shouldBuy = optimalSignal.action === 'buy' || optimalSignal.action === 'strong_buy'
    const shouldSell = optimalSignal.action === 'sell' || optimalSignal.action === 'strong_sell'
    const minConfidence = optimalSignal.action.includes('strong') ? 40 : 50

    // Skip if high volatility and not a strong signal
    if (signals.volatility?.isHighVolatility && !optimalSignal.action.includes('strong')) {
      loggers.flywheel.info({ tokenSymbol: token.token_symbol, volatility: signals.volatility.volatility }, 'High volatility - waiting for stronger signal')
      await this.updateFlywheelCheck(token.id, 'high_volatility')
      return null
    }

    // Execute BUY
    if (shouldBuy && optimalSignal.confidence >= minConfidence) {
      const solBalance = await getBalance(wallet.publicKey)
      const minRequired = config.min_buy_amount_sol + 0.01

      if (solBalance < minRequired) {
        const message = `Insufficient SOL for smart buy (have ${solBalance.toFixed(4)}, need ${minRequired.toFixed(4)})`
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, solBalance, minRequired }, 'Insufficient SOL for smart buy')
        await this.updateFlywheelCheck(token.id, 'insufficient_sol')
        await this.logInfoMessage(token.id, message)
        return null
      }

      // Calculate position size based on confidence and volatility
      const positionSizePct = signals.suggestedPositionSizePct
      const baseAmount = solBalance * (positionSizePct / 100)
      const buyAmount = Math.min(Math.max(baseAmount, config.min_buy_amount_sol), config.max_buy_amount_sol)
      const lamports = Math.floor(buyAmount * 1e9)

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, buyAmount, action: optimalSignal.action, confidence: optimalSignal.confidence, route: tradingRoute }, 'Executing SMART BUY')

      const quote = await this.getTradeQuote(
        tradingRoute,
        SOL_MINT,
        token.token_mint_address,
        lamports,
        'buy',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        const errorMsg = `Failed to get smart buy quote via ${tradingRoute}`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
      }

      const signature = await this.executeSwapWithRoute(connection, wallet, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        const errorMsg = `Smart buy swap failed via ${tradingRoute}`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
      }

      // Record trade and cooldown
      await this.clearFailures(token.id)
      await this.recordTradeTimestamp(token.id)
      await this.recordTransaction(token.id, 'buy', buyAmount, signature)
      await this.updateFlywheelCheck(token.id, 'smart_buy')

      return { ...baseResult, tradeType: 'buy', success: true, amount: buyAmount, signature }
    }

    // Execute SELL
    if (shouldSell && optimalSignal.confidence >= minConfidence) {
      const tokenBalance = await getTokenBalance(wallet.publicKey, tokenMint)

      if (tokenBalance < 1) {
        const message = 'Insufficient tokens for smart sell'
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, tokenBalance }, 'Insufficient tokens for smart sell')
        await this.updateFlywheelCheck(token.id, 'insufficient_tokens')
        await this.logInfoMessage(token.id, message)
        return null
      }

      // Calculate sell amount based on confidence and volatility
      const positionSizePct = signals.suggestedPositionSizePct
      const sellAmount = Math.min(tokenBalance * (positionSizePct / 100), tokenBalance * 0.4) // Max 40% per trade
      const tokenUnits = Math.floor(sellAmount * Math.pow(10, token.token_decimals))

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, sellAmount, action: optimalSignal.action, confidence: optimalSignal.confidence, route: tradingRoute }, 'Executing SMART SELL')

      const quote = await this.getTradeQuote(
        tradingRoute,
        token.token_mint_address,
        SOL_MINT,
        tokenUnits,
        'sell',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        const errorMsg = `Failed to get smart sell quote via ${tradingRoute}`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellAmount, error: errorMsg }
      }

      const signature = await this.executeSwapWithRoute(connection, wallet, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        const errorMsg = `Smart sell swap failed via ${tradingRoute}`
        await this.recordFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellAmount, error: errorMsg }
      }

      // Record trade and cooldown
      await this.clearFailures(token.id)
      await this.recordTradeTimestamp(token.id)
      await this.recordTransaction(token.id, 'sell', sellAmount, signature)
      await this.updateFlywheelCheck(token.id, 'smart_sell')

      return { ...baseResult, tradeType: 'sell', success: true, amount: sellAmount, signature }
    }

    // Hold position
    loggers.flywheel.debug({ tokenSymbol: token.token_symbol, action: optimalSignal.action, confidence: optimalSignal.confidence }, 'Holding position')
    await this.updateFlywheelCheck(token.id, 'holding')
    return null
  }

  /**
   * Execute a swap using Bags.fm
   */
  private async executeSwap(
    connection: Connection,
    wallet: Keypair,
    quoteResponse: any
  ): Promise<string | null> {
    try {
      const swapData = await bagsFmService.generateSwapTransaction(
        wallet.publicKey.toString(),
        quoteResponse
      )

      if (!swapData) {
        loggers.flywheel.error('Failed to get swap transaction')
        return null
      }

      // Deserialize the transaction
      const txBuffer = bs58.decode(swapData.transaction)
      const transaction = VersionedTransaction.deserialize(txBuffer)

      // Use unified transaction utility for better retry handling
      const result = await sendVersionedTransactionWithRetry(
        connection,
        transaction,
        [wallet],
        {
          skipPreflight: true,
          maxRetries: 3,
          logContext: { service: 'flywheel', type: 'swap' },
        }
      )

      if (!result.success) {
        loggers.flywheel.error({ error: result.error }, 'Swap transaction failed')
        return null
      }

      return result.signature || null
    } catch (error: any) {
      loggers.flywheel.error({ error: String(error) }, 'Swap failed')
      return null
    }
  }

  /**
   * Record a transaction in the database
   */
  private async recordTransaction(
    userTokenId: string,
    type: 'buy' | 'sell' | 'transfer',
    amount: number,
    signature: string
  ): Promise<void> {
    if (!supabase) {
      loggers.flywheel.error('Cannot record transaction: supabase not configured')
      return
    }

    loggers.flywheel.debug({ type, userTokenId, amount, signature }, 'Recording transaction')

    try {
      const insertData = {
        user_token_id: userTokenId,
        type,
        amount,
        signature,
        status: 'confirmed',
        created_at: new Date().toISOString(),
      }
      loggers.flywheel.debug({ insertData }, 'Insert data')

      const { data, error } = await supabase.from('user_transactions').insert([insertData]).select()

      if (error) {
        loggers.flywheel.error({ type, error: error.message, errorDetails: error }, 'Failed to record transaction')
      } else {
        loggers.flywheel.info({ type, signature, recordId: data?.[0]?.id }, 'Recorded transaction')
      }
    } catch (error: any) {
      loggers.flywheel.error({ error: String(error) }, 'Failed to record transaction')
    }
  }

  /**
   * Log an info message for the user to see in their activity terminal
   */
  private async logInfoMessage(
    userTokenId: string,
    message: string
  ): Promise<void> {
    if (!supabase) {
      loggers.flywheel.warn('Cannot log info message: supabase not configured')
      return
    }

    try {
      const { error } = await supabase.from('user_transactions').insert([{
        user_token_id: userTokenId,
        type: 'info',
        amount: 0,
        message,
        status: 'confirmed',
        created_at: new Date().toISOString(),
      }])

      if (error) {
        loggers.flywheel.warn({ error: error.message }, 'Failed to log info message - run SQL migration to add info type to user_transactions')
      }
    } catch (error: any) {
      loggers.flywheel.warn({ error: String(error) }, 'Failed to log info message')
    }
  }

  /**
   * Update flywheel check timestamp and result
   */
  private async updateFlywheelCheck(
    userTokenId: string,
    checkResult: string
  ): Promise<void> {
    if (!supabase) return

    try {
      await supabase.from('user_flywheel_state').update({
        last_checked_at: new Date().toISOString(),
        last_check_result: checkResult,
        updated_at: new Date().toISOString(),
      }).eq('user_token_id', userTokenId)
    } catch (error: any) {
      // Silently fail
    }
  }

  private randomBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min
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
  // PRIVY TOKEN HANDLING
  // For tokens registered via Privy (TMA/embedded wallets)
  // Uses delegated signing instead of encrypted keypairs
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run flywheel cycle for all Privy user tokens
   */
  async runPrivyFlywheelCycle(maxTradesPerMinute: number = 30): Promise<FlywheelCycleResult> {
    if (this.isRunning) {
      loggers.flywheel.warn('Flywheel cycle already in progress, skipping Privy tokens')
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

    loggers.flywheel.info('Starting Privy flywheel cycle')

    try {
      // Reset rate limit counter if new minute
      const currentMinute = Math.floor(Date.now() / 60000)
      if (currentMinute !== this.lastTradeMinute) {
        this.tradesThisMinute = 0
        this.lastTradeMinute = currentMinute
      }

      // Get all active Privy flywheel tokens
      const privyTokens = await getPrivyTokensForFlywheel()
      loggers.flywheel.info({ tokenCount: privyTokens.length }, 'Found Privy tokens with active flywheels')

      for (const privyToken of privyTokens) {
        // Check rate limit
        if (this.tradesThisMinute >= maxTradesPerMinute) {
          loggers.flywheel.warn({ maxTradesPerMinute }, 'Rate limit reached, pausing until next cycle')
          break
        }

        try {
          const result = await this.processPrivyToken(privyToken)
          if (result) {
            results.push(result)
            if (result.success) {
              this.tradesThisMinute++
            }
          }

          // Small delay between tokens
          await this.sleep(500)
        } catch (error: any) {
          loggers.flywheel.error({
            tokenSymbol: privyToken.token_symbol,
            tokenMint: privyToken.token_mint_address,
            error: String(error),
          }, 'Unexpected error processing Privy token')
          results.push({
            userTokenId: privyToken.id,
            tokenMint: privyToken.token_mint_address,
            tokenSymbol: privyToken.token_symbol,
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

    loggers.flywheel.info({ tradesExecuted, totalTrades: results.length }, 'Privy flywheel cycle completed')

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
   * Process a single Privy token's flywheel
   */
  private async processPrivyToken(token: PrivyTokenWithConfig): Promise<TradeResult | null> {
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
    if (await this.isPrivyFlywheelPaused(state, token.id)) {
      const pausedUntil = state.paused_until ? new Date(state.paused_until).toLocaleTimeString() : 'unknown'
      loggers.flywheel.info({
        tokenSymbol: token.token_symbol,
        pausedUntil,
        consecutiveFailures: state.consecutive_failures,
        lastFailureReason: state.last_failure_reason,
      }, 'Privy flywheel paused due to repeated failures, skipping')
      return null
    }

    // Determine trading route (auto-detect based on graduation)
    const tradingRoute = this.getPrivyTradingRoute(token, config)
    loggers.flywheel.debug({
      tokenSymbol: token.token_symbol,
      tradingRoute,
      isGraduated: token.is_graduated,
      configRoute: config.trading_route,
    }, 'Privy token using trading route')

    // Collect fees from dev wallet to ops wallet
    await this.collectPrivyFees(token, connection)

    // Get ops wallet address for trading
    const opsWalletAddress = token.ops_wallet?.wallet_address
    if (!opsWalletAddress) {
      return { ...baseResult, tradeType: 'buy', success: false, amount: 0, error: 'Ops wallet not found' }
    }

    // Use simple algorithm for now (can expand to smart/rebalance later)
    return this.runPrivySimpleAlgorithm(token, config, state, opsWalletAddress, connection, baseResult, tradingRoute)
  }

  /**
   * Check if Privy flywheel is paused due to repeated failures
   */
  private async isPrivyFlywheelPaused(state: UserFlywheelState, tokenId: string): Promise<boolean> {
    if (!state.paused_until) return false

    const pausedUntil = new Date(state.paused_until).getTime()
    const now = Date.now()

    if (now < pausedUntil) {
      return true
    }

    // Pause period has expired, reset it
    await this.clearPrivyPauseState(tokenId)
    return false
  }

  /**
   * Clear Privy pause state
   */
  private async clearPrivyPauseState(tokenId: string): Promise<void> {
    if (!isPrismaConfigured()) return

    try {
      await prisma.privyFlywheelState.update({
        where: { privyTokenId: tokenId },
        data: {
          pausedUntil: null,
          consecutiveFailures: 0,
        },
      })

      loggers.flywheel.info({ tokenId }, 'Privy flywheel pause period expired, resuming')
    } catch (error) {
      loggers.flywheel.warn({ tokenId, error: String(error) }, 'Failed to clear Privy pause state')
    }
  }

  /**
   * Determine trading route for Privy token
   */
  private getPrivyTradingRoute(token: PrivyTokenWithConfig, config: UserTokenConfig): 'bags' | 'jupiter' {
    if (config.trading_route === 'bags') return 'bags'
    if (config.trading_route === 'jupiter') return 'jupiter'
    return token.is_graduated ? 'jupiter' : 'bags'
  }

  /**
   * Transfer excess SOL from Privy dev wallet to ops wallet using Privy signing
   * NOTE: This is just a balance sweep - NO platform fee is taken here.
   * Platform fees are only taken from actual Bags.fm fee claims in fast-claim.service.ts
   */
  private async collectPrivyFees(
    token: PrivyTokenWithConfig,
    connection: Connection
  ): Promise<{ collected: boolean; amount: number; signature?: string }> {
    try {
      const devWalletAddress = token.dev_wallet?.wallet_address
      const opsWalletAddress = token.ops_wallet?.wallet_address

      if (!devWalletAddress || !opsWalletAddress) {
        loggers.flywheel.warn({ tokenSymbol: token.token_symbol }, 'Missing wallet addresses for Privy balance sweep')
        return { collected: false, amount: 0 }
      }

      // Get dev wallet SOL balance
      const devPubkey = new PublicKey(devWalletAddress)
      const devBalance = await getBalance(devPubkey)
      loggers.flywheel.debug({ tokenSymbol: token.token_symbol, devBalance, devWallet: devWalletAddress }, 'Privy dev wallet balance')

      // Calculate transfer amount (keep minimum reserve)
      const transferAmount = devBalance - DEV_WALLET_MIN_RESERVE_SOL

      if (transferAmount < MIN_FEE_THRESHOLD_SOL) {
        loggers.flywheel.debug({ tokenSymbol: token.token_symbol, devBalance }, 'Privy dev wallet balance too low for sweep')
        return { collected: false, amount: 0 }
      }

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, transferAmount }, 'Sweeping Privy dev wallet balance to ops (no platform fee)')

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
        { commitment: 'confirmed', logContext: { service: 'flywheel', type: 'privy-balance-sweep', tokenSymbol: token.token_symbol } }
      )

      if (result.success) {
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, transferAmount, signature: result.signature }, 'Privy balance sweep successful')
        await this.recordPrivyTransaction(token.id, 'transfer', transferAmount, result.signature!)
        return { collected: true, amount: transferAmount, signature: result.signature }
      } else {
        loggers.flywheel.error({ tokenSymbol: token.token_symbol, error: result.error }, 'Privy balance sweep failed')
        return { collected: false, amount: 0 }
      }
    } catch (error: any) {
      loggers.flywheel.error({ tokenSymbol: token.token_symbol, error: String(error) }, 'Privy balance sweep failed')
      return { collected: false, amount: 0 }
    }
  }

  /**
   * Simple algorithm for Privy tokens: 5 buys then 5 sells
   */
  private async runPrivySimpleAlgorithm(
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

    if (state.cycle_phase === 'buy') {
      // Check SOL balance
      const solBalance = await getBalance(opsWalletPubkey)
      const minRequired = config.min_buy_amount_sol + 0.01

      if (solBalance < minRequired) {
        const message = `Insufficient SOL for buy (have ${solBalance.toFixed(4)}, need ${minRequired.toFixed(4)})`
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, solBalance, minRequired }, 'Insufficient SOL for Privy buy')
        await this.updatePrivyFlywheelCheck(token.id, 'insufficient_sol')
        return null
      }

      // Random amount within bounds
      const buyAmount = this.randomBetween(config.min_buy_amount_sol, config.max_buy_amount_sol)
      const lamports = Math.floor(buyAmount * 1e9)

      loggers.flywheel.info({
        tokenSymbol: token.token_symbol,
        buyAmount,
        buyCount: state.buy_count,
        maxBuys: BUYS_PER_CYCLE,
        route: tradingRoute,
      }, 'Executing Privy BUY')

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
        await this.updatePrivyFlywheelCheck(token.id, 'quote_failed')
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
      }

      const signature = await this.executeSwapWithPrivySigning(connection, opsWalletAddress, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        // Actual swap failures should trigger pause mechanism
        const errorMsg = `${tradingRoute} swap failed`
        await this.recordPrivyFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: errorMsg }
      }

      // Clear failures on success
      await this.clearPrivyFailures(token.id)

      // Update state
      const newBuyCount = state.buy_count + 1
      const shouldSwitchToSell = newBuyCount >= BUYS_PER_CYCLE

      // If switching to sell, snapshot the token balance
      let tokenSnapshot = state.sell_phase_token_snapshot
      let sellPerTx = state.sell_amount_per_tx

      if (shouldSwitchToSell) {
        const tokenBalance = await getTokenBalance(opsWalletPubkey, tokenMint)
        tokenSnapshot = tokenBalance
        sellPerTx = tokenBalance / SELLS_PER_CYCLE
      }

      await updatePrivyFlywheelState(token.id, {
        cycle_phase: shouldSwitchToSell ? 'sell' : 'buy',
        buy_count: shouldSwitchToSell ? 0 : newBuyCount,
        sell_count: 0,
        sell_phase_token_snapshot: tokenSnapshot,
        sell_amount_per_tx: sellPerTx,
        last_trade_at: new Date().toISOString(),
      })

      await this.recordPrivyTransaction(token.id, 'buy', buyAmount, signature)
      await this.updatePrivyFlywheelCheck(token.id, 'traded')

      return { ...baseResult, tradeType: 'buy', success: true, amount: buyAmount, signature }

    } else {
      // SELL phase
      const sellAmount = state.sell_amount_per_tx

      if (sellAmount <= 0) {
        loggers.flywheel.info({ tokenSymbol: token.token_symbol }, 'No tokens to sell, switching to buy phase')
        await this.updatePrivyFlywheelCheck(token.id, 'no_tokens')
        await updatePrivyFlywheelState(token.id, { cycle_phase: 'buy', sell_count: 0 })
        return null
      }

      // Check token balance
      const tokenBalance = await getTokenBalance(opsWalletPubkey, tokenMint)
      const actualSellAmount = Math.min(sellAmount, tokenBalance)

      if (actualSellAmount < 1) {
        loggers.flywheel.info({ tokenSymbol: token.token_symbol, tokenBalance }, 'Insufficient tokens for sell, switching to buy phase')
        await this.updatePrivyFlywheelCheck(token.id, 'insufficient_tokens')
        await updatePrivyFlywheelState(token.id, { cycle_phase: 'buy', sell_count: 0 })
        return null
      }

      const tokenUnits = Math.floor(actualSellAmount * Math.pow(10, token.token_decimals))

      loggers.flywheel.info({
        tokenSymbol: token.token_symbol,
        sellAmount: actualSellAmount,
        sellCount: state.sell_count,
        maxSells: SELLS_PER_CYCLE,
        route: tradingRoute,
      }, 'Executing Privy SELL')

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
        await this.updatePrivyFlywheelCheck(token.id, 'quote_failed')
        return { ...baseResult, tradeType: 'sell', success: false, amount: actualSellAmount, error: errorMsg }
      }

      const signature = await this.executeSwapWithPrivySigning(connection, opsWalletAddress, quote.rawQuoteResponse, tradingRoute)

      if (!signature) {
        // Actual swap failures should trigger pause mechanism
        const errorMsg = `${tradingRoute} swap failed`
        await this.recordPrivyFailure(token.id, errorMsg)
        return { ...baseResult, tradeType: 'sell', success: false, amount: actualSellAmount, error: errorMsg }
      }

      // Clear failures on success
      await this.clearPrivyFailures(token.id)

      // Update state
      const newSellCount = state.sell_count + 1
      const shouldSwitchToBuy = newSellCount >= SELLS_PER_CYCLE

      await updatePrivyFlywheelState(token.id, {
        cycle_phase: shouldSwitchToBuy ? 'buy' : 'sell',
        buy_count: 0,
        sell_count: shouldSwitchToBuy ? 0 : newSellCount,
        last_trade_at: new Date().toISOString(),
      })

      await this.recordPrivyTransaction(token.id, 'sell', actualSellAmount, signature)
      await this.updatePrivyFlywheelCheck(token.id, 'traded')

      return { ...baseResult, tradeType: 'sell', success: true, amount: actualSellAmount, signature }
    }
  }

  /**
   * Execute swap with Privy delegated signing
   * Uses sign-only + self-broadcast pattern for reliability (like WHEEL flywheel)
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
        loggers.flywheel.error({ route, attempt }, 'Failed to get swap transaction for Privy signing')
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
        loggers.flywheel.error({ route, error: String(error) }, 'Failed to deserialize transaction for Privy signing')
        return null
      }

      // Use sendTransactionWithPrivySigning utility (sign-only + self-broadcast)
      // This is faster than signAndSendSolanaTransaction because we broadcast immediately after signing
      const result = await sendTransactionWithPrivySigning(connection, transaction, walletAddress, {
        maxRetries: 1, // We handle retries ourselves with fresh transactions
        logContext: { service: 'privy-flywheel', route, attempt: attempt + 1 },
      })

      if (result.success && result.signature) {
        loggers.flywheel.info({ route, signature: result.signature, attempt: attempt + 1 }, 'Privy swap executed successfully')
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
      loggers.flywheel.error({ route, walletAddress, error: errorMsg, attempt: attempt + 1 }, 'Privy swap failed')
      return null
    }

    loggers.flywheel.error({ route, walletAddress, maxRetries }, 'Privy swap failed after all retries')
    return null
  }

  /**
   * Record Privy failure
   */
  private async recordPrivyFailure(tokenId: string, reason: string): Promise<void> {
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
        }, 'Pausing Privy flywheel due to repeated failures')
      }

      await prisma.privyFlywheelState.update({
        where: { privyTokenId: tokenId },
        data: updates,
      })
    } catch (error) {
      loggers.flywheel.error({ tokenId, error: String(error) }, 'Failed to record Privy failure')
    }
  }

  /**
   * Clear Privy failure count after successful trade
   */
  private async clearPrivyFailures(tokenId: string): Promise<void> {
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
      loggers.flywheel.warn({ tokenId, error: String(error) }, 'Failed to clear Privy failures')
    }
  }

  /**
   * Record Privy transaction
   */
  private async recordPrivyTransaction(
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
    } catch (error: any) {
      loggers.flywheel.error({ type, error: String(error) }, 'Failed to record Privy transaction')
    }
  }

  /**
   * Update Privy flywheel check status
   */
  private async updatePrivyFlywheelCheck(
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
}

export const multiUserMMService = new MultiUserMMService()
