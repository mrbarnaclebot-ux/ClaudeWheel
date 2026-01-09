// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM BOT (Notifications Only)
// Simplified bot for TMA architecture - all interactions happen in the Mini App
// Bot only provides /start, /help commands and serves as notification transport
// ═══════════════════════════════════════════════════════════════════════════

import { Telegraf, Context, Markup } from 'telegraf'
import { env } from '../config/env'
import { loggers } from '../utils/logger'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type BotContext = Context

// ═══════════════════════════════════════════════════════════════════════════
// BOT INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let bot: Telegraf<BotContext> | null = null

/**
 * Get or create the Telegram bot instance
 */
export function getBot(): Telegraf<BotContext> | null {
  if (!env.telegramBotToken) {
    return null
  }

  if (!bot) {
    bot = new Telegraf<BotContext>(env.telegramBotToken)
    setupBot(bot)
  }

  return bot
}

/**
 * Get the TMA URL from environment or use default
 */
function getTmaUrl(): string {
  return env.tmaUrl || 'https://tma.claudewheel.com'
}

/**
 * Create the "Open App" keyboard with TMA button
 */
function createAppKeyboard() {
  const tmaUrl = getTmaUrl()
  return Markup.inlineKeyboard([
    [Markup.button.webApp('🚀 Open ClaudeWheel', tmaUrl)],
  ])
}

// ═══════════════════════════════════════════════════════════════════════════
// BOT SETUP
// ═══════════════════════════════════════════════════════════════════════════

// Rate limiter for Telegram commands
const rateLimiter = new Map<number, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60000 // 1 minute
const MAX_COMMANDS_PER_WINDOW = 10

function checkRateLimit(userId: number): boolean {
  const now = Date.now()
  const userLimit = rateLimiter.get(userId)

  if (!userLimit || now > userLimit.resetAt) {
    rateLimiter.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (userLimit.count >= MAX_COMMANDS_PER_WINDOW) {
    return false
  }

  userLimit.count++
  return true
}

function setupBot(bot: Telegraf<BotContext>) {
  // Rate limiting middleware
  bot.use(async (ctx, next) => {
    if (ctx.from && !checkRateLimit(ctx.from.id)) {
      await ctx.reply('You are sending commands too quickly. Please wait a moment.')
      return
    }
    return next()
  })

  // Error handling
  bot.catch((err, ctx) => {
    loggers.telegram.error(
      { error: String(err), chatId: ctx.chat?.id, userId: ctx.from?.id },
      'Telegram bot error'
    )
    ctx.reply('An error occurred. Please try again or contact support.')
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMANDS (Minimal - all interactions in TMA)
  // ═══════════════════════════════════════════════════════════════════════════

  // /start - Welcome message with TMA button
  bot.command('start', async (ctx) => {
    const welcomeMessage = `🎡 *Welcome to ClaudeWheel!*

Launch tokens on Bags.fm and let our flywheel automatically trade and collect fees for you.

*Features:*
• Launch new tokens with one tap
• Automated market-making (flywheel)
• Automatic fee collection
• Real-time trade notifications

Tap the button below to get started:`

    await ctx.reply(welcomeMessage, {
      parse_mode: 'Markdown',
      ...createAppKeyboard(),
    })
  })

  // /help - Brief help with TMA button
  bot.command('help', async (ctx) => {
    const helpMessage = `🎡 *ClaudeWheel Help*

ClaudeWheel automates market-making for your Bags.fm tokens.

*What you can do:*
• Launch new tokens
• Register existing tokens
• Configure flywheel settings
• Monitor your portfolio
• Claim trading fees

All features are available in the app:

*Need support?*
Visit our [docs](https://claudewheel.com/docs) or open the app to access help.`

    await ctx.reply(helpMessage, {
      parse_mode: 'Markdown',
      ...createAppKeyboard(),
    })
  })

  // Handle any other text - redirect to TMA
  bot.on('text', async (ctx) => {
    const text = ctx.message.text

    // Ignore commands (handled above)
    if (text.startsWith('/')) return

    await ctx.reply(
      `All ClaudeWheel features are now available in the app.\n\nTap the button below to open it:`,
      createAppKeyboard()
    )
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start the Telegram bot
 */
export async function startTelegramBot(): Promise<void> {
  const botInstance = getBot()

  if (!botInstance) {
    loggers.telegram.warn('Telegram bot not configured (set TELEGRAM_BOT_TOKEN)')
    return
  }

  try {
    // Get bot info to verify connection
    const botInfo = await botInstance.telegram.getMe()
    loggers.telegram.info({ username: botInfo.username, botId: botInfo.id }, 'Bot connected')

    // Use webhook in production, polling in development
    if (env.isProd && env.telegramWebhookUrl) {
      try {
        await botInstance.telegram.setWebhook(env.telegramWebhookUrl)
        loggers.telegram.info({ webhookUrl: env.telegramWebhookUrl }, 'Telegram bot webhook set')
      } catch (webhookError) {
        loggers.telegram.warn(
          {
            webhookUrl: env.telegramWebhookUrl,
            error: webhookError instanceof Error ? webhookError.message : String(webhookError),
          },
          'Webhook setup failed, falling back to polling mode'
        )
        // Delete any existing webhook before falling back to polling
        try {
          await botInstance.telegram.deleteWebhook()
          loggers.telegram.info('Deleted existing webhook to enable polling')
        } catch (deleteError) {
          loggers.telegram.warn({ error: String(deleteError) }, 'Could not delete webhook')
        }
        // Fall back to polling
        await botInstance.launch()
        loggers.telegram.info('Telegram bot started (polling mode - fallback)')
      }
    } else {
      // Use polling for development
      await botInstance.launch()
      loggers.telegram.info('Telegram bot started (polling mode)')
    }

    loggers.telegram.info({ commands: ['/start', '/help'] }, 'Registered commands')
  } catch (error) {
    loggers.telegram.error({ error: String(error) }, 'Failed to start Telegram bot')
  }
}

/**
 * Stop the Telegram bot
 */
export function stopTelegramBot(): void {
  if (bot) {
    try {
      bot.stop('SIGTERM')
      loggers.telegram.info('Telegram bot stopped')
    } catch (error) {
      // Bot might not be running (e.g., using webhook mode or already stopped)
      loggers.telegram.debug({ error: String(error) }, 'Bot stop called but bot was not running')
    }
  }
}

/**
 * Get Express middleware for webhook
 */
export function getTelegramWebhookMiddleware() {
  const botInstance = getBot()
  if (!botInstance) return null
  // Use '/' since Express strips the '/telegram/webhook' prefix when mounting
  return botInstance.webhookCallback('/')
}
