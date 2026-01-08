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
import { supabase } from '../config/database'
import { getKeypairFromEncrypted } from './wallet-generator'

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
    console.warn('⚠️ Supabase not configured')
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
    console.error('Error fetching pending refunds:', error)
    return []
  }

  // Enrich with current balance and original funder
  const enrichedData = await Promise.all(
    (data || []).map(async (launch) => {
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
        console.error(`Error enriching launch ${launch.id}:`, error)
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
 * Find the original address that funded the dev wallet
 * by looking at the first incoming SOL transfer
 */
export async function findOriginalFunder(devWalletAddress: string): Promise<string | null> {
  try {
    const devWalletPubkey = new PublicKey(devWalletAddress)

    // Get transaction signatures for this wallet
    const signatures = await connection.getSignaturesForAddress(devWalletPubkey, {
      limit: 20, // Check last 20 transactions
    })

    if (signatures.length === 0) return null

    // Look through transactions to find the first incoming SOL transfer
    for (const sig of signatures.reverse()) {
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
    console.error('Error finding original funder:', error)
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

    // Get the dev wallet keypair
    const devWalletKeypair = getKeypairFromEncrypted(
      launch.dev_wallet_private_key_encrypted,
      launch.dev_encryption_iv,
      launch.dev_encryption_auth_tag || ''
    )

    // Check current balance
    const currentBalance = await getBalance(devWalletKeypair.publicKey)
    if (currentBalance <= RENT_RESERVE_SOL) {
      return { success: false, error: `Insufficient balance: ${currentBalance} SOL` }
    }

    // Calculate refund amount (leave rent reserve)
    const refundAmountSol = currentBalance - RENT_RESERVE_SOL
    const refundAmountLamports = Math.floor(refundAmountSol * LAMPORTS_PER_SOL)

    console.log(`💸 Refunding ${refundAmountSol.toFixed(6)} SOL to ${refundAddress}`)

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

    console.log(`✅ Refund successful: ${signature}`)

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
    console.error('Refund failed:', error)

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
    console.error('Error sending refund notification:', error)
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
    console.error('Error fetching audit logs:', error)
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
    console.error('Error fetching launch stats:', error)
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
