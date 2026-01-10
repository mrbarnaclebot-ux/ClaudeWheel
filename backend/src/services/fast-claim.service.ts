// ═══════════════════════════════════════════════════════════════════════════
// FAST CLAIM SERVICE
// High-frequency fee claiming - checks every 30 seconds, claims when >= 0.15 SOL
// Optimized for speed with batch position checking and parallel execution
// ═══════════════════════════════════════════════════════════════════════════

import { Connection, Transaction, Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import { supabase } from '../config/database'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { getConnection, getOpsWallet, getSolPrice } from '../config/solana'
import { env } from '../config/env'
import { bagsFmService, ClaimablePosition } from './bags-fm'
import { loggers } from '../utils/logger'
import { sendSerializedTransactionWithRetry, sendAndConfirmTransactionWithRetry, sendTransactionWithPrivySigning } from '../utils/transaction'
import {
  UserToken,
  getTokensForAutoClaim,
  getDecryptedDevWallet,
  // Privy imports
  PrivyTokenWithConfig,
  getPrivyTokensForAutoClaim,
} from './user-token.service'
import { privyService } from './privy.service'

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Platform WHEEL token - excluded from platform fees
const PLATFORM_WHEEL_TOKEN_MINT = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'

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
      loggers.claim.warn('Fast claim cycle already in progress, skipping')
      return this.emptyResult()
    }

    this.isRunning = true
    this.cycleCount++
    const cycleStartedAt = new Date().toISOString()

    loggers.claim.info({ cycleCount: this.cycleCount, threshold: MIN_CLAIM_THRESHOLD_SOL, maxConcurrent: MAX_CONCURRENT_CLAIMS }, 'Starting fast claim cycle')

    const results: FastClaimResult[] = []
    let tokensChecked = 0
    let tokensClaimable = 0

    try {
      // Step 1: Get all tokens with auto-claim enabled
      const tokens = await getTokensForAutoClaim()
      tokensChecked = tokens.length

      if (tokens.length === 0) {
        loggers.claim.debug('No tokens with auto-claim enabled')
        return this.emptyResult()
      }

      loggers.claim.info({ tokenCount: tokens.length }, 'Checking tokens for claimable fees')

      // Step 2: Group tokens by dev wallet to minimize API calls
      const walletToTokens = this.groupTokensByDevWallet(tokens)
      loggers.claim.debug({ walletCount: Object.keys(walletToTokens).length }, 'Grouped tokens by dev wallet')

      // Step 3: Batch check claimable positions for all wallets
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

      // Step 4: Execute claims in parallel batches
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

    // Summary
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

      loggers.claim.debug({ batchNumber: Math.floor(i / MAX_CONCURRENT_CLAIMS) + 1, totalBatches: Math.ceil(claimableTokens.length / MAX_CONCURRENT_CLAIMS) }, 'Processing claim batch')

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
      loggers.claim.info({ tokenSymbol: token.token_symbol, claimableAmount: position.claimableAmount }, 'Claiming fees')

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
   * Sign and send a transaction using unified transaction utility
   */
  private async signAndSendTransaction(
    connection: Connection,
    txBase64: string,
    signer: Keypair
  ): Promise<string | null> {
    const result = await sendSerializedTransactionWithRetry(
      connection,
      txBase64,
      signer,
      {
        skipPreflight: false,
        maxRetries: 3,
        logContext: { service: 'fast-claim' },
      }
    )

    return result.success ? result.signature || null : null
  }

  /**
   * Transfer SOL with platform fee split
   * 10% goes to WHEEL ops wallet, 90% goes to user's ops wallet
   * WHEEL token is excluded from platform fees (100% goes to user)
   */
  private async transferWithPlatformFee(
    connection: Connection,
    fromWallet: Keypair,
    userOpsWalletAddress: string,
    amountSol: number,
    tokenSymbol: string,
    tokenMint: string
  ): Promise<{ success: boolean; platformFeeSol: number; userAmountSol: number }> {
    try {
      // Reserve some SOL for rent and future transactions
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

      // Get WHEEL platform ops wallet
      const platformOpsWallet = getOpsWallet()

      // Transfer 1: Platform fee to WHEEL ops wallet (10%) - skip for WHEEL token
      if (platformOpsWallet && platformFeeSol >= 0.001) {
        const platformTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: fromWallet.publicKey,
            toPubkey: platformOpsWallet.publicKey,
            lamports: Math.floor(platformFeeSol * 1e9),
          })
        )

        const platformResult = await sendAndConfirmTransactionWithRetry(
          connection,
          platformTx,
          [fromWallet],
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
            fromPubkey: fromWallet.publicKey,
            toPubkey: new PublicKey(userOpsWalletAddress),
            lamports: Math.floor(userAmountSol * 1e9),
          })
        )

        const userResult = await sendAndConfirmTransactionWithRetry(
          connection,
          userTx,
          [fromWallet],
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
        loggers.claim.warn({ error: String(priceError) }, 'Failed to fetch SOL price for USD calculation')
      }

      const { error: historyError } = await supabase.from('user_claim_history').insert([{
        user_token_id: userTokenId,
        amount_sol: amountSol,
        amount_usd: amountUsd,
        platform_fee_sol: platformFeeSol,
        user_received_sol: userReceivedSol,
        transaction_signature: signature,
        claimed_at: new Date().toISOString(),
      }])

      if (historyError) {
        console.error('Failed to insert claim history:', historyError)
      }

      // Also record as transaction for activity feed
      const usdStr = amountUsd > 0 ? ` ($${amountUsd.toFixed(2)})` : ''
      const { error: txError } = await supabase.from('user_transactions').insert([{
        user_token_id: userTokenId,
        type: 'transfer',
        amount: amountSol,
        signature,
        message: `Claimed ${amountSol.toFixed(4)} SOL${usdStr} fees (${platformFeeSol.toFixed(4)} platform fee)`,
        status: 'confirmed',
      }])

      if (txError) {
        console.error('Failed to insert transaction record:', txError)
      }
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

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVY TOKEN CLAIMING
  // For tokens registered via Privy (TMA/embedded wallets)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run a fast claim cycle for Privy tokens
   */
  async runPrivyFastClaimCycle(): Promise<FastClaimCycleResult> {
    if (this.isRunning) {
      loggers.claim.warn('Fast claim cycle already in progress, skipping Privy tokens')
      return this.emptyResult()
    }

    this.isRunning = true
    this.cycleCount++
    const cycleStartedAt = new Date().toISOString()

    loggers.claim.info({ cycleCount: this.cycleCount, threshold: MIN_CLAIM_THRESHOLD_SOL }, 'Starting Privy fast claim cycle')

    const results: FastClaimResult[] = []
    let tokensChecked = 0
    let tokensClaimable = 0

    try {
      // Get all Privy tokens with auto-claim enabled
      const tokens = await getPrivyTokensForAutoClaim()
      tokensChecked = tokens.length

      if (tokens.length === 0) {
        loggers.claim.debug('No Privy tokens with auto-claim enabled')
        return this.emptyResult()
      }

      loggers.claim.info({ tokenCount: tokens.length }, 'Checking Privy tokens for claimable fees')

      // Group tokens by dev wallet
      const walletToTokens = this.groupPrivyTokensByDevWallet(tokens)

      // Batch check claimable positions
      const claimableTokens = await this.batchCheckPrivyClaimablePositions(walletToTokens)
      tokensClaimable = claimableTokens.length

      if (claimableTokens.length === 0) {
        loggers.claim.debug({ threshold: MIN_CLAIM_THRESHOLD_SOL }, 'No Privy tokens with claimable amount above threshold')
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
      }, 'Found Privy tokens ready to claim')

      // Execute claims in batches
      const claimResults = await this.executePrivyClaimsInBatches(claimableTokens)
      results.push(...claimResults)

    } catch (error: any) {
      loggers.claim.error({ error: String(error) }, 'Privy fast claim cycle error')
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
    }, 'Privy fast claim cycle completed')

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
   * Group Privy tokens by dev wallet address
   */
  private groupPrivyTokensByDevWallet(tokens: PrivyTokenWithConfig[]): Record<string, PrivyTokenWithConfig[]> {
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
   * Batch check claimable positions for Privy wallets
   */
  private async batchCheckPrivyClaimablePositions(
    walletToTokens: Record<string, PrivyTokenWithConfig[]>
  ): Promise<{ token: PrivyTokenWithConfig; position: ClaimablePosition }[]> {
    const claimableTokens: { token: PrivyTokenWithConfig; position: ClaimablePosition }[] = []
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
   * Execute Privy claims in batches
   */
  private async executePrivyClaimsInBatches(
    claimableTokens: { token: PrivyTokenWithConfig; position: ClaimablePosition }[]
  ): Promise<FastClaimResult[]> {
    const results: FastClaimResult[] = []

    for (let i = 0; i < claimableTokens.length; i += MAX_CONCURRENT_CLAIMS) {
      const batch = claimableTokens.slice(i, i + MAX_CONCURRENT_CLAIMS)

      const batchResults = await Promise.allSettled(
        batch.map(ct => this.executePrivySingleClaim(ct))
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
   * Execute a single Privy claim
   * Uses RAW transaction objects (no serialization) - same pattern as token-launcher.ts
   * Fresh transactions for each retry to avoid stale blockhash
   */
  private async executePrivySingleClaim(
    claimable: { token: PrivyTokenWithConfig; position: ClaimablePosition }
  ): Promise<FastClaimResult> {
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
      }, 'Claiming Privy fees')

      const devWalletAddress = token.dev_wallet?.wallet_address
      if (!devWalletAddress) {
        throw new Error('Dev wallet not found')
      }

      const connection = getConnection()
      let lastSignature: string | undefined
      let lastError: Error | null = null

      // Retry loop - generate FRESH RAW transactions each attempt
      // Uses the same pattern as token-launcher.ts (which works)
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          loggers.claim.debug({
            tokenSymbol: token.token_symbol,
            devWallet: devWalletAddress,
            tokenMint: token.token_mint_address,
            attempt: attempt + 1,
          }, 'Generating fresh RAW claim transactions for Privy token')

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

          // Execute claim transactions using the WORKING pattern from token-launcher.ts:
          // Sign with Privy → We broadcast ourselves → Poll for confirmation
          // This pattern WORKS for token launches, so use it for claims too
          for (const tx of claimTxs) {
            const result = await sendTransactionWithPrivySigning(
              connection,
              tx, // Raw transaction object
              devWalletAddress,
              {
                maxRetries: 1, // Don't retry internally - we get fresh txs each outer attempt
                logContext: { service: 'privy-fast-claim', attempt: attempt + 1 },
              }
            )
            if (result.success && result.signature) {
              lastSignature = result.signature
              break // Success - exit transaction loop
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
          }, 'Privy claim attempt failed')

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
        }, 'Failed to complete Privy claim after all attempts')
        throw new Error(errorMsg)
      }

      // Transfer to ops wallet with platform fee split
      let platformFeeSol = 0
      let userReceivedSol = position.claimableAmount
      const opsWalletAddress = token.ops_wallet?.wallet_address

      if (opsWalletAddress) {
        const transferResult = await this.transferPrivyWithPlatformFee(
          connection,
          devWalletAddress,
          opsWalletAddress,
          position.claimableAmount,
          token.token_symbol
        )
        platformFeeSol = transferResult.platformFeeSol
        userReceivedSol = transferResult.userAmountSol
      }

      // Record the claim
      await this.recordPrivyClaim(token.id, position.claimableAmount, lastSignature, platformFeeSol, userReceivedSol)

      loggers.claim.info({ tokenSymbol: token.token_symbol, claimedAmount: position.claimableAmount, signature: lastSignature }, 'Privy claim successful')

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
      loggers.claim.error({ tokenSymbol: token.token_symbol, error: String(error) }, 'Privy claim failed')
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
   */
  private async transferPrivyWithPlatformFee(
    connection: Connection,
    devWalletAddress: string,
    userOpsWalletAddress: string,
    amountSol: number,
    tokenSymbol: string
  ): Promise<{ success: boolean; platformFeeSol: number; userAmountSol: number }> {
    try {
      const reserveSol = 0.1
      const transferAmount = Math.max(0, amountSol - reserveSol)

      if (transferAmount <= 0) {
        return { success: true, platformFeeSol: 0, userAmountSol: 0 }
      }

      // Calculate platform fee (10%)
      const platformFeePercent = env.platformFeePercentage || 10
      const platformFeeSol = transferAmount * (platformFeePercent / 100)
      const userAmountSol = transferAmount - platformFeeSol

      const devPubkey = new PublicKey(devWalletAddress)
      const platformOpsWallet = getOpsWallet()

      // Transfer 1: Platform fee to WHEEL ops wallet (10%)
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
          { commitment: 'confirmed', logContext: { service: 'privy-fast-claim', type: 'platform-fee', tokenSymbol } }
        )

        if (platformResult.success) {
          loggers.claim.info({ tokenSymbol, platformFeeSol, signature: platformResult.signature }, 'Privy platform fee transferred')
        } else {
          loggers.claim.error({ tokenSymbol, error: platformResult.error }, 'Privy platform fee transfer failed')
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
          { commitment: 'confirmed', logContext: { service: 'privy-fast-claim', type: 'user-portion', tokenSymbol } }
        )

        if (userResult.success) {
          loggers.claim.info({ tokenSymbol, userAmountSol, signature: userResult.signature }, 'Privy user portion transferred')
        } else {
          loggers.claim.error({ tokenSymbol, error: userResult.error }, 'Privy user transfer failed')
        }
      }

      return { success: true, platformFeeSol, userAmountSol }
    } catch (error: any) {
      loggers.claim.error({ tokenSymbol, error: String(error) }, 'Privy transfer with platform fee failed')
      return { success: false, platformFeeSol: 0, userAmountSol: 0 }
    }
  }

  /**
   * Record Privy claim in database using Prisma
   */
  private async recordPrivyClaim(
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
        loggers.claim.warn('Failed to fetch SOL price for Privy claim USD calculation')
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
      loggers.claim.error({ error: String(error) }, 'Failed to record Privy claim')
    }
  }
}

export const fastClaimService = new FastClaimService()
