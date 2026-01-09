// ═══════════════════════════════════════════════════════════════════════════
// MULTI-USER MARKET MAKING SERVICE
// Orchestrates market making across all users with active flywheels
// ═══════════════════════════════════════════════════════════════════════════

import { Keypair, PublicKey, VersionedTransaction, Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { sendAndConfirmTransactionWithRetry, sendVersionedTransactionWithRetry } from '../utils/transaction'
import bs58 from 'bs58'
import { supabase } from '../config/database'
import { getConnection, getBalance, getTokenBalance, getOpsWallet } from '../config/solana'
import { env } from '../config/env'
import { bagsFmService } from './bags-fm'
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
} from './user-token.service'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const BUYS_PER_CYCLE = 5
const SELLS_PER_CYCLE = 5

// Fee collection settings
const DEV_WALLET_MIN_RESERVE_SOL = 0.01 // Keep minimum SOL in dev wallet for claiming
const MIN_FEE_THRESHOLD_SOL = 0.01 // Minimum SOL to trigger fee collection

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
   * Collect fees from dev wallet and transfer to ops wallet with platform fee split
   * Takes 10% for WHEEL platform, 90% goes to user's ops wallet
   */
  private async collectFees(
    token: UserToken,
    connection: Connection
  ): Promise<{ collected: boolean; amount: number; platformFeeSol: number; userAmountSol: number; signature?: string }> {
    try {
      // Get dev wallet (source of fees)
      const devWallet = await getDecryptedDevWallet(token.id)
      if (!devWallet) {
        loggers.flywheel.warn({ tokenSymbol: token.token_symbol, tokenId: token.id }, 'Could not decrypt dev wallet for fee collection')
        return { collected: false, amount: 0, platformFeeSol: 0, userAmountSol: 0 }
      }

      // Get dev wallet SOL balance
      const devBalance = await getBalance(devWallet.publicKey)
      loggers.flywheel.debug({ tokenSymbol: token.token_symbol, devBalance, devWallet: devWallet.publicKey.toString() }, 'Dev wallet balance')

      // Calculate transfer amount (keep minimum reserve)
      const transferAmount = devBalance - DEV_WALLET_MIN_RESERVE_SOL

      if (transferAmount < MIN_FEE_THRESHOLD_SOL) {
        loggers.flywheel.debug({ tokenSymbol: token.token_symbol, devBalance, minRequired: MIN_FEE_THRESHOLD_SOL + DEV_WALLET_MIN_RESERVE_SOL }, 'Dev wallet balance too low for fee collection')
        return { collected: false, amount: 0, platformFeeSol: 0, userAmountSol: 0 }
      }

      // Calculate platform fee (default 10%)
      const platformFeePercent = env.platformFeePercentage || 10
      const platformFeeSol = transferAmount * (platformFeePercent / 100)
      const userAmountSol = transferAmount - platformFeeSol

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, transferAmount, platformFeePercent }, 'Collecting fees from dev wallet')

      // Get platform ops wallet (WHEEL)
      const platformOpsWallet = getOpsWallet()
      let platformSig: string | undefined

      // Transfer 1: Platform fee to WHEEL ops wallet (10%)
      if (platformOpsWallet && platformFeeSol > 0.001) {
        const platformTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: devWallet.publicKey,
            toPubkey: platformOpsWallet.publicKey,
            lamports: Math.floor(platformFeeSol * LAMPORTS_PER_SOL),
          })
        )
        const platformResult = await sendAndConfirmTransactionWithRetry(
          connection,
          platformTx,
          [devWallet],
          { commitment: 'confirmed', logContext: { service: 'flywheel', type: 'platform-fee', tokenSymbol: token.token_symbol } }
        )
        if (platformResult.success) {
          platformSig = platformResult.signature
          loggers.flywheel.info({ tokenSymbol: token.token_symbol, platformFeePercent, platformFeeSol, signature: platformSig }, 'Platform fee transferred to WHEEL ops wallet')
        } else {
          loggers.flywheel.error({ tokenSymbol: token.token_symbol, error: platformResult.error }, 'Platform fee transfer failed')
        }
      } else if (!platformOpsWallet) {
        loggers.flywheel.warn({ tokenSymbol: token.token_symbol }, 'Platform ops wallet not configured, skipping platform fee')
      }

      // Transfer 2: Remaining to user's ops wallet (90%)
      let userSig: string | undefined
      if (userAmountSol > 0.001) {
        const userOpsWalletAddress = new PublicKey(token.ops_wallet_address)
        const userTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: devWallet.publicKey,
            toPubkey: userOpsWalletAddress,
            lamports: Math.floor(userAmountSol * LAMPORTS_PER_SOL),
          })
        )
        const userResult = await sendAndConfirmTransactionWithRetry(
          connection,
          userTx,
          [devWallet],
          { commitment: 'confirmed', logContext: { service: 'flywheel', type: 'user-portion', tokenSymbol: token.token_symbol } }
        )
        if (userResult.success) {
          userSig = userResult.signature
          loggers.flywheel.info({ tokenSymbol: token.token_symbol, userPercent: 100 - platformFeePercent, userAmountSol, signature: userSig }, 'User portion transferred to ops wallet')
        } else {
          loggers.flywheel.error({ tokenSymbol: token.token_symbol, error: userResult.error }, 'User portion transfer failed')
        }
      }

      const signature = userSig || platformSig || ''
      loggers.flywheel.info({ tokenSymbol: token.token_symbol, totalAmount: transferAmount, platformFeeSol, userAmountSol }, 'Fee collection successful')

      // Record the transfer (user portion)
      if (userSig) {
        await this.recordTransaction(token.id, 'transfer', userAmountSol, userSig)
      }

      return { collected: true, amount: transferAmount, platformFeeSol, userAmountSol, signature }
    } catch (error: any) {
      loggers.flywheel.error({ tokenSymbol: token.token_symbol, error: String(error) }, 'Fee collection failed')
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

    // Step 1: Collect fees from dev wallet to ops wallet
    // This ensures ops wallet has SOL for trading
    await this.collectFees(token, connection)

    // Get current flywheel state
    let state = await getFlywheelState(token.id)
    if (!state) {
      // Initialize state if not exists
      await supabase?.from('user_flywheel_state').insert([{
        user_token_id: token.id,
        cycle_phase: 'buy',
        buy_count: 0,
        sell_count: 0,
      }])
      state = await getFlywheelState(token.id)
    }

    if (!state) {
      return { ...baseResult, tradeType: 'buy', success: false, amount: 0, error: 'Failed to get flywheel state' }
    }

    // Get ops wallet for trading (this wallet has the private key for signing trades)
    const opsWallet = await getDecryptedOpsWallet(token.id)
    if (!opsWallet) {
      return { ...baseResult, tradeType: 'buy', success: false, amount: 0, error: 'Failed to decrypt ops wallet' }
    }

    // Determine trade based on algorithm mode
    if (config.algorithm_mode === 'simple') {
      return this.runSimpleAlgorithm(token, config, state, opsWallet, connection, baseResult)
    } else if (config.algorithm_mode === 'rebalance') {
      return this.runRebalanceAlgorithm(token, config, state, opsWallet, connection, baseResult)
    } else {
      // Smart mode - signal-based trading with RSI, Bollinger Bands, and trend analysis
      return this.runSmartAlgorithm(token, config, state, opsWallet, connection, baseResult)
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
    baseResult: { userTokenId: string; tokenMint: string; tokenSymbol: string }
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

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, buyAmount, buyCount: state.buy_count, maxBuys: BUYS_PER_CYCLE }, 'Executing BUY')

      // Get quote and execute
      const quote = await bagsFmService.getTradeQuote(
        SOL_MINT,
        token.token_mint_address,
        lamports,
        'buy',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: 'Failed to get quote' }
      }

      const signature = await this.executeSwap(connection, wallet, quote.rawQuoteResponse)

      if (!signature) {
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: 'Swap failed' }
      }

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

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, sellAmount: actualSellAmount, sellCount: state.sell_count, maxSells: SELLS_PER_CYCLE }, 'Executing SELL')

      // Get quote and execute
      const quote = await bagsFmService.getTradeQuote(
        token.token_mint_address,
        SOL_MINT,
        tokenUnits,
        'sell',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        return { ...baseResult, tradeType: 'sell', success: false, amount: actualSellAmount, error: 'Failed to get quote' }
      }

      const signature = await this.executeSwap(connection, wallet, quote.rawQuoteResponse)

      if (!signature) {
        return { ...baseResult, tradeType: 'sell', success: false, amount: actualSellAmount, error: 'Swap failed' }
      }

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
   * Rebalance algorithm: maintain target SOL/token allocation
   */
  private async runRebalanceAlgorithm(
    token: UserToken,
    config: UserTokenConfig,
    state: UserFlywheelState,
    wallet: Keypair,
    connection: Connection,
    baseResult: { userTokenId: string; tokenMint: string; tokenSymbol: string }
  ): Promise<TradeResult | null> {
    const tokenMint = new PublicKey(token.token_mint_address)

    // Get current balances
    const solBalance = await getBalance(wallet.publicKey)
    const tokenBalance = await getTokenBalance(wallet.publicKey, tokenMint)

    // Get token price (approximate from a small quote)
    const priceQuote = await bagsFmService.getTradeQuote(
      SOL_MINT,
      token.token_mint_address,
      1e9, // 1 SOL
      'buy',
      100
    )

    if (!priceQuote) {
      return { ...baseResult, tradeType: 'buy', success: false, amount: 0, error: 'Failed to get price' }
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

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, buyAmount, action: 'rebalance' }, 'Executing rebalance BUY')

      const quote = await bagsFmService.getTradeQuote(
        SOL_MINT,
        token.token_mint_address,
        lamports,
        'buy',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: 'Failed to get quote' }
      }

      const signature = await this.executeSwap(connection, wallet, quote.rawQuoteResponse)

      if (!signature) {
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: 'Swap failed' }
      }

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

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, sellAmount: sellTokens, action: 'rebalance' }, 'Executing rebalance SELL')

      const quote = await bagsFmService.getTradeQuote(
        token.token_mint_address,
        SOL_MINT,
        tokenUnits,
        'sell',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellTokens, error: 'Failed to get quote' }
      }

      const signature = await this.executeSwap(connection, wallet, quote.rawQuoteResponse)

      if (!signature) {
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellTokens, error: 'Swap failed' }
      }

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
    baseResult: { userTokenId: string; tokenMint: string; tokenSymbol: string }
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
      return this.runSimpleAlgorithm(token, config, state, wallet, connection, baseResult)
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

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, buyAmount, action: optimalSignal.action, confidence: optimalSignal.confidence }, 'Executing SMART BUY')

      const quote = await bagsFmService.getTradeQuote(
        SOL_MINT,
        token.token_mint_address,
        lamports,
        'buy',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: 'Failed to get quote' }
      }

      const signature = await this.executeSwap(connection, wallet, quote.rawQuoteResponse)

      if (!signature) {
        return { ...baseResult, tradeType: 'buy', success: false, amount: buyAmount, error: 'Swap failed' }
      }

      // Record trade and cooldown
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

      loggers.flywheel.info({ tokenSymbol: token.token_symbol, sellAmount, action: optimalSignal.action, confidence: optimalSignal.confidence }, 'Executing SMART SELL')

      const quote = await bagsFmService.getTradeQuote(
        token.token_mint_address,
        SOL_MINT,
        tokenUnits,
        'sell',
        config.slippage_bps
      )

      if (!quote?.rawQuoteResponse) {
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellAmount, error: 'Failed to get quote' }
      }

      const signature = await this.executeSwap(connection, wallet, quote.rawQuoteResponse)

      if (!signature) {
        return { ...baseResult, tradeType: 'sell', success: false, amount: sellAmount, error: 'Swap failed' }
      }

      // Record trade and cooldown
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
}

export const multiUserMMService = new MultiUserMMService()
