// ═══════════════════════════════════════════════════════════════════════════
// FAST CLAIM SERVICE
// High-frequency fee claiming - checks every 30 seconds, claims when >= 0.15 SOL
// Optimized for speed with batch position checking and parallel execution
// ═══════════════════════════════════════════════════════════════════════════

import { Connection, Transaction, VersionedTransaction, sendAndConfirmTransaction, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { supabase } from '../config/database'
import { getConnection, getOpsWallet, getSolPrice } from '../config/solana'
import { env } from '../config/env'
import { bagsFmService, ClaimablePosition } from './bags-fm'
import {
  UserToken,
  getTokensForAutoClaim,
  getDecryptedDevWallet,
} from './user-token.service'

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Minimum claimable amount to trigger a claim (0.15 SOL)
const MIN_CLAIM_THRESHOLD_SOL = parseFloat(process.env.FAST_CLAIM_THRESHOLD_SOL || '0.15')

// Max concurrent claims to avoid rate limiting
const MAX_CONCURRENT_CLAIMS = parseInt(process.env.FAST_CLAIM_MAX_CONCURRENT || '5', 10)

// Delay between claim batches (ms)
const BATCH_DELAY_MS = parseInt(process.env.FAST_CLAIM_BATCH_DELAY_MS || '500', 10)

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ClaimableToken {
  token: UserToken
  position: ClaimablePosition
}

interface FastClaimResult {
  userTokenId: string
  tokenSymbol: string
  tokenMint: string
  amountClaimedSol: number
  platformFeeSol: number
  userReceivedSol: number
  success: boolean
  signature?: string
  error?: string
  claimedAt: string
}

interface FastClaimCycleResult {
  cycleStartedAt: string
  cycleCompletedAt: string
  tokensChecked: number
  tokensClaimable: number
  claimsAttempted: number
  claimsSuccessful: number
  claimsFailed: number
  totalClaimedSol: number
  totalPlatformFeeSol: number
  totalUserReceivedSol: number
  results: FastClaimResult[]
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class FastClaimService {
  private isRunning = false
  private lastCycleAt: Date | null = null
  private cycleCount = 0

  /**
   * Run a fast claim cycle
   * Checks all tokens and claims any with >= 0.15 SOL claimable
   */
  async runFastClaimCycle(): Promise<FastClaimCycleResult> {
    if (this.isRunning) {
      console.log('⚡ Fast claim cycle already in progress, skipping')
      return this.emptyResult()
    }

    this.isRunning = true
    this.cycleCount++
    const cycleStartedAt = new Date().toISOString()

    console.log(`\n⚡ FAST CLAIM CYCLE #${this.cycleCount} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`   Threshold: ${MIN_CLAIM_THRESHOLD_SOL} SOL | Concurrency: ${MAX_CONCURRENT_CLAIMS}`)

    const results: FastClaimResult[] = []
    let tokensChecked = 0
    let tokensClaimable = 0

    try {
      // Step 1: Get all tokens with auto-claim enabled
      const tokens = await getTokensForAutoClaim()
      tokensChecked = tokens.length

      if (tokens.length === 0) {
        console.log('   No tokens with auto-claim enabled')
        return this.emptyResult()
      }

      console.log(`   Checking ${tokens.length} tokens for claimable fees...`)

      // Step 2: Group tokens by dev wallet to minimize API calls
      const walletToTokens = this.groupTokensByDevWallet(tokens)
      console.log(`   ${Object.keys(walletToTokens).length} unique dev wallets to check`)

      // Step 3: Batch check claimable positions for all wallets
      const claimableTokens = await this.batchCheckClaimablePositions(walletToTokens)
      tokensClaimable = claimableTokens.length

      if (claimableTokens.length === 0) {
        console.log(`   No tokens with >= ${MIN_CLAIM_THRESHOLD_SOL} SOL claimable`)
        this.lastCycleAt = new Date()
        this.isRunning = false
        return {
          ...this.emptyResult(),
          cycleStartedAt,
          cycleCompletedAt: new Date().toISOString(),
          tokensChecked,
        }
      }

      console.log(`\n   💰 Found ${claimableTokens.length} tokens ready to claim:`)
      claimableTokens.forEach(ct => {
        console.log(`      • ${ct.token.token_symbol}: ${ct.position.claimableAmount.toFixed(4)} SOL`)
      })

      // Step 4: Execute claims in parallel batches
      const claimResults = await this.executeClaimsInBatches(claimableTokens)
      results.push(...claimResults)

    } catch (error: any) {
      console.error(`   ❌ Fast claim cycle error: ${error.message}`)
    } finally {
      this.isRunning = false
      this.lastCycleAt = new Date()
    }

    const cycleCompletedAt = new Date().toISOString()
    const successful = results.filter(r => r.success)
    const failed = results.filter(r => !r.success)
    const totalClaimed = successful.reduce((sum, r) => sum + r.amountClaimedSol, 0)
    const totalPlatformFee = successful.reduce((sum, r) => sum + r.platformFeeSol, 0)
    const totalUserReceived = successful.reduce((sum, r) => sum + r.userReceivedSol, 0)

    // Summary
    console.log(`\n   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`   ✅ Successful: ${successful.length} | ❌ Failed: ${failed.length}`)
    console.log(`   💰 Total Claimed: ${totalClaimed.toFixed(4)} SOL`)
    console.log(`   🎡 Platform Fee (10%): ${totalPlatformFee.toFixed(4)} SOL → WHEEL`)
    console.log(`   👤 User Received (90%): ${totalUserReceived.toFixed(4)} SOL`)
    console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

    return {
      cycleStartedAt,
      cycleCompletedAt,
      tokensChecked,
      tokensClaimable,
      claimsAttempted: results.length,
      claimsSuccessful: successful.length,
      claimsFailed: failed.length,
      totalClaimedSol: totalClaimed,
      totalPlatformFeeSol: totalPlatformFee,
      totalUserReceivedSol: totalUserReceived,
      results,
    }
  }

  /**
   * Group tokens by dev wallet address for efficient batch checking
   */
  private groupTokensByDevWallet(tokens: UserToken[]): Record<string, UserToken[]> {
    const walletToTokens: Record<string, UserToken[]> = {}

    for (const token of tokens) {
      const wallet = token.dev_wallet_address
      if (!walletToTokens[wallet]) {
        walletToTokens[wallet] = []
      }
      walletToTokens[wallet].push(token)
    }

    return walletToTokens
  }

  /**
   * Batch check claimable positions for all wallets
   * Returns tokens with >= MIN_CLAIM_THRESHOLD_SOL claimable
   */
  private async batchCheckClaimablePositions(
    walletToTokens: Record<string, UserToken[]>
  ): Promise<ClaimableToken[]> {
    const claimableTokens: ClaimableToken[] = []
    const wallets = Object.keys(walletToTokens)

    // Check all wallets in parallel (with some rate limiting)
    const BATCH_SIZE = 10
    for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
      const batch = wallets.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.allSettled(
        batch.map(async (wallet) => {
          const positions = await bagsFmService.getClaimablePositions(wallet)
          return { wallet, positions }
        })
      )

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.positions) {
          const { wallet, positions } = result.value
          const tokens = walletToTokens[wallet]

          for (const token of tokens) {
            const position = positions.find(p => p.tokenMint === token.token_mint_address)
            if (position && position.claimableAmount >= MIN_CLAIM_THRESHOLD_SOL) {
              claimableTokens.push({ token, position })
            }
          }
        }
      }

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < wallets.length) {
        await this.sleep(200)
      }
    }

    return claimableTokens
  }

  /**
   * Execute claims in parallel batches
   */
  private async executeClaimsInBatches(claimableTokens: ClaimableToken[]): Promise<FastClaimResult[]> {
    const results: FastClaimResult[] = []

    // Process in batches of MAX_CONCURRENT_CLAIMS
    for (let i = 0; i < claimableTokens.length; i += MAX_CONCURRENT_CLAIMS) {
      const batch = claimableTokens.slice(i, i + MAX_CONCURRENT_CLAIMS)

      console.log(`\n   Processing batch ${Math.floor(i / MAX_CONCURRENT_CLAIMS) + 1}/${Math.ceil(claimableTokens.length / MAX_CONCURRENT_CLAIMS)}...`)

      const batchResults = await Promise.allSettled(
        batch.map(ct => this.executeSingleClaim(ct))
      )

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j]
        const ct = batch[j]

        if (result.status === 'fulfilled') {
          results.push(result.value)
        } else {
          results.push({
            userTokenId: ct.token.id,
            tokenSymbol: ct.token.token_symbol,
            tokenMint: ct.token.token_mint_address,
            amountClaimedSol: 0,
            platformFeeSol: 0,
            userReceivedSol: 0,
            success: false,
            error: result.reason?.message || 'Unknown error',
            claimedAt: new Date().toISOString(),
          })
        }
      }

      // Delay between batches
      if (i + MAX_CONCURRENT_CLAIMS < claimableTokens.length) {
        await this.sleep(BATCH_DELAY_MS)
      }
    }

    return results
  }

  /**
   * Execute a single claim for a token
   */
  private async executeSingleClaim(claimable: ClaimableToken): Promise<FastClaimResult> {
    const { token, position } = claimable
    const claimedAt = new Date().toISOString()

    try {
      console.log(`      ⚡ Claiming ${position.claimableAmount.toFixed(4)} SOL for ${token.token_symbol}...`)

      // Get decrypted dev wallet
      const devWallet = await getDecryptedDevWallet(token.id)
      if (!devWallet) {
        throw new Error('Failed to decrypt dev wallet')
      }

      // Generate claim transactions
      const claimTxs = await bagsFmService.generateClaimTransactions(
        token.dev_wallet_address,
        [token.token_mint_address]
      )

      if (!claimTxs || claimTxs.length === 0) {
        throw new Error('Failed to generate claim transactions')
      }

      // Execute claim transactions
      const connection = getConnection()
      let lastSignature: string | undefined

      for (const txBase64 of claimTxs) {
        const signature = await this.signAndSendTransaction(connection, txBase64, devWallet)
        if (signature) {
          lastSignature = signature
        }
      }

      if (!lastSignature) {
        throw new Error('Claim transaction failed')
      }

      // Transfer to ops wallet with platform fee split
      let platformFeeSol = 0
      let userReceivedSol = position.claimableAmount

      if (token.ops_wallet_address) {
        const transferResult = await this.transferWithPlatformFee(
          connection,
          devWallet,
          token.ops_wallet_address,
          position.claimableAmount,
          token.token_symbol
        )
        platformFeeSol = transferResult.platformFeeSol
        userReceivedSol = transferResult.userAmountSol
      }

      // Record the claim
      await this.recordClaim(token.id, position.claimableAmount, lastSignature, platformFeeSol, userReceivedSol)

      console.log(`      ✅ ${token.token_symbol}: Claimed ${position.claimableAmount.toFixed(4)} SOL (tx: ${lastSignature.slice(0, 8)}...)`)

      return {
        userTokenId: token.id,
        tokenSymbol: token.token_symbol,
        tokenMint: token.token_mint_address,
        amountClaimedSol: position.claimableAmount,
        platformFeeSol,
        userReceivedSol,
        success: true,
        signature: lastSignature,
        claimedAt,
      }
    } catch (error: any) {
      console.log(`      ❌ ${token.token_symbol}: ${error.message}`)
      return {
        userTokenId: token.id,
        tokenSymbol: token.token_symbol,
        tokenMint: token.token_mint_address,
        amountClaimedSol: 0,
        platformFeeSol: 0,
        userReceivedSol: 0,
        success: false,
        error: error.message,
        claimedAt,
      }
    }
  }

  /**
   * Sign and send a transaction
   */
  private async signAndSendTransaction(
    connection: Connection,
    txBase64: string,
    signer: Keypair
  ): Promise<string | null> {
    try {
      const txBuffer = Buffer.from(txBase64, 'base64')

      let signature: string
      try {
        // Try VersionedTransaction first
        const versionedTx = VersionedTransaction.deserialize(txBuffer)
        versionedTx.sign([signer])
        signature = await connection.sendTransaction(versionedTx, {
          skipPreflight: false,
          maxRetries: 3,
        })
      } catch {
        // Fall back to legacy transaction
        const legacyTx = Transaction.from(txBuffer)
        legacyTx.sign(signer)
        signature = await connection.sendRawTransaction(legacyTx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        })
      }

      // Wait for confirmation with timeout
      const latestBlockhash = await connection.getLatestBlockhash()
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }, 'confirmed')

      return signature
    } catch (error: any) {
      console.error(`      Transaction failed: ${error.message}`)
      return null
    }
  }

  /**
   * Transfer SOL with platform fee split
   * 10% goes to WHEEL ops wallet, 90% goes to user's ops wallet
   */
  private async transferWithPlatformFee(
    connection: Connection,
    fromWallet: Keypair,
    userOpsWalletAddress: string,
    amountSol: number,
    tokenSymbol: string
  ): Promise<{ success: boolean; platformFeeSol: number; userAmountSol: number }> {
    try {
      // Reserve some SOL for rent and future transactions
      const reserveSol = 0.005
      const transferAmount = Math.max(0, amountSol - reserveSol)

      if (transferAmount <= 0) {
        return { success: true, platformFeeSol: 0, userAmountSol: 0 }
      }

      // Calculate 10% platform fee
      const platformFeePercent = env.platformFeePercentage || 10
      const platformFeeSol = transferAmount * (platformFeePercent / 100)
      const userAmountSol = transferAmount - platformFeeSol

      // Get WHEEL platform ops wallet
      const platformOpsWallet = getOpsWallet()

      // Transfer 1: Platform fee to WHEEL ops wallet (10%)
      if (platformOpsWallet && platformFeeSol >= 0.001) {
        try {
          const platformTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: fromWallet.publicKey,
              toPubkey: platformOpsWallet.publicKey,
              lamports: Math.floor(platformFeeSol * 1e9),
            })
          )

          const platformSig = await sendAndConfirmTransaction(connection, platformTx, [fromWallet], {
            commitment: 'confirmed',
          })
          console.log(`      🎡 ${tokenSymbol}: Platform fee ${platformFeeSol.toFixed(4)} SOL → WHEEL (${platformSig.slice(0, 8)}...)`)
        } catch (err: any) {
          console.error(`      ⚠️ ${tokenSymbol}: Platform fee transfer failed: ${err.message}`)
        }
      }

      // Transfer 2: User's portion to their ops wallet (90%)
      if (userAmountSol >= 0.001) {
        try {
          const userTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: fromWallet.publicKey,
              toPubkey: new PublicKey(userOpsWalletAddress),
              lamports: Math.floor(userAmountSol * 1e9),
            })
          )

          const userSig = await sendAndConfirmTransaction(connection, userTx, [fromWallet], {
            commitment: 'confirmed',
          })
          console.log(`      👤 ${tokenSymbol}: User portion ${userAmountSol.toFixed(4)} SOL → ops wallet (${userSig.slice(0, 8)}...)`)
        } catch (err: any) {
          console.error(`      ⚠️ ${tokenSymbol}: User transfer failed: ${err.message}`)
        }
      }

      return { success: true, platformFeeSol, userAmountSol }
    } catch (error: any) {
      console.error(`      ⚠️ Transfer failed: ${error.message}`)
      return { success: false, platformFeeSol: 0, userAmountSol: 0 }
    }
  }

  /**
   * Record claim in database
   */
  private async recordClaim(
    userTokenId: string,
    amountSol: number,
    signature: string,
    platformFeeSol: number,
    userReceivedSol: number
  ): Promise<void> {
    if (!supabase) return

    try {
      // Fetch current SOL price for USD value tracking
      let amountUsd = 0
      try {
        const solPrice = await getSolPrice()
        amountUsd = amountSol * solPrice
      } catch (priceError) {
        console.warn('Failed to fetch SOL price for USD calculation:', priceError)
      }

      await supabase.from('user_claim_history').insert([{
        user_token_id: userTokenId,
        amount_sol: amountSol,
        amount_usd: amountUsd,
        platform_fee_sol: platformFeeSol,
        user_received_sol: userReceivedSol,
        transaction_signature: signature,
        claimed_at: new Date().toISOString(),
      }])

      // Also record as transaction for activity feed
      const usdStr = amountUsd > 0 ? ` ($${amountUsd.toFixed(2)})` : ''
      await supabase.from('user_transactions').insert([{
        user_token_id: userTokenId,
        type: 'transfer',
        amount: amountSol,
        signature,
        message: `Claimed ${amountSol.toFixed(4)} SOL${usdStr} fees (${platformFeeSol.toFixed(4)} platform fee)`,
        status: 'confirmed',
      }])
    } catch (error) {
      console.error('Failed to record claim:', error)
    }
  }

  private emptyResult(): FastClaimCycleResult {
    return {
      cycleStartedAt: new Date().toISOString(),
      cycleCompletedAt: new Date().toISOString(),
      tokensChecked: 0,
      tokensClaimable: 0,
      claimsAttempted: 0,
      claimsSuccessful: 0,
      claimsFailed: 0,
      totalClaimedSol: 0,
      totalPlatformFeeSol: 0,
      totalUserReceivedSol: 0,
      results: [],
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  getStatus(): {
    isRunning: boolean
    lastCycleAt: Date | null
    cycleCount: number
    threshold: number
  } {
    return {
      isRunning: this.isRunning,
      lastCycleAt: this.lastCycleAt,
      cycleCount: this.cycleCount,
      threshold: MIN_CLAIM_THRESHOLD_SOL,
    }
  }

  isJobRunning(): boolean {
    return this.isRunning
  }

  getLastCycleAt(): Date | null {
    return this.lastCycleAt
  }
}

export const fastClaimService = new FastClaimService()
