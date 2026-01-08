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
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
    })

    // Try multiple API endpoints with retry logic
    // Note: quote-api.jup.ag may have DNS issues on some hosts
    // api.jup.ag/swap/v1 requires API key
    const apiUrls = [
      env.jupiterApiUrl,
      'https://public.jupiterapi.com', // Alternative public endpoint
      'https://lite.jup.ag/v6', // Lite version
      'https://quote-api.jup.ag/v6', // Original endpoint (may have DNS issues)
    ]

    for (let attempt = 0; attempt < 3; attempt++) {
      for (const apiUrl of apiUrls) {
        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 10000) // 10s timeout

          const response = await fetch(`${apiUrl}/quote?${params}`, {
            signal: controller.signal,
          })

          clearTimeout(timeout)

          if (!response.ok) {
            console.warn(`Jupiter quote failed from ${apiUrl}: ${response.statusText}`)
            continue
          }

          const data = await response.json()
          if (data) {
            console.log(`✅ Got Jupiter quote from ${apiUrl}`)
            return data
          }
        } catch (error: any) {
          if (error.name === 'AbortError') {
            console.warn(`Jupiter API timeout from ${apiUrl}`)
          } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('getaddrinfo')) {
            console.warn(`Jupiter API DNS error from ${apiUrl}: ${error.message}`)
          } else {
            console.warn(`Jupiter API error from ${apiUrl}:`, error.message)
          }
        }
      }
      // Wait before retry
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)))
      }
    }

    console.error('Failed to get Jupiter quote after all retries')
    return null
  }

  async executeSwap(quoteResponse: any): Promise<string | null> {
    if (!this.opsWallet) {
      console.warn('⚠️ Ops wallet not configured')
      return null
    }

    // Try multiple API endpoints
    const apiUrls = [
      env.jupiterApiUrl,
      'https://public.jupiterapi.com',
      'https://lite.jup.ag/v6',
      'https://quote-api.jup.ag/v6',
    ]

    let swapTransaction: string | null = null

    for (const apiUrl of apiUrls) {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15000) // 15s timeout

        const swapResponse = await fetch(`${apiUrl}/swap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quoteResponse,
            userPublicKey: this.opsWallet.publicKey.toString(),
            wrapAndUnwrapSol: true,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeout)

        if (!swapResponse.ok) {
          console.warn(`Jupiter swap failed from ${apiUrl}: ${swapResponse.statusText}`)
          continue
        }

        const data = await swapResponse.json() as { swapTransaction: string }
        swapTransaction = data.swapTransaction
        console.log(`✅ Got Jupiter swap transaction from ${apiUrl}`)
        break
      } catch (error: any) {
        console.warn(`Jupiter swap API error from ${apiUrl}:`, error.message)
      }
    }

    if (!swapTransaction) {
      console.error('Failed to get Jupiter swap transaction from all endpoints')
      return null
    }

    try {
      // Deserialize and sign transaction
      const transactionBuf = Buffer.from(swapTransaction, 'base64')
      const transaction = VersionedTransaction.deserialize(transactionBuf)
      transaction.sign([this.opsWallet])

      // Send transaction with skipPreflight for faster submission
      const signature = await connection.sendTransaction(transaction, {
        maxRetries: 5,
        skipPreflight: true,
        preflightCommitment: 'processed',
      })

      console.log(`📤 Transaction sent: ${signature}`)

      // Wait for confirmation with robust timeout handling
      const maxRetries = 4
      const retryDelays = [5000, 10000, 15000, 20000]

      try {
        await connection.confirmTransaction(signature, 'confirmed')
        console.log(`✅ Swap executed! Signature: ${signature}`)
        return signature
      } catch (confirmError: any) {
        if (confirmError?.message?.includes('not confirmed in')) {
          console.warn(`⏱️ Confirmation timed out, checking transaction status...`)

          for (let i = 0; i < maxRetries; i++) {
            await new Promise(resolve => setTimeout(resolve, retryDelays[i]))

            try {
              const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true })

              if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
                console.log(`✅ Transaction confirmed on attempt ${i + 1}! Signature: ${signature}`)
                return signature
              }

              if (status?.value?.err) {
                console.error(`❌ Transaction failed with error: ${JSON.stringify(status.value.err)}`)
                break
              }

              console.log(`   Attempt ${i + 1}/${maxRetries}: Status = ${status?.value?.confirmationStatus || 'pending'}`)
            } catch (statusError) {
              console.warn(`   Attempt ${i + 1}/${maxRetries}: Could not get status`)
            }
          }

          console.warn(`⚠️ Transaction status uncertain after ${maxRetries} retries: ${signature}`)
          console.warn(`   Check Solana Explorer: https://solscan.io/tx/${signature}`)
          return signature
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

      // Send transaction with skipPreflight for faster submission
      const signature = await connection.sendTransaction(transaction, {
        maxRetries: 5,
        skipPreflight: true,
        preflightCommitment: 'processed',
      })

      console.log(`📤 Transaction sent: ${signature}`)

      // Wait for confirmation with robust timeout handling
      // Solana network can be slow, especially during congestion
      const maxRetries = 4
      const retryDelays = [5000, 10000, 15000, 20000] // 5s, 10s, 15s, 20s

      try {
        await connection.confirmTransaction(signature, 'confirmed')
        console.log(`✅ Bags.fm swap executed! Signature: ${signature}`)
        return signature
      } catch (confirmError: any) {
        // Check if it's a timeout error - the transaction might have succeeded
        if (confirmError?.message?.includes('not confirmed in')) {
          console.warn(`⏱️ Confirmation timed out, checking transaction status...`)

          // Multiple retry attempts with increasing delays
          for (let i = 0; i < maxRetries; i++) {
            await new Promise(resolve => setTimeout(resolve, retryDelays[i]))

            try {
              const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true })

              if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
                console.log(`✅ Transaction confirmed on attempt ${i + 1}! Signature: ${signature}`)
                return signature
              }

              // If we got an error status, the transaction failed
              if (status?.value?.err) {
                console.error(`❌ Transaction failed with error: ${JSON.stringify(status.value.err)}`)
                break
              }

              console.log(`   Attempt ${i + 1}/${maxRetries}: Status = ${status?.value?.confirmationStatus || 'pending'}`)
            } catch (statusError) {
              console.warn(`   Attempt ${i + 1}/${maxRetries}: Could not get status`)
            }
          }

          // After all retries, assume the transaction may have succeeded
          // The next cycle will see updated balances if it did
          console.warn(`⚠️ Transaction status uncertain after ${maxRetries} retries: ${signature}`)
          console.warn(`   Check Solana Explorer: https://solscan.io/tx/${signature}`)
          // Return the signature anyway - if the tx succeeded, we want to track it
          // If it failed, the next cycle will just retry
          return signature
        }
        throw confirmError
      }
    } catch (error: any) {
      console.error('❌ Bags.fm swap execution failed:')

      // Parse and explain common instruction errors
      const errorStr = JSON.stringify(error, Object.getOwnPropertyNames(error), 2)

      if (errorStr.includes('InstructionError')) {
        console.error('⚠️ Transaction instruction error - likely slippage exceeded or price moved')
        console.error('   The swap was attempted but failed on-chain. This can happen when:')
        console.error('   1. Price moved more than slippage tolerance during execution')
        console.error('   2. Bonding curve state changed between quote and execution')
        console.error('   3. Insufficient liquidity at the quoted price')
        console.error('   Will retry on next cycle with fresh quote.')
      } else if (error?.logs) {
        console.error('Transaction logs:', error.logs)
      }

      if (error?.message) {
        console.error('Error message:', error.message)
      }
      console.error('Full error:', errorStr)
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
