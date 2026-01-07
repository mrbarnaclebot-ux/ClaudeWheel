// ═══════════════════════════════════════════════════════════════════════════
// MULTI-USER CLAIM SERVICE
// Handles automated fee claiming for all users with auto-claim enabled
// ═══════════════════════════════════════════════════════════════════════════

import { Connection, Transaction, VersionedTransaction, sendAndConfirmTransaction, Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { supabase } from '../config/database'
import { getConnection } from '../config/solana'
import { bagsFmService, ClaimablePosition } from './bags-fm'
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
      console.log('⚠️ Batch claim already in progress, skipping')
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

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('   MULTI-USER CLAIM JOB')
    console.log('═══════════════════════════════════════════════════════════\n')

    try {
      // Get all tokens with auto-claim enabled
      const tokens = await getTokensForAutoClaim()
      const tokensToProcess = tokens.slice(0, maxTokensPerCycle)

      console.log(`📋 Found ${tokens.length} tokens with auto-claim enabled`)
      console.log(`   Processing up to ${maxTokensPerCycle} tokens this cycle\n`)

      for (const token of tokensToProcess) {
        try {
          const result = await this.claimForToken(token)
          results.push(result)

          if (result.success) {
            console.log(`✅ ${token.token_symbol}: Claimed ${result.amountClaimedSol.toFixed(4)} SOL`)
          } else if (result.error?.includes('Nothing to claim')) {
            console.log(`ℹ️ ${token.token_symbol}: Nothing to claim`)
          } else {
            console.log(`❌ ${token.token_symbol}: ${result.error}`)
          }

          // Small delay between claims to avoid rate limiting
          await this.sleep(1000)
        } catch (error: any) {
          console.error(`❌ ${token.token_symbol}: Unexpected error - ${error.message}`)
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

    console.log('\n───────────────────────────────────────────────────────────')
    console.log(`   Claim job completed: ${successfulClaims}/${results.length} successful`)
    console.log(`   Total claimed: ${totalClaimedSol.toFixed(4)} SOL`)
    console.log('───────────────────────────────────────────────────────────\n')

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

      // Record the claim
      await this.recordClaim(token.id, position.claimableAmount, lastSignature)

      // Transfer to ops wallet if configured
      if (token.ops_wallet_address) {
        await this.transferToOpsWallet(
          connection,
          devWallet,
          token.ops_wallet_address,
          position.claimableAmount
        )
      }

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
      console.error('Transaction failed:', error.message)
      return null
    }
  }

  /**
   * Transfer claimed SOL to ops wallet
   */
  private async transferToOpsWallet(
    connection: Connection,
    fromWallet: Keypair,
    toAddress: string,
    amountSol: number
  ): Promise<boolean> {
    try {
      const { PublicKey, SystemProgram, Transaction } = await import('@solana/web3.js')

      // Keep some SOL for rent and future transactions
      const reserveSol = 0.01
      const transferAmount = Math.max(0, amountSol - reserveSol)

      if (transferAmount <= 0) {
        console.log(`   ℹ️ Amount too small to transfer (${amountSol} SOL)`)
        return true
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromWallet.publicKey,
          toPubkey: new PublicKey(toAddress),
          lamports: Math.floor(transferAmount * 1e9),
        })
      )

      const signature = await sendAndConfirmTransaction(connection, transaction, [fromWallet])
      console.log(`   → Transferred ${transferAmount.toFixed(4)} SOL to ops wallet: ${signature.slice(0, 8)}...`)

      return true
    } catch (error: any) {
      console.error(`   ⚠️ Transfer to ops wallet failed: ${error.message}`)
      return false
    }
  }

  /**
   * Record a successful claim in the database
   */
  private async recordClaim(userTokenId: string, amountSol: number, signature: string): Promise<void> {
    if (!supabase) return

    try {
      // Insert into claim history
      await supabase.from('user_claim_history').insert([{
        user_token_id: userTokenId,
        amount_sol: amountSol,
        amount_usd: 0, // Would need price lookup
        transaction_signature: signature,
        claimed_at: new Date().toISOString(),
      }])

      // Update fee stats
      await supabase.rpc('increment_claim_stats', {
        p_user_token_id: userTokenId,
        p_amount_sol: amountSol,
      })
    } catch (error) {
      console.error('Failed to record claim:', error)
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
