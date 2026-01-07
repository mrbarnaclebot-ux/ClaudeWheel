// ═══════════════════════════════════════════════════════════════════════════
// MULTI-USER MARKET MAKING SERVICE
// Orchestrates market making across all users with active flywheels
// ═══════════════════════════════════════════════════════════════════════════

import { Keypair, PublicKey, VersionedTransaction, Connection, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js'
import bs58 from 'bs58'
import { supabase } from '../config/database'
import { getConnection, getBalance, getTokenBalance } from '../config/solana'
import { bagsFmService } from './bags-fm'
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

  /**
   * Run flywheel cycle for all users with active flywheels
   */
  async runFlywheelCycle(maxTradesPerMinute: number = 30): Promise<FlywheelCycleResult> {
    if (this.isRunning) {
      console.log('⚠️ Flywheel cycle already in progress, skipping')
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

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('   MULTI-USER FLYWHEEL CYCLE')
    console.log('═══════════════════════════════════════════════════════════\n')

    try {
      // Reset rate limit counter if new minute
      const currentMinute = Math.floor(Date.now() / 60000)
      if (currentMinute !== this.lastTradeMinute) {
        this.tradesThisMinute = 0
        this.lastTradeMinute = currentMinute
      }

      // Get all active flywheel tokens
      const tokens = await getTokensForFlywheel()
      console.log(`📋 Found ${tokens.length} tokens with active flywheels\n`)

      for (const tokenWithConfig of tokens) {
        // Check rate limit
        if (this.tradesThisMinute >= maxTradesPerMinute) {
          console.log(`⏸️ Rate limit reached (${maxTradesPerMinute}/min), pausing until next cycle`)
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
          console.error(`❌ ${tokenWithConfig.token_symbol}: Unexpected error - ${error.message}`)
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

    console.log('\n───────────────────────────────────────────────────────────')
    console.log(`   Flywheel cycle completed: ${tradesExecuted}/${results.length} trades`)
    console.log('───────────────────────────────────────────────────────────\n')

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
   * Collect fees from dev wallet and transfer to ops wallet
   * This ensures the ops wallet has SOL for trading
   */
  private async collectFees(
    token: UserToken,
    connection: Connection
  ): Promise<{ collected: boolean; amount: number; signature?: string }> {
    try {
      // Get dev wallet (source of fees)
      const devWallet = await getDecryptedDevWallet(token.id)
      if (!devWallet) {
        console.log(`   ⚠️ ${token.token_symbol}: Could not decrypt dev wallet for fee collection`)
        return { collected: false, amount: 0 }
      }

      // Get dev wallet SOL balance
      const devBalance = await getBalance(devWallet.publicKey)
      console.log(`   📊 ${token.token_symbol}: Dev wallet balance: ${devBalance.toFixed(4)} SOL`)

      // Calculate transfer amount (keep minimum reserve)
      const transferAmount = devBalance - DEV_WALLET_MIN_RESERVE_SOL

      if (transferAmount < MIN_FEE_THRESHOLD_SOL) {
        console.log(`   ℹ️ ${token.token_symbol}: Dev wallet balance too low for fee collection (need ${(MIN_FEE_THRESHOLD_SOL + DEV_WALLET_MIN_RESERVE_SOL).toFixed(4)} SOL)`)
        return { collected: false, amount: 0 }
      }

      // Get ops wallet address
      const opsWalletAddress = new PublicKey(token.ops_wallet_address)

      console.log(`   💸 ${token.token_symbol}: Collecting ${transferAmount.toFixed(4)} SOL from dev → ops wallet`)

      // Create transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: devWallet.publicKey,
          toPubkey: opsWalletAddress,
          lamports: Math.floor(transferAmount * LAMPORTS_PER_SOL),
        })
      )

      // Send transaction
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [devWallet],
        { commitment: 'confirmed' }
      )

      console.log(`   ✅ ${token.token_symbol}: Fee collection successful! ${signature.slice(0, 8)}...`)

      // Record the transfer
      await this.recordTransaction(token.id, 'transfer', transferAmount, signature)

      return { collected: true, amount: transferAmount, signature }
    } catch (error: any) {
      console.error(`   ❌ ${token.token_symbol}: Fee collection failed: ${error.message}`)
      return { collected: false, amount: 0 }
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
      // Smart mode - for now, use simple
      return this.runSimpleAlgorithm(token, config, state, opsWallet, connection, baseResult)
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
        console.log(`ℹ️ ${token.token_symbol}: Insufficient SOL for buy (${solBalance.toFixed(4)} < ${minRequired.toFixed(4)})`)
        return null
      }

      // Random amount within bounds
      const buyAmount = this.randomBetween(config.min_buy_amount_sol, config.max_buy_amount_sol)
      const lamports = Math.floor(buyAmount * 1e9)

      console.log(`🟢 ${token.token_symbol}: BUY ${buyAmount.toFixed(4)} SOL (${state.buy_count}/${BUYS_PER_CYCLE})`)

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

      // Record transaction
      await this.recordTransaction(token.id, 'buy', buyAmount, signature)

      return { ...baseResult, tradeType: 'buy', success: true, amount: buyAmount, signature }

    } else {
      // SELL phase
      const sellAmount = state.sell_amount_per_tx

      if (sellAmount <= 0) {
        console.log(`ℹ️ ${token.token_symbol}: No tokens to sell`)
        // Reset to buy phase
        await updateFlywheelState(token.id, { cycle_phase: 'buy', sell_count: 0 })
        return null
      }

      // Check token balance
      const tokenBalance = await getTokenBalance(wallet.publicKey, tokenMint)
      const actualSellAmount = Math.min(sellAmount, tokenBalance)

      if (actualSellAmount < 1) {
        console.log(`ℹ️ ${token.token_symbol}: Insufficient tokens for sell`)
        await updateFlywheelState(token.id, { cycle_phase: 'buy', sell_count: 0 })
        return null
      }

      const tokenUnits = Math.floor(actualSellAmount * Math.pow(10, token.token_decimals))

      console.log(`🔴 ${token.token_symbol}: SELL ${actualSellAmount.toFixed(0)} tokens (${state.sell_count}/${SELLS_PER_CYCLE})`)

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

      // Record transaction
      await this.recordTransaction(token.id, 'sell', actualSellAmount, signature)

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

    console.log(`📊 ${token.token_symbol}: SOL ${currentSolPct.toFixed(1)}% (target ${targetSolPct}%) | Token ${currentTokenPct.toFixed(1)}% (target ${targetTokenPct}%)`)

    // Check if rebalance needed
    if (Math.abs(currentSolPct - targetSolPct) < threshold) {
      console.log(`ℹ️ ${token.token_symbol}: Within threshold, no rebalance needed`)
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

      console.log(`🟢 ${token.token_symbol}: Rebalance BUY ${buyAmount.toFixed(4)} SOL`)

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
      return { ...baseResult, tradeType: 'buy', success: true, amount: buyAmount, signature }

    } else if (currentTokenPct > targetTokenPct + threshold) {
      // Too many tokens, sell some
      const excessTokenValue = tokenValueInSol - (totalValueSol * targetTokenPct / 100)
      const sellTokens = Math.min(excessTokenValue * tokensPerSol * 0.5, tokenBalance * 0.2) // Sell half excess, max 20%

      if (sellTokens < 1) {
        return null
      }

      const tokenUnits = Math.floor(sellTokens * Math.pow(10, token.token_decimals))

      console.log(`🔴 ${token.token_symbol}: Rebalance SELL ${sellTokens.toFixed(0)} tokens`)

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
      return { ...baseResult, tradeType: 'sell', success: true, amount: sellTokens, signature }
    }

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
        console.error('Failed to get swap transaction')
        return null
      }

      // Deserialize and sign
      const txBuffer = bs58.decode(swapData.transaction)
      const transaction = VersionedTransaction.deserialize(txBuffer)
      transaction.sign([wallet])

      // Send transaction
      const signature = await connection.sendTransaction(transaction, {
        maxRetries: 5,
        skipPreflight: true,
      })

      console.log(`   📤 TX sent: ${signature.slice(0, 8)}...`)

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed')

      return signature
    } catch (error: any) {
      console.error(`   ❌ Swap failed: ${error.message}`)
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
      console.error('   ❌ Cannot record transaction: supabase not configured')
      return
    }

    try {
      const { data, error } = await supabase.from('user_transactions').insert([{
        user_token_id: userTokenId,
        type,
        amount,
        signature,
        status: 'confirmed',
        created_at: new Date().toISOString(),
      }]).select()

      if (error) {
        console.error(`   ❌ Failed to record ${type} transaction:`, error.message)
      } else {
        console.log(`   📝 Recorded ${type} transaction: ${signature.slice(0, 8)}...`)
      }
    } catch (error: any) {
      console.error('   ❌ Failed to record transaction:', error.message)
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
