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
  PublicKey,
} from '@solana/web3.js'
import { loggers } from './logger'
import { privyService } from '../services/privy.service'

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
// PRIVY DELEGATED SIGNING FUNCTIONS
// For transactions signed via Privy's server-side wallet API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sign and send a transaction using Privy - EXACT copy of token-launcher.ts pattern
 *
 * CRITICAL: This function does NOT modify blockhash - Bags SDK provides fresh ones.
 * But for legacy Transaction, we MUST set feePayer if not already set.
 * This is the pattern that WORKS for token launches.
 */
export async function signAndSendWithPrivyExact(
  connection: Connection,
  walletAddress: string,
  transaction: Transaction | VersionedTransaction,
  description: string = 'transaction'
): Promise<{ success: boolean; signature?: string; error?: string }> {

  loggers.solana.debug({ description, walletAddress }, `Signing ${description} with Privy (exact pattern)`)

  try {
    // For legacy Transaction, ensure feePayer is set (required before signing)
    // VersionedTransaction has feePayer baked into message, so this only applies to legacy
    if (transaction instanceof Transaction) {
      if (!transaction.feePayer) {
        transaction.feePayer = new PublicKey(walletAddress)
        loggers.solana.debug({ description }, 'Set feePayer for legacy Transaction')
      }

      // Log transaction details for debugging
      loggers.solana.debug({
        description,
        feePayer: transaction.feePayer?.toBase58(),
        recentBlockhash: transaction.recentBlockhash?.slice(0, 8) + '...',
        instructionCount: transaction.instructions.length,
      }, 'Legacy Transaction details before signing')
    }

    // Sign with Privy - NO blockhash modifications (SDK provides fresh ones)
    const signedTx = await privyService.signSolanaTransaction(walletAddress, transaction)

    if (!signedTx) {
      return { success: false, error: `Privy signing returned null for ${description}` }
    }

    loggers.solana.debug({ description }, `${description} signed by Privy, preparing to broadcast`)

    // Log signature state BEFORE serialization to diagnose issues
    if (signedTx instanceof Transaction) {
      const sigInfo = signedTx.signatures.map(s => ({
        pubkey: s.publicKey.toBase58(),
        hasSig: s.signature !== null,
        sigLength: s.signature?.length || 0,
      }))
      loggers.solana.info({
        description,
        signatureCount: signedTx.signatures.length,
        signatures: sigInfo,
        feePayer: signedTx.feePayer?.toBase58(),
        recentBlockhash: signedTx.recentBlockhash,
      }, 'Transaction state after Privy signing (before serialize)')
    }

    // Serialize - handle both Transaction and VersionedTransaction
    // IMPORTANT: Use same serialization as WHEEL claims (no requireAllSignatures option)
    let serialized: Buffer
    try {
      if (signedTx instanceof VersionedTransaction) {
        serialized = Buffer.from(signedTx.serialize())
      } else if (signedTx instanceof Transaction) {
        // Try without options first (like WHEEL does) - this will throw if not fully signed
        try {
          serialized = signedTx.serialize()
        } catch (serializeError) {
          // If that fails, the transaction wasn't properly signed
          loggers.solana.error({
            description,
            error: String(serializeError),
          }, 'Transaction not fully signed - Privy signing may have failed')
          return { success: false, error: `Transaction not fully signed: ${serializeError}` }
        }
      } else if ((signedTx as any).serialize) {
        serialized = (signedTx as any).serialize()
      } else {
        return { success: false, error: `Unknown signed transaction type for ${description}` }
      }
    } catch (serError) {
      loggers.solana.error({ description, error: String(serError) }, 'Serialization failed')
      return { success: false, error: `Serialization failed: ${serError}` }
    }

    // Try with preflight FIRST to catch errors, then retry without if it fails
    let signature: string
    try {
      signature = await connection.sendRawTransaction(serialized, {
        skipPreflight: false,  // Enable preflight to catch errors
        maxRetries: 5,
      })
    } catch (preflightError: any) {
      loggers.solana.warn({
        description,
        error: String(preflightError),
      }, 'Preflight failed, retrying with skipPreflight=true')

      // Retry without preflight
      signature = await connection.sendRawTransaction(serialized, {
        skipPreflight: true,
        maxRetries: 5,
      })
    }

    loggers.solana.info({ signature, description }, `${description} broadcast, polling for confirmation`)

    // Poll for status (don't use confirmTransaction which times out)
    const maxPolls = 30 // 30 * 2s = 60s max
    for (let i = 0; i < maxPolls; i++) {
      await sleep(2000)

      const status = await connection.getSignatureStatus(signature)

      if (status && status.value) {
        if (status.value.err) {
          loggers.solana.error({ signature, error: status.value.err, description }, `${description} failed on-chain`)
          return { success: false, signature, error: `Transaction failed: ${JSON.stringify(status.value.err)}` }
        }

        if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
          loggers.solana.info({
            signature,
            description,
            confirmationStatus: status.value.confirmationStatus,
          }, `${description} confirmed on-chain`)
          return { success: true, signature }
        }

        loggers.solana.debug({ signature, poll: i + 1 }, 'Transaction processing...')
      } else {
        loggers.solana.debug({ signature, poll: i + 1 }, 'Transaction not found yet...')
      }
    }

    // Transaction not confirmed after timeout
    loggers.solana.error({ signature, description }, `${description} not confirmed after 60s`)
    return { success: false, signature, error: `Transaction not confirmed after 60 seconds. Signature: ${signature}` }
  } catch (error: any) {
    loggers.solana.error({ error: String(error), description }, `${description} failed`)
    return { success: false, error: error.message || String(error) }
  }
}

export interface PrivyTransactionOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Delay between retries in ms (default: exponential backoff) */
  retryDelayMs?: number[]
  /** Commitment level for confirmation (default: 'confirmed') */
  commitment?: 'processed' | 'confirmed' | 'finalized'
  /** Log context for debugging */
  logContext?: Record<string, unknown>
}

/**
 * Send a transaction using Privy's signAndSend method
 * Privy handles EVERYTHING: signing, serialization, broadcast
 * Use this when manual broadcast isn't working (e.g., claim transactions)
 */
export async function sendTransactionWithPrivySignAndSend(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  walletAddress: string,
  options: PrivyTransactionOptions = {}
): Promise<TransactionResult> {
  const {
    maxRetries = 3,
    retryDelayMs = [2000, 5000, 10000],
    logContext = {},
  } = options

  let lastError: Error | null = null
  let attempts = 0

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    attempts++
    try {
      loggers.solana.debug({
        ...logContext,
        walletAddress,
        attempt: attempt + 1,
      }, 'Sending transaction via Privy signAndSend')

      // Let Privy handle EVERYTHING: signing, serialization, broadcast
      const signature = await privyService.signAndSendSolanaTransaction(
        walletAddress,
        transaction
      )

      if (!signature) {
        throw new Error('Privy signAndSend returned null')
      }

      loggers.solana.info({
        ...logContext,
        signature,
        walletAddress,
        attempts,
      }, 'Privy signAndSend returned signature, polling for confirmation')

      // Poll for confirmation (transaction is already broadcast by Privy)
      const maxPolls = 30 // 30 * 2s = 60s
      for (let poll = 0; poll < maxPolls; poll++) {
        await sleep(2000)

        const status = await connection.getSignatureStatus(signature)

        if (status && status.value) {
          if (status.value.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.value.err)}`)
          }

          if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
            loggers.solana.info({
              ...logContext,
              signature,
              walletAddress,
              attempts,
              confirmationStatus: status.value.confirmationStatus,
            }, 'Privy signAndSend transaction confirmed')

            return {
              success: true,
              signature,
              attempts,
            }
          }
        }
      }

      // Timeout
      throw new Error(`Transaction not confirmed after 60s. Signature: ${signature}`)
    } catch (error) {
      lastError = error as Error

      const errorMessage = error instanceof Error ? error.message : String(error)
      const isRetryable = isRetryableError(errorMessage) ||
        errorMessage.includes('BLOCKHASH_EXPIRED')

      loggers.solana.warn({
        ...logContext,
        walletAddress,
        attempt: attempt + 1,
        maxRetries,
        error: errorMessage,
        isRetryable,
      }, 'Privy signAndSend attempt failed')

      if (!isRetryable || attempt >= maxRetries - 1) {
        break
      }

      const delay = retryDelayMs[attempt] || retryDelayMs[retryDelayMs.length - 1]
      await sleep(delay)
    }
  }

  const errorMessage = lastError?.message || 'Privy signAndSend failed after max retries'
  loggers.solana.error({
    ...logContext,
    walletAddress,
    attempts,
    error: errorMessage,
  }, 'Privy signAndSend transaction failed')

  return {
    success: false,
    error: errorMessage,
    attempts,
  }
}

/**
 * Send a transaction using Privy delegated signing
 * Works with both legacy and versioned transactions
 *
 * Uses the Orica pattern: sign with Privy RPC, broadcast ourselves, poll for status
 */
export async function sendTransactionWithPrivySigning(
  connection: Connection,
  transaction: Transaction | VersionedTransaction,
  walletAddress: string,
  options: PrivyTransactionOptions = {}
): Promise<TransactionResult> {
  const {
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
      // For legacy transactions, get fresh blockhash each attempt
      if (transaction instanceof Transaction) {
        const latestBlockhash = await connection.getLatestBlockhash(commitment)
        transaction.recentBlockhash = latestBlockhash.blockhash
        // Note: feePayer should already be set by caller
      }

      // Sign with Privy (sign only, we broadcast ourselves)
      const signedTx = await privyService.signSolanaTransaction(walletAddress, transaction)

      if (!signedTx) {
        throw new Error('Privy signing failed - no signed transaction returned')
      }

      // Serialize the signed transaction
      let serialized: Buffer
      if (signedTx instanceof VersionedTransaction) {
        serialized = Buffer.from(signedTx.serialize())
      } else if (signedTx instanceof Transaction) {
        serialized = signedTx.serialize({ requireAllSignatures: false })
      } else if ((signedTx as any).serialize) {
        serialized = (signedTx as any).serialize({ requireAllSignatures: false })
      } else {
        throw new Error('Unknown signed transaction type')
      }

      // Broadcast with skipPreflight and high retries (Orica pattern)
      const signature = await connection.sendRawTransaction(serialized, {
        skipPreflight: true,
        maxRetries: 5,
      })

      loggers.solana.debug({
        ...logContext,
        signature,
        walletAddress,
        attempt: attempt + 1,
      }, 'Privy transaction broadcast, polling for confirmation')

      // Poll for status instead of confirmTransaction (Orica pattern)
      const maxPolls = 30 // 30 * 2s = 60s
      for (let poll = 0; poll < maxPolls; poll++) {
        await sleep(2000)

        const status = await connection.getSignatureStatus(signature)

        if (status && status.value) {
          if (status.value.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.value.err)}`)
          }

          if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
            loggers.solana.info({
              ...logContext,
              signature,
              walletAddress,
              attempts,
              confirmationStatus: status.value.confirmationStatus,
            }, 'Privy transaction confirmed')

            return {
              success: true,
              signature,
              attempts,
            }
          }
        }
      }

      // Timeout - but transaction might still land
      throw new Error(`Transaction not confirmed after 60s. Signature: ${signature}`)
    } catch (error) {
      lastError = error as Error

      const errorMessage = error instanceof Error ? error.message : String(error)
      const isRetryable = isRetryableError(errorMessage)

      loggers.solana.warn({
        ...logContext,
        walletAddress,
        attempt: attempt + 1,
        maxRetries,
        error: errorMessage,
        isRetryable,
      }, 'Privy transaction attempt failed')

      if (!isRetryable || attempt >= maxRetries - 1) {
        break
      }

      const delay = retryDelayMs[attempt] || retryDelayMs[retryDelayMs.length - 1]
      await sleep(delay)
    }
  }

  const errorMessage = lastError?.message || 'Privy transaction failed after max retries'
  loggers.solana.error({
    ...logContext,
    walletAddress,
    attempts,
    error: errorMessage,
  }, 'Privy transaction failed')

  return {
    success: false,
    error: errorMessage,
    attempts,
  }
}

/**
 * Send a pre-serialized transaction (base64 encoded) using Privy delegated signing
 * Automatically detects versioned vs legacy transaction format
 *
 * Uses the Orica pattern: sign with Privy RPC, broadcast ourselves, poll for status
 */
export async function sendSerializedTransactionWithPrivySigning(
  connection: Connection,
  serializedTx: string,
  walletAddress: string,
  options: PrivyTransactionOptions = {}
): Promise<TransactionResult> {
  const {
    maxRetries = 3,
    retryDelayMs = [2000, 5000, 10000],
    logContext = {},
  } = options

  let lastError: Error | null = null
  let attempts = 0

  const txBuffer = Buffer.from(serializedTx, 'base64')

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    attempts++
    try {
      let transaction: Transaction | VersionedTransaction

      // Try to deserialize as versioned transaction first
      try {
        transaction = VersionedTransaction.deserialize(txBuffer)
      } catch {
        // Fall back to legacy transaction
        transaction = Transaction.from(txBuffer)
      }

      // Sign with Privy (sign only, we broadcast ourselves)
      const signedTx = await privyService.signSolanaTransaction(walletAddress, transaction)

      if (!signedTx) {
        throw new Error('Privy signing failed - no signed transaction returned')
      }

      // Serialize the signed transaction
      let serialized: Buffer
      if (signedTx instanceof VersionedTransaction) {
        serialized = Buffer.from(signedTx.serialize())
      } else if (signedTx instanceof Transaction) {
        serialized = signedTx.serialize({ requireAllSignatures: false })
      } else if ((signedTx as any).serialize) {
        serialized = (signedTx as any).serialize({ requireAllSignatures: false })
      } else {
        throw new Error('Unknown signed transaction type')
      }

      // Broadcast with skipPreflight and high retries (Orica pattern)
      const signature = await connection.sendRawTransaction(serialized, {
        skipPreflight: true,
        maxRetries: 5,
      })

      loggers.solana.debug({
        ...logContext,
        signature,
        walletAddress,
        attempt: attempt + 1,
      }, 'Privy serialized transaction broadcast, polling for confirmation')

      // Poll for status instead of confirmTransaction (Orica pattern)
      const maxPolls = 30 // 30 * 2s = 60s
      for (let poll = 0; poll < maxPolls; poll++) {
        await sleep(2000)

        const status = await connection.getSignatureStatus(signature)

        if (status && status.value) {
          if (status.value.err) {
            throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.value.err)}`)
          }

          if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
            loggers.solana.info({
              ...logContext,
              signature,
              walletAddress,
              attempts,
              confirmationStatus: status.value.confirmationStatus,
            }, 'Privy serialized transaction confirmed')

            return {
              success: true,
              signature,
              attempts,
            }
          }
        }
      }

      // Timeout - but transaction might still land
      throw new Error(`Transaction not confirmed after 60s. Signature: ${signature}`)
    } catch (error) {
      lastError = error as Error

      const errorMessage = error instanceof Error ? error.message : String(error)
      const isRetryable = isRetryableError(errorMessage)

      loggers.solana.warn({
        ...logContext,
        walletAddress,
        attempt: attempt + 1,
        maxRetries,
        error: errorMessage,
        isRetryable,
      }, 'Privy serialized transaction attempt failed')

      if (!isRetryable || attempt >= maxRetries - 1) {
        break
      }

      const delay = retryDelayMs[attempt] || retryDelayMs[retryDelayMs.length - 1]
      await sleep(delay)
    }
  }

  const errorMessage = lastError?.message || 'Privy serialized transaction failed after max retries'
  loggers.solana.error({
    ...logContext,
    walletAddress,
    attempts,
    error: errorMessage,
  }, 'Privy serialized transaction failed')

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
