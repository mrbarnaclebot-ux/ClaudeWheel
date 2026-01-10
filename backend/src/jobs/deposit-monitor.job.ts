// ═══════════════════════════════════════════════════════════════════════════
// DEPOSIT MONITOR JOB
// Monitors pending token launches for SOL deposits and triggers launch
// ═══════════════════════════════════════════════════════════════════════════

import cron from 'node-cron'
import { loggers } from '../utils/logger'
import { PublicKey } from '@solana/web3.js'
import { supabase } from '../config/database'
import { prisma, isPrismaConfigured, type PrivyPendingLaunch as PrismaPrivyPendingLaunch, type PrivyWallet } from '../config/prisma'
import { getConnection, getBalance } from '../config/solana'
import { tokenLauncherService } from '../services/token-launcher'
import { executeRefund, executePrivyRefund, findOriginalFunder } from '../services/refund.service'

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
const MIN_DEPOSIT_SOL = 0.1 // Minimum required, 0.5 recommended for MM funding

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
  // Social links (optional)
  twitter_url: string | null
  telegram_url: string | null
  website_url: string | null
  discord_url: string | null
  // Wallet encryption
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
      .lt('expires_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()) // Includes expired (handled separately below)

    if (error) {
      loggers.deposit.error({ error: String(error) }, 'Error fetching pending launches')
      return
    }

    if (!pendingLaunches || pendingLaunches.length === 0) {
      return
    }

    loggers.deposit.info({ count: pendingLaunches.length }, '📡 Checking pending token launches...')

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
          loggers.deposit.info({ tokenSymbol: launch.token_symbol, balance }, '💰 Deposit detected')

          // Atomic update with optimistic locking - only update if status is still 'awaiting_deposit'
          // This prevents race conditions when multiple instances detect the same deposit
          const { data: updated, error: updateError } = await db
            .from('pending_token_launches')
            .update({
              deposit_received_sol: balance,
              status: 'launching',
              updated_at: new Date().toISOString(),
            })
            .eq('id', launch.id)
            .eq('status', 'awaiting_deposit') // Only update if still awaiting
            .select()
            .single()

          // Handle update result - differentiate between race condition and real errors
          if (updateError) {
            // Real database error - log as error, not info
            loggers.deposit.error({ launchId: launch.id, error: String(updateError) }, '❌ Database error updating launch status')
            continue
          }
          if (!updated) {
            // No rows updated means another process got it first (race condition) - this is expected
            loggers.deposit.info({ launchId: launch.id }, '⏭️ Launch already being processed by another instance')
            continue
          }

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
        loggers.deposit.error({ launchId: launch.id, error: String(error) }, 'Error checking launch')
      }
    }
  } catch (error) {
    loggers.deposit.error({ error: String(error) }, 'Error in deposit monitor')
  } finally {
    isRunning = false
  }
}

/**
 * Handle expired pending launch
 */
async function handleExpiredLaunch(launch: PendingLaunch): Promise<void> {
  loggers.deposit.info({ tokenSymbol: launch.token_symbol }, '⏰ Launch expired')
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
        error_message: `Expired with ${balance} SOL - processing refund`,
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

    // Trigger automatic refund
    try {
      // Find the original funder address to refund to
      const originalFunder = await findOriginalFunder(launch.dev_wallet_address)
      if (originalFunder) {
        loggers.deposit.info({ balance: balance.toFixed(4), originalFunder }, '💸 Auto-refunding SOL to original funder')
        const refundResult = await executeRefund(launch.id, originalFunder)
        if (refundResult.success) {
          loggers.deposit.info({ signature: refundResult.signature }, '✅ Auto-refund successful')
          // Notification is handled by executeRefund
          return
        } else {
          loggers.deposit.error({ error: refundResult.error }, '❌ Auto-refund failed')
        }
      } else {
        loggers.deposit.warn({ tokenSymbol: launch.token_symbol }, '⚠️ Could not find original funder - manual refund required')
      }
    } catch (refundError) {
      loggers.deposit.error({ error: String(refundError) }, 'Auto-refund error')
    }
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
    loggers.deposit.info({ tokenSymbol: launch.token_symbol }, '🚀 Launching on Bags.fm...')

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
      // Social links (optional)
      twitterUrl: launch.twitter_url || undefined,
      telegramUrl: launch.telegram_url || undefined,
      websiteUrl: launch.website_url || undefined,
      discordUrl: launch.discord_url || undefined,
      // Wallet encryption
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
    loggers.deposit.error({ tokenSymbol: launch.token_symbol, error: String(error) }, 'Error launching token')
    await handleFailedLaunch(launch, error.message || 'Launch failed')
  }
}

/**
 * Handle successful token launch
 */
async function handleSuccessfulLaunch(launch: PendingLaunch, tokenMint: string): Promise<void> {
  loggers.deposit.info({ tokenSymbol: launch.token_symbol, tokenMint }, '✅ Successfully launched token')
  const db = requireSupabase()

  try {
    // Update pending launch status first
    const { error: updateError } = await db
      .from('pending_token_launches')
      .update({
        status: 'completed',
        token_mint_address: tokenMint,
        updated_at: new Date().toISOString(),
      })
      .eq('id', launch.id)

    if (updateError) {
      console.error('Error updating pending launch status:', updateError)
    }

    // Get or create main user
    let { data: mainUser, error: userFetchError } = await db
      .from('users')
      .select('id')
      .eq('wallet_address', launch.dev_wallet_address)
      .single()

    if (userFetchError && userFetchError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is expected for new users
      console.error('Error fetching user:', userFetchError)
    }

    if (!mainUser) {
      const { data: newUser, error: createUserError } = await db
        .from('users')
        .insert({ wallet_address: launch.dev_wallet_address })
        .select('id')
        .single()

      if (createUserError) {
        console.error('Error creating user:', createUserError)
        throw new Error(`Failed to create user: ${createUserError.message}`)
      }
      mainUser = newUser
    }

    if (!mainUser?.id) {
      throw new Error('Failed to get or create user - mainUser.id is null')
    }

    // Create user_token record
    // Note: encryption_auth_tag must not be null for DB constraint
    const { data: userToken, error: tokenError } = await db
      .from('user_tokens')
      .insert({
        user_id: mainUser.id,
        telegram_user_id: launch.telegram_user_id,
        token_mint_address: tokenMint,
        token_symbol: launch.token_symbol,
        token_name: launch.token_name,
        dev_wallet_address: launch.dev_wallet_address,
        dev_wallet_private_key_encrypted: launch.dev_wallet_private_key_encrypted,
        dev_encryption_iv: launch.dev_encryption_iv,
        dev_encryption_auth_tag: launch.dev_encryption_auth_tag || '', // Fallback to empty string if null
        ops_wallet_address: launch.ops_wallet_address,
        ops_wallet_private_key_encrypted: launch.ops_wallet_private_key_encrypted,
        ops_encryption_iv: launch.ops_encryption_iv,
        ops_encryption_auth_tag: launch.ops_encryption_auth_tag || '', // Fallback to empty string if null
        launched_via_telegram: true,
        is_active: true,
      })
      .select('id')
      .single()

    if (tokenError) {
      console.error('❌ Error creating user_token:', tokenError)
      console.error('   Insert data:', {
        user_id: mainUser.id,
        telegram_user_id: launch.telegram_user_id,
        token_mint_address: tokenMint,
        token_symbol: launch.token_symbol,
        dev_wallet_address: launch.dev_wallet_address?.slice(0, 8) + '...',
        has_encryption_iv: !!launch.dev_encryption_iv,
        has_encryption_auth_tag: !!launch.dev_encryption_auth_tag,
      })
      throw new Error(`Failed to create user_token: ${tokenError.message}`)
    }

    if (!userToken?.id) {
      throw new Error('Failed to create user_token - userToken.id is null')
    }

    console.log(`📝 Created user_token: ${userToken.id}`)

    // Create config with flywheel enabled
    const { error: configError } = await db.from('user_token_config').insert({
      user_token_id: userToken.id,
      flywheel_active: true, // Auto-enable flywheel
      algorithm_mode: 'simple',
      min_buy_amount_sol: 0.01,
      max_buy_amount_sol: 0.05,
      slippage_bps: 300,
      auto_claim_enabled: true,
    })

    if (configError) {
      console.error('❌ Error creating user_token_config:', configError)
      // Don't throw - the token record exists, config can be created later
    } else {
      console.log(`⚙️ Created user_token_config for ${userToken.id}`)
    }

    const { error: stateError } = await db.from('user_flywheel_state').insert({
      user_token_id: userToken.id,
      cycle_phase: 'buy',
      buy_count: 0,
      sell_count: 0,
    })

    if (stateError) {
      console.error('❌ Error creating user_flywheel_state:', stateError)
      // Don't throw - the token record exists, state can be created later
    } else {
      console.log(`🔄 Created user_flywheel_state for ${userToken.id}`)
    }

    // Update pending launch with user_token_id reference
    await db
      .from('pending_token_launches')
      .update({ user_token_id: userToken.id })
      .eq('id', launch.id)

    // Log audit event
    await db.from('audit_log').insert({
      event_type: 'launch_completed',
      pending_launch_id: launch.id,
      user_token_id: userToken.id,
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💸 *Fee Split Reminder*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Trading fees collected automatically:
├ 90% → Your Ops Wallet
└ 10% → Claude Wheel (platform fee)

Your token is now live and the flywheel is running!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Commands:*
• /status ${launch.token_symbol} - Check status
• /settings ${launch.token_symbol} - Adjust config
• /fund ${launch.token_symbol} - Add more SOL

🌐 *Dashboard:* claudewheel.com/dashboard`
    )
  } catch (dbError: any) {
    // Database operations failed after successful launch
    console.error('❌ Database error after successful token launch:', dbError)
    console.error('   Token mint:', tokenMint)
    console.error('   Launch ID:', launch.id)

    // Notify user about the issue
    await notifyUser(
      launch.telegram_users?.telegram_id,
      `🎉 *TOKEN LAUNCHED ON BAGS.FM!*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*${launch.token_name} (${launch.token_symbol})*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mint: \`${tokenMint}\`

🔗 *View on Bags.fm:*
bags.fm/token/${tokenMint}

⚠️ *Note:* There was an issue registering your token in our system. Please use /register to manually add it so you can use /status and flywheel features.

🌐 *Dashboard:* claudewheel.com/dashboard`
    )

    // Log the error in audit
    const db = requireSupabase()
    await db.from('audit_log').insert({
      event_type: 'launch_db_error',
      pending_launch_id: launch.id,
      telegram_id: launch.telegram_users?.telegram_id,
      details: {
        token_mint: tokenMint,
        token_symbol: launch.token_symbol,
        error: dbError.message,
      },
    })
  }
}

/**
 * Handle failed token launch
 */
async function handleFailedLaunch(launch: PendingLaunch, errorMessage: string): Promise<void> {
  loggers.deposit.error({ tokenSymbol: launch.token_symbol, errorMessage }, '❌ Failed to launch token')
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

    // Trigger automatic refund
    let refundTriggered = false
    try {
      const devWalletPubkey = new PublicKey(launch.dev_wallet_address)
      const balance = await getBalance(devWalletPubkey)

      if (balance > 0.001) {
        const originalFunder = await findOriginalFunder(launch.dev_wallet_address)
        if (originalFunder) {
          loggers.deposit.info({ balance: balance.toFixed(4), originalFunder }, '💸 Auto-refunding SOL after failed launch')
          const refundResult = await executeRefund(launch.id, originalFunder)
          if (refundResult.success) {
            loggers.deposit.info({ signature: refundResult.signature }, '✅ Auto-refund successful')
            refundTriggered = true
            // Notification is handled by executeRefund
          } else {
            loggers.deposit.error({ error: refundResult.error }, '❌ Auto-refund failed')
          }
        } else {
          loggers.deposit.warn({ tokenSymbol: launch.token_symbol }, '⚠️ Could not find original funder - manual refund required')
        }
      }
    } catch (refundError) {
      loggers.deposit.error({ error: String(refundError) }, 'Auto-refund error')
    }

    // Notify user about failure (only if refund wasn't triggered - refund service sends its own notification)
    if (!refundTriggered) {
      await notifyUser(
        launch.telegram_users?.telegram_id,
        `❌ *Launch Failed*

Your ${launch.token_symbol} launch could not be completed after ${maxRetries} attempts.

Error: ${errorMessage}

Your SOL will be refunded to your wallet. Please contact support if you need assistance.

Use /launch to try again with a new token.`
      )
    }
  }
}

/**
 * Send notification to Telegram user with retry mechanism
 */
async function notifyUser(
  telegramId: number | undefined,
  message: string,
  maxRetries: number = 3
): Promise<boolean> {
  if (!telegramId) return false

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { getBot } = await import('../telegram/bot')
      const bot = getBot()
      if (!bot) {
        loggers.deposit.warn('⚠️ Telegram bot not initialized - notification not sent')
        return false
      }

      await bot.telegram.sendMessage(telegramId, message, { parse_mode: 'Markdown' })
      return true
    } catch (error: any) {
      const isLastAttempt = attempt === maxRetries
      const errorMessage = error?.message || 'Unknown error'

      if (isLastAttempt) {
        loggers.deposit.error({ telegramId, messagePreview: message.substring(0, 100), maxRetries, error: errorMessage }, '❌ Failed to send Telegram notification')
        return false
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000
      loggers.deposit.warn({ attempt, maxRetries, delay, error: errorMessage }, '⚠️ Telegram notification attempt failed, retrying')
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return false
}

/**
 * Start the deposit monitor job
 */
export function startDepositMonitorJob(): void {
  if (jobTask) {
    loggers.deposit.warn('⚠️ Deposit monitor job already running')
    return
  }

  loggers.deposit.info('🔄 Starting deposit monitor job (every 30 seconds)')

  jobTask = cron.schedule(CHECK_INTERVAL, async () => {
    await checkPendingLaunches()
    await checkPrivyPendingLaunches() // Also check Privy pending launches
  })

  // Run immediately on start
  checkPendingLaunches()
  checkPrivyPendingLaunches()
}

/**
 * Stop the deposit monitor job
 */
export function stopDepositMonitorJob(): void {
  if (jobTask) {
    jobTask.stop()
    jobTask = null
    loggers.deposit.info('⏹️ Deposit monitor job stopped')
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

// ═══════════════════════════════════════════════════════════════════════════
// PRIVY PENDING LAUNCHES
// For tokens launched via TMA with Privy embedded wallets
// ═══════════════════════════════════════════════════════════════════════════

// Prisma PrivyPendingLaunch with relations
// Note: PrismaPrivyPendingLaunch already includes devBuySol from schema
type PrivyPendingLaunchWithRelations = PrismaPrivyPendingLaunch & {
  devWallet: PrivyWallet
  opsWallet: PrivyWallet
  user: { telegramId: bigint | null }
}

let isPrivyRunning = false

/**
 * Check all Privy pending launches for deposits
 */
async function checkPrivyPendingLaunches(): Promise<void> {
  if (isPrivyRunning) {
    return
  }

  if (!isPrismaConfigured()) {
    return
  }

  isPrivyRunning = true

  try {
    // Get all Privy pending launches awaiting deposit using Prisma
    const pendingLaunches = await prisma.privyPendingLaunch.findMany({
      where: {
        status: 'awaiting_deposit',
        expiresAt: { lt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
      },
      include: {
        devWallet: true,
        opsWallet: true,
        user: { select: { telegramId: true } },
      },
    })

    // Also get launches that need retry (failed but have retries left)
    // Only retry if at least 30 seconds have passed since last attempt
    const retryThreshold = new Date(Date.now() - 30 * 1000) // 30 seconds ago
    const retryPendingLaunches = await prisma.privyPendingLaunch.findMany({
      where: {
        status: 'retry_pending',
        updatedAt: { lt: retryThreshold }, // Wait at least 30 seconds between retries
        expiresAt: { gt: new Date() }, // Not expired
      },
      include: {
        devWallet: true,
        opsWallet: true,
        user: { select: { telegramId: true } },
      },
    })

    // Process retry_pending launches first
    for (const launch of retryPendingLaunches) {
      try {
        const devWalletAddress = launch.devWallet?.walletAddress
        if (!devWalletAddress) continue

        const devWalletPubkey = new PublicKey(devWalletAddress)
        const balance = await getBalance(devWalletPubkey)

        if (balance >= Number(launch.minDepositSol)) {
          loggers.deposit.info({ tokenSymbol: launch.tokenSymbol, balance, retryCount: launch.retryCount }, '🔄 Retrying Privy token launch...')

          // Update status to launching
          await prisma.privyPendingLaunch.update({
            where: { id: launch.id },
            data: { status: 'launching', updatedAt: new Date() },
          })

          // Trigger launch
          await triggerPrivyTokenLaunch(launch, balance)
        }
      } catch (error) {
        loggers.deposit.error({ launchId: launch.id, error: String(error) }, 'Error retrying Privy launch')
      }
    }

    if (!pendingLaunches || pendingLaunches.length === 0) {
      return
    }

    loggers.deposit.info({ count: pendingLaunches.length }, '📡 Checking Privy pending token launches...')

    for (const launch of pendingLaunches) {
      try {
        // Check if expired
        if (launch.expiresAt < new Date()) {
          await handlePrivyExpiredLaunch(launch)
          continue
        }

        // Check balance of dev wallet
        const devWalletAddress = launch.devWallet?.walletAddress
        if (!devWalletAddress) {
          loggers.deposit.warn({ launchId: launch.id }, 'Privy launch missing dev wallet')
          continue
        }

        const devWalletPubkey = new PublicKey(devWalletAddress)
        const balance = await getBalance(devWalletPubkey)

        if (balance >= MIN_DEPOSIT_SOL) {
          loggers.deposit.info({ tokenSymbol: launch.tokenSymbol, balance }, '💰 Privy deposit detected')

          // Atomic update with optimistic locking using Prisma
          // updateMany returns count, so we check if any rows were updated
          const updateResult = await prisma.privyPendingLaunch.updateMany({
            where: {
              id: launch.id,
              status: 'awaiting_deposit', // Only update if still awaiting
            },
            data: {
              minDepositSol: balance, // Store the received deposit amount
              status: 'launching',
              updatedAt: new Date(),
            },
          })

          if (updateResult.count === 0) {
            loggers.deposit.info({ launchId: launch.id }, '⏭️ Privy launch already being processed')
            continue
          }

          // Log audit event to Supabase (audit_log is still in Supabase)
          const db = requireSupabase()
          await db.from('audit_log').insert({
            event_type: 'privy_deposit_received',
            details: {
              privy_launch_id: launch.id,
              amount_sol: balance,
              dev_wallet: devWalletAddress,
              telegram_id: launch.user?.telegramId ? Number(launch.user.telegramId) : null,
            },
          })

          // Trigger token launch with Privy signing
          await triggerPrivyTokenLaunch(launch, balance)
        }
      } catch (error) {
        loggers.deposit.error({ launchId: launch.id, error: String(error) }, 'Error checking Privy launch')
      }
    }
  } catch (error) {
    loggers.deposit.error({ error: String(error) }, 'Error in Privy deposit monitor')
  } finally {
    isPrivyRunning = false
  }
}

/**
 * Handle expired Privy pending launch
 */
async function handlePrivyExpiredLaunch(launch: PrivyPendingLaunchWithRelations): Promise<void> {
  loggers.deposit.info({ tokenSymbol: launch.tokenSymbol }, '⏰ Privy launch expired')

  const devWalletAddress = launch.devWallet?.walletAddress
  if (!devWalletAddress) return

  const devWalletPubkey = new PublicKey(devWalletAddress)
  const balance = await getBalance(devWalletPubkey)

  // Update using Prisma - set initial expired status
  await prisma.privyPendingLaunch.update({
    where: { id: launch.id },
    data: {
      status: 'expired',
      minDepositSol: balance, // Store the balance at expiry
      lastError: balance > 0.001 ? `Expired with ${balance.toFixed(4)} SOL - refund pending` : 'No deposit received',
      updatedAt: new Date(),
    },
  })

  // Log audit event to Supabase (audit_log is still in Supabase)
  const db = requireSupabase()
  await db.from('audit_log').insert({
    event_type: 'privy_launch_expired',
    details: {
      privy_launch_id: launch.id,
      balance_sol: balance,
      telegram_id: launch.user?.telegramId ? Number(launch.user.telegramId) : null,
    },
  })

  // Trigger automatic refund if there's balance using Privy delegated signing
  if (balance > 0.001) {
    try {
      const originalFunder = await findOriginalFunder(devWalletAddress)
      if (originalFunder) {
        loggers.deposit.info({ balance: balance.toFixed(4), originalFunder }, '💸 Auto-refunding Privy SOL after expiry')
        const refundResult = await executePrivyRefund(
          launch.id,
          devWalletAddress,
          originalFunder,
          launch.user?.telegramId ?? undefined
        )
        if (refundResult.success) {
          loggers.deposit.info({ signature: refundResult.signature }, '✅ Privy auto-refund successful')
          // Notification and status update to 'refunded' handled by executePrivyRefund
          return
        } else {
          loggers.deposit.error({ error: refundResult.error }, '❌ Privy auto-refund failed')
          // Update lastError to reflect refund failure
          await prisma.privyPendingLaunch.update({
            where: { id: launch.id },
            data: { lastError: `Expired with ${balance.toFixed(4)} SOL - refund failed: ${refundResult.error}` },
          })
        }
      } else {
        loggers.deposit.warn({ tokenSymbol: launch.tokenSymbol }, '⚠️ Could not find original funder - manual refund required')
        // Update lastError to indicate manual refund needed
        await prisma.privyPendingLaunch.update({
          where: { id: launch.id },
          data: { lastError: `Expired with ${balance.toFixed(4)} SOL - manual refund required (could not find funder)` },
        })
      }
    } catch (refundError) {
      loggers.deposit.error({ error: String(refundError) }, 'Privy auto-refund error')
      // Update lastError to reflect refund error
      await prisma.privyPendingLaunch.update({
        where: { id: launch.id },
        data: { lastError: `Expired with ${balance.toFixed(4)} SOL - refund error: ${String(refundError)}` },
      })
    }
  }

  // Notify user via Telegram (only if refund wasn't successfully triggered)
  if (launch.user?.telegramId) {
    await notifyUser(
      Number(launch.user.telegramId),
      `⏰ Your ${launch.tokenSymbol} launch has expired.\n\n${balance > 0.001 ? `Balance of ${balance.toFixed(4)} SOL will be refunded.` : 'No deposit was received.'}\n\nUse the TMA app to start a new launch.`
    )
  }
}

/**
 * Trigger Privy token launch on Bags.fm
 * Uses Privy delegated signing instead of encrypted keys
 */
async function triggerPrivyTokenLaunch(launch: PrivyPendingLaunchWithRelations, depositAmount: number): Promise<void> {
  try {
    loggers.deposit.info({ tokenSymbol: launch.tokenSymbol }, '🚀 Launching Privy token on Bags.fm...')

    const devWalletAddress = launch.devWallet?.walletAddress

    // Notify user that launch is starting
    if (launch.user?.telegramId) {
      await notifyUser(
        Number(launch.user.telegramId),
        `💰 *Deposit Detected!*\n\nReceived: ${depositAmount.toFixed(4)} SOL\nLaunching your token on Bags.fm...`
      )
    }

    // Call token launcher service with Privy signing
    const result = await tokenLauncherService.launchTokenWithPrivySigning({
      tokenName: launch.tokenName,
      tokenSymbol: launch.tokenSymbol,
      tokenDescription: launch.tokenDescription || '',
      tokenImageUrl: launch.tokenImageUrl || '',
      twitterUrl: launch.twitterUrl || undefined,
      telegramUrl: launch.telegramUrl || undefined,
      websiteUrl: launch.websiteUrl || undefined,
      discordUrl: launch.discordUrl || undefined,
      devWalletAddress: devWalletAddress!,
      devBuySol: Number(launch.devBuySol) || 0,
    })

    if (result.success && result.tokenMint) {
      await handlePrivySuccessfulLaunch(launch, result.tokenMint)
    } else {
      await handlePrivyFailedLaunch(launch, result.error || 'Unknown error')
    }
  } catch (error: any) {
    loggers.deposit.error({ tokenSymbol: launch.tokenSymbol, error: String(error) }, 'Error launching Privy token')
    await handlePrivyFailedLaunch(launch, error.message || 'Launch failed')
  }
}

/**
 * Handle successful Privy token launch
 */
async function handlePrivySuccessfulLaunch(launch: PrivyPendingLaunchWithRelations, tokenMint: string): Promise<void> {
  loggers.deposit.info({ tokenSymbol: launch.tokenSymbol, tokenMint }, '✅ Successfully launched Privy token')

  try {
    // Update pending launch status using Prisma
    await prisma.privyPendingLaunch.update({
      where: { id: launch.id },
      data: {
        status: 'completed',
        tokenMintAddress: tokenMint,
        launchedAt: new Date(),
        updatedAt: new Date(),
      },
    })

    // Create privy_user_tokens record using Prisma
    const userToken = await prisma.privyUserToken.create({
      data: {
        privyUserId: launch.privyUserId,
        devWalletId: launch.devWalletId,
        opsWalletId: launch.opsWalletId,
        tokenMintAddress: tokenMint,
        tokenSymbol: launch.tokenSymbol,
        tokenName: launch.tokenName,
        tokenDecimals: 9, // Bags.fm default
        isActive: true,
        isGraduated: false,
        launchedViaTelegram: true,
      },
    })

    loggers.deposit.info({ userTokenId: userToken.id }, '📝 Created privy_user_tokens record')

    // Create config with flywheel enabled using Prisma
    try {
      await prisma.privyTokenConfig.create({
        data: {
          privyTokenId: userToken.id,
          flywheelActive: true,
          autoClaimEnabled: true,
          algorithmMode: 'simple',
          minBuyAmountSol: 0.01,
          maxBuyAmountSol: 0.05,
          slippageBps: 300,
          tradingRoute: 'auto',
        },
      })
      loggers.deposit.info({ userTokenId: userToken.id }, '⚙️ Created privy_token_config')
    } catch (configError: any) {
      loggers.deposit.error({ error: configError.message }, 'Failed to create privy_token_config')
    }

    // Create flywheel state using Prisma
    try {
      await prisma.privyFlywheelState.create({
        data: {
          privyTokenId: userToken.id,
          cyclePhase: 'buy',
          buyCount: 0,
          sellCount: 0,
          consecutiveFailures: 0,
          totalFailures: 0,
        },
      })
      loggers.deposit.info({ userTokenId: userToken.id }, '🔄 Created privy_flywheel_state')
    } catch (stateError: any) {
      loggers.deposit.error({ error: stateError.message }, 'Failed to create privy_flywheel_state')
    }

    // Log audit event to Supabase (audit_log is still in Supabase)
    const db = requireSupabase()
    await db.from('audit_log').insert({
      event_type: 'privy_launch_completed',
      details: {
        privy_launch_id: launch.id,
        privy_token_id: userToken.id,
        token_mint: tokenMint,
        token_symbol: launch.tokenSymbol,
        telegram_id: launch.user?.telegramId ? Number(launch.user.telegramId) : null,
      },
    })

    // Notify user
    if (launch.user?.telegramId) {
      await notifyUser(
        Number(launch.user.telegramId),
        `🎉 *TOKEN LAUNCHED SUCCESSFULLY!*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*${launch.tokenName} (${launch.tokenSymbol})*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mint: \`${tokenMint}\`

🔗 *View on Bags.fm:*
bags.fm/token/${tokenMint}

✅ Flywheel: ENABLED
✅ Auto-Claim: ACTIVE
✅ Algorithm: Simple mode

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💸 *Fee Split*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Trading fees collected automatically:
├ 90% → Your Ops Wallet
└ 10% → Claude Wheel (platform fee)

Your token is live! Check the TMA app for status.`
      )
    }
  } catch (dbError: any) {
    loggers.deposit.error({ error: dbError.message, tokenMint }, 'Database error after Privy token launch')

    if (launch.user?.telegramId) {
      await notifyUser(
        Number(launch.user.telegramId),
        `🎉 *TOKEN LAUNCHED ON BAGS.FM!*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*${launch.tokenName} (${launch.tokenSymbol})*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mint: \`${tokenMint}\`

🔗 *View on Bags.fm:*
bags.fm/token/${tokenMint}

⚠️ *Note:* There was an issue registering your token. Please use the TMA app to register it manually.`
      )
    }
  }
}

/**
 * Handle failed Privy token launch
 */
async function handlePrivyFailedLaunch(launch: PrivyPendingLaunchWithRelations, errorMessage: string): Promise<void> {
  loggers.deposit.error({ tokenSymbol: launch.tokenSymbol, errorMessage }, '❌ Failed to launch Privy token')

  const newRetryCount = (launch.retryCount || 0) + 1
  const maxRetries = 3

  if (newRetryCount < maxRetries) {
    // Update using Prisma for retry - use 'retry_pending' status to avoid flickering
    // The deposit monitor will pick this up after a delay
    await prisma.privyPendingLaunch.update({
      where: { id: launch.id },
      data: {
        status: 'retry_pending',
        retryCount: newRetryCount,
        lastError: errorMessage,
        updatedAt: new Date(),
      },
    })

    if (launch.user?.telegramId) {
      await notifyUser(
        Number(launch.user.telegramId),
        `⚠️ Launch attempt ${newRetryCount} failed for ${launch.tokenSymbol}.\n\nError: ${errorMessage}\n\nRetrying in 30 seconds...`
      )
    }
  } else {
    // Update using Prisma for final failure
    await prisma.privyPendingLaunch.update({
      where: { id: launch.id },
      data: {
        status: 'failed',
        retryCount: newRetryCount,
        lastError: `Max retries reached. Last error: ${errorMessage}`,
        updatedAt: new Date(),
      },
    })

    // Log audit event to Supabase (audit_log is still in Supabase)
    const db = requireSupabase()
    await db.from('audit_log').insert({
      event_type: 'privy_launch_failed',
      details: {
        privy_launch_id: launch.id,
        error: errorMessage,
        retry_count: newRetryCount,
        telegram_id: launch.user?.telegramId ? Number(launch.user.telegramId) : null,
      },
    })

    // Trigger automatic refund using Privy delegated signing
    let refundTriggered = false
    const devWalletAddress = launch.devWallet?.walletAddress
    if (devWalletAddress) {
      try {
        const devWalletPubkey = new PublicKey(devWalletAddress)
        const balance = await getBalance(devWalletPubkey)

        if (balance > 0.001) {
          const originalFunder = await findOriginalFunder(devWalletAddress)
          if (originalFunder) {
            loggers.deposit.info({ balance: balance.toFixed(4), originalFunder }, '💸 Auto-refunding Privy SOL after failed launch')
            const refundResult = await executePrivyRefund(
              launch.id,
              devWalletAddress,
              originalFunder,
              launch.user?.telegramId ?? undefined
            )
            if (refundResult.success) {
              loggers.deposit.info({ signature: refundResult.signature }, '✅ Privy auto-refund successful')
              refundTriggered = true
              // Notification and status update to 'refunded' handled by executePrivyRefund
            } else {
              loggers.deposit.error({ error: refundResult.error }, '❌ Privy auto-refund failed')
              // Update lastError to reflect refund failure
              await prisma.privyPendingLaunch.update({
                where: { id: launch.id },
                data: { lastError: `Launch failed after ${newRetryCount} retries - refund failed: ${refundResult.error}` },
              })
            }
          } else {
            loggers.deposit.warn({ tokenSymbol: launch.tokenSymbol }, '⚠️ Could not find original funder - manual refund required')
            // Update lastError to indicate manual refund needed
            await prisma.privyPendingLaunch.update({
              where: { id: launch.id },
              data: { lastError: `Launch failed - manual refund required (could not find funder)` },
            })
          }
        }
      } catch (refundError) {
        loggers.deposit.error({ error: String(refundError) }, 'Privy auto-refund error')
        // Update lastError to reflect refund error
        await prisma.privyPendingLaunch.update({
          where: { id: launch.id },
          data: { lastError: `Launch failed - refund error: ${String(refundError)}` },
        })
      }
    }

    // Notify user about failure (only if refund wasn't triggered - refund service sends its own notification)
    if (!refundTriggered && launch.user?.telegramId) {
      await notifyUser(
        Number(launch.user.telegramId),
        `❌ *Launch Failed*

Your ${launch.tokenSymbol} launch could not be completed after ${maxRetries} attempts.

Error: ${errorMessage}

Your SOL will be refunded to your wallet. Please contact support if you need assistance.

Use the TMA app to try again!`
      )
    }
  }
}

/**
 * Start both deposit monitor jobs (legacy + Privy)
 */
export function startAllDepositMonitorJobs(): void {
  startDepositMonitorJob()

  // Run Privy check alongside the regular one
  loggers.deposit.info('🔄 Starting Privy deposit monitor (piggybacks on main job)')
}

/**
 * Run a single check of Privy pending launches (for manual trigger)
 */
export async function runPrivyDepositCheck(): Promise<void> {
  await checkPrivyPendingLaunches()
}
