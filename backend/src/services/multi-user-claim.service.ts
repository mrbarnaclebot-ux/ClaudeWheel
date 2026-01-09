// ═══════════════════════════════════════════════════════════════════════════
// MULTI-USER CLAIM SERVICE
// Handles automated fee claiming for all users with auto-claim enabled
// ═══════════════════════════════════════════════════════════════════════════

import { Connection, Transaction, VersionedTransaction, sendAndConfirmTransaction, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import bs58 from 'bs58'
import { supabase } from '../config/database'
import { getConnection, getOpsWallet } from '../config/solana'
import { env } from '../config/env'
import { bagsFmService, ClaimablePosition } from './bags-fm'
import { loggers } from '../utils/logger'
import {
  UserToken,
  getTokensForAutoClaim,
  getDecryptedDevWallet,
  getTokenConfig,
} from './user-token.service'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ClaimResult {
  userTokenId: string
  tokenMint: string
  tokenSymbol: string
  success: boolean
  amountClaimedSol: number
  signature?: string
  error?: string
}

export interface BatchClaimResult {
  totalTokensProcessed: number
  successfulClaims: number
  failedClaims: number
  totalClaimedSol: number
  results: ClaimResult[]
  startedAt: string
  completedAt: string
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class MultiUserClaimService {
  private isRunning = false
  private lastRunAt: Date | null = null

  /**
   * Run claims for all users with auto-claim enabled
   * Called by the scheduled claim job
   */
  async runBatchClaim(maxTokensPerCycle: number = 100): Promise<BatchClaimResult> {
    if (this.isRunning) {
      loggers.claim.warn('Batch claim already in progress, skipping')
      return {
        totalTokensProcessed: 0,
        successfulClaims: 0,
        failedClaims: 0,
        totalClaimedSol: 0,
        results: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      }
    }

    this.isRunning = true
    const startedAt = new Date().toISOString()
    const results: ClaimResult[] = []

    loggers.claim.info('Starting multi-user claim job')

    try {
      // Get all tokens with auto-claim enabled
      const tokens = await getTokensForAutoClaim()
      const tokensToProcess = tokens.slice(0, maxTokensPerCycle)

      loggers.claim.info({ totalTokens: tokens.length, processingCount: tokensToProcess.length, maxTokensPerCycle }, 'Found tokens with auto-claim enabled')

      for (const token of tokensToProcess) {
        try {
          const result = await this.claimForToken(token)
          results.push(result)

          if (result.success) {
            loggers.claim.info({ tokenSymbol: token.token_symbol, amountClaimedSol: result.amountClaimedSol, signature: result.signature }, 'Claimed fees successfully')
          } else if (result.error?.includes('Nothing to claim')) {
            loggers.claim.debug({ tokenSymbol: token.token_symbol }, 'Nothing to claim')
          } else {
            loggers.claim.warn({ tokenSymbol: token.token_symbol, error: result.error }, 'Claim failed')
          }

          // Small delay between claims to avoid rate limiting
          await this.sleep(1000)
        } catch (error: any) {
          loggers.claim.error({ tokenSymbol: token.token_symbol, tokenMint: token.token_mint_address, error: String(error) }, 'Unexpected error claiming fees')
          results.push({
            userTokenId: token.id,
            tokenMint: token.token_mint_address,
            tokenSymbol: token.token_symbol,
            success: false,
            amountClaimedSol: 0,
            error: error.message,
          })
        }
      }
    } finally {
      this.isRunning = false
      this.lastRunAt = new Date()
    }

    const completedAt = new Date().toISOString()
    const successfulClaims = results.filter(r => r.success).length
    const totalClaimedSol = results.reduce((sum, r) => sum + r.amountClaimedSol, 0)

    loggers.claim.info({ successfulClaims, totalResults: results.length, totalClaimedSol }, 'Claim job completed')

    return {
      totalTokensProcessed: results.length,
      successfulClaims,
      failedClaims: results.filter(r => !r.success && !r.error?.includes('Nothing to claim')).length,
      totalClaimedSol,
      results,
      startedAt,
      completedAt,
    }
  }

  /**
   * Claim fees for a specific token
   */
  async claimForToken(token: UserToken): Promise<ClaimResult> {
    const baseResult = {
      userTokenId: token.id,
      tokenMint: token.token_mint_address,
      tokenSymbol: token.token_symbol,
    }

    try {
      // Get token config for fee threshold
      const config = await getTokenConfig(token.id)
      const feeThreshold = config?.fee_threshold_sol || 0.01

      // Check claimable positions
      const positions = await bagsFmService.getClaimablePositions(token.dev_wallet_address)

      if (!positions || positions.length === 0) {
        return { ...baseResult, success: false, amountClaimedSol: 0, error: 'Nothing to claim' }
      }

      // Find position for this token
      const position = positions.find(p => p.tokenMint === token.token_mint_address)

      if (!position || position.claimableAmount < feeThreshold) {
        return {
          ...baseResult,
          success: false,
          amountClaimedSol: 0,
          error: `Nothing to claim (${position?.claimableAmount || 0} SOL < ${feeThreshold} threshold)`,
        }
      }

      // Get decrypted dev wallet
      const devWallet = await getDecryptedDevWallet(token.id)
      if (!devWallet) {
        return { ...baseResult, success: false, amountClaimedSol: 0, error: 'Failed to decrypt dev wallet' }
      }

      // Generate claim transactions
      const claimTxs = await bagsFmService.generateClaimTransactions(
        token.dev_wallet_address,
        [token.token_mint_address]
      )

      if (!claimTxs || claimTxs.length === 0) {
        return { ...baseResult, success: false, amountClaimedSol: 0, error: 'Failed to generate claim transactions' }
      }

      // Execute the claim transactions
      const connection = getConnection()
      let lastSignature: string | undefined

      for (const txBase64 of claimTxs) {
        const signature = await this.signAndSendTransaction(connection, txBase64, devWallet)
        if (signature) {
          lastSignature = signature
        }
      }

      if (!lastSignature) {
        return { ...baseResult, success: false, amountClaimedSol: 0, error: 'Transaction failed' }
      }

      // Transfer to ops wallet if configured (with platform fee split)
      let platformFeeSol = 0
      let userReceivedSol = position.claimableAmount
      if (token.ops_wallet_address) {
        const transferResult = await this.transferToOpsWallet(
          connection,
          devWallet,
          token.ops_wallet_address,
          position.claimableAmount
        )
        platformFeeSol = transferResult.platformFeeSol
        userReceivedSol = transferResult.userAmountSol
      }

      // Record the claim with platform fee tracking
      await this.recordClaim(token.id, position.claimableAmount, lastSignature, platformFeeSol, userReceivedSol)

      return {
        ...baseResult,
        success: true,
        amountClaimedSol: position.claimableAmount,
        signature: lastSignature,
      }
    } catch (error: any) {
      return { ...baseResult, success: false, amountClaimedSol: 0, error: error.message }
    }
  }

  /**
   * Manual claim for a specific token (user-initiated)
   */
  async manualClaim(userTokenId: string): Promise<ClaimResult> {
    // Get the token
    const { data: token } = await supabase!
      .from('user_tokens')
      .select('*')
      .eq('id', userTokenId)
      .single()

    if (!token) {
      return {
        userTokenId,
        tokenMint: '',
        tokenSymbol: '',
        success: false,
        amountClaimedSol: 0,
        error: 'Token not found',
      }
    }

    return this.claimForToken(token as UserToken)
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

      // Try to decode as VersionedTransaction first
      let signature: string
      try {
        const versionedTx = VersionedTransaction.deserialize(txBuffer)
        versionedTx.sign([signer])
        signature = await connection.sendTransaction(versionedTx)
      } catch {
        // Fall back to legacy transaction
        const legacyTx = Transaction.from(txBuffer)
        legacyTx.sign(signer)
        signature = await connection.sendRawTransaction(legacyTx.serialize())
      }

      // Wait for confirmation
      const latestBlockhash = await connection.getLatestBlockhash()
      await connection.confirmTransaction({
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      })

      return signature
    } catch (error: any) {
      loggers.claim.error({ error: String(error) }, 'Transaction failed')
      return null
    }
  }

  /**
   * Transfer claimed SOL to ops wallet with platform fee split
   * Takes 10% for WHEEL platform, 90% goes to user's ops wallet
   */
  private async transferToOpsWallet(
    connection: Connection,
    fromWallet: Keypair,
    toAddress: string,
    amountSol: number,
    tokenSymbol?: string
  ): Promise<{ success: boolean; platformFeeSol: number; userAmountSol: number }> {
    try {
      // Keep some SOL for rent and future transactions
      const reserveSol = 0.01
      const transferAmount = Math.max(0, amountSol - reserveSol)

      if (transferAmount <= 0) {
        loggers.claim.debug({ amountSol }, 'Amount too small to transfer')
        return { success: true, platformFeeSol: 0, userAmountSol: 0 }
      }

      // Calculate platform fee (default 10%)
      const platformFeePercent = env.platformFeePercentage || 10
      const platformFeeSol = transferAmount * (platformFeePercent / 100)
      const userAmountSol = transferAmount - platformFeeSol

      // Get platform ops wallet (WHEEL)
      const platformOpsWallet = getOpsWallet()

      // Transfer 1: Platform fee to WHEEL ops wallet (10%)
      if (platformOpsWallet && platformFeeSol > 0.001) {
        const platformTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: fromWallet.publicKey,
            toPubkey: platformOpsWallet.publicKey,
            lamports: Math.floor(platformFeeSol * 1e9),
          })
        )
        const platformSig = await sendAndConfirmTransaction(connection, platformTx, [fromWallet])
        loggers.claim.info({ platformFeePercent, platformFeeSol, signature: platformSig }, 'Platform fee transferred to WHEEL ops wallet')
      } else if (!platformOpsWallet) {
        loggers.claim.warn('Platform ops wallet not configured, skipping platform fee')
      }

      // Transfer 2: Remaining to user's ops wallet (90%)
      if (userAmountSol > 0.001) {
        const userTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: fromWallet.publicKey,
            toPubkey: new PublicKey(toAddress),
            lamports: Math.floor(userAmountSol * 1e9),
          })
        )
        const userSig = await sendAndConfirmTransaction(connection, userTx, [fromWallet])
        loggers.claim.info({ userPercent: 100 - platformFeePercent, userAmountSol, signature: userSig }, 'User portion transferred to ops wallet')
      }

      return { success: true, platformFeeSol, userAmountSol }
    } catch (error: any) {
      loggers.claim.error({ error: String(error) }, 'Transfer to ops wallet failed')
      return { success: false, platformFeeSol: 0, userAmountSol: 0 }
    }
  }

  /**
   * Record a successful claim in the database
   */
  private async recordClaim(
    userTokenId: string,
    amountSol: number,
    signature: string,
    platformFeeSol: number = 0,
    userReceivedSol: number = 0
  ): Promise<void> {
    if (!supabase) return

    try {
      // Insert into claim history
      await supabase.from('user_claim_history').insert([{
        user_token_id: userTokenId,
        amount_sol: amountSol,
        amount_usd: 0, // Would need price lookup
        platform_fee_sol: platformFeeSol,
        user_received_sol: userReceivedSol,
        transaction_signature: signature,
        claimed_at: new Date().toISOString(),
      }])

      // Update fee stats
      await supabase.rpc('increment_claim_stats', {
        p_user_token_id: userTokenId,
        p_amount_sol: amountSol,
      })
    } catch (error) {
      loggers.claim.error({ error: String(error) }, 'Failed to record claim')
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

export const multiUserClaimService = new MultiUserClaimService()
