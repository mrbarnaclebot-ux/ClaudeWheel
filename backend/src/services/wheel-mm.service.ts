// ═══════════════════════════════════════════════════════════════════════════
// WHEEL TOKEN MARKET MAKING SERVICE
// Dedicated flywheel for the platform WHEEL token
// Uses environment wallet keys and old flywheel_state table
// ═══════════════════════════════════════════════════════════════════════════

import { PublicKey, Connection, Keypair } from '@solana/web3.js'
import { supabase } from '../config/database'
import { getConnection, getBalance, getTokenBalance, getDevWallet, getOpsWallet } from '../config/solana'
import { env } from '../config/env'
import { loggers } from '../utils/logger'
import { loadFlywheelState, saveFlywheelState, FlywheelState } from '../config/database'
import { BagsSDK, signAndSendTransaction } from '@bagsfm/bags-sdk'

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const WHEEL_TOKEN_MINT = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'
const WHEEL_TOKEN_DECIMALS = 6

const BUYS_PER_CYCLE = 5
const SELLS_PER_CYCLE = 5

// Trading configuration (can be overridden by env vars)
const MIN_BUY_AMOUNT_SOL = parseFloat(process.env.WHEEL_MIN_BUY_SOL || '0.02')
const MAX_BUY_AMOUNT_SOL = parseFloat(process.env.WHEEL_MAX_BUY_SOL || '0.1')
const SLIPPAGE_BPS = parseInt(process.env.WHEEL_SLIPPAGE_BPS || '300', 10)

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WheelTradeResult {
  success: boolean
  tradeType: 'buy' | 'sell'
  amount: number
  signature?: string
  error?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class WheelMMService {
  private isRunning = false
  private lastRunAt: Date | null = null
  private sdk: BagsSDK | null = null

  constructor() {
    this.initSdk()
  }

  /**
   * Initialize the Bags SDK
   */
  private initSdk(): void {
    if (env.bagsFmApiKey) {
      const connection = getConnection()
      this.sdk = new BagsSDK(env.bagsFmApiKey, connection, 'confirmed')
      loggers.flywheel.info('WHEEL: Bags SDK initialized')
    } else {
      loggers.flywheel.warn('WHEEL: Bags SDK not initialized - missing API key')
    }
  }

  /**
   * Run a single flywheel cycle for the WHEEL token
   * Uses Bags SDK for trading
   */
  async runFlywheelCycle(): Promise<WheelTradeResult | null> {
    if (this.isRunning) {
      loggers.flywheel.warn('WHEEL flywheel cycle already in progress, skipping')
      return null
    }

    this.isRunning = true
    const startedAt = new Date()

    try {
      loggers.flywheel.info('Starting WHEEL token flywheel cycle')

      // Check SDK availability
      if (!this.sdk) {
        loggers.flywheel.error('WHEEL: Bags SDK not available')
        return null
      }

      // Get wallets from environment
      const opsWallet = getOpsWallet()
      if (!opsWallet) {
        loggers.flywheel.error('WHEEL ops wallet not configured')
        return null
      }

      const connection = getConnection()

      // Load flywheel state
      const state = await loadFlywheelState()
      loggers.flywheel.debug({
        phase: state.cycle_phase,
        buyCount: state.buy_count,
        sellCount: state.sell_count,
      }, 'WHEEL flywheel state')

      // Execute trade based on current phase
      const result = await this.executeTrade(state, opsWallet, connection)

      this.lastRunAt = new Date()
      loggers.flywheel.info({
        success: result?.success,
        tradeType: result?.tradeType,
        duration: Date.now() - startedAt.getTime(),
      }, 'WHEEL flywheel cycle completed')

      return result
    } catch (error) {
      loggers.flywheel.error({ error: String(error) }, 'WHEEL flywheel cycle failed')
      return null
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Execute a trade based on current flywheel state
   */
  private async executeTrade(
    state: FlywheelState,
    wallet: ReturnType<typeof getOpsWallet>,
    connection: Connection
  ): Promise<WheelTradeResult | null> {
    if (!wallet) return null

    const tokenMint = new PublicKey(WHEEL_TOKEN_MINT)

    if (state.cycle_phase === 'buy') {
      // Check SOL balance
      const solBalance = await getBalance(wallet.publicKey)
      const minRequired = MIN_BUY_AMOUNT_SOL + 0.01 // reserve for fees

      if (solBalance < minRequired) {
        loggers.flywheel.info({ solBalance, minRequired }, 'WHEEL: Insufficient SOL for buy')
        return null
      }

      // Random amount within bounds
      const buyAmount = this.randomBetween(MIN_BUY_AMOUNT_SOL, MAX_BUY_AMOUNT_SOL)
      const lamports = Math.floor(buyAmount * 1e9)

      loggers.flywheel.info({
        buyAmount,
        buyCount: state.buy_count,
        maxBuys: BUYS_PER_CYCLE,
      }, 'WHEEL: Executing BUY via Bags SDK')

      // Get quote from Bags SDK
      const quote = await this.sdk!.trade.getQuote({
        inputMint: new PublicKey(SOL_MINT),
        outputMint: new PublicKey(WHEEL_TOKEN_MINT),
        amount: lamports,
        slippageMode: 'manual',
        slippageBps: SLIPPAGE_BPS,
      })

      if (!quote) {
        loggers.flywheel.error('WHEEL: Failed to get Bags SDK quote for buy')
        return { success: false, tradeType: 'buy', amount: buyAmount, error: 'Failed to get quote' }
      }

      // Execute swap via Bags SDK
      const signature = await this.executeSwap(connection, wallet, quote)

      if (!signature) {
        return { success: false, tradeType: 'buy', amount: buyAmount, error: 'Swap failed' }
      }

      // Update state
      const newBuyCount = state.buy_count + 1
      if (newBuyCount >= BUYS_PER_CYCLE) {
        // Switch to sell phase
        const tokenBalance = await getTokenBalance(wallet.publicKey, tokenMint)
        await saveFlywheelState({
          cycle_phase: 'sell',
          buy_count: 0,
          sell_count: 0,
          sell_phase_token_snapshot: tokenBalance,
          sell_amount_per_tx: tokenBalance / SELLS_PER_CYCLE,
        })
        loggers.flywheel.info({ tokenBalance }, 'WHEEL: Completed buy phase, switching to sell')
      } else {
        await saveFlywheelState({
          ...state,
          buy_count: newBuyCount,
        })
      }

      await this.recordTransaction('buy', buyAmount, signature)
      return { success: true, tradeType: 'buy', amount: buyAmount, signature }

    } else {
      // SELL PHASE
      const tokenBalance = await getTokenBalance(wallet.publicKey, tokenMint)

      if (tokenBalance < 1) {
        loggers.flywheel.info('WHEEL: No tokens to sell, switching to buy phase')
        await saveFlywheelState({
          cycle_phase: 'buy',
          buy_count: 0,
          sell_count: 0,
          sell_phase_token_snapshot: 0,
          sell_amount_per_tx: 0,
        })
        return null
      }

      // Calculate sell amount
      const sellAmount = Math.min(
        state.sell_amount_per_tx || tokenBalance / SELLS_PER_CYCLE,
        tokenBalance * 0.3 // Max 30% per trade
      )

      if (sellAmount < 1) {
        loggers.flywheel.info('WHEEL: Sell amount too small, switching to buy phase')
        await saveFlywheelState({
          cycle_phase: 'buy',
          buy_count: 0,
          sell_count: 0,
          sell_phase_token_snapshot: 0,
          sell_amount_per_tx: 0,
        })
        return null
      }

      const tokenUnits = Math.floor(sellAmount * Math.pow(10, WHEEL_TOKEN_DECIMALS))

      loggers.flywheel.info({
        sellAmount,
        sellCount: state.sell_count,
        maxSells: SELLS_PER_CYCLE,
      }, 'WHEEL: Executing SELL via Bags SDK')

      // Get quote from Bags SDK
      const quote = await this.sdk!.trade.getQuote({
        inputMint: new PublicKey(WHEEL_TOKEN_MINT),
        outputMint: new PublicKey(SOL_MINT),
        amount: tokenUnits,
        slippageMode: 'manual',
        slippageBps: SLIPPAGE_BPS,
      })

      if (!quote) {
        loggers.flywheel.error('WHEEL: Failed to get Bags SDK quote for sell')
        return { success: false, tradeType: 'sell', amount: sellAmount, error: 'Failed to get quote' }
      }

      // Execute swap via Bags SDK
      const signature = await this.executeSwap(connection, wallet, quote)

      if (!signature) {
        return { success: false, tradeType: 'sell', amount: sellAmount, error: 'Swap failed' }
      }

      // Update state
      const newSellCount = state.sell_count + 1
      if (newSellCount >= SELLS_PER_CYCLE) {
        // Switch back to buy phase
        await saveFlywheelState({
          cycle_phase: 'buy',
          buy_count: 0,
          sell_count: 0,
          sell_phase_token_snapshot: 0,
          sell_amount_per_tx: 0,
        })
        loggers.flywheel.info('WHEEL: Completed sell phase, switching to buy')
      } else {
        await saveFlywheelState({
          ...state,
          sell_count: newSellCount,
        })
      }

      await this.recordTransaction('sell', sellAmount, signature)
      return { success: true, tradeType: 'sell', amount: sellAmount, signature }
    }
  }

  /**
   * Execute a swap using Bags SDK
   * Uses SDK's signAndSendTransaction for reliable transaction handling
   */
  private async executeSwap(
    connection: Connection,
    wallet: Keypair,
    quoteResponse: any
  ): Promise<string | null> {
    if (!wallet || !this.sdk) return null

    try {
      // Create swap transaction using SDK
      const swapResult = await this.sdk.trade.createSwapTransaction({
        quoteResponse,
        userPublicKey: wallet.publicKey,
      })

      if (!swapResult || !swapResult.transaction) {
        loggers.flywheel.error('WHEEL: Failed to create swap transaction via SDK')
        return null
      }

      loggers.flywheel.debug({
        computeUnitLimit: swapResult.computeUnitLimit,
        lastValidBlockHeight: swapResult.lastValidBlockHeight,
      }, 'WHEEL: Swap transaction created')

      // Use SDK's signAndSendTransaction which handles encoding properly
      const signature = await signAndSendTransaction(
        connection,
        'confirmed',
        swapResult.transaction,
        wallet
      )

      loggers.flywheel.info({ signature }, 'WHEEL: Swap confirmed via SDK')
      return signature
    } catch (error) {
      loggers.flywheel.error({ error: String(error) }, 'WHEEL: Swap failed')
      return null
    }
  }

  /**
   * Record transaction in database
   */
  private async recordTransaction(
    type: 'buy' | 'sell',
    amount: number,
    signature: string
  ): Promise<void> {
    if (!supabase) return

    try {
      await supabase.from('transactions').insert({
        type,
        amount,
        signature,
        token_mint: WHEEL_TOKEN_MINT,
        token_symbol: 'WHEEL',
        created_at: new Date().toISOString(),
      })
      loggers.flywheel.debug({ type, amount, signature }, 'WHEEL: Recorded transaction')
    } catch (error) {
      loggers.flywheel.warn({ error: String(error) }, 'WHEEL: Failed to record transaction')
    }
  }

  /**
   * Random number between min and max
   */
  private randomBetween(min: number, max: number): number {
    return Math.random() * (max - min) + min
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt?.toISOString() || null,
      tokenMint: WHEEL_TOKEN_MINT,
    }
  }
}

export const wheelMMService = new WheelMMService()
