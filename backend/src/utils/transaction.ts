// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED TRANSACTION UTILITY
// Consistent transaction sending and confirmation with retry logic
// ═══════════════════════════════════════════════════════════════════════════

import {
  Connection,
  Transaction,
  VersionedTransaction,
  Keypair,
  SendTransactionError,
  TransactionConfirmationStrategy,
} from '@solana/web3.js'
import { loggers } from './logger'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SendTransactionOptions {
  /** Skip preflight simulation (default: false - safer) */
  skipPreflight?: boolean
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Delay between retries in ms (default: exponential backoff) */
  retryDelayMs?: number[]
  /** Commitment level for confirmation (default: 'confirmed') */
  commitment?: 'processed' | 'confirmed' | 'finalized'
  /** Timeout for confirmation in ms (default: 60000) */
  confirmationTimeout?: number
  /** Log context for debugging */
  logContext?: Record<string, unknown>
}

export interface TransactionResult {
  success: boolean
  signature?: string
  error?: string
  attempts?: number
}

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send and confirm a legacy transaction with retry logic
 */
export async function sendAndConfirmTransactionWithRetry(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  options: SendTransactionOptions = {}
): Promise<TransactionResult> {
  const {
    skipPreflight = false,
    maxRetries = 3,
    retryDelayMs = [2000, 5000, 10000],
    commitment = 'confirmed',
    confirmationTimeout = 60000,
    logContext = {},
  } = options

  let lastError: Error | null = null
  let attempts = 0

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    attempts++
    try {
      // Get fresh blockhash for each attempt
      const latestBlockhash = await connection.getLatestBlockhash(commitment)
      transaction.recentBlockhash = latestBlockhash.blockhash
      transaction.feePayer = signers[0].publicKey

      // Sign transaction
      transaction.sign(...signers)

      // Send transaction
      const signature = await connection.sendRawTransaction(
        transaction.serialize(),
        {
          skipPreflight,
          preflightCommitment: commitment,
          maxRetries: 0, // We handle retries ourselves
        }
      )

      loggers.solana.debug({
        ...logContext,
        signature,
        attempt: attempt + 1,
      }, 'Transaction sent, awaiting confirmation')

      // Confirm transaction
      const confirmationStrategy: TransactionConfirmationStrategy = {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }

      const confirmation = await connection.confirmTransaction(
        confirmationStrategy,
        commitment
      )

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      loggers.solana.info({
        ...logContext,
        signature,
        attempts,
      }, 'Transaction confirmed')

      return {
        success: true,
        signature,
        attempts,
      }
    } catch (error) {
      lastError = error as Error

      // Check if error is retryable
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isRetryable = isRetryableError(errorMessage)

      loggers.solana.warn({
        ...logContext,
        attempt: attempt + 1,
        maxRetries,
        error: errorMessage,
        isRetryable,
      }, 'Transaction attempt failed')

      if (!isRetryable || attempt >= maxRetries - 1) {
        break
      }

      // Wait before retry with exponential backoff
      const delay = retryDelayMs[attempt] || retryDelayMs[retryDelayMs.length - 1]
      await sleep(delay)
    }
  }

  const errorMessage = lastError?.message || 'Transaction failed after max retries'
  loggers.solana.error({
    ...logContext,
    attempts,
    error: errorMessage,
  }, 'Transaction failed')

  return {
    success: false,
    error: errorMessage,
    attempts,
  }
}

/**
 * Send and confirm a versioned transaction with retry logic
 */
export async function sendVersionedTransactionWithRetry(
  connection: Connection,
  transaction: VersionedTransaction,
  signers: Keypair[],
  options: SendTransactionOptions = {}
): Promise<TransactionResult> {
  const {
    skipPreflight = false,
    maxRetries = 3,
    retryDelayMs = [2000, 5000, 10000],
    commitment = 'confirmed',
    logContext = {},
  } = options

  let lastError: Error | null = null
  let attempts = 0

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    attempts++
    try {
      // Sign transaction only on first attempt (avoid duplicate signatures)
      if (attempt === 0) {
        transaction.sign(signers)
      }

      // Send transaction
      const signature = await connection.sendTransaction(transaction, {
        skipPreflight,
        maxRetries: 0, // We handle retries ourselves
      })

      loggers.solana.debug({
        ...logContext,
        signature,
        attempt: attempt + 1,
      }, 'Versioned transaction sent, awaiting confirmation')

      // Confirm transaction
      const latestBlockhash = await connection.getLatestBlockhash(commitment)
      const confirmationStrategy: TransactionConfirmationStrategy = {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }

      const confirmation = await connection.confirmTransaction(
        confirmationStrategy,
        commitment
      )

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      loggers.solana.info({
        ...logContext,
        signature,
        attempts,
      }, 'Versioned transaction confirmed')

      return {
        success: true,
        signature,
        attempts,
      }
    } catch (error) {
      lastError = error as Error

      const errorMessage = error instanceof Error ? error.message : String(error)
      const isRetryable = isRetryableError(errorMessage)

      loggers.solana.warn({
        ...logContext,
        attempt: attempt + 1,
        maxRetries,
        error: errorMessage,
        isRetryable,
      }, 'Versioned transaction attempt failed')

      if (!isRetryable || attempt >= maxRetries - 1) {
        break
      }

      const delay = retryDelayMs[attempt] || retryDelayMs[retryDelayMs.length - 1]
      await sleep(delay)
    }
  }

  const errorMessage = lastError?.message || 'Transaction failed after max retries'
  loggers.solana.error({
    ...logContext,
    attempts,
    error: errorMessage,
  }, 'Versioned transaction failed')

  return {
    success: false,
    error: errorMessage,
    attempts,
  }
}

/**
 * Send a pre-serialized transaction (base64 encoded) with retry logic
 * Automatically detects versioned vs legacy transaction format
 */
export async function sendSerializedTransactionWithRetry(
  connection: Connection,
  serializedTx: string,
  signer: Keypair,
  options: SendTransactionOptions = {}
): Promise<TransactionResult> {
  const {
    skipPreflight = false,
    maxRetries = 3,
    retryDelayMs = [2000, 5000, 10000],
    commitment = 'confirmed',
    logContext = {},
  } = options

  let lastError: Error | null = null
  let attempts = 0

  const txBuffer = Buffer.from(serializedTx, 'base64')

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    attempts++
    try {
      let signature: string

      // Try to deserialize as versioned transaction first
      try {
        const versionedTx = VersionedTransaction.deserialize(txBuffer)
        versionedTx.sign([signer])
        signature = await connection.sendTransaction(versionedTx, {
          skipPreflight,
          maxRetries: 0,
        })
      } catch {
        // Fall back to legacy transaction
        const legacyTx = Transaction.from(txBuffer)
        legacyTx.sign(signer)
        signature = await connection.sendRawTransaction(legacyTx.serialize(), {
          skipPreflight,
          maxRetries: 0,
        })
      }

      loggers.solana.debug({
        ...logContext,
        signature,
        attempt: attempt + 1,
      }, 'Serialized transaction sent, awaiting confirmation')

      // Confirm transaction
      const latestBlockhash = await connection.getLatestBlockhash(commitment)
      const confirmationStrategy: TransactionConfirmationStrategy = {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      }

      const confirmation = await connection.confirmTransaction(
        confirmationStrategy,
        commitment
      )

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      loggers.solana.info({
        ...logContext,
        signature,
        attempts,
      }, 'Serialized transaction confirmed')

      return {
        success: true,
        signature,
        attempts,
      }
    } catch (error) {
      lastError = error as Error

      const errorMessage = error instanceof Error ? error.message : String(error)
      const isRetryable = isRetryableError(errorMessage)

      loggers.solana.warn({
        ...logContext,
        attempt: attempt + 1,
        maxRetries,
        error: errorMessage,
        isRetryable,
      }, 'Serialized transaction attempt failed')

      if (!isRetryable || attempt >= maxRetries - 1) {
        break
      }

      const delay = retryDelayMs[attempt] || retryDelayMs[retryDelayMs.length - 1]
      await sleep(delay)
    }
  }

  const errorMessage = lastError?.message || 'Transaction failed after max retries'
  loggers.solana.error({
    ...logContext,
    attempts,
    error: errorMessage,
  }, 'Serialized transaction failed')

  return {
    success: false,
    error: errorMessage,
    attempts,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an error is retryable
 */
function isRetryableError(errorMessage: string): boolean {
  const retryablePatterns = [
    'BlockhashNotFound',
    'blockhash not found',
    'block height exceeded',
    'Transaction was not confirmed',
    'timeout',
    'ETIMEDOUT',
    'ECONNRESET',
    'ENOTFOUND',
    'socket hang up',
    '429', // Rate limited
    '503', // Service unavailable
    '502', // Bad gateway
    'Transaction simulation failed',
  ]

  const lowercaseError = errorMessage.toLowerCase()
  return retryablePatterns.some(pattern =>
    lowercaseError.includes(pattern.toLowerCase())
  )
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Extract transaction error from SendTransactionError
 */
export function extractTransactionError(error: unknown): string {
  if (error instanceof SendTransactionError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
