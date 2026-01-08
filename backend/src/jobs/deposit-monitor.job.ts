// ═══════════════════════════════════════════════════════════════════════════
// DEPOSIT MONITOR JOB
// Monitors pending token launches for SOL deposits and triggers launch
// ═══════════════════════════════════════════════════════════════════════════

import cron from 'node-cron'
import { PublicKey } from '@solana/web3.js'
import { supabase } from '../config/database'
import { getConnection, getBalance } from '../config/solana'
import { tokenLauncherService } from '../services/token-launcher'

/**
 * Check if supabase is configured and throw error if not
 */
function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase not configured')
  }
  return supabase
}

// Minimum SOL required to trigger launch
const MIN_DEPOSIT_SOL = 0.5

// How often to check (every 30 seconds)
const CHECK_INTERVAL = '*/30 * * * * *'

let isRunning = false
let jobTask: cron.ScheduledTask | null = null

interface PendingLaunch {
  id: string
  telegram_user_id: string
  token_name: string
  token_symbol: string
  token_description: string | null
  token_image_url: string | null
  dev_wallet_address: string
  dev_wallet_private_key_encrypted: string
  dev_encryption_iv: string
  dev_encryption_auth_tag: string | null
  ops_wallet_address: string
  ops_wallet_private_key_encrypted: string
  ops_encryption_iv: string
  ops_encryption_auth_tag: string | null
  status: string
  deposit_received_sol: number
  retry_count: number
  expires_at: string
  telegram_users: {
    telegram_id: number
  } | null
}

/**
 * Check all pending launches for deposits
 */
async function checkPendingLaunches(): Promise<void> {
  if (isRunning) {
    return
  }

  isRunning = true

  try {
    const db = requireSupabase()

    // Get all pending launches awaiting deposit
    const { data: pendingLaunches, error } = await db
      .from('pending_token_launches')
      .select(`
        *,
        telegram_users (telegram_id)
      `)
      .eq('status', 'awaiting_deposit')
      .lt('expires_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()) // Not expired

    if (error) {
      console.error('Error fetching pending launches:', error)
      return
    }

    if (!pendingLaunches || pendingLaunches.length === 0) {
      return
    }

    console.log(`📡 Checking ${pendingLaunches.length} pending token launches...`)

    const connection = getConnection()

    for (const launch of pendingLaunches as PendingLaunch[]) {
      try {
        // Check if expired
        if (new Date(launch.expires_at) < new Date()) {
          await handleExpiredLaunch(launch)
          continue
        }

        // Check balance of dev wallet
        const devWalletPubkey = new PublicKey(launch.dev_wallet_address)
        const balance = await getBalance(devWalletPubkey)

        if (balance >= MIN_DEPOSIT_SOL) {
          console.log(`💰 Deposit detected for ${launch.token_symbol}: ${balance} SOL`)

          // Update deposit amount
          await db
            .from('pending_token_launches')
            .update({
              deposit_received_sol: balance,
              status: 'launching',
              updated_at: new Date().toISOString(),
            })
            .eq('id', launch.id)

          // Log audit event
          await db.from('audit_log').insert({
            event_type: 'deposit_received',
            pending_launch_id: launch.id,
            telegram_id: launch.telegram_users?.telegram_id,
            details: { amount_sol: balance, dev_wallet: launch.dev_wallet_address },
          })

          // Trigger token launch
          await triggerTokenLaunch(launch, balance)
        }
      } catch (error) {
        console.error(`Error checking launch ${launch.id}:`, error)
      }
    }
  } catch (error) {
    console.error('Error in deposit monitor:', error)
  } finally {
    isRunning = false
  }
}

/**
 * Handle expired pending launch
 */
async function handleExpiredLaunch(launch: PendingLaunch): Promise<void> {
  console.log(`⏰ Launch expired for ${launch.token_symbol}`)
  const db = requireSupabase()

  // Check if there's any balance to refund
  const devWalletPubkey = new PublicKey(launch.dev_wallet_address)
  const balance = await getBalance(devWalletPubkey)

  if (balance > 0.001) {
    // Has balance but not enough - mark for refund
    await db
      .from('pending_token_launches')
      .update({
        status: 'expired',
        deposit_received_sol: balance,
        error_message: `Expired with ${balance} SOL - refund pending`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', launch.id)

    // Log audit event
    await db.from('audit_log').insert({
      event_type: 'launch_expired',
      pending_launch_id: launch.id,
      telegram_id: launch.telegram_users?.telegram_id,
      details: { balance_sol: balance, needs_refund: true },
    })

    // TODO: Trigger refund process
    // For now, admin will handle refunds manually
  } else {
    // No balance - just mark as expired
    await db
      .from('pending_token_launches')
      .update({
        status: 'expired',
        error_message: 'No deposit received within 24 hours',
        updated_at: new Date().toISOString(),
      })
      .eq('id', launch.id)

    await db.from('audit_log').insert({
      event_type: 'launch_expired',
      pending_launch_id: launch.id,
      telegram_id: launch.telegram_users?.telegram_id,
      details: { balance_sol: 0, needs_refund: false },
    })
  }

  // Notify user via Telegram
  await notifyUser(
    launch.telegram_users?.telegram_id,
    `⏰ Your ${launch.token_symbol} launch has expired.\n\n${balance > 0.001 ? `Balance of ${balance.toFixed(4)} SOL will be refunded.` : 'No deposit was received.'}\n\nUse /launch to start a new launch.`
  )
}

/**
 * Trigger the actual token launch on Bags.fm
 */
async function triggerTokenLaunch(launch: PendingLaunch, depositAmount: number): Promise<void> {
  try {
    console.log(`🚀 Launching ${launch.token_symbol} on Bags.fm...`)

    // Notify user that launch is starting
    await notifyUser(
      launch.telegram_users?.telegram_id,
      `💰 *Deposit Detected!*\n\nReceived: ${depositAmount.toFixed(4)} SOL\nLaunching your token on Bags.fm...`
    )

    // Call the token launcher service
    const result = await tokenLauncherService.launchToken({
      tokenName: launch.token_name,
      tokenSymbol: launch.token_symbol,
      tokenDescription: launch.token_description || '',
      tokenImageUrl: launch.token_image_url || '',
      devWalletAddress: launch.dev_wallet_address,
      devWalletPrivateKeyEncrypted: launch.dev_wallet_private_key_encrypted,
      devEncryptionIv: launch.dev_encryption_iv,
      devEncryptionAuthTag: launch.dev_encryption_auth_tag || '',
      opsWalletAddress: launch.ops_wallet_address,
      opsWalletPrivateKeyEncrypted: launch.ops_wallet_private_key_encrypted,
      opsEncryptionIv: launch.ops_encryption_iv,
      opsEncryptionAuthTag: launch.ops_encryption_auth_tag || '',
    })

    if (result.success && result.tokenMint) {
      await handleSuccessfulLaunch(launch, result.tokenMint)
    } else {
      await handleFailedLaunch(launch, result.error || 'Unknown error')
    }
  } catch (error: any) {
    console.error(`Error launching ${launch.token_symbol}:`, error)
    await handleFailedLaunch(launch, error.message || 'Launch failed')
  }
}

/**
 * Handle successful token launch
 */
async function handleSuccessfulLaunch(launch: PendingLaunch, tokenMint: string): Promise<void> {
  console.log(`✅ Successfully launched ${launch.token_symbol}: ${tokenMint}`)
  const db = requireSupabase()

  // Update pending launch
  await db
    .from('pending_token_launches')
    .update({
      status: 'completed',
      token_mint_address: tokenMint,
      updated_at: new Date().toISOString(),
    })
    .eq('id', launch.id)

  // Get or create main user
  let { data: mainUser } = await db
    .from('users')
    .select('id')
    .eq('wallet_address', launch.dev_wallet_address)
    .single()

  if (!mainUser) {
    const { data: newUser } = await db
      .from('users')
      .insert({ wallet_address: launch.dev_wallet_address })
      .select('id')
      .single()
    mainUser = newUser
  }

  // Create user_token record
  const { data: userToken, error: tokenError } = await db
    .from('user_tokens')
    .insert({
      user_id: mainUser?.id,
      telegram_user_id: launch.telegram_user_id,
      token_mint_address: tokenMint,
      token_symbol: launch.token_symbol,
      token_name: launch.token_name,
      dev_wallet_address: launch.dev_wallet_address,
      dev_wallet_private_key_encrypted: launch.dev_wallet_private_key_encrypted,
      encryption_iv: launch.dev_encryption_iv,
      encryption_auth_tag: launch.dev_encryption_auth_tag,
      ops_wallet_address: launch.ops_wallet_address,
      ops_wallet_private_key_encrypted: launch.ops_wallet_private_key_encrypted,
      ops_encryption_iv: launch.ops_encryption_iv,
      ops_encryption_auth_tag: launch.ops_encryption_auth_tag,
      launched_via_telegram: true,
      is_active: true,
    })
    .select('id')
    .single()

  if (tokenError) {
    console.error('Error creating user_token:', tokenError)
  }

  // Create config with flywheel enabled
  if (userToken) {
    await db.from('user_token_config').insert({
      user_token_id: userToken.id,
      flywheel_active: true, // Auto-enable flywheel
      algorithm_mode: 'simple',
      min_buy_amount_sol: 0.01,
      max_buy_amount_sol: 0.05,
      slippage_bps: 300,
      auto_claim_enabled: true,
    })

    await db.from('user_flywheel_state').insert({
      user_token_id: userToken.id,
      cycle_phase: 'buy',
      buy_count: 0,
      sell_count: 0,
    })
  }

  // Log audit event
  await db.from('audit_log').insert({
    event_type: 'launch_completed',
    pending_launch_id: launch.id,
    user_token_id: userToken?.id,
    telegram_id: launch.telegram_users?.telegram_id,
    details: { token_mint: tokenMint, token_symbol: launch.token_symbol },
  })

  // Notify user
  await notifyUser(
    launch.telegram_users?.telegram_id,
    `🎉 *TOKEN LAUNCHED SUCCESSFULLY!*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*${launch.token_name} (${launch.token_symbol})*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mint: \`${tokenMint}\`

🔗 *View on Bags.fm:*
bags.fm/token/${tokenMint}

✅ Flywheel: ENABLED (auto-started)
✅ Fee Claiming: ACTIVE
✅ Algorithm: Simple mode

Your token is now live and the flywheel is running automatically!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Commands:*
• /status ${launch.token_symbol} - Check status
• /settings ${launch.token_symbol} - Adjust config
• /fund ${launch.token_symbol} - Add more SOL

🌐 *Dashboard:* claudewheel.com/dashboard`
  )
}

/**
 * Handle failed token launch
 */
async function handleFailedLaunch(launch: PendingLaunch, errorMessage: string): Promise<void> {
  console.error(`❌ Failed to launch ${launch.token_symbol}: ${errorMessage}`)
  const db = requireSupabase()

  const newRetryCount = (launch.retry_count || 0) + 1
  const maxRetries = 3

  if (newRetryCount < maxRetries) {
    // Update for retry
    await db
      .from('pending_token_launches')
      .update({
        status: 'awaiting_deposit', // Reset to try again
        retry_count: newRetryCount,
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', launch.id)

    await notifyUser(
      launch.telegram_users?.telegram_id,
      `⚠️ Launch attempt ${newRetryCount} failed for ${launch.token_symbol}.\n\nError: ${errorMessage}\n\nRetrying automatically...`
    )
  } else {
    // Max retries reached - mark as failed
    await db
      .from('pending_token_launches')
      .update({
        status: 'failed',
        retry_count: newRetryCount,
        error_message: `Max retries reached. Last error: ${errorMessage}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', launch.id)

    // Log audit event
    await db.from('audit_log').insert({
      event_type: 'launch_failed',
      pending_launch_id: launch.id,
      telegram_id: launch.telegram_users?.telegram_id,
      details: { error: errorMessage, retry_count: newRetryCount },
    })

    // Notify user about failure and refund
    await notifyUser(
      launch.telegram_users?.telegram_id,
      `❌ *Launch Failed*

Your ${launch.token_symbol} launch could not be completed after ${maxRetries} attempts.

Error: ${errorMessage}

Your SOL will be refunded to your wallet. Please contact support if you need assistance.

Use /launch to try again with a new token.`
    )

    // TODO: Trigger automatic refund
  }
}

/**
 * Send notification to Telegram user
 */
async function notifyUser(telegramId: number | undefined, message: string): Promise<void> {
  if (!telegramId) return

  try {
    const { getBot } = await import('../telegram/bot')
    const bot = getBot()
    if (bot) {
      await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' })
    }
  } catch (error) {
    console.error('Error sending Telegram notification:', error)
  }
}

/**
 * Start the deposit monitor job
 */
export function startDepositMonitorJob(): void {
  if (jobTask) {
    console.log('⚠️ Deposit monitor job already running')
    return
  }

  console.log('🔄 Starting deposit monitor job (every 30 seconds)')

  jobTask = cron.schedule(CHECK_INTERVAL, async () => {
    await checkPendingLaunches()
  })

  // Run immediately on start
  checkPendingLaunches()
}

/**
 * Stop the deposit monitor job
 */
export function stopDepositMonitorJob(): void {
  if (jobTask) {
    jobTask.stop()
    jobTask = null
    console.log('⏹️ Deposit monitor job stopped')
  }
}

/**
 * Get job status
 */
export function getDepositMonitorStatus(): { running: boolean; isProcessing: boolean } {
  return {
    running: jobTask !== null,
    isProcessing: isRunning,
  }
}
