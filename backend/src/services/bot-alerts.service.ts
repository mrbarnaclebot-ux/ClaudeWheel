// ═══════════════════════════════════════════════════════════════════════════
// BOT ALERTS SERVICE
// Manages user subscriptions for downtime alerts and broadcasts
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from '../config/prisma'
import { getBot } from '../telegram/bot'
import { loggers } from '../utils/logger'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface BotStatus {
  isMaintenanceMode: boolean
  maintenanceReason?: string
  maintenanceStartedAt?: string
  estimatedEndTime?: string
  lastUpdated: string
}

export interface AlertSubscription {
  id: string
  telegramId: number
  telegramUsername?: string
  subscribedAt: string
  isActive: boolean
}

export interface BroadcastResult {
  total: number
  successful: number
  failed: number
  errors: string[]
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Subscribe a user to downtime alerts
 */
export async function subscribeToAlerts(
  telegramId: number,
  telegramUsername?: string
): Promise<{ success: boolean; alreadySubscribed?: boolean; error?: string }> {
  try {
    // Check if already subscribed
    const existing = await prisma.telegramAlertSubscriber.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true, isActive: true },
    })

    if (existing) {
      if (existing.isActive) {
        return { success: true, alreadySubscribed: true }
      }

      // Reactivate subscription
      await prisma.telegramAlertSubscriber.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          telegramUsername: telegramUsername,
        },
      })

      return { success: true }
    }

    // Create new subscription
    await prisma.telegramAlertSubscriber.create({
      data: {
        telegramId: BigInt(telegramId),
        telegramUsername: telegramUsername,
        isActive: true,
      },
    })

    return { success: true }
  } catch (error: any) {
    loggers.alerts.error({ error: String(error), telegramId }, 'Error in subscribeToAlerts')
    return { success: false, error: error.message }
  }
}

/**
 * Unsubscribe a user from downtime alerts
 */
export async function unsubscribeFromAlerts(
  telegramId: number
): Promise<{ success: boolean; wasSubscribed?: boolean; error?: string }> {
  try {
    const existing = await prisma.telegramAlertSubscriber.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { id: true, isActive: true },
    })

    if (!existing || !existing.isActive) {
      return { success: true, wasSubscribed: false }
    }

    await prisma.telegramAlertSubscriber.update({
      where: { id: existing.id },
      data: {
        isActive: false,
      },
    })

    return { success: true, wasSubscribed: true }
  } catch (error: any) {
    loggers.alerts.error({ error: String(error), telegramId }, 'Error in unsubscribeFromAlerts')
    return { success: false, error: error.message }
  }
}

/**
 * Check if a user is subscribed to alerts
 */
export async function isSubscribed(telegramId: number): Promise<boolean> {
  try {
    const subscriber = await prisma.telegramAlertSubscriber.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: { isActive: true },
    })

    return subscriber?.isActive || false
  } catch {
    return false
  }
}

/**
 * Get all active subscribers
 */
export async function getActiveSubscribers(): Promise<AlertSubscription[]> {
  try {
    const subscribers = await prisma.telegramAlertSubscriber.findMany({
      where: { isActive: true },
      select: {
        id: true,
        telegramId: true,
        telegramUsername: true,
        createdAt: true,
        isActive: true,
      },
    })

    return subscribers.map(sub => ({
      id: sub.id,
      telegramId: Number(sub.telegramId),
      telegramUsername: sub.telegramUsername || undefined,
      subscribedAt: sub.createdAt.toISOString(),
      isActive: sub.isActive,
    }))
  } catch {
    return []
  }
}

/**
 * Get subscriber count
 */
export async function getSubscriberCount(): Promise<number> {
  try {
    const count = await prisma.telegramAlertSubscriber.count({
      where: { isActive: true },
    })

    return count
  } catch {
    return 0
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAINTENANCE MODE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get current bot status
 */
export async function getBotStatus(): Promise<BotStatus> {
  try {
    const status = await prisma.botStatus.findUnique({
      where: { id: 'main' },
    })

    if (!status) {
      return {
        isMaintenanceMode: false,
        lastUpdated: new Date().toISOString(),
      }
    }

    return {
      isMaintenanceMode: status.isMaintenanceMode || false,
      maintenanceReason: status.maintenanceReason || undefined,
      maintenanceStartedAt: status.maintenanceStartedAt?.toISOString(),
      estimatedEndTime: status.estimatedEndTime?.toISOString(),
      lastUpdated: status.updatedAt.toISOString(),
    }
  } catch {
    return {
      isMaintenanceMode: false,
      lastUpdated: new Date().toISOString(),
    }
  }
}

/**
 * Enable maintenance mode and notify subscribers
 */
export async function enableMaintenanceMode(
  reason: string,
  estimatedEndTime?: string,
  notifyUsers: boolean = true
): Promise<{ success: boolean; notifiedCount?: number; error?: string }> {
  try {
    const now = new Date()

    // Update or create bot status
    await prisma.botStatus.upsert({
      where: { id: 'main' },
      update: {
        isMaintenanceMode: true,
        maintenanceReason: reason,
        maintenanceStartedAt: now,
        estimatedEndTime: estimatedEndTime ? new Date(estimatedEndTime) : null,
      },
      create: {
        id: 'main',
        isMaintenanceMode: true,
        maintenanceReason: reason,
        maintenanceStartedAt: now,
        estimatedEndTime: estimatedEndTime ? new Date(estimatedEndTime) : null,
      },
    })

    loggers.alerts.info({ reason }, 'Maintenance mode ENABLED')

    // Notify subscribers if requested
    let notifiedCount = 0
    if (notifyUsers) {
      const message = formatMaintenanceAlert(reason, estimatedEndTime, true)
      const result = await broadcastMessage(message, 'maintenance_start')
      notifiedCount = result.successful
    }

    return { success: true, notifiedCount }
  } catch (error: any) {
    loggers.alerts.error({ error: String(error) }, 'Error enabling maintenance mode')
    return { success: false, error: error.message }
  }
}

/**
 * Disable maintenance mode and notify subscribers
 */
export async function disableMaintenanceMode(
  notifyUsers: boolean = true
): Promise<{ success: boolean; notifiedCount?: number; error?: string }> {
  try {
    // Update bot status
    await prisma.botStatus.upsert({
      where: { id: 'main' },
      update: {
        isMaintenanceMode: false,
        maintenanceReason: null,
        maintenanceStartedAt: null,
        estimatedEndTime: null,
      },
      create: {
        id: 'main',
        isMaintenanceMode: false,
        maintenanceReason: null,
        maintenanceStartedAt: null,
        estimatedEndTime: null,
      },
    })

    loggers.alerts.info('Maintenance mode DISABLED')

    // Notify subscribers if requested
    let notifiedCount = 0
    if (notifyUsers) {
      const message = `✅ *Claude Wheel Bot is Back Online!*

The bot is now fully operational. Thank you for your patience!

You can now:
• /launch - Create a new token
• /register - Register existing token
• /mytokens - View your tokens

_You're receiving this because you subscribed to alerts._
_Use /alerts to manage your subscription._`

      const result = await broadcastMessage(message, 'maintenance_end')
      notifiedCount = result.successful
    }

    return { success: true, notifiedCount }
  } catch (error: any) {
    loggers.alerts.error({ error: String(error) }, 'Error disabling maintenance mode')
    return { success: false, error: error.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BROADCAST MESSAGING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Broadcast a message to all subscribed users
 */
export async function broadcastMessage(
  message: string,
  eventType: string = 'broadcast'
): Promise<BroadcastResult> {
  const result: BroadcastResult = {
    total: 0,
    successful: 0,
    failed: 0,
    errors: [],
  }

  try {
    const bot = getBot()
    if (!bot) {
      result.errors.push('Bot not configured')
      return result
    }

    const subscribers = await getActiveSubscribers()
    result.total = subscribers.length

    if (subscribers.length === 0) {
      return result
    }

    loggers.alerts.info({ subscriberCount: subscribers.length }, 'Broadcasting to subscribers')

    // Send messages with rate limiting (25 messages per second for Telegram limits)
    const BATCH_SIZE = 25
    const BATCH_DELAY_MS = 1000

    for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
      const batch = subscribers.slice(i, i + BATCH_SIZE)

      const sendPromises = batch.map(async subscriber => {
        try {
          await bot.telegram.sendMessage(subscriber.telegramId, message, {
            parse_mode: 'Markdown',
          })
          return { success: true, telegramId: subscriber.telegramId }
        } catch (error: any) {
          // Handle blocked users or deactivated accounts
          if (
            error.code === 403 ||
            error.description?.includes('blocked') ||
            error.description?.includes('deactivated')
          ) {
            // Auto-unsubscribe blocked users
            await unsubscribeFromAlerts(subscriber.telegramId)
          }
          return {
            success: false,
            telegramId: subscriber.telegramId,
            error: error.message,
          }
        }
      })

      const results = await Promise.all(sendPromises)

      for (const sendResult of results) {
        if (sendResult.success) {
          result.successful++
        } else {
          result.failed++
          if (result.errors.length < 10) {
            result.errors.push(`User ${sendResult.telegramId}: ${sendResult.error}`)
          }
        }
      }

      // Delay between batches to respect rate limits
      if (i + BATCH_SIZE < subscribers.length) {
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
      }
    }

    // Log the broadcast to audit log
    await prisma.auditLog.create({
      data: {
        action: `broadcast_${eventType}`,
        details: {
          total: result.total,
          successful: result.successful,
          failed: result.failed,
          message: message.substring(0, 200),
        },
      },
    })

    loggers.alerts.info({
      successful: result.successful,
      total: result.total
    }, 'Broadcast complete')

    return result
  } catch (error: any) {
    loggers.alerts.error({ error: String(error) }, 'Error in broadcastMessage')
    result.errors.push(error.message)
    return result
  }
}

/**
 * Send a custom admin announcement to all subscribers
 */
export async function sendAdminAnnouncement(
  title: string,
  body: string
): Promise<BroadcastResult> {
  const message = `📢 *${title}*

${body}

_You're receiving this because you subscribed to alerts._
_Use /alerts to manage your subscription._`

  return broadcastMessage(message, 'announcement')
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format maintenance alert message
 */
function formatMaintenanceAlert(
  reason: string,
  estimatedEndTime?: string,
  isStart: boolean = true
): string {
  if (isStart) {
    let message = `🔧 *Claude Wheel Bot - Maintenance*

The bot is currently undergoing maintenance.

*Reason:* ${reason}`

    if (estimatedEndTime) {
      message += `\n*Estimated Return:* ${estimatedEndTime}`
    }

    message += `

During this time:
• New launches are paused
• Flywheel operations continue
• Your tokens are safe

We'll notify you when we're back online.

_You're receiving this because you subscribed to alerts._
_Use /alerts to manage your subscription._`

    return message
  }

  return ''
}

/**
 * Check if bot is in maintenance mode (for use in command handlers)
 */
export async function isInMaintenanceMode(): Promise<boolean> {
  const status = await getBotStatus()
  return status.isMaintenanceMode
}
