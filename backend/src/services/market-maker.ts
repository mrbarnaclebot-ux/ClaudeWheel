import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { connection, getTokenMint, getBalance, getTokenBalance } from '../config/solana'
import { env } from '../config/env'
import { bagsFmService } from './bags-fm'
import { insertTransaction } from '../config/database'
import type { Transaction as TxRecord, MarketMakingOrder } from '../types'

// ═══════════════════════════════════════════════════════════════════════════
// MARKET MAKER SERVICE
// Executes buy/sell orders using Bags.fm (bonding curve) or Jupiter (graduated)
// ═══════════════════════════════════════════════════════════════════════════

// SOL mint address
const SOL_MINT = 'So11111111111111111111111111111111111111112'

export class MarketMaker {
  private opsWallet: Keypair | null = null
  private lastOrderTime: Date | null = null
  private isEnabled: boolean = env.marketMakingEnabled
  private isGraduated: boolean | null = null // Cache graduation status
  private lastGraduationCheck: Date | null = null

  constructor(opsWallet?: Keypair) {
    this.opsWallet = opsWallet || null
  }

  /**
   * Check if the token has graduated from the bonding curve
   * Caches result for 5 minutes to reduce API calls
   */
  async checkIsGraduated(): Promise<boolean> {
    const tokenMint = getTokenMint()
    if (!tokenMint) return false

    // Use cached value if checked within last 5 minutes
    const now = new Date()
    if (
      this.isGraduated !== null &&
      this.lastGraduationCheck &&
      now.getTime() - this.lastGraduationCheck.getTime() < 5 * 60 * 1000
    ) {
      return this.isGraduated
    }

    try {
      const tokenInfo = await bagsFmService.getTokenCreatorInfo(tokenMint.toString())
      this.isGraduated = tokenInfo?.isGraduated ?? false
      this.lastGraduationCheck = now

      if (this.isGraduated) {
        console.log('✅ Token has graduated - using Jupiter for trades')
      } else {
        console.log('📈 Token on bonding curve - using Bags.fm for trades')
      }

      return this.isGraduated
    } catch (error) {
      console.error('Failed to check graduation status:', error)
      return false
    }
  }

  setOpsWallet(wallet: Keypair) {
    this.opsWallet = wallet
  }

  enable() {
    this.isEnabled = true
    console.log('🟢 Market making enabled')
  }

  disable() {
    this.isEnabled = false
    console.log('🔴 Market making disabled')
  }

  async getJupiterQuote(
    inputMint: string,
    outputMint: string,
    amount: number, // in lamports or smallest unit
    slippageBps: number = 50 // 0.5% default
  ): Promise<any> {
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: slippageBps.toString(),
      })

      const response = await fetch(`${env.jupiterApiUrl}/quote?${params}`)

      if (!response.ok) {
        throw new Error(`Jupiter quote failed: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to get Jupiter quote:', error)
      return null
    }
  }

  async executeSwap(quoteResponse: any): Promise<string | null> {
    if (!this.opsWallet) {
      console.warn('⚠️ Ops wallet not configured')
      return null
    }

    try {
      // Get swap transaction from Jupiter
      const swapResponse = await fetch(`${env.jupiterApiUrl}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey: this.opsWallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
        }),
      })

      if (!swapResponse.ok) {
        throw new Error(`Jupiter swap failed: ${swapResponse.statusText}`)
      }

      const { swapTransaction } = await swapResponse.json() as { swapTransaction: string }

      // Deserialize and sign transaction
      const transactionBuf = Buffer.from(swapTransaction, 'base64')
      const transaction = VersionedTransaction.deserialize(transactionBuf)
      transaction.sign([this.opsWallet])

      // Send transaction
      const signature = await connection.sendTransaction(transaction, {
        maxRetries: 3,
      })

      console.log(`📤 Transaction sent: ${signature}`)

      // Wait for confirmation with timeout handling
      try {
        await connection.confirmTransaction(signature, 'confirmed')
        console.log(`✅ Swap executed! Signature: ${signature}`)
        return signature
      } catch (confirmError: any) {
        // Check if it's a timeout error - the transaction might have succeeded
        if (confirmError?.message?.includes('not confirmed in')) {
          console.warn(`⏱️ Confirmation timed out, checking transaction status...`)

          // Wait a bit and check the transaction status
          await new Promise(resolve => setTimeout(resolve, 5000))

          const status = await connection.getSignatureStatus(signature)
          if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
            console.log(`✅ Transaction confirmed after timeout check! Signature: ${signature}`)
            return signature
          }

          // Try one more time after another delay
          await new Promise(resolve => setTimeout(resolve, 10000))
          const retryStatus = await connection.getSignatureStatus(signature)
          if (retryStatus?.value?.confirmationStatus === 'confirmed' || retryStatus?.value?.confirmationStatus === 'finalized') {
            console.log(`✅ Transaction confirmed on retry! Signature: ${signature}`)
            return signature
          }

          console.error(`❌ Transaction failed to confirm: ${signature}`)
        }
        throw confirmError
      }
    } catch (error) {
      console.error('❌ Swap execution failed:', error)
      return null
    }
  }

  /**
   * Execute a swap via Bags.fm bonding curve
   * Requires the raw quote response from bagsFmService.getTradeQuote()
   */
  async executeBagsFmSwap(quoteResponse: any): Promise<string | null> {
    if (!this.opsWallet) {
      console.warn('⚠️ Ops wallet not configured')
      return null
    }

    try {
      // Get swap transaction from Bags.fm using full quote response
      const swapData = await bagsFmService.generateSwapTransaction(
        this.opsWallet.publicKey.toString(),
        quoteResponse
      )

      if (!swapData) {
        console.error('Failed to get Bags.fm swap transaction')
        return null
      }

      // Deserialize and sign transaction (Bags.fm returns Base58 encoded)
      const transactionBuf = bs58.decode(swapData.transaction)
      const transaction = VersionedTransaction.deserialize(transactionBuf)
      transaction.sign([this.opsWallet])

      // Send transaction
      const signature = await connection.sendTransaction(transaction, {
        maxRetries: 3,
      })

      console.log(`📤 Transaction sent: ${signature}`)

      // Wait for confirmation with timeout handling
      try {
        await connection.confirmTransaction(signature, 'confirmed')
        console.log(`✅ Bags.fm swap executed! Signature: ${signature}`)
        return signature
      } catch (confirmError: any) {
        // Check if it's a timeout error - the transaction might have succeeded
        if (confirmError?.message?.includes('not confirmed in')) {
          console.warn(`⏱️ Confirmation timed out, checking transaction status...`)

          // Wait a bit and check the transaction status
          await new Promise(resolve => setTimeout(resolve, 5000))

          const status = await connection.getSignatureStatus(signature)
          if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
            console.log(`✅ Transaction confirmed after timeout check! Signature: ${signature}`)
            return signature
          }

          // Try one more time after another delay
          await new Promise(resolve => setTimeout(resolve, 10000))
          const retryStatus = await connection.getSignatureStatus(signature)
          if (retryStatus?.value?.confirmationStatus === 'confirmed' || retryStatus?.value?.confirmationStatus === 'finalized') {
            console.log(`✅ Transaction confirmed on retry! Signature: ${signature}`)
            return signature
          }

          console.error(`❌ Transaction failed to confirm: ${signature}`)
          console.error(`   Status: ${JSON.stringify(retryStatus?.value)}`)
        }
        throw confirmError
      }
    } catch (error: any) {
      console.error('❌ Bags.fm swap execution failed:')
      if (error?.logs) {
        console.error('Transaction logs:', error.logs)
      }
      if (error?.message) {
        console.error('Error message:', error.message)
      }
      console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
      return null
    }
  }

  async executeBuy(solAmount: number): Promise<TxRecord | null> {
    if (!this.isEnabled) {
      console.log('ℹ️ Market making is disabled')
      return null
    }

    if (!this.opsWallet) {
      console.warn('⚠️ Ops wallet not configured')
      return null
    }

    // Check if we have enough SOL
    const balance = await getBalance(this.opsWallet.publicKey)
    if (balance < solAmount + 0.01) {
      console.log(`ℹ️ Insufficient SOL balance for buy (${balance.toFixed(4)} < ${solAmount})`)
      return null
    }

    // Cap the buy amount
    const cappedAmount = Math.min(solAmount, env.maxBuyAmountSol)
    const lamports = Math.floor(cappedAmount * 1e9)

    console.log(`🟢 Executing BUY: ${cappedAmount.toFixed(4)} SOL → CLAUDE tokens`)

    const tokenMint = getTokenMint()
    if (!tokenMint) {
      console.warn('⚠️ Token mint not configured - cannot execute buy')
      return null
    }

    try {
      // Check if token has graduated from bonding curve
      const isGraduated = await this.checkIsGraduated()

      let signature: string | null = null
      let outputAmount: number = 0

      if (isGraduated) {
        // Use Jupiter for graduated tokens
        const quote = await this.getJupiterQuote(
          SOL_MINT,
          tokenMint.toString(),
          lamports
        )

        if (!quote) {
          console.error('Failed to get Jupiter buy quote')
          return null
        }

        signature = await this.executeSwap(quote)
        outputAmount = quote.outAmount / Math.pow(10, env.tokenDecimals)
      } else {
        // Use Bags.fm for bonding curve tokens
        const quote = await bagsFmService.getTradeQuote(
          SOL_MINT,
          tokenMint.toString(),
          lamports,
          'buy'
        )

        if (!quote || !quote.rawQuoteResponse) {
          console.error('Failed to get Bags.fm buy quote')
          return null
        }

        signature = await this.executeBagsFmSwap(quote.rawQuoteResponse)
        outputAmount = quote.outputAmount / Math.pow(10, env.tokenDecimals)
      }

      if (!signature) {
        return null
      }

      this.lastOrderTime = new Date()

      const txRecord: TxRecord = {
        id: signature,
        type: 'buy',
        amount: outputAmount,
        token: env.tokenSymbol || 'TOKEN',
        signature,
        status: 'confirmed',
        created_at: new Date(),
      }

      // Record transaction to Supabase for live feed
      await insertTransaction({
        type: 'buy',
        amount: outputAmount,
        token: env.tokenSymbol || 'TOKEN',
        signature,
        status: 'confirmed',
      })

      return txRecord
    } catch (error) {
      console.error('❌ Buy order failed:', error)
      return null
    }
  }

  async executeSell(tokenAmount: number, options?: { bypassCap?: boolean }): Promise<TxRecord | null> {
    if (!this.isEnabled) {
      console.log('ℹ️ Market making is disabled')
      return null
    }

    if (!this.opsWallet) {
      console.warn('⚠️ Ops wallet not configured')
      return null
    }

    const tokenMint = getTokenMint()
    if (!tokenMint) {
      console.warn('⚠️ Token mint not configured - cannot execute sell')
      return null
    }

    // Check if we have enough tokens
    const tokenBalance = await getTokenBalance(this.opsWallet.publicKey, tokenMint)
    if (tokenBalance < tokenAmount) {
      console.log(`ℹ️ Insufficient token balance for sell (${tokenBalance} < ${tokenAmount})`)
      return null
    }

    // Cap the sell amount (unless bypassed for internal flywheel operations)
    const cappedAmount = options?.bypassCap ? tokenAmount : Math.min(tokenAmount, env.maxSellAmountTokens)
    const tokenUnits = Math.floor(cappedAmount * Math.pow(10, env.tokenDecimals))

    console.log(`🔴 Executing SELL: ${cappedAmount.toFixed(0)} CLAUDE → SOL`)

    try {
      // Check if token has graduated from bonding curve
      const isGraduated = await this.checkIsGraduated()

      let signature: string | null = null

      if (isGraduated) {
        // Use Jupiter for graduated tokens
        const quote = await this.getJupiterQuote(
          tokenMint.toString(),
          SOL_MINT,
          tokenUnits
        )

        if (!quote) {
          console.error('Failed to get Jupiter sell quote')
          return null
        }

        signature = await this.executeSwap(quote)
      } else {
        // Use Bags.fm for bonding curve tokens
        const quote = await bagsFmService.getTradeQuote(
          tokenMint.toString(),
          SOL_MINT,
          tokenUnits,
          'sell'
        )

        if (!quote || !quote.rawQuoteResponse) {
          console.error('Failed to get Bags.fm sell quote')
          return null
        }

        signature = await this.executeBagsFmSwap(quote.rawQuoteResponse)
      }

      if (!signature) {
        return null
      }

      this.lastOrderTime = new Date()

      const txRecord: TxRecord = {
        id: signature,
        type: 'sell',
        amount: cappedAmount,
        token: env.tokenSymbol || 'TOKEN',
        signature,
        status: 'confirmed',
        created_at: new Date(),
      }

      // Record transaction to Supabase for live feed
      await insertTransaction({
        type: 'sell',
        amount: cappedAmount,
        token: env.tokenSymbol || 'TOKEN',
        signature,
        status: 'confirmed',
      })

      return txRecord
    } catch (error) {
      console.error('❌ Sell order failed:', error)
      return null
    }
  }

  getStats() {
    return {
      isEnabled: this.isEnabled,
      lastOrderTime: this.lastOrderTime,
      isGraduated: this.isGraduated,
      tradingVia: this.isGraduated ? 'Jupiter' : 'Bags.fm (bonding curve)',
    }
  }
}

// Singleton instance
export const marketMaker = new MarketMaker()
