// ═══════════════════════════════════════════════════════════════════════════
// WHEEL TOKEN CLAIM SERVICE
// Claims Bags.fm fees from WHEEL dev wallet and transfers to ops wallet
// No platform fee since this IS the platform token
// ═══════════════════════════════════════════════════════════════════════════

import { Connection, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { supabase } from '../config/database'
import { getConnection, getBalance, getDevWallet, getOpsWallet } from '../config/solana'
import { bagsFmService } from './bags-fm'
import { loggers } from '../utils/logger'
import { sendSerializedTransactionWithRetry, sendAndConfirmTransactionWithRetry } from '../utils/transaction'

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const WHEEL_TOKEN_MINT = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'

// Minimum claimable amount to trigger a claim (SOL)
const MIN_CLAIM_THRESHOLD_SOL = parseFloat(process.env.WHEEL_CLAIM_THRESHOLD_SOL || '0.05')

// Reserve SOL in dev wallet for rent/future claims
const DEV_WALLET_RESERVE_SOL = 0.1

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WheelClaimResult {
  success: boolean
  amountClaimedSol: number
  amountTransferredSol: number
  claimSignature?: string
  transferSignature?: string
  error?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class WheelClaimService {
  private isRunning = false
  private lastRunAt: Date | null = null
  private totalClaimedSol = 0

  /**
   * Run a claim cycle for the WHEEL token
   * 1. Check claimable fees on Bags.fm
   * 2. Claim if above threshold
   * 3. Transfer to ops wallet (100% - no platform fee)
   */
  async runClaimCycle(): Promise<WheelClaimResult | null> {
    if (this.isRunning) {
      loggers.claim.debug('WHEEL claim cycle already in progress, skipping')
      return null
    }

    this.isRunning = true

    try {
      // Get wallets from environment
      const devWallet = getDevWallet()
      const opsWallet = getOpsWallet()

      if (!devWallet) {
        loggers.claim.warn('WHEEL dev wallet not configured')
        return null
      }

      if (!opsWallet) {
        loggers.claim.warn('WHEEL ops wallet not configured')
        return null
      }

      const connection = getConnection()

      // Check claimable positions on Bags.fm
      const positions = await bagsFmService.getClaimablePositions(
        devWallet.publicKey.toString()
      )

      // Find the WHEEL token position
      const position = positions?.find(p => p.tokenMint === WHEEL_TOKEN_MINT)

      if (!position || position.claimableAmount < MIN_CLAIM_THRESHOLD_SOL) {
        loggers.claim.debug({
          claimable: position?.claimableAmount || 0,
          threshold: MIN_CLAIM_THRESHOLD_SOL,
        }, 'WHEEL: Below claim threshold')
        return null
      }

      loggers.claim.info({
        claimableAmount: position.claimableAmount,
        threshold: MIN_CLAIM_THRESHOLD_SOL,
      }, 'WHEEL: Claiming fees')

      // Execute claim
      const claimResult = await this.executeClaim(connection, devWallet, position)

      if (!claimResult.success) {
        return {
          success: false,
          amountClaimedSol: 0,
          amountTransferredSol: 0,
          error: claimResult.error,
        }
      }

      // Transfer to ops wallet (100% - no platform fee for WHEEL)
      const transferResult = await this.transferToOpsWallet(
        connection,
        devWallet,
        opsWallet.publicKey.toString(),
        position.claimableAmount
      )

      // Record the claim
      await this.recordClaim(
        position.claimableAmount,
        claimResult.signature || '',
        transferResult.amountTransferred
      )

      this.totalClaimedSol += position.claimableAmount
      this.lastRunAt = new Date()

      loggers.claim.info({
        claimed: position.claimableAmount,
        transferred: transferResult.amountTransferred,
        totalClaimed: this.totalClaimedSol,
      }, 'WHEEL: Claim cycle completed')

      return {
        success: true,
        amountClaimedSol: position.claimableAmount,
        amountTransferredSol: transferResult.amountTransferred,
        claimSignature: claimResult.signature,
        transferSignature: transferResult.signature,
      }
    } catch (error) {
      loggers.claim.error({ error: String(error) }, 'WHEEL claim cycle failed')
      return {
        success: false,
        amountClaimedSol: 0,
        amountTransferredSol: 0,
        error: String(error),
      }
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Execute the claim transaction
   */
  private async executeClaim(
    connection: Connection,
    devWallet: ReturnType<typeof getDevWallet>,
    _position: { claimableAmount: number }
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    if (!devWallet) return { success: false, error: 'No dev wallet' }

    try {
      // Get claim transactions from Bags.fm
      const claimTxs = await bagsFmService.generateClaimTransactions(
        devWallet.publicKey.toString(),
        [WHEEL_TOKEN_MINT]
      )

      if (!claimTxs || claimTxs.length === 0) {
        return { success: false, error: 'No claim transactions returned' }
      }

      let lastSignature: string | undefined

      // Execute each claim transaction (claimTxs is array of base64 strings)
      for (const txBase64 of claimTxs) {
        const result = await sendSerializedTransactionWithRetry(
          connection,
          txBase64,
          devWallet,
          {
            commitment: 'confirmed',
            logContext: { service: 'wheel-claim', type: 'claim' },
          }
        )

        if (result.success && result.signature) {
          lastSignature = result.signature
          loggers.claim.debug({ signature: result.signature }, 'WHEEL: Claim tx confirmed')
        } else {
          loggers.claim.error({ error: result.error }, 'WHEEL: Claim tx failed')
        }
      }

      if (!lastSignature) {
        return { success: false, error: 'All claim transactions failed' }
      }

      return { success: true, signature: lastSignature }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  }

  /**
   * Transfer claimed SOL to ops wallet
   * 100% transfer - no platform fee for WHEEL token
   * Transfers any excess above DEV_WALLET_RESERVE_SOL from actual wallet balance
   */
  private async transferToOpsWallet(
    connection: Connection,
    fromWallet: ReturnType<typeof getDevWallet>,
    toAddress: string,
    _claimedAmountSol: number // Kept for logging, actual balance is used
  ): Promise<{ success: boolean; amountTransferred: number; signature?: string }> {
    if (!fromWallet) return { success: false, amountTransferred: 0 }

    try {
      // Get actual wallet balance to calculate transferable amount
      const currentBalance = await getBalance(fromWallet.publicKey)

      // Keep reserve in dev wallet - transfer any excess
      const transferAmount = Math.max(0, currentBalance - DEV_WALLET_RESERVE_SOL)

      if (transferAmount <= 0.001) {
        loggers.claim.debug({
          claimedAmount: _claimedAmountSol,
          currentBalance,
          reserve: DEV_WALLET_RESERVE_SOL,
        }, 'WHEEL: Balance below reserve threshold, skipping transfer')
        return { success: true, amountTransferred: 0 }
      }

      loggers.claim.info({
        currentBalance,
        reserve: DEV_WALLET_RESERVE_SOL,
        transferAmount,
      }, 'WHEEL: Transferring excess balance to ops wallet')

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromWallet.publicKey,
          toPubkey: new (await import('@solana/web3.js')).PublicKey(toAddress),
          lamports: Math.floor(transferAmount * LAMPORTS_PER_SOL),
        })
      )

      const result = await sendAndConfirmTransactionWithRetry(
        connection,
        tx,
        [fromWallet],
        {
          commitment: 'confirmed',
          logContext: { service: 'wheel-claim', type: 'transfer' },
        }
      )

      if (result.success) {
        loggers.claim.info({
          amount: transferAmount,
          signature: result.signature,
        }, 'WHEEL: Transferred to ops wallet')
        return { success: true, amountTransferred: transferAmount, signature: result.signature }
      } else {
        loggers.claim.error({ error: result.error }, 'WHEEL: Transfer failed')
        return { success: false, amountTransferred: 0 }
      }
    } catch (error) {
      loggers.claim.error({ error: String(error) }, 'WHEEL: Transfer error')
      return { success: false, amountTransferred: 0 }
    }
  }

  /**
   * Record claim in database
   */
  private async recordClaim(
    amountSol: number,
    claimSignature: string,
    transferredSol: number
  ): Promise<void> {
    if (!supabase) return

    try {
      // Update fee_stats table (used by old system)
      const { data: currentStats } = await supabase
        .from('fee_stats')
        .select('*')
        .eq('id', 'main')
        .single()

      const totalClaimed = (currentStats?.total_claimed_sol || 0) + amountSol
      const totalTransferred = (currentStats?.total_transferred_sol || 0) + transferredSol

      await supabase.from('fee_stats').upsert({
        id: 'main',
        total_claimed_sol: totalClaimed,
        total_transferred_sol: totalTransferred,
        last_claim_at: new Date().toISOString(),
        last_claim_signature: claimSignature,
        updated_at: new Date().toISOString(),
      })

      // Also record in transactions table
      await supabase.from('transactions').insert({
        type: 'claim',
        amount: amountSol,
        signature: claimSignature,
        token_mint: WHEEL_TOKEN_MINT,
        token_symbol: 'WHEEL',
        created_at: new Date().toISOString(),
      })

      loggers.claim.debug({ amountSol, totalClaimed }, 'WHEEL: Recorded claim')
    } catch (error) {
      loggers.claim.warn({ error: String(error) }, 'WHEEL: Failed to record claim')
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt?.toISOString() || null,
      totalClaimedSol: this.totalClaimedSol,
      tokenMint: WHEEL_TOKEN_MINT,
      claimThreshold: MIN_CLAIM_THRESHOLD_SOL,
    }
  }
}

export const wheelClaimService = new WheelClaimService()
