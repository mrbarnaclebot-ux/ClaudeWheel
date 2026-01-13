// ═══════════════════════════════════════════════════════════════════════════
// REFUND SERVICE
// Handles refunding SOL to users when launches fail or expire
// ═══════════════════════════════════════════════════════════════════════════

import {
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import { connection, getBalance } from '../config/solana'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { loggers } from '../utils/logger'

// Legacy Supabase removed - stub for backward compatibility
const supabase = null as any

// Legacy encryption removed - this function will throw if called
function getKeypairFromEncrypted(_encrypted: string, _iv: string, _authTag: string): never {
  throw new Error('Legacy encryption removed. Use Privy delegated signing for refunds.')
}

// Minimum SOL to keep for rent exemption
const RENT_RESERVE_SOL = 0.001

export interface PendingRefund {
  id: string
  telegram_user_id: string
  token_name: string
  token_symbol: string
  dev_wallet_address: string
  dev_wallet_private_key_encrypted: string
  dev_encryption_iv: string
  dev_encryption_auth_tag: string | null
  status: string
  deposit_received_sol: number
  error_message: string | null
  created_at: string
  updated_at: string
  telegram_users: {
    telegram_id: number
  } | null
  // Computed fields
  current_balance?: number
  original_funder?: string
}

export interface RefundResult {
  success: boolean
  signature?: string
  amountRefunded?: number
  refundAddress?: string
  error?: string
}

/**
 * Get all launches that need refunds (failed or expired with balance)
 */
export async function getPendingRefunds(): Promise<PendingRefund[]> {
  if (!supabase) {
    loggers.refund.warn('Supabase not configured')
    return []
  }

  const { data, error } = await supabase
    .from('pending_token_launches')
    .select(`
      *,
      telegram_users (telegram_id)
    `)
    .in('status', ['failed', 'expired'])
    .gt('deposit_received_sol', 0)
    .order('updated_at', { ascending: false })

  if (error) {
    loggers.refund.error({ error: String(error) }, 'Error fetching pending refunds')
    return []
  }

  // Enrich with current balance and original funder
  const enrichedData = await Promise.all(
    (data || []).map(async (launch: any) => {
      try {
        const devWalletPubkey = new PublicKey(launch.dev_wallet_address)
        const currentBalance = await getBalance(devWalletPubkey)

        // Find the original funder by looking at transaction history
        const originalFunder = await findOriginalFunder(launch.dev_wallet_address)

        return {
          ...launch,
          current_balance: currentBalance,
          original_funder: originalFunder,
        }
      } catch (error) {
        loggers.refund.error({ launchId: launch.id, error: String(error) }, 'Error enriching launch')
        return {
          ...launch,
          current_balance: 0,
          original_funder: null,
        }
      }
    })
  )

  return enrichedData
}

/**
 * Find the address that most recently funded the dev wallet
 * by looking at the most recent incoming SOL transfer
 * This ensures refunds go to the correct sender for this specific launch
 */
export async function findOriginalFunder(devWalletAddress: string): Promise<string | null> {
  try {
    const devWalletPubkey = new PublicKey(devWalletAddress)

    // Get transaction signatures for this wallet (most recent first)
    const signatures = await connection.getSignaturesForAddress(devWalletPubkey, {
      limit: 20, // Check last 20 transactions
    })

    if (signatures.length === 0) return null

    // Look through transactions to find the most recent incoming SOL transfer
    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        })

        if (!tx?.meta || !tx.transaction.message.instructions) continue

        // Look for system program transfer to this wallet
        for (const instruction of tx.transaction.message.instructions) {
          if ('parsed' in instruction &&
              instruction.program === 'system' &&
              instruction.parsed?.type === 'transfer') {
            const info = instruction.parsed.info
            if (info.destination === devWalletAddress && info.lamports > 0) {
              return info.source // Return the sender's address
            }
          }
        }
      } catch (e) {
        // Skip failed transaction fetches
        continue
      }
    }

    return null
  } catch (error) {
    loggers.refund.error({ error: String(error) }, 'Error finding original funder')
    return null
  }
}

/**
 * Execute a refund for a pending launch
 */
export async function executeRefund(
  launchId: string,
  refundAddress: string
): Promise<RefundResult> {
  if (!supabase) {
    return { success: false, error: 'Supabase not configured' }
  }

  try {
    // Get the launch details
    const { data: launch, error: fetchError } = await supabase
      .from('pending_token_launches')
      .select(`
        *,
        telegram_users (telegram_id)
      `)
      .eq('id', launchId)
      .single()

    if (fetchError || !launch) {
      return { success: false, error: 'Launch not found' }
    }

    // Verify status allows refund
    if (!['failed', 'expired'].includes(launch.status)) {
      return { success: false, error: `Cannot refund launch with status: ${launch.status}` }
    }

    // Validate refund address
    let refundPubkey: PublicKey
    try {
      refundPubkey = new PublicKey(refundAddress)
    } catch {
      return { success: false, error: 'Invalid refund address' }
    }

    // LEGACY: Encryption-based refund is deprecated
    // This will throw at runtime - use Privy delegated signing for refunds
    const devWalletKeypair = getKeypairFromEncrypted(
      launch.dev_wallet_private_key_encrypted,
      launch.dev_encryption_iv,
      launch.dev_encryption_auth_tag || ''
    ) as any as import('@solana/web3.js').Keypair

    // Check current balance
    const currentBalance = await getBalance(devWalletKeypair.publicKey)
    if (currentBalance <= RENT_RESERVE_SOL) {
      return { success: false, error: `Insufficient balance: ${currentBalance} SOL` }
    }

    // Calculate refund amount (leave rent reserve)
    const refundAmountSol = currentBalance - RENT_RESERVE_SOL
    const refundAmountLamports = Math.floor(refundAmountSol * LAMPORTS_PER_SOL)

    loggers.refund.info({ amountSol: refundAmountSol, refundAddress }, 'Processing refund')

    // Create transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: devWalletKeypair.publicKey,
        toPubkey: refundPubkey,
        lamports: refundAmountLamports,
      })
    )

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
    transaction.recentBlockhash = blockhash
    transaction.feePayer = devWalletKeypair.publicKey

    // Sign and send transaction
    transaction.sign(devWalletKeypair)
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    })

    // Wait for confirmation
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed')

    loggers.refund.info({ signature }, 'Refund successful')

    // Update database
    await supabase
      .from('pending_token_launches')
      .update({
        status: 'refunded',
        error_message: `Refunded ${refundAmountSol.toFixed(6)} SOL to ${refundAddress}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', launchId)

    // Log audit event
    await supabase.from('audit_log').insert({
      event_type: 'refund_executed',
      pending_launch_id: launchId,
      telegram_id: launch.telegram_users?.telegram_id,
      details: {
        refund_address: refundAddress,
        amount_sol: refundAmountSol,
        signature,
      },
    })

    // Notify user via Telegram
    await notifyUserRefund(
      launch.telegram_users?.telegram_id,
      launch.token_symbol,
      refundAmountSol,
      refundAddress,
      signature
    )

    return {
      success: true,
      signature,
      amountRefunded: refundAmountSol,
      refundAddress,
    }
  } catch (error: any) {
    loggers.refund.error({ error: String(error) }, 'Refund failed')

    // Log the failure
    if (supabase) {
      await supabase.from('audit_log').insert({
        event_type: 'refund_failed',
        pending_launch_id: launchId,
        details: {
          error: error.message,
          refund_address: refundAddress,
        },
      })
    }

    return { success: false, error: error.message || 'Refund failed' }
  }
}

/**
 * Send Telegram notification about successful refund
 */
async function notifyUserRefund(
  telegramId: number | undefined,
  tokenSymbol: string,
  amountSol: number,
  refundAddress: string,
  signature: string
): Promise<void> {
  if (!telegramId) return

  try {
    const { getBot } = await import('../telegram/bot')
    const bot = getBot()
    if (bot) {
      const message = `💸 *Refund Processed*

Your ${tokenSymbol} launch funds have been refunded.

├ Amount: *${amountSol.toFixed(6)} SOL*
└ To: \`${refundAddress.slice(0, 8)}...${refundAddress.slice(-6)}\`

[View Transaction](https://solscan.io/tx/${signature})

Use /launch to try again!`

      await bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      })
    }
  } catch (error) {
    loggers.refund.error({ error: String(error) }, 'Error sending refund notification')
  }
}

/**
 * Execute a refund for a Privy pending launch using delegated signing
 */
export async function executePrivyRefund(
  launchId: string,
  devWalletAddress: string,
  refundAddress: string,
  telegramId?: number | bigint
): Promise<RefundResult> {
  try {
    // Validate addresses
    let devWalletPubkey: PublicKey
    let refundPubkey: PublicKey
    try {
      devWalletPubkey = new PublicKey(devWalletAddress)
      refundPubkey = new PublicKey(refundAddress)
    } catch {
      return { success: false, error: 'Invalid wallet address' }
    }

    // Check current balance
    const currentBalance = await getBalance(devWalletPubkey)
    if (currentBalance <= RENT_RESERVE_SOL) {
      return { success: false, error: `Insufficient balance: ${currentBalance} SOL` }
    }

    // Calculate refund amount (leave rent reserve)
    const refundAmountSol = currentBalance - RENT_RESERVE_SOL
    const refundAmountLamports = Math.floor(refundAmountSol * LAMPORTS_PER_SOL)

    loggers.refund.info({ amountSol: refundAmountSol, refundAddress }, 'Processing Privy refund')

    // Create transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: devWalletPubkey,
        toPubkey: refundPubkey,
        lamports: refundAmountLamports,
      })
    )

    // Get recent blockhash - use 'finalized' for longer validity window due to Privy API latency
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized')
    transaction.recentBlockhash = blockhash
    transaction.feePayer = devWalletPubkey

    // Use Privy service to sign and send
    const { privyService } = await import('./privy.service')

    if (!privyService.canSignTransactions()) {
      return { success: false, error: 'Privy signing not configured - missing PRIVY_AUTHORIZATION_KEY' }
    }

    const signature = await privyService.signAndSendSolanaTransaction(
      devWalletAddress,
      transaction
    )

    if (!signature) {
      return { success: false, error: 'Privy signing failed' }
    }

    // Wait for confirmation
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed')

    loggers.refund.info({ signature }, 'Privy refund successful')

    // Update database using Prisma
    if (isPrismaConfigured()) {
      await prisma.privyPendingLaunch.update({
        where: { id: launchId },
        data: {
          status: 'refunded',
          lastError: `Refunded ${refundAmountSol.toFixed(6)} SOL to ${refundAddress}`,
          updatedAt: new Date(),
        },
      })
    }

    // Log audit event
    if (supabase) {
      await supabase.from('audit_log').insert({
        event_type: 'privy_refund_executed',
        details: {
          privy_launch_id: launchId,
          refund_address: refundAddress,
          amount_sol: refundAmountSol,
          signature,
          telegram_id: telegramId ? Number(telegramId) : null,
        },
      })
    }

    // Notify user via Telegram if we have their ID
    if (telegramId) {
      await notifyUserRefund(
        Number(telegramId),
        'your token',
        refundAmountSol,
        refundAddress,
        signature
      )
    }

    return {
      success: true,
      signature,
      amountRefunded: refundAmountSol,
      refundAddress,
    }
  } catch (error: any) {
    loggers.refund.error({ error: String(error) }, 'Privy refund failed')

    // Log the failure
    if (supabase) {
      await supabase.from('audit_log').insert({
        event_type: 'privy_refund_failed',
        details: {
          privy_launch_id: launchId,
          error: error.message,
          refund_address: refundAddress,
        },
      })
    }

    return { success: false, error: error.message || 'Privy refund failed' }
  }
}

/**
 * Get all Telegram-related audit logs
 */
export async function getTelegramAuditLogs(limit: number = 100): Promise<any[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    loggers.refund.error({ error: String(error) }, 'Error fetching audit logs')
    return []
  }

  return data || []
}

/**
 * Get launch statistics for admin dashboard
 */
export async function getLaunchStats(): Promise<{
  total: number
  awaiting: number
  launching: number
  completed: number
  failed: number
  expired: number
  refunded: number
  totalDeposited: number
  totalRefunded: number
}> {
  if (!supabase) {
    return {
      total: 0,
      awaiting: 0,
      launching: 0,
      completed: 0,
      failed: 0,
      expired: 0,
      refunded: 0,
      totalDeposited: 0,
      totalRefunded: 0,
    }
  }

  const { data, error } = await supabase
    .from('pending_token_launches')
    .select('status, deposit_received_sol')

  if (error || !data) {
    loggers.refund.error({ error: String(error) }, 'Error fetching launch stats')
    return {
      total: 0,
      awaiting: 0,
      launching: 0,
      completed: 0,
      failed: 0,
      expired: 0,
      refunded: 0,
      totalDeposited: 0,
      totalRefunded: 0,
    }
  }

  const stats = {
    total: data.length,
    awaiting: 0,
    launching: 0,
    completed: 0,
    failed: 0,
    expired: 0,
    refunded: 0,
    totalDeposited: 0,
    totalRefunded: 0,
  }

  for (const launch of data) {
    switch (launch.status) {
      case 'awaiting_deposit':
        stats.awaiting++
        break
      case 'launching':
        stats.launching++
        break
      case 'completed':
        stats.completed++
        stats.totalDeposited += Number(launch.deposit_received_sol) || 0
        break
      case 'failed':
        stats.failed++
        break
      case 'expired':
        stats.expired++
        break
      case 'refunded':
        stats.refunded++
        stats.totalRefunded += Number(launch.deposit_received_sol) || 0
        break
    }
  }

  return stats
}
