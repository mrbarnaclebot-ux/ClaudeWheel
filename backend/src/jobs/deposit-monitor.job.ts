// ═══════════════════════════════════════════════════════════════════════════
// DEPOSIT MONITOR JOB
// Monitors pending token launches for SOL deposits and triggers launch
// Privy-only: Uses delegated signing for embedded wallets
// ═══════════════════════════════════════════════════════════════════════════

import cron from 'node-cron'
import { loggers } from '../utils/logger'
import { PublicKey } from '@solana/web3.js'
import { prisma, isPrismaConfigured, type PrivyPendingLaunch as PrismaPrivyPendingLaunch, type PrivyWallet, type PrivyMmPending as PrismaPrivyMmPending } from '../config/prisma'
import { getBalance } from '../config/solana'
import { tokenLauncherService } from '../services/token-launcher'
import { executePrivyRefund, findOriginalFunder } from '../services/refund.service'

// Minimum SOL required to trigger launch
const MIN_DEPOSIT_SOL = 0.1 // Minimum required, 0.5 recommended for MM funding
const MM_MIN_DEPOSIT_SOL = 0.1

// How often to check (every 30 seconds)
const CHECK_INTERVAL = '*/30 * * * * *'

let isRunning = false
let isMmRunning = false
let jobTask: cron.ScheduledTask | null = null

// Prisma PrivyPendingLaunch with relations
type PrivyPendingLaunchWithRelations = PrismaPrivyPendingLaunch & {
  devWallet: PrivyWallet
  opsWallet: PrivyWallet
  user: { telegramId: bigint | null }
}

type PrivyMmPendingWithRelations = PrismaPrivyMmPending & {
  opsWallet: PrivyWallet
  user: { telegramId: bigint | null }
}

/**
 * Check all pending launches for deposits
 */
async function checkPendingLaunches(): Promise<void> {
  if (isRunning) {
    return
  }

  if (!isPrismaConfigured()) {
    return
  }

  isRunning = true

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
          loggers.deposit.info({ tokenSymbol: launch.tokenSymbol, balance, retryCount: launch.retryCount }, '🔄 Retrying token launch...')

          // Update status to launching
          await prisma.privyPendingLaunch.update({
            where: { id: launch.id },
            data: { status: 'launching', updatedAt: new Date() },
          })

          // Trigger launch
          await triggerTokenLaunch(launch, balance)
        }
      } catch (error) {
        loggers.deposit.error({ launchId: launch.id, error: String(error) }, 'Error retrying launch')
      }
    }

    if (!pendingLaunches || pendingLaunches.length === 0) {
      return
    }

    loggers.deposit.info({ count: pendingLaunches.length }, '📡 Checking pending token launches...')

    for (const launch of pendingLaunches) {
      try {
        // Check if expired
        if (launch.expiresAt < new Date()) {
          await handleExpiredLaunch(launch)
          continue
        }

        // Check balance of dev wallet
        const devWalletAddress = launch.devWallet?.walletAddress
        if (!devWalletAddress) {
          loggers.deposit.warn({ launchId: launch.id }, 'Launch missing dev wallet')
          continue
        }

        const devWalletPubkey = new PublicKey(devWalletAddress)
        const balance = await getBalance(devWalletPubkey)

        if (balance >= MIN_DEPOSIT_SOL) {
          loggers.deposit.info({ tokenSymbol: launch.tokenSymbol, balance }, '💰 Deposit detected')

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
            loggers.deposit.info({ launchId: launch.id }, '⏭️ Launch already being processed')
            continue
          }

          // Trigger token launch with Privy signing
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
async function handleExpiredLaunch(launch: PrivyPendingLaunchWithRelations): Promise<void> {
  loggers.deposit.info({ tokenSymbol: launch.tokenSymbol }, '⏰ Launch expired')

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

  // Trigger automatic refund if there's balance using Privy delegated signing
  if (balance > 0.001) {
    try {
      const originalFunder = await findOriginalFunder(devWalletAddress)
      if (originalFunder) {
        loggers.deposit.info({ balance: balance.toFixed(4), originalFunder }, '💸 Auto-refunding SOL after expiry')
        const refundResult = await executePrivyRefund(
          launch.id,
          devWalletAddress,
          originalFunder,
          launch.user?.telegramId ?? undefined
        )
        if (refundResult.success) {
          loggers.deposit.info({ signature: refundResult.signature }, '✅ Auto-refund successful')
          // Notification and status update to 'refunded' handled by executePrivyRefund
          return
        } else {
          loggers.deposit.error({ error: refundResult.error }, '❌ Auto-refund failed')
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
      loggers.deposit.error({ error: String(refundError) }, 'Auto-refund error')
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
 * Trigger token launch on Bags.fm
 * Uses Privy delegated signing instead of encrypted keys
 */
async function triggerTokenLaunch(launch: PrivyPendingLaunchWithRelations, depositAmount: number): Promise<void> {
  try {
    loggers.deposit.info({ tokenSymbol: launch.tokenSymbol }, '🚀 Launching token on Bags.fm...')

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
      await handleSuccessfulLaunch(launch, result.tokenMint)
    } else {
      await handleFailedLaunch(launch, result.error || 'Unknown error')
    }
  } catch (error: any) {
    loggers.deposit.error({ tokenSymbol: launch.tokenSymbol, error: String(error) }, 'Error launching token')
    await handleFailedLaunch(launch, error.message || 'Launch failed')
  }
}

/**
 * Handle successful token launch
 */
async function handleSuccessfulLaunch(launch: PrivyPendingLaunchWithRelations, tokenMint: string): Promise<void> {
  loggers.deposit.info({ tokenSymbol: launch.tokenSymbol, tokenMint }, '✅ Successfully launched token')

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

    // Create config with flywheel enabled using stored MM preferences from launch
    try {
      const launchAlgorithmMode = launch.mmAlgorithm || 'simple'
      const launchConfigData: any = {
        privyTokenId: userToken.id,
        flywheelActive: true,
        autoClaimEnabled: launch.mmAutoClaimEnabled ?? true,
        algorithmMode: launchAlgorithmMode,
        minBuyAmountSol: Number(launch.mmMinBuySol) || 0.01,
        maxBuyAmountSol: Number(launch.mmMaxBuySol) || 0.05,
        slippageBps: 300,
        tradingRoute: 'auto',
      }

      // Add turbo mode defaults if turbo_lite algorithm selected
      if (launchAlgorithmMode === 'turbo_lite') {
        launchConfigData.turboJobIntervalSeconds = 15
        launchConfigData.turboCycleSizeBuys = 8
        launchConfigData.turboCycleSizeSells = 8
        launchConfigData.turboInterTokenDelayMs = 200
        launchConfigData.turboGlobalRateLimit = 60
        launchConfigData.turboConfirmationTimeout = 45
        launchConfigData.turboBatchStateUpdates = true
      }

      await prisma.privyTokenConfig.create({
        data: launchConfigData,
      })
      loggers.deposit.info({
        userTokenId: userToken.id,
        algorithm: launchAlgorithmMode,
        minBuy: Number(launch.mmMinBuySol),
        maxBuy: Number(launch.mmMaxBuySol),
      }, '⚙️ Created privy_token_config with user MM preferences')
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
    loggers.deposit.error({ error: dbError.message, tokenMint }, 'Database error after token launch')

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
 * Handle failed token launch
 */
async function handleFailedLaunch(launch: PrivyPendingLaunchWithRelations, errorMessage: string): Promise<void> {
  loggers.deposit.error({ tokenSymbol: launch.tokenSymbol, errorMessage }, '❌ Failed to launch token')

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
            loggers.deposit.info({ balance: balance.toFixed(4), originalFunder }, '💸 Auto-refunding SOL after failed launch')
            const refundResult = await executePrivyRefund(
              launch.id,
              devWalletAddress,
              originalFunder,
              launch.user?.telegramId ?? undefined
            )
            if (refundResult.success) {
              loggers.deposit.info({ signature: refundResult.signature }, '✅ Auto-refund successful')
              refundTriggered = true
              // Notification and status update to 'refunded' handled by executePrivyRefund
            } else {
              loggers.deposit.error({ error: refundResult.error }, '❌ Auto-refund failed')
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
        loggers.deposit.error({ error: String(refundError) }, 'Auto-refund error')
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

// ═══════════════════════════════════════════════════════════════════════════
// MM PENDING DEPOSITS
// For MM-only mode: user funds ops wallet to market-make any Bags token
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check all MM pending deposits
 */
async function checkMmPending(): Promise<void> {
  if (isMmRunning) {
    return
  }

  if (!isPrismaConfigured()) {
    return
  }

  isMmRunning = true

  try {
    // Get all pending MM deposits awaiting deposit
    const pendingMm = await prisma.privyMmPending.findMany({
      where: {
        status: 'awaiting_deposit',
      },
      include: {
        opsWallet: true,
        user: { select: { telegramId: true } },
      },
    })

    if (!pendingMm || pendingMm.length === 0) {
      return
    }

    loggers.deposit.info({ count: pendingMm.length }, '📡 Checking MM pending deposits...')

    for (const pending of pendingMm as PrivyMmPendingWithRelations[]) {
      try {
        // Check if expired
        if (pending.expiresAt < new Date()) {
          await handleMmExpired(pending)
          continue
        }

        // Check balance of ops wallet
        const opsWalletAddress = pending.opsWallet?.walletAddress
        if (!opsWalletAddress) {
          loggers.deposit.warn({ pendingId: pending.id }, 'MM pending missing ops wallet')
          continue
        }

        const opsWalletPubkey = new PublicKey(opsWalletAddress)
        const balance = await getBalance(opsWalletPubkey)

        if (balance >= MM_MIN_DEPOSIT_SOL) {
          loggers.deposit.info({ tokenSymbol: pending.tokenSymbol, balance }, '💰 MM deposit detected')

          // Atomic update with optimistic locking
          const updateResult = await prisma.privyMmPending.updateMany({
            where: {
              id: pending.id,
              status: 'awaiting_deposit',
            },
            data: {
              status: 'active',
              activatedAt: new Date(),
              updatedAt: new Date(),
            },
          })

          if (updateResult.count === 0) {
            loggers.deposit.info({ pendingId: pending.id }, '⏭️ MM pending already being processed')
            continue
          }

          // Activate MM-only token
          await activateMmToken(pending)
        }
      } catch (error) {
        loggers.deposit.error({ pendingId: pending.id, error: String(error) }, 'Error checking MM pending')
      }
    }
  } catch (error) {
    loggers.deposit.error({ error: String(error) }, 'Error in MM pending monitor')
  } finally {
    isMmRunning = false
  }
}

/**
 * Handle expired MM pending deposit
 */
async function handleMmExpired(pending: PrivyMmPendingWithRelations): Promise<void> {
  loggers.deposit.info({ tokenSymbol: pending.tokenSymbol }, '⏰ MM pending expired')

  await prisma.privyMmPending.update({
    where: { id: pending.id },
    data: {
      status: 'expired',
      updatedAt: new Date(),
    },
  })

  // Notify user
  if (pending.user?.telegramId) {
    await notifyUser(
      Number(pending.user.telegramId),
      `⏰ Your MM setup for ${pending.tokenSymbol} has expired.\n\nNo deposit was received within 24 hours.\n\nUse the TMA app to start a new MM setup.`
    )
  }
}

/**
 * Activate MM-only token after deposit received
 */
async function activateMmToken(pending: PrivyMmPendingWithRelations): Promise<void> {
  try {
    loggers.deposit.info({
      tokenSymbol: pending.tokenSymbol,
      tokenMint: pending.tokenMintAddress,
    }, '🚀 Activating MM-only token')

    // Get user's dev wallet (needed for relations, even if unused for MM-only)
    const devWallet = await prisma.privyWallet.findFirst({
      where: {
        privyUserId: pending.privyUserId,
        walletType: 'dev',
      },
    })

    if (!devWallet) {
      loggers.deposit.error({ pendingId: pending.id }, 'Dev wallet not found for MM activation')
      return
    }

    // Use transaction to ensure all records are created together (no orphans)
    const userToken = await prisma.$transaction(async (tx) => {
      // Create user token record (mm_only source)
      const token = await tx.privyUserToken.create({
        data: {
          privyUserId: pending.privyUserId,
          devWalletId: devWallet.id,
          opsWalletId: pending.opsWalletId,
          tokenMintAddress: pending.tokenMintAddress,
          tokenSymbol: pending.tokenSymbol,
          tokenName: pending.tokenName,
          tokenImage: pending.tokenImage,
          tokenDecimals: pending.tokenDecimals,
          isActive: true,
          isGraduated: false,
          launchedViaTelegram: false,
          tokenSource: 'mm_only',
        },
      })

      // Create config with flywheel enabled, NO auto-claim (not creator)
      const algorithmMode = pending.mmAlgorithm || 'simple'
      const configData: any = {
        privyTokenId: token.id,
        flywheelActive: true,
        autoClaimEnabled: false, // MM-only users can't claim fees (not creator)
        algorithmMode,
        minBuyAmountSol: 0.01,
        maxBuyAmountSol: 0.05,
        slippageBps: 300,
        tradingRoute: 'auto',
      }

      // Add turbo mode defaults if turbo_lite algorithm selected
      if (algorithmMode === 'turbo_lite') {
        configData.turboJobIntervalSeconds = 15
        configData.turboCycleSizeBuys = 8
        configData.turboCycleSizeSells = 8
        configData.turboInterTokenDelayMs = 200
        configData.turboGlobalRateLimit = 60
        configData.turboConfirmationTimeout = 45
        configData.turboBatchStateUpdates = true
      }

      await tx.privyTokenConfig.create({
        data: configData,
      })

      // Create flywheel state
      await tx.privyFlywheelState.create({
        data: {
          privyTokenId: token.id,
          cyclePhase: 'buy',
          buyCount: 0,
          sellCount: 0,
          consecutiveFailures: 0,
          totalFailures: 0,
        },
      })

      return token
    })

    loggers.deposit.info({ userTokenId: userToken.id, algorithm: pending.mmAlgorithm }, '📝 Created MM-only token with config and state')

    // Notify user
    if (pending.user?.telegramId) {
      await notifyUser(
        Number(pending.user.telegramId),
        `🎉 *MM Mode Activated!*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*${pending.tokenName || pending.tokenSymbol} (${pending.tokenSymbol})*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mint: \`${pending.tokenMintAddress}\`

✅ Flywheel: ENABLED
✅ Algorithm: ${pending.mmAlgorithm || 'simple'} mode

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ️ *Note*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

As an MM-only user, you receive trading profits
but cannot claim creator fees.

To withdraw, use the TMA app to stop MM
and transfer your SOL out.`
      )
    }

    loggers.deposit.info({
      tokenSymbol: pending.tokenSymbol,
      userTokenId: userToken.id,
    }, '✅ MM-only token activated successfully')

  } catch (error) {
    loggers.deposit.error({
      pendingId: pending.id,
      tokenSymbol: pending.tokenSymbol,
      error: String(error),
    }, '❌ Failed to activate MM-only token')

    // Revert status so user can retry
    await prisma.privyMmPending.update({
      where: { id: pending.id },
      data: {
        status: 'awaiting_deposit',
        updatedAt: new Date(),
      },
    })

    if (pending.user?.telegramId) {
      await notifyUser(
        Number(pending.user.telegramId),
        `⚠️ Failed to activate MM for ${pending.tokenSymbol}.\n\nPlease try again or contact support.`
      )
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Run the deposit monitor (checks both pending launches and MM pending)
 */
async function runDepositMonitor(): Promise<void> {
  await checkPendingLaunches()
  await checkMmPending()
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
    await runDepositMonitor()
  })

  // Run immediately on start
  runDepositMonitor()
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
    isProcessing: isRunning || isMmRunning,
  }
}

/**
 * Start the deposit monitor job (alias for backwards compatibility)
 */
export function startAllDepositMonitorJobs(): void {
  startDepositMonitorJob()
}

/**
 * Run a single check of pending launches (for manual trigger)
 */
export async function runPrivyDepositCheck(): Promise<void> {
  await runDepositMonitor()
}
