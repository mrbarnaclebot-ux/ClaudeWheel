// ═══════════════════════════════════════════════════════════════════════════
// BOT ALERTS SERVICE
// Manages user subscriptions for downtime alerts and broadcasts
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '../config/database'
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
    if (!supabase) {
      return { success: false, error: 'Database not configured' }
    }

    // Check if already subscribed
    const { data: existing } = await supabase
      .from('telegram_alert_subscribers')
      .select('id, is_active')
      .eq('telegram_id', telegramId)
      .single()

    if (existing) {
      if (existing.is_active) {
        return { success: true, alreadySubscribed: true }
      }

      // Reactivate subscription
      await supabase
        .from('telegram_alert_subscribers')
        .update({
          is_active: true,
          telegram_username: telegramUsername,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      return { success: true }
    }

    // Create new subscription
    const { error } = await supabase.from('telegram_alert_subscribers').insert({
      telegram_id: telegramId,
      telegram_username: telegramUsername,
      is_active: true,
    })

    if (error) {
      loggers.alerts.error({ error: String(error), telegramId }, 'Error subscribing to alerts')
      return { success: false, error: 'Failed to subscribe' }
    }

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
    if (!supabase) {
      return { success: false, error: 'Database not configured' }
    }

    const { data: existing } = await supabase
      .from('telegram_alert_subscribers')
      .select('id, is_active')
      .eq('telegram_id', telegramId)
      .single()

    if (!existing || !existing.is_active) {
      return { success: true, wasSubscribed: false }
    }

    await supabase
      .from('telegram_alert_subscribers')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)

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
    if (!supabase) return false

    const { data } = await supabase
      .from('telegram_alert_subscribers')
      .select('is_active')
      .eq('telegram_id', telegramId)
      .single()

    return data?.is_active || false
  } catch {
    return false
  }
}

/**
 * Get all active subscribers
 */
export async function getActiveSubscribers(): Promise<AlertSubscription[]> {
  try {
    if (!supabase) return []

    const { data } = await supabase
      .from('telegram_alert_subscribers')
      .select('id, telegram_id, telegram_username, created_at, is_active')
      .eq('is_active', true)

    return (data || []).map(sub => ({
      id: sub.id,
      telegramId: sub.telegram_id,
      telegramUsername: sub.telegram_username,
      subscribedAt: sub.created_at,
      isActive: sub.is_active,
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
    if (!supabase) return 0

    const { count } = await supabase
      .from('telegram_alert_subscribers')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    return count || 0
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
    if (!supabase) {
      return {
        isMaintenanceMode: false,
        lastUpdated: new Date().toISOString(),
      }
    }

    const { data } = await supabase
      .from('bot_status')
      .select('*')
      .eq('id', 'main')
      .single()

    if (!data) {
      return {
        isMaintenanceMode: false,
        lastUpdated: new Date().toISOString(),
      }
    }

    return {
      isMaintenanceMode: data.is_maintenance_mode || false,
      maintenanceReason: data.maintenance_reason,
      maintenanceStartedAt: data.maintenance_started_at,
      estimatedEndTime: data.estimated_end_time,
      lastUpdated: data.updated_at,
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
    if (!supabase) {
      return { success: false, error: 'Database not configured' }
    }

    const now = new Date().toISOString()

    // Update or create bot status
    await supabase.from('bot_status').upsert({
      id: 'main',
      is_maintenance_mode: true,
      maintenance_reason: reason,
      maintenance_started_at: now,
      estimated_end_time: estimatedEndTime || null,
      updated_at: now,
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
    if (!supabase) {
      return { success: false, error: 'Database not configured' }
    }

    // Update bot status
    await supabase.from('bot_status').upsert({
      id: 'main',
      is_maintenance_mode: false,
      maintenance_reason: null,
      maintenance_started_at: null,
      estimated_end_time: null,
      updated_at: new Date().toISOString(),
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

    // Log the broadcast
    if (supabase) {
      await supabase.from('audit_log').insert({
        event_type: `broadcast_${eventType}`,
        details: {
          total: result.total,
          successful: result.successful,
          failed: result.failed,
          message: message.substring(0, 200),
        },
      })
    }

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
