import { Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js'
import { connection, getTokenMint, getBalance, getTokenBalance } from '../config/solana'
import { env } from '../config/env'
import type { Transaction as TxRecord, MarketMakingOrder } from '../types'

// ═══════════════════════════════════════════════════════════════════════════
// MARKET MAKER SERVICE
// Executes buy/sell orders using Jupiter for optimal routing
// ═══════════════════════════════════════════════════════════════════════════

// SOL mint address
const SOL_MINT = 'So11111111111111111111111111111111111111112'

export class MarketMaker {
  private opsWallet: Keypair | null = null
  private lastOrderTime: Date | null = null
  private isEnabled: boolean = env.marketMakingEnabled

  constructor(opsWallet?: Keypair) {
    this.opsWallet = opsWallet || null
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

      const { swapTransaction } = await swapResponse.json()

      // Deserialize and sign transaction
      const transactionBuf = Buffer.from(swapTransaction, 'base64')
      const transaction = VersionedTransaction.deserialize(transactionBuf)
      transaction.sign([this.opsWallet])

      // Send transaction
      const signature = await connection.sendTransaction(transaction, {
        maxRetries: 3,
      })

      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed')

      console.log(`✅ Swap executed! Signature: ${signature}`)
      return signature
    } catch (error) {
      console.error('❌ Swap execution failed:', error)
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
      // Get quote
      const quote = await this.getJupiterQuote(
        SOL_MINT,
        tokenMint.toString(),
        lamports
      )

      if (!quote) {
        console.error('Failed to get buy quote')
        return null
      }

      // Execute swap
      const signature = await this.executeSwap(quote)
      if (!signature) {
        return null
      }

      this.lastOrderTime = new Date()

      const txRecord: TxRecord = {
        id: signature,
        type: 'buy',
        amount: quote.outAmount / Math.pow(10, env.tokenDecimals),
        token: 'CLAUDE',
        signature,
        status: 'confirmed',
        created_at: new Date(),
      }

      return txRecord
    } catch (error) {
      console.error('❌ Buy order failed:', error)
      return null
    }
  }

  async executeSell(tokenAmount: number): Promise<TxRecord | null> {
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

    // Cap the sell amount
    const cappedAmount = Math.min(tokenAmount, env.maxSellAmountTokens)
    const tokenUnits = Math.floor(cappedAmount * Math.pow(10, env.tokenDecimals))

    console.log(`🔴 Executing SELL: ${cappedAmount.toFixed(0)} CLAUDE → SOL`)

    try {
      // Get quote
      const quote = await this.getJupiterQuote(
        tokenMint.toString(),
        SOL_MINT,
        tokenUnits
      )

      if (!quote) {
        console.error('Failed to get sell quote')
        return null
      }

      // Execute swap
      const signature = await this.executeSwap(quote)
      if (!signature) {
        return null
      }

      this.lastOrderTime = new Date()

      const txRecord: TxRecord = {
        id: signature,
        type: 'sell',
        amount: cappedAmount,
        token: 'CLAUDE',
        signature,
        status: 'confirmed',
        created_at: new Date(),
      }

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
    }
  }
}

// Singleton instance
export const marketMaker = new MarketMaker()
