// ===============================================================================
// FAST CLAIM SERVICE
// High-frequency fee claiming - checks every 30 seconds, claims when >= 0.15 SOL
// Optimized for speed with batch position checking and parallel execution
// Privy-only implementation - uses delegated signing via Privy API
// ===============================================================================

import { Connection, Transaction, PublicKey, SystemProgram } from '@solana/web3.js'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { getConnection, getOpsWallet, getSolPrice } from '../config/solana'
import { env } from '../config/env'
import { bagsFmService, ClaimablePosition } from './bags-fm'
import { loggers } from '../utils/logger'
import { sendTransactionWithPrivySigning, signAndSendWithPrivyExact } from '../utils/transaction'
import {
  PrivyTokenWithConfig,
  getPrivyTokensForAutoClaim,
} from './user-token.service'

// ===============================================================================
// CONFIGURATION
// ===============================================================================

// Platform WHEEL token - excluded from platform fees
const PLATFORM_WHEEL_TOKEN_MINT = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'

// Minimum claimable amount to trigger a claim (0.15 SOL)
const MIN_CLAIM_THRESHOLD_SOL = parseFloat(process.env.FAST_CLAIM_THRESHOLD_SOL || '0.15')

// Max concurrent claims to avoid rate limiting
const MAX_CONCURRENT_CLAIMS = parseInt(process.env.FAST_CLAIM_MAX_CONCURRENT || '5', 10)

// Delay between claim batches (ms)
const BATCH_DELAY_MS = parseInt(process.env.FAST_CLAIM_BATCH_DELAY_MS || '500', 10)

// ===============================================================================
// TYPES
// ===============================================================================

interface ClaimableToken {
  token: PrivyTokenWithConfig
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

// ===============================================================================
// SERVICE
// ===============================================================================

class FastClaimService {
  private isRunning = false
  private lastCycleAt: Date | null = null
  private cycleCount = 0

  /**
   * Run a fast claim cycle for all Privy tokens
   * Checks all tokens and claims any with >= 0.15 SOL claimable
   */
  async runClaimCycle(): Promise<FastClaimCycleResult> {
    if (this.isRunning) {
      loggers.claim.warn('Fast claim cycle already in progress, skipping')
      return this.emptyResult()
    }

    this.isRunning = true
    this.cycleCount++
    const cycleStartedAt = new Date().toISOString()

    loggers.claim.info({ cycleCount: this.cycleCount, threshold: MIN_CLAIM_THRESHOLD_SOL }, 'Starting fast claim cycle')

    const results: FastClaimResult[] = []
    let tokensChecked = 0
    let tokensClaimable = 0

    try {
      // Get all Privy tokens with auto-claim enabled
      const tokens = await getPrivyTokensForAutoClaim()
      tokensChecked = tokens.length

      if (tokens.length === 0) {
        loggers.claim.debug('No tokens with auto-claim enabled')
        return this.emptyResult()
      }

      loggers.claim.info({ tokenCount: tokens.length }, 'Checking tokens for claimable fees')

      // Group tokens by dev wallet
      const walletToTokens = this.groupTokensByDevWallet(tokens)

      // Batch check claimable positions
      const claimableTokens = await this.batchCheckClaimablePositions(walletToTokens)
      tokensClaimable = claimableTokens.length

      if (claimableTokens.length === 0) {
        loggers.claim.debug({ threshold: MIN_CLAIM_THRESHOLD_SOL }, 'No tokens with claimable amount above threshold')
        this.lastCycleAt = new Date()
        this.isRunning = false
        return {
          ...this.emptyResult(),
          cycleStartedAt,
          cycleCompletedAt: new Date().toISOString(),
          tokensChecked,
        }
      }

      loggers.claim.info({
        claimableCount: claimableTokens.length,
        tokens: claimableTokens.map(ct => ({ symbol: ct.token.token_symbol, amount: ct.position.claimableAmount }))
      }, 'Found tokens ready to claim')

      // Execute claims in batches
      const claimResults = await this.executeClaimsInBatches(claimableTokens)
      results.push(...claimResults)

    } catch (error: any) {
      loggers.claim.error({ error: String(error) }, 'Fast claim cycle error')
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

    loggers.claim.info({
      successfulCount: successful.length,
      failedCount: failed.length,
      totalClaimedSol: totalClaimed,
      platformFeeSol: totalPlatformFee,
      userReceivedSol: totalUserReceived,
    }, 'Fast claim cycle completed')

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
  private groupTokensByDevWallet(tokens: PrivyTokenWithConfig[]): Record<string, PrivyTokenWithConfig[]> {
    const walletToTokens: Record<string, PrivyTokenWithConfig[]> = {}

    for (const token of tokens) {
      const wallet = token.dev_wallet?.wallet_address
      if (!wallet) continue

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
    walletToTokens: Record<string, PrivyTokenWithConfig[]>
  ): Promise<ClaimableToken[]> {
    const claimableTokens: ClaimableToken[] = []
    const wallets = Object.keys(walletToTokens)

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

    for (let i = 0; i < claimableTokens.length; i += MAX_CONCURRENT_CLAIMS) {
      const batch = claimableTokens.slice(i, i + MAX_CONCURRENT_CLAIMS)

      loggers.claim.debug({
        batchNumber: Math.floor(i / MAX_CONCURRENT_CLAIMS) + 1,
        totalBatches: Math.ceil(claimableTokens.length / MAX_CONCURRENT_CLAIMS)
      }, 'Processing claim batch')

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

      if (i + MAX_CONCURRENT_CLAIMS < claimableTokens.length) {
        await this.sleep(BATCH_DELAY_MS)
      }
    }

    return results
  }

  /**
   * Execute a single claim for a token
   * Uses RAW transaction objects (no serialization) - same pattern as token-launcher.ts
   * Fresh transactions for each retry to avoid stale blockhash
   */
  private async executeSingleClaim(claimable: ClaimableToken): Promise<FastClaimResult> {
    const { token, position } = claimable
    const claimedAt = new Date().toISOString()
    const maxRetries = 3
    const retryDelays = [2000, 4000, 8000] // Exponential backoff

    try {
      loggers.claim.info({
        tokenSymbol: token.token_symbol,
        tokenMint: token.token_mint_address,
        claimableAmount: position.claimableAmount,
        isGraduated: token.is_graduated,
      }, 'Claiming fees')

      const devWalletAddress = token.dev_wallet?.wallet_address
      if (!devWalletAddress) {
        throw new Error('Dev wallet not found')
      }

      const connection = getConnection()
      let lastSignature: string | undefined
      let lastError: Error | null = null

      // Retry loop - generate FRESH RAW transactions each attempt
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          loggers.claim.debug({
            tokenSymbol: token.token_symbol,
            devWallet: devWalletAddress,
            tokenMint: token.token_mint_address,
            attempt: attempt + 1,
          }, 'Generating fresh RAW claim transactions')

          // Generate RAW claim transactions (no serialization - like token-launcher.ts)
          const claimTxs = await bagsFmService.generateClaimTransactionsRaw(
            devWalletAddress,
            [token.token_mint_address]
          )

          if (!claimTxs || claimTxs.length === 0) {
            throw new Error('Failed to generate claim transactions')
          }

          loggers.claim.info({
            tokenSymbol: token.token_symbol,
            txCount: claimTxs.length,
            attempt: attempt + 1,
          }, 'Fresh RAW claim transactions generated, executing with Privy signing')

          // Execute claim transactions using EXACT token-launcher.ts pattern:
          // - NO transaction modifications (especially no blockhash changes)
          // - Sign with Privy -> Serialize ourselves -> Broadcast ourselves -> Poll
          for (let txIndex = 0; txIndex < claimTxs.length; txIndex++) {
            const tx = claimTxs[txIndex]
            const result = await signAndSendWithPrivyExact(
              connection,
              devWalletAddress,
              tx,
              `claim tx ${txIndex + 1}/${claimTxs.length} for ${token.token_symbol}`
            )
            if (result.success && result.signature) {
              lastSignature = result.signature
              // Continue to next tx if there are more (some claims have multiple txs)
            } else if (!result.success) {
              throw new Error(result.error || 'Claim transaction failed')
            }
          }

          if (lastSignature) {
            break // Success - exit retry loop
          }

          throw new Error('Claim transaction signing/broadcast failed')
        } catch (error: any) {
          lastError = error
          const errorStr = String(error)
          const isBlockhashError = errorStr.includes('Blockhash') ||
            errorStr.includes('blockhash') ||
            errorStr.includes('block height') ||
            errorStr.includes('not confirmed')

          loggers.claim.warn({
            tokenSymbol: token.token_symbol,
            attempt: attempt + 1,
            maxRetries,
            error: errorStr,
            isBlockhashError,
          }, 'Claim attempt failed')

          if (attempt < maxRetries - 1) {
            const delay = retryDelays[attempt]
            loggers.claim.debug({
              tokenSymbol: token.token_symbol,
              delay,
              nextAttempt: attempt + 2,
            }, 'Retrying claim with fresh transaction')
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
      }

      if (!lastSignature) {
        const errorMsg = lastError?.message || 'Claim transaction failed after all retries'
        loggers.claim.error({
          tokenSymbol: token.token_symbol,
          tokenMint: token.token_mint_address,
          devWallet: devWalletAddress,
          isGraduated: token.is_graduated,
          claimableAmount: position.claimableAmount,
          error: errorMsg,
        }, 'Failed to complete claim after all attempts')
        throw new Error(errorMsg)
      }

      // Transfer to ops wallet with platform fee split
      let platformFeeSol = 0
      let userReceivedSol = position.claimableAmount
      const opsWalletAddress = token.ops_wallet?.wallet_address

      if (opsWalletAddress) {
        const transferResult = await this.transferWithPlatformFee(
          connection,
          devWalletAddress,
          opsWalletAddress,
          position.claimableAmount,
          token.token_symbol,
          token.token_mint_address
        )
        platformFeeSol = transferResult.platformFeeSol
        userReceivedSol = transferResult.userAmountSol
      }

      // Record the claim
      await this.recordClaim(token.id, position.claimableAmount, lastSignature, platformFeeSol, userReceivedSol)

      loggers.claim.info({ tokenSymbol: token.token_symbol, claimedAmount: position.claimableAmount, signature: lastSignature }, 'Claim successful')

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
      loggers.claim.error({ tokenSymbol: token.token_symbol, error: String(error) }, 'Claim failed')
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
   * Transfer SOL with platform fee split using Privy signing
   * 10% goes to WHEEL ops wallet, 90% goes to user's ops wallet
   * WHEEL token (platform token) is excluded from platform fees (100% goes to user)
   */
  private async transferWithPlatformFee(
    connection: Connection,
    devWalletAddress: string,
    userOpsWalletAddress: string,
    amountSol: number,
    tokenSymbol: string,
    tokenMint: string
  ): Promise<{ success: boolean; platformFeeSol: number; userAmountSol: number }> {
    try {
      const reserveSol = 0.1
      const transferAmount = Math.max(0, amountSol - reserveSol)

      if (transferAmount <= 0) {
        return { success: true, platformFeeSol: 0, userAmountSol: 0 }
      }

      // Check if this is the platform WHEEL token - excluded from platform fees
      const isWheelToken = tokenMint === PLATFORM_WHEEL_TOKEN_MINT

      // Calculate platform fee (0% for WHEEL token, default 10% for others)
      const platformFeePercent = isWheelToken ? 0 : (env.platformFeePercentage || 10)
      const platformFeeSol = transferAmount * (platformFeePercent / 100)
      const userAmountSol = transferAmount - platformFeeSol

      if (isWheelToken) {
        loggers.claim.info({ tokenSymbol }, 'WHEEL token - skipping platform fee')
      }

      const devPubkey = new PublicKey(devWalletAddress)
      const platformOpsWallet = getOpsWallet()

      // Transfer 1: Platform fee to WHEEL ops wallet (10%) - skip for WHEEL token
      if (platformOpsWallet && platformFeeSol >= 0.001) {
        const platformTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: devPubkey,
            toPubkey: platformOpsWallet.publicKey,
            lamports: Math.floor(platformFeeSol * 1e9),
          })
        )
        platformTx.feePayer = devPubkey

        const platformResult = await sendTransactionWithPrivySigning(
          connection,
          platformTx,
          devWalletAddress,
          { commitment: 'confirmed', logContext: { service: 'fast-claim', type: 'platform-fee', tokenSymbol } }
        )

        if (platformResult.success) {
          loggers.claim.info({ tokenSymbol, platformFeeSol, signature: platformResult.signature }, 'Platform fee transferred')
        } else {
          loggers.claim.error({ tokenSymbol, error: platformResult.error }, 'Platform fee transfer failed')
        }
      }

      // Transfer 2: User's portion to their ops wallet (90%)
      if (userAmountSol >= 0.001) {
        const userTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: devPubkey,
            toPubkey: new PublicKey(userOpsWalletAddress),
            lamports: Math.floor(userAmountSol * 1e9),
          })
        )
        userTx.feePayer = devPubkey

        const userResult = await sendTransactionWithPrivySigning(
          connection,
          userTx,
          devWalletAddress,
          { commitment: 'confirmed', logContext: { service: 'fast-claim', type: 'user-portion', tokenSymbol } }
        )

        if (userResult.success) {
          loggers.claim.info({ tokenSymbol, userAmountSol, signature: userResult.signature }, 'User portion transferred')
        } else {
          loggers.claim.error({ tokenSymbol, error: userResult.error }, 'User transfer failed')
        }
      }

      return { success: true, platformFeeSol, userAmountSol }
    } catch (error: any) {
      loggers.claim.error({ tokenSymbol, error: String(error) }, 'Transfer with platform fee failed')
      return { success: false, platformFeeSol: 0, userAmountSol: 0 }
    }
  }

  /**
   * Record claim in database using Prisma
   */
  private async recordClaim(
    privyTokenId: string,
    amountSol: number,
    signature: string,
    platformFeeSol: number,
    userReceivedSol: number
  ): Promise<void> {
    if (!isPrismaConfigured()) return

    try {
      // Fetch current SOL price
      let amountUsd = 0
      try {
        const solPrice = await getSolPrice()
        amountUsd = amountSol * solPrice
      } catch {
        loggers.claim.warn('Failed to fetch SOL price for claim USD calculation')
      }

      // Insert into privy_claim_history using Prisma
      await prisma.privyClaimHistory.create({
        data: {
          privyTokenId,
          amountSol,
          totalAmountSol: amountSol,
          amountUsd,
          platformFeeSol,
          userReceivedSol,
          transactionSignature: signature,
          claimSignature: signature,
          status: 'completed',
          claimedAt: new Date(),
          completedAt: new Date(),
        },
      })

      // Also record as transaction using Prisma
      const usdStr = amountUsd > 0 ? ` ($${amountUsd.toFixed(2)})` : ''
      await prisma.privyTransaction.create({
        data: {
          privyTokenId,
          type: 'transfer',
          amount: amountSol,
          amountUsd,
          signature,
          message: `Claimed ${amountSol.toFixed(4)} SOL${usdStr} fees (${platformFeeSol.toFixed(4)} platform fee)`,
          status: 'confirmed',
          confirmedAt: new Date(),
        },
      })
    } catch (error) {
      loggers.claim.error({ error: String(error) }, 'Failed to record claim')
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

  // ===============================================================================
  // STATUS METHODS
  // ===============================================================================

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
