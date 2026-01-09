// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM BOT
// Claude Wheel Telegram Bot for token launch and management
// ═══════════════════════════════════════════════════════════════════════════

import { Telegraf, Context, Scenes, session, Markup } from 'telegraf'
import { randomBytes } from 'crypto'
import { env } from '../config/env'
import { supabase } from '../config/database'
import { loggers } from '../utils/logger'

// ═══════════════════════════════════════════════════════════════════════════
// INLINE KEYBOARDS
// ═══════════════════════════════════════════════════════════════════════════

const mainMenuKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('🚀 Launch Token', 'action_launch'),
    Markup.button.callback('📝 Register Token', 'action_register'),
  ],
  [
    Markup.button.callback('📊 My Tokens', 'action_mytokens'),
    Markup.button.callback('❓ Help', 'action_help'),
  ],
  [Markup.button.url('🌐 Dashboard', 'https://claudewheel.com/dashboard')],
])

const helpKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('🚀 Launch', 'action_launch'),
    Markup.button.callback('📝 Register', 'action_register'),
  ],
  [Markup.button.callback('« Back to Menu', 'action_start')],
])

const alertsKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('🔔 Subscribe', 'action_subscribe_alerts'),
    Markup.button.callback('🔕 Unsubscribe', 'action_unsubscribe_alerts'),
  ],
  [Markup.button.callback('« Back to Menu', 'action_start')],
])

const cancelKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('❌ Cancel', 'action_cancel')],
])

const confirmTokenKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('✅ Yes, Continue', 'confirm_token_yes'),
    Markup.button.callback('❌ No, Try Again', 'confirm_token_no'),
  ],
])

const confirmRegisterKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('✅ Confirm Registration', 'confirm_register'),
    Markup.button.callback('❌ Cancel', 'action_cancel'),
  ],
])

const reactivateTokenKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('🔓 Reactivate Token', 'action_reactivate'),
    Markup.button.callback('❌ Cancel', 'action_cancel'),
  ],
])

/**
 * Check if supabase is configured and throw error if not
 */
function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase not configured')
  }
  return supabase
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SessionData extends Scenes.WizardSession {
  // Launch wizard data
  launchData?: {
    tokenName?: string
    tokenSymbol?: string
    tokenDescription?: string
    tokenImageUrl?: string
    // Social links (optional)
    twitterUrl?: string
    telegramUrl?: string
    websiteUrl?: string
    discordUrl?: string
    // Wallet data
    devWalletAddress?: string
    opsWalletAddress?: string
    pendingLaunchId?: string
    step?: string
  }
  // Register wizard data
  registerData?: {
    tokenMint?: string
    tokenSymbol?: string
    tokenName?: string
    tokenImage?: string
    isGraduated?: boolean
    creatorWallet?: string // Token creator for ownership verification
    devWalletPrivateKey?: string
    opsWalletPrivateKey?: string
    devWalletAddress?: string
    opsWalletAddress?: string
    step?: string
    // Reactivation flow fields
    isReactivation?: boolean // True if reactivating a suspended token
    suspendedTokenId?: string // ID of the suspended token being reactivated
    suspendedTokenSymbol?: string // Symbol of the suspended token
    suspendedDevWallet?: string // Expected dev wallet address
    suspendedOpsWallet?: string // Expected ops wallet address
  }
  // User data
  telegramUserId?: string
  walletAddress?: string
}

export interface BotContext extends Context {
  session: SessionData
  scene: Scenes.SceneContextScene<BotContext, Scenes.WizardSessionData>
  wizard: Scenes.WizardContextWizard<BotContext>
}

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
 * Setup bot middleware and commands
 */
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
  // Session middleware
  bot.use(session())

  // Rate limiting middleware - prevents command spam
  bot.use(async (ctx, next) => {
    if (ctx.from && !checkRateLimit(ctx.from.id)) {
      await ctx.reply('You are sending commands too quickly. Please wait a moment.')
      return
    }
    return next()
  })

  // Error handling
  bot.catch((err, ctx) => {
    loggers.telegram.error({ error: String(err), chatId: ctx.chat?.id, userId: ctx.from?.id }, 'Telegram bot error')
    ctx.reply('An error occurred. Please try again or contact support.')
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMANDS
  // ═══════════════════════════════════════════════════════════════════════════

  // /start - Welcome message
  bot.command('start', async (ctx) => {
    await sendWelcomeMessage(ctx)
  })

  // Action handlers for inline buttons
  bot.action('action_start', async (ctx) => {
    await ctx.answerCbQuery()
    await sendWelcomeMessage(ctx)
  })

  bot.action('action_launch', async (ctx) => {
    await ctx.answerCbQuery()
    await startLaunchWizard(ctx)
  })

  bot.action('action_register', async (ctx) => {
    await ctx.answerCbQuery()
    await startRegisterWizard(ctx)
  })

  bot.action('action_mytokens', async (ctx) => {
    await ctx.answerCbQuery()
    await showMyTokens(ctx)
  })

  bot.action('action_help', async (ctx) => {
    await ctx.answerCbQuery()
    await sendHelpMessage(ctx)
  })

  bot.action('action_alerts', async (ctx) => {
    await ctx.answerCbQuery()
    await showAlertsMenu(ctx)
  })

  bot.action('action_subscribe_alerts', async (ctx) => {
    await ctx.answerCbQuery('Subscribing...')
    await handleAlertSubscription(ctx, true)
  })

  bot.action('action_unsubscribe_alerts', async (ctx) => {
    await ctx.answerCbQuery('Unsubscribing...')
    await handleAlertSubscription(ctx, false)
  })

  bot.action('action_cancel', async (ctx) => {
    await ctx.answerCbQuery('Cancelled')
    ctx.session = ctx.session || {}
    ctx.session.launchData = undefined
    ctx.session.registerData = undefined
    await ctx.editMessageText('❌ Operation cancelled.\n\nUse /start to begin again.')
  })

  bot.action('confirm_token_yes', async (ctx) => {
    await ctx.answerCbQuery()
    const data = ctx.session?.registerData
    if (data) {
      data.step = 'dev_key'
      await ctx.editMessageText(
        `✅ *Token Confirmed*\n\n` +
        `Now I need your wallet private keys to enable the flywheel.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ *PRIVATE KEY REQUIRED*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `The dev wallet receives Bags.fm trading fees.\n` +
        `We need the private key to claim fees.\n\n` +
        `*Security:*\n` +
        `• Encrypted with AES-256-GCM\n` +
        `• Only system can decrypt\n` +
        `• Used solely for fee claiming\n\n` +
        `⚠️ *DELETE YOUR MESSAGE after I confirm!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📝 *Send your DEV WALLET PRIVATE KEY* (base58):`,
        { parse_mode: 'Markdown' }
      )
    }
  })

  bot.action('confirm_token_no', async (ctx) => {
    await ctx.answerCbQuery()
    const data = ctx.session?.registerData
    if (data) {
      data.step = 'mint'
      await ctx.editMessageText(
        '🔄 *Let\'s try again*\n\nPlease send the correct token mint address:',
        { parse_mode: 'Markdown' }
      )
    }
  })

  // Handle reactivation flow - user clicked "Reactivate Token"
  bot.action('action_reactivate', async (ctx) => {
    await ctx.answerCbQuery()
    const data = ctx.session?.registerData
    if (data && data.isReactivation) {
      data.step = 'reactivate_dev_key'
      await ctx.editMessageText(
        `🔓 *Reactivate ${data.suspendedTokenSymbol || 'Token'}*\n\n` +
        `To prove ownership and reactivate this token, you must provide the private keys for both wallets.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ *DEV WALLET VERIFICATION*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Expected address:\n\`${data.suspendedDevWallet?.slice(0, 8)}...${data.suspendedDevWallet?.slice(-6)}\`\n\n` +
        `🔒 *Security:*\n` +
        `• Key verified against stored wallet\n` +
        `• Re-encrypted after verification\n` +
        `• Only you can reactivate\n\n` +
        `⚠️ *DELETE YOUR MESSAGE after I confirm!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📝 *Send your DEV WALLET PRIVATE KEY* (base58):`,
        { parse_mode: 'Markdown' }
      )
    }
  })

  bot.action(/^toggle_(.+)$/, async (ctx) => {
    const symbol = ctx.match[1]
    await ctx.answerCbQuery(`Toggling ${symbol}...`)
    await toggleFlywheel(ctx, symbol)
  })

  bot.action(/^status_(.+)$/, async (ctx) => {
    const symbol = ctx.match[1]
    await ctx.answerCbQuery()
    await showTokenStatus(ctx, symbol)
  })

  // /help - Full command list
  bot.command('help', async (ctx) => {
    await sendHelpMessage(ctx)
  })

  // /alerts - Manage downtime alert subscription
  bot.command('alerts', async (ctx) => {
    await showAlertsMenu(ctx)
  })

  // /botstatus - Check bot status
  bot.command('botstatus', async (ctx) => {
    await showBotStatus(ctx)
  })

  // /launch - Start token launch wizard
  bot.command('launch', async (ctx) => {
    loggers.telegram.info({ userId: ctx.from?.id, command: 'launch' }, '📱 /launch command received')
    try {
      await startLaunchWizard(ctx)
    } catch (error) {
      loggers.telegram.error({ error: String(error), userId: ctx.from?.id, command: 'launch' }, 'Error in /launch command')
      await ctx.reply('❌ Error starting launch wizard. Please try again.')
    }
  })

  // /register - Start token registration wizard
  bot.command('register', async (ctx) => {
    await startRegisterWizard(ctx)
  })

  // /mytokens - List user's tokens
  bot.command('mytokens', async (ctx) => {
    await showMyTokens(ctx)
  })

  // /status <symbol> - Token status
  bot.command('status', async (ctx) => {
    const args = ctx.message.text.split(' ')
    if (args.length < 2) {
      await ctx.reply('Usage: /status <symbol>\nExample: /status MAT')
      return
    }

    const symbol = args[1].toUpperCase()
    const telegramId = ctx.from?.id

    if (!telegramId) {
      await ctx.reply('Unable to identify your account.')
      return
    }

    try {
      const db = requireSupabase()

      // Get telegram user
      const { data: telegramUser } = await db
        .from('telegram_users')
        .select('id')
        .eq('telegram_id', telegramId)
        .single()

      if (!telegramUser) {
        await ctx.reply('You haven\'t registered any tokens yet.')
        return
      }

      // Get token by symbol
      const { data: token } = await db
        .from('user_tokens')
        .select(`
          *,
          user_token_config (*),
          user_flywheel_state (*)
        `)
        .eq('telegram_user_id', telegramUser.id)
        .ilike('token_symbol', symbol)
        .single()

      if (!token) {
        await ctx.reply(`Token ${symbol} not found. Use /mytokens to see your tokens.`)
        return
      }

      const config = Array.isArray(token.user_token_config)
        ? token.user_token_config[0]
        : token.user_token_config
      const state = Array.isArray(token.user_flywheel_state)
        ? token.user_flywheel_state[0]
        : token.user_flywheel_state

      const statusEmoji = config?.flywheel_active ? '🟢' : '🔴'
      const statusText = config?.flywheel_active ? 'ACTIVE' : 'INACTIVE'
      const phase = state?.cycle_phase || 'buy'
      const buyCount = state?.buy_count || 0
      const sellCount = state?.sell_count || 0

      const statusMessage = `
📊 *${token.token_symbol} Token Status*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Flywheel: ${statusEmoji} *${statusText}*
Algorithm: ${config?.algorithm_mode || 'simple'}
Phase: ${phase} (${phase === 'buy' ? buyCount : sellCount}/5)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*CONFIGURATION*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Buy Range: ${config?.min_buy_amount_sol || 0.01} - ${config?.max_buy_amount_sol || 0.05} SOL
Slippage: ${((config?.slippage_bps || 300) / 100).toFixed(1)}%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*WALLETS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dev: \`${token.dev_wallet_address.slice(0, 8)}...\`
Ops: \`${token.ops_wallet_address.slice(0, 8)}...\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

_Use /toggle ${symbol} to enable/disable_
_Use /settings ${symbol} to configure_
`
      await ctx.replyWithMarkdown(statusMessage)
    } catch (error) {
      loggers.telegram.error({ error: String(error), userId: ctx.from?.id, command: 'status' }, 'Error fetching token status')
      await ctx.reply('Error fetching token status. Please try again.')
    }
  })

  // /toggle <symbol> - Toggle flywheel
  bot.command('toggle', async (ctx) => {
    const args = ctx.message.text.split(' ')
    if (args.length < 2) {
      await ctx.reply('Usage: /toggle <symbol>\nExample: /toggle MAT')
      return
    }

    const symbol = args[1].toUpperCase()
    const telegramId = ctx.from?.id

    if (!telegramId) {
      await ctx.reply('Unable to identify your account.')
      return
    }

    try {
      const db = requireSupabase()

      // Get telegram user
      const { data: telegramUser } = await db
        .from('telegram_users')
        .select('id')
        .eq('telegram_id', telegramId)
        .single()

      if (!telegramUser) {
        await ctx.reply('You haven\'t registered any tokens yet.')
        return
      }

      // Get token by symbol
      const { data: token } = await db
        .from('user_tokens')
        .select('id, token_symbol, user_token_config(id, flywheel_active)')
        .eq('telegram_user_id', telegramUser.id)
        .ilike('token_symbol', symbol)
        .single()

      if (!token) {
        await ctx.reply(`Token ${symbol} not found.`)
        return
      }

      const config = Array.isArray(token.user_token_config)
        ? token.user_token_config[0]
        : token.user_token_config

      if (!config) {
        await ctx.reply('Token configuration not found.')
        return
      }

      // Toggle flywheel
      const newState = !config.flywheel_active

      await db
        .from('user_token_config')
        .update({ flywheel_active: newState })
        .eq('id', config.id)

      const emoji = newState ? '🟢' : '🔴'
      const state = newState ? 'ENABLED' : 'DISABLED'

      await ctx.reply(`${emoji} Flywheel ${state} for ${token.token_symbol}`)
    } catch (error) {
      loggers.telegram.error({ error: String(error), userId: ctx.from?.id, command: 'toggle' }, 'Error toggling flywheel')
      await ctx.reply('Error toggling flywheel. Please try again.')
    }
  })

  // /cancel - Cancel current operation
  bot.command('cancel', async (ctx) => {
    ctx.session = ctx.session || {}
    ctx.session.launchData = undefined
    ctx.session.registerData = undefined

    await ctx.reply('Operation cancelled. Use /start to see available commands.')
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // MESSAGE HANDLERS (for wizard flows)
  // ═══════════════════════════════════════════════════════════════════════════

  // Handle text messages for wizard flows
  bot.on('text', async (ctx) => {
    const text = ctx.message.text

    // Skip if it's a command
    if (text.startsWith('/')) return

    ctx.session = ctx.session || {}

    // Handle launch wizard
    if (ctx.session.launchData) {
      await handleLaunchWizard(ctx, text)
      return
    }

    // Handle register wizard
    if (ctx.session.registerData) {
      await handleRegisterWizard(ctx, text)
      return
    }
  })

  // Handle photo uploads for launch wizard image step
  bot.on('photo', async (ctx) => {
    ctx.session = ctx.session || {}
    const data = ctx.session.launchData

    // Only handle photos during launch wizard image step
    if (!data || data.step !== 'image') {
      return
    }

    try {
      await ctx.reply('📤 *Uploading your image...*', { parse_mode: 'Markdown' })

      // Get the largest photo (last in array)
      const photos = ctx.message.photo
      const largestPhoto = photos[photos.length - 1]

      // Get file info from Telegram
      const file = await ctx.telegram.getFile(largestPhoto.file_id)
      const fileUrl = `https://api.telegram.org/file/bot${env.telegramBotToken}/${file.file_path}`

      // Download the image
      const response = await fetch(fileUrl)
      if (!response.ok) {
        throw new Error('Failed to download image from Telegram')
      }
      const imageBuffer = Buffer.from(await response.arrayBuffer())

      // Upload to Supabase Storage
      const publicUrl = await uploadTokenImage(imageBuffer, file.file_path || 'image.jpg')

      if (!publicUrl) {
        await ctx.reply('⚠️ Could not upload image. Please try sending a URL instead, or type "skip":')
        return
      }

      data.tokenImageUrl = publicUrl
      data.step = 'socials'

      await ctx.reply(`✅ *Image uploaded successfully!*`, { parse_mode: 'Markdown' })

      // Continue to social links step (optional)
      await ctx.replyWithMarkdown(
        `🔗 *SOCIAL LINKS* _(optional)_\n\n` +
        `Add your token's social links to increase visibility.\n\n` +
        `Send links in this format (one per line):\n` +
        `\`twitter: https://twitter.com/yourtoken\`\n` +
        `\`telegram: https://t.me/yourgroup\`\n` +
        `\`website: https://yourtoken.com\`\n` +
        `\`discord: https://discord.gg/invite\`\n\n` +
        `Or type *"skip"* to continue without social links.`
      )
    } catch (error) {
      loggers.telegram.error({ error: String(error), userId: ctx.from?.id }, 'Error handling photo upload')
      await ctx.reply('⚠️ Error uploading image. Please try sending a URL instead, or type "skip":')
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload token image to Supabase Storage
 * Returns the public URL or null on failure
 */
async function uploadTokenImage(imageBuffer: Buffer, originalPath: string): Promise<string | null> {
  try {
    if (!supabase) {
      loggers.telegram.warn('⚠️ Supabase not configured - cannot upload image')
      return null
    }

    // Generate unique filename
    const extension = originalPath.split('.').pop() || 'jpg'
    const filename = `token-${Date.now()}-${randomBytes(8).toString('hex')}.${extension}`
    const storagePath = `token-images/${filename}`

    // Determine content type
    const contentType = extension === 'png' ? 'image/png' : 'image/jpeg'

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('public-assets')
      .upload(storagePath, imageBuffer, {
        contentType,
        upsert: false,
      })

    if (error) {
      loggers.telegram.error({ error: String(error), storagePath }, 'Supabase storage upload error')
      return null
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('public-assets')
      .getPublicUrl(storagePath)

    loggers.telegram.info({ publicUrl: urlData.publicUrl }, '✅ Image uploaded to Supabase')
    return urlData.publicUrl
  } catch (error) {
    loggers.telegram.error({ error: String(error) }, 'Failed to upload token image')
    return null
  }
}

/**
 * Finalize launch wizard - generate wallets and create pending launch
 * Called after image step is complete (either URL, upload, or skip)
 */
async function finalizeLaunchWizard(ctx: BotContext): Promise<void> {
  const data = ctx.session.launchData
  if (!data) return

  try {
    const { generateEncryptedWalletPair } = await import('../services/wallet-generator')
    const wallets = generateEncryptedWalletPair()
    const db = requireSupabase()

    data.devWalletAddress = wallets.devWallet.address
    data.opsWalletAddress = wallets.opsWallet.address

    // Store pending launch in database
    const telegramId = ctx.from?.id

    // Get or create telegram user
    let { data: telegramUser, error: userFetchError } = await db
      .from('telegram_users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single()

    if (!telegramUser && userFetchError?.code === 'PGRST116') {
      // PGRST116 = no rows returned, create new user
      const { data: newUser, error: createUserError } = await db
        .from('telegram_users')
        .insert({
          telegram_id: telegramId,
          telegram_username: ctx.from?.username,
        })
        .select('id')
        .single()

      if (createUserError) {
        console.error('Error creating telegram user:', createUserError)
        await ctx.reply('Error setting up your account. Please try again with /launch')
        ctx.session.launchData = undefined
        return
      }
      telegramUser = newUser
    } else if (userFetchError && userFetchError.code !== 'PGRST116') {
      console.error('Error fetching telegram user:', userFetchError)
      await ctx.reply('Error fetching your account. Please try again with /launch')
      ctx.session.launchData = undefined
      return
    }

    if (!telegramUser?.id) {
      console.error('Failed to get or create telegram user')
      await ctx.reply('Error setting up your account. Please try again with /launch')
      ctx.session.launchData = undefined
      return
    }

    // Create pending launch
    const { data: pendingLaunch, error } = await db
      .from('pending_token_launches')
      .insert({
        telegram_user_id: telegramUser.id,
        token_name: data.tokenName,
        token_symbol: data.tokenSymbol,
        token_description: data.tokenDescription,
        token_image_url: data.tokenImageUrl,
        // Social links (optional)
        twitter_url: data.twitterUrl || null,
        telegram_url: data.telegramUrl || null,
        website_url: data.websiteUrl || null,
        discord_url: data.discordUrl || null,
        // Wallet encryption
        dev_wallet_address: wallets.devWallet.address,
        dev_wallet_private_key_encrypted: wallets.devWallet.encryptedPrivateKey,
        dev_encryption_iv: wallets.devWallet.iv,
        dev_encryption_auth_tag: wallets.devWallet.authTag,
        ops_wallet_address: wallets.opsWallet.address,
        ops_wallet_private_key_encrypted: wallets.opsWallet.encryptedPrivateKey,
        ops_encryption_iv: wallets.opsWallet.iv,
        ops_encryption_auth_tag: wallets.opsWallet.authTag,
        status: 'awaiting_deposit',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      loggers.telegram.error({ error: String(error), tokenName: data.tokenName, tokenSymbol: data.tokenSymbol }, 'Error creating pending launch')
      await ctx.reply('Error creating launch. Please try again with /launch')
      ctx.session.launchData = undefined
      return
    }

    data.pendingLaunchId = pendingLaunch?.id

    // Log audit event
    await db.from('audit_log').insert({
      event_type: 'launch_started',
      pending_launch_id: pendingLaunch?.id,
      telegram_id: telegramId,
      details: { token_name: data.tokenName, token_symbol: data.tokenSymbol },
    })

    const confirmMessage = `🎯 *${data.tokenName}* (${data.tokenSymbol})

📬 *Dev Wallet* — receives fees
\`${wallets.devWallet.address}\`

🔧 *Ops Wallet* — runs flywheel
\`${wallets.opsWallet.address}\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💸 *Fee Structure*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

100% of trading fees go to Dev Wallet
When claimed, fees are split:
├ 90% → Your Ops Wallet
└ 10% → Claude Wheel (platform fee)

_Auto-claim runs every 30 seconds when fees ≥ 0.15 SOL_

─────────────────────────

💰 *Fund to Launch*

Send *0.5+ SOL* to Dev Wallet:
\`${wallets.devWallet.address}\`

├ 0.1 SOL → Launch fee
└ 0.4+ SOL → Initial liquidity

─────────────────────────

⏳ Monitoring for deposit...

_Expires in 24h • /cancel to abort_`
    await ctx.replyWithMarkdown(confirmMessage)

    // Clear launch data from session (deposit monitor will handle the rest)
    ctx.session.launchData = undefined
  } catch (error) {
    loggers.telegram.error({ error: String(error), chatId: ctx.chat?.id }, 'Error in finalizeLaunchWizard')
    await ctx.reply('Error generating wallets. Please try again with /launch')
    ctx.session.launchData = undefined
  }
}

async function sendWelcomeMessage(ctx: BotContext) {
  const welcomeMessage = `🔷 *Claude Wheel Bot*

Automated market-making for Bags.fm tokens

🚀 *Launch* — Create new token
├ Auto-generated wallets
└ Flywheel starts immediately

📝 *Register* — Existing token
├ Enable automated trading
└ Auto-claim fees

─────────────────────────

Select an option below:`
  await ctx.replyWithMarkdown(welcomeMessage, mainMenuKeyboard)
}

async function sendHelpMessage(ctx: BotContext) {
  const helpMessage = `📚 *Commands*

*Start*
├ /launch — New token
├ /register — Existing token
└ /cancel — Abort

*Manage*
├ /mytokens — List tokens
├ /status \`SYM\` — Check status
└ /toggle \`SYM\` — On/off

*Alerts*
├ /alerts — Downtime alerts
└ /botstatus — Check status

*Modes*
├ simple — 5 buys → 5 sells
├ smart — RSI + Bollinger
└ rebalance — Target %

─────────────────────────

📖 [Docs](https://claudewheel.com/docs) • 🌐 [Dashboard](https://claudewheel.com/dashboard)`
  await ctx.replyWithMarkdown(helpMessage, helpKeyboard)
}

async function showAlertsMenu(ctx: BotContext) {
  const telegramId = ctx.from?.id
  if (!telegramId) {
    await ctx.reply('Unable to identify your account.')
    return
  }

  try {
    const { isSubscribed: checkSubscribed } = await import('../services/bot-alerts.service')
    const subscribed = await checkSubscribed(telegramId)

    const statusEmoji = subscribed ? '🔔' : '🔕'
    const statusText = subscribed ? 'Subscribed' : 'Not subscribed'

    const alertsMessage = `🔔 *Downtime Alerts*

Stay informed when the bot goes offline for maintenance or upgrades.

*Current Status:* ${statusEmoji} ${statusText}

*What you'll receive:*
├ Maintenance announcements
├ Downtime notifications
├ Service restoration alerts
└ Important updates

─────────────────────────

${subscribed
    ? '_You will receive alerts when the bot is down._'
    : '_Subscribe to get notified about downtime._'
  }`

    await ctx.replyWithMarkdown(alertsMessage, alertsKeyboard)
  } catch (error) {
    loggers.telegram.error({ error: String(error), userId: ctx.from?.id }, 'Error showing alerts menu')
    await ctx.reply('Error loading alerts settings. Please try again.')
  }
}

async function handleAlertSubscription(ctx: BotContext, subscribe: boolean) {
  const telegramId = ctx.from?.id
  const username = ctx.from?.username

  if (!telegramId) {
    await ctx.reply('Unable to identify your account.')
    return
  }

  try {
    const { subscribeToAlerts, unsubscribeFromAlerts } = await import('../services/bot-alerts.service')

    if (subscribe) {
      const result = await subscribeToAlerts(telegramId, username)

      if (!result.success) {
        await ctx.reply(`❌ Failed to subscribe: ${result.error}`)
        return
      }

      if (result.alreadySubscribed) {
        await ctx.reply('✅ You\'re already subscribed to downtime alerts!')
      } else {
        await ctx.replyWithMarkdown(`🔔 *Subscribed to Alerts!*

You'll now receive notifications when:
• Bot goes down for maintenance
• Services are restored
• Important announcements

Use /alerts to manage your subscription.`)
      }
    } else {
      const result = await unsubscribeFromAlerts(telegramId)

      if (!result.success) {
        await ctx.reply(`❌ Failed to unsubscribe: ${result.error}`)
        return
      }

      if (!result.wasSubscribed) {
        await ctx.reply('You weren\'t subscribed to alerts.')
      } else {
        await ctx.replyWithMarkdown(`🔕 *Unsubscribed from Alerts*

You will no longer receive downtime notifications.

Use /alerts to re-subscribe anytime.`)
      }
    }
  } catch (error) {
    loggers.telegram.error({ error: String(error), userId: ctx.from?.id, subscribe }, 'Error handling alert subscription')
    await ctx.reply('Error updating subscription. Please try again.')
  }
}

async function showBotStatus(ctx: BotContext) {
  try {
    const { getBotStatus, getSubscriberCount } = await import('../services/bot-alerts.service')
    const status = await getBotStatus()
    const subscriberCount = await getSubscriberCount()

    let statusMessage: string

    if (status.isMaintenanceMode) {
      statusMessage = `🔧 *Bot Status: Maintenance*

The bot is currently undergoing maintenance.

*Reason:* ${status.maintenanceReason || 'Scheduled maintenance'}
${status.estimatedEndTime ? `*Estimated Return:* ${status.estimatedEndTime}` : ''}
*Started:* ${status.maintenanceStartedAt ? new Date(status.maintenanceStartedAt).toLocaleString() : 'Recently'}

─────────────────────────

During maintenance:
• New launches are paused
• Flywheel operations continue
• Your tokens are safe

Use /alerts to get notified when we're back.`
    } else {
      const uptimeEmoji = '🟢'
      statusMessage = `${uptimeEmoji} *Bot Status: Online*

All systems operational!

*Services:*
├ Token Launching: ✅ Active
├ Registration: ✅ Active
├ Flywheel: ✅ Running
└ Fee Claims: ✅ Active

*Alert Subscribers:* ${subscriberCount} users

─────────────────────────

Use /alerts to subscribe to downtime notifications.`
    }

    await ctx.replyWithMarkdown(statusMessage)
  } catch (error) {
    loggers.telegram.error({ error: String(error), userId: ctx.from?.id }, 'Error showing bot status')
    await ctx.reply('Error checking bot status. Please try again.')
  }
}

async function startLaunchWizard(ctx: BotContext) {
  loggers.telegram.info({ chatId: ctx.chat?.id, chatType: ctx.chat?.type }, '🚀 startLaunchWizard called')

  // Check if in private chat
  if (ctx.chat?.type !== 'private') {
    loggers.telegram.warn({ chatId: ctx.chat?.id, chatType: ctx.chat?.type }, '⚠️ Launch rejected - not private chat')
    await ctx.reply('⚠️ For security, please use /launch in a private chat with me.')
    return
  }

  // Initialize session data
  ctx.session = ctx.session || {}
  ctx.session.launchData = { step: 'name' }
  loggers.telegram.debug({ chatId: ctx.chat?.id, step: 'name' }, '📝 Session initialized with launchData')

  const launchIntro = `🚀 *Launch New Token*

1. Provide token details
2. We generate wallets
3. You send SOL
4. Token mints auto
5. Flywheel starts

─────────────────────────

📝 *TOKEN NAME?*
_e.g. "Claude Wheel"_`
  loggers.telegram.debug({ chatId: ctx.chat?.id }, '📤 Sending launch intro message...')
  await ctx.replyWithMarkdown(launchIntro, cancelKeyboard)
  loggers.telegram.debug({ chatId: ctx.chat?.id }, '✅ Launch intro sent successfully')
}

async function startRegisterWizard(ctx: BotContext) {
  // Check if in private chat
  if (ctx.chat?.type !== 'private') {
    await ctx.reply('⚠️ For security, please use /register in a private chat with me.')
    return
  }

  // Initialize session data
  ctx.session = ctx.session || {}
  ctx.session.registerData = { step: 'mint' }

  const registerIntro = `📝 *Register Existing Token*

For tokens already on Bags.fm

🔒 *Security*
├ AES-256-GCM encryption
├ Only system can decrypt
└ Delete key messages!

─────────────────────────

📝 *TOKEN MINT ADDRESS?*
_Solana address of your token_`
  await ctx.replyWithMarkdown(registerIntro, cancelKeyboard)
}

async function showMyTokens(ctx: BotContext) {
  const telegramId = ctx.from?.id
  if (!telegramId) {
    await ctx.reply('Unable to identify your account.')
    return
  }

  try {
    const db = requireSupabase()

    // Get telegram user
    const { data: telegramUser } = await db
      .from('telegram_users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single()

    if (!telegramUser) {
      const noTokensMessage = `📊 *My Tokens*

No tokens yet.

Launch a new token or register an existing one to get started!`
      const noTokensKeyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('🚀 Launch', 'action_launch'),
          Markup.button.callback('📝 Register', 'action_register'),
        ],
      ])
      await ctx.replyWithMarkdown(noTokensMessage, noTokensKeyboard)
      return
    }

    // Get user's tokens
    const { data: tokens, error } = await db
      .from('user_tokens')
      .select(`
        id,
        token_symbol,
        token_name,
        token_mint_address,
        is_active,
        is_graduated,
        launched_via_telegram,
        user_token_config (
          flywheel_active,
          algorithm_mode
        )
      `)
      .eq('telegram_user_id', telegramUser.id)
      .eq('is_active', true)

    if (error || !tokens || tokens.length === 0) {
      const noTokensMessage = `📊 *My Tokens*

No tokens yet.

Launch a new token or register an existing one to get started!`
      const noTokensKeyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('🚀 Launch', 'action_launch'),
          Markup.button.callback('📝 Register', 'action_register'),
        ],
      ])
      await ctx.replyWithMarkdown(noTokensMessage, noTokensKeyboard)
      return
    }

    let message = `📊 *My Tokens*\n\n`

    const buttons: ReturnType<typeof Markup.button.callback>[][] = []

    for (const token of tokens) {
      const config = Array.isArray(token.user_token_config)
        ? token.user_token_config[0]
        : token.user_token_config

      const flywheelStatus = config?.flywheel_active ? '🟢' : '🔴'
      const graduatedStatus = token.is_graduated ? '✨' : '📈'
      const mode = config?.algorithm_mode || 'simple'
      const source = token.launched_via_telegram ? 'Launched' : 'Registered'

      message += `${graduatedStatus} *${token.token_name || token.token_symbol}*\n`
      message += `┌ Symbol: \`${token.token_symbol}\`\n`
      message += `├ Flywheel: ${flywheelStatus} ${config?.flywheel_active ? 'Active' : 'Inactive'}\n`
      message += `├ Mode: ${mode}\n`
      message += `└ ${source}\n\n`

      // Add buttons for this token
      buttons.push([
        Markup.button.callback(`📊 ${token.token_symbol}`, `status_${token.token_symbol}`),
        Markup.button.callback(
          config?.flywheel_active ? `🔴 Disable` : `🟢 Enable`,
          `toggle_${token.token_symbol}`
        ),
      ])
    }

    // Add main menu button at the bottom
    buttons.push([Markup.button.callback('➕ Add Token', 'action_register')])

    await ctx.replyWithMarkdown(message, Markup.inlineKeyboard(buttons))
  } catch (error) {
    loggers.telegram.error({ error: String(error), userId: ctx.from?.id }, 'Error fetching tokens')
    await ctx.reply('Error fetching your tokens. Please try again.')
  }
}

async function showTokenStatus(ctx: BotContext, symbol: string) {
  const telegramId = ctx.from?.id
  if (!telegramId) {
    await ctx.reply('Unable to identify your account.')
    return
  }

  try {
    const db = requireSupabase()

    // Get telegram user
    const { data: telegramUser } = await db
      .from('telegram_users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single()

    if (!telegramUser) {
      await ctx.reply('You haven\'t registered any tokens yet.')
      return
    }

    // Get token by symbol
    const { data: token } = await db
      .from('user_tokens')
      .select(`
        *,
        user_token_config (*),
        user_flywheel_state (*)
      `)
      .eq('telegram_user_id', telegramUser.id)
      .ilike('token_symbol', symbol)
      .single()

    if (!token) {
      await ctx.reply(`Token ${symbol} not found. Use /mytokens to see your tokens.`)
      return
    }

    const config = Array.isArray(token.user_token_config)
      ? token.user_token_config[0]
      : token.user_token_config
    const state = Array.isArray(token.user_flywheel_state)
      ? token.user_flywheel_state[0]
      : token.user_flywheel_state

    const statusEmoji = config?.flywheel_active ? '🟢' : '🔴'
    const statusText = config?.flywheel_active ? 'ACTIVE' : 'INACTIVE'
    const graduatedBadge = token.is_graduated ? '✨ Graduated' : '📈 Bonding'
    const phase = state?.cycle_phase || 'buy'
    const buyCount = state?.buy_count || 0
    const sellCount = state?.sell_count || 0

    const statusMessage = `📊 *${token.token_name || token.token_symbol}* (${token.token_symbol})

${statusEmoji} Flywheel: *${statusText}*
├ Market: ${graduatedBadge}
├ Mode: ${config?.algorithm_mode || 'simple'}
└ Phase: ${phase} (${phase === 'buy' ? buyCount : sellCount}/5)

⚙️ *Config*
├ Buy: ${config?.min_buy_amount_sol || 0.01}-${config?.max_buy_amount_sol || 0.05} SOL
└ Slippage: ${((config?.slippage_bps || 300) / 100).toFixed(1)}%

💼 *Wallets*
├ Dev: \`${token.dev_wallet_address.slice(0, 8)}...\`
└ Ops: \`${token.ops_wallet_address.slice(0, 8)}...\``

    const statusKeyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          config?.flywheel_active ? '🔴 Disable Flywheel' : '🟢 Enable Flywheel',
          `toggle_${symbol}`
        ),
      ],
      [
        Markup.button.callback('📊 My Tokens', 'action_mytokens'),
        Markup.button.url('🌐 Dashboard', 'https://claudewheel.com/dashboard'),
      ],
    ])

    await ctx.replyWithMarkdown(statusMessage, statusKeyboard)
  } catch (error) {
    loggers.telegram.error({ error: String(error), userId: ctx.from?.id, symbol }, 'Error fetching token status')
    await ctx.reply('Error fetching token status. Please try again.')
  }
}

async function toggleFlywheel(ctx: BotContext, symbol: string) {
  const telegramId = ctx.from?.id
  if (!telegramId) {
    await ctx.reply('Unable to identify your account.')
    return
  }

  try {
    const db = requireSupabase()

    // Get telegram user
    const { data: telegramUser } = await db
      .from('telegram_users')
      .select('id')
      .eq('telegram_id', telegramId)
      .single()

    if (!telegramUser) {
      await ctx.reply('You haven\'t registered any tokens yet.')
      return
    }

    // Get token by symbol
    const { data: token } = await db
      .from('user_tokens')
      .select('id, token_symbol, user_token_config(id, flywheel_active)')
      .eq('telegram_user_id', telegramUser.id)
      .ilike('token_symbol', symbol)
      .single()

    if (!token) {
      await ctx.reply(`Token ${symbol} not found.`)
      return
    }

    const config = Array.isArray(token.user_token_config)
      ? token.user_token_config[0]
      : token.user_token_config

    if (!config) {
      await ctx.reply('Token configuration not found.')
      return
    }

    // Toggle flywheel
    const newState = !config.flywheel_active

    await db
      .from('user_token_config')
      .update({ flywheel_active: newState })
      .eq('id', config.id)

    const emoji = newState ? '🟢' : '🔴'
    const stateText = newState ? 'ENABLED' : 'DISABLED'

    const toggleMessage = `${emoji} *${token.token_symbol}* flywheel ${stateText.toLowerCase()}

${newState ? '✅ Auto-trading now active' : '⏸️ Trading paused'}`

    const toggleKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback(`📊 View Status`, `status_${symbol}`)],
      [Markup.button.callback('📊 My Tokens', 'action_mytokens')],
    ])

    await ctx.replyWithMarkdown(toggleMessage, toggleKeyboard)
  } catch (error) {
    loggers.telegram.error({ error: String(error), userId: ctx.from?.id, symbol }, 'Error toggling flywheel')
    await ctx.reply('Error toggling flywheel. Please try again.')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleLaunchWizard(ctx: BotContext, text: string) {
  const data = ctx.session.launchData
  if (!data) return

  switch (data.step) {
    case 'name':
      if (text.length < 2 || text.length > 50) {
        await ctx.reply('Token name must be 2-50 characters. Please try again:')
        return
      }
      data.tokenName = text
      data.step = 'symbol'
      await ctx.reply(`Great name! 📝 *TOKEN SYMBOL?* (3-8 characters, e.g., MAT)`, { parse_mode: 'Markdown' })
      break

    case 'symbol':
      const symbol = text.toUpperCase()
      if (symbol.length < 2 || symbol.length > 8 || !/^[A-Z0-9]+$/.test(symbol)) {
        await ctx.reply('Symbol must be 2-8 alphanumeric characters. Please try again:')
        return
      }
      data.tokenSymbol = symbol
      data.step = 'description'
      await ctx.reply(`Symbol: *${symbol}*\n\n📝 *DESCRIPTION?*\n(This appears on Bags.fm and explorers)`, { parse_mode: 'Markdown' })
      break

    case 'description':
      if (text.length < 10 || text.length > 500) {
        await ctx.reply('Description must be 10-500 characters. Please try again:')
        return
      }
      data.tokenDescription = text
      data.step = 'image'
      await ctx.reply(`Perfect!\n\n🖼️ *TOKEN IMAGE*\n\nYou can either:\n• 📤 *Upload a photo* directly in this chat\n• 🔗 *Send a URL* (direct link to PNG/JPG)\n• Type "skip" to use a default image\n\n_Recommended: 400x400 square image_`, { parse_mode: 'Markdown' })
      break

    case 'image':
      if (text.toLowerCase() !== 'skip') {
        // Basic URL validation
        if (!text.startsWith('http://') && !text.startsWith('https://')) {
          await ctx.reply('Please provide a valid URL starting with http:// or https://, upload a photo, or type "skip":')
          return
        }
        data.tokenImageUrl = text
      }
      data.step = 'socials'

      // Ask for social links (optional)
      await ctx.replyWithMarkdown(
        `🔗 *SOCIAL LINKS* _(optional)_\n\n` +
        `Add your token's social links to increase visibility.\n\n` +
        `Send links in this format (one per line):\n` +
        `\`twitter: https://twitter.com/yourtoken\`\n` +
        `\`telegram: https://t.me/yourgroup\`\n` +
        `\`website: https://yourtoken.com\`\n` +
        `\`discord: https://discord.gg/invite\`\n\n` +
        `Or type *"skip"* to continue without social links.`
      )
      break

    case 'socials':
      if (text.toLowerCase() !== 'skip') {
        // Parse social links from the message
        const lines = text.split('\n')
        for (const line of lines) {
          const trimmedLine = line.trim().toLowerCase()
          if (trimmedLine.startsWith('twitter:')) {
            data.twitterUrl = line.substring(line.indexOf(':') + 1).trim()
          } else if (trimmedLine.startsWith('telegram:')) {
            data.telegramUrl = line.substring(line.indexOf(':') + 1).trim()
          } else if (trimmedLine.startsWith('website:')) {
            data.websiteUrl = line.substring(line.indexOf(':') + 1).trim()
          } else if (trimmedLine.startsWith('discord:')) {
            data.discordUrl = line.substring(line.indexOf(':') + 1).trim()
          } else if (line.trim().startsWith('http')) {
            // If it's just a URL without prefix, try to detect the type
            const url = line.trim()
            if (url.includes('twitter.com') || url.includes('x.com')) {
              data.twitterUrl = url
            } else if (url.includes('t.me') || url.includes('telegram')) {
              data.telegramUrl = url
            } else if (url.includes('discord')) {
              data.discordUrl = url
            } else {
              data.websiteUrl = url
            }
          }
        }

        // Show what was detected
        const detected = []
        if (data.twitterUrl) detected.push(`Twitter: ✅`)
        if (data.telegramUrl) detected.push(`Telegram: ✅`)
        if (data.websiteUrl) detected.push(`Website: ✅`)
        if (data.discordUrl) detected.push(`Discord: ✅`)

        if (detected.length > 0) {
          await ctx.reply(`📝 Social links detected:\n${detected.join('\n')}`)
        }
      }
      data.step = 'confirm'

      // Generate wallets and show confirmation
      await ctx.reply('🔐 *Generating Secure Wallets...*', { parse_mode: 'Markdown' })
      await finalizeLaunchWizard(ctx)
      break
  }
}

async function handleRegisterWizard(ctx: BotContext, text: string) {
  const data = ctx.session.registerData
  if (!data) return
  const { isValidSolanaAddress, validatePrivateKey } = await import('../services/wallet-generator')

  switch (data.step) {
    case 'mint':
      if (!isValidSolanaAddress(text)) {
        await ctx.reply('Invalid Solana address. Please enter a valid token mint address:')
        return
      }
      data.tokenMint = text

      // Check if token is already registered for this user or suspended
      try {
        const db = requireSupabase()
        const telegramId = ctx.from?.id
        const { getSuspendedTokenByMint } = await import('../services/user-token.service')

        // First check if token is suspended (can be reactivated)
        const suspendedToken = await getSuspendedTokenByMint(text)
        if (suspendedToken) {
          // Token exists but is suspended - offer reactivation
          data.isReactivation = true
          data.suspendedTokenId = suspendedToken.id
          data.suspendedTokenSymbol = suspendedToken.token_symbol
          data.suspendedDevWallet = suspendedToken.dev_wallet_address
          data.suspendedOpsWallet = suspendedToken.ops_wallet_address
          data.tokenSymbol = suspendedToken.token_symbol
          data.tokenName = suspendedToken.token_name || undefined

          await ctx.replyWithMarkdown(
            `🔒 *Suspended Token Found*\n\n` +
            `*${suspendedToken.token_name || suspendedToken.token_symbol}* (${suspendedToken.token_symbol})\n\n` +
            `This token was previously registered but is now suspended.\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `💼 *Registered Wallets*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Dev: \`${suspendedToken.dev_wallet_address.slice(0, 8)}...${suspendedToken.dev_wallet_address.slice(-6)}\`\n` +
            `Ops: \`${suspendedToken.ops_wallet_address.slice(0, 8)}...${suspendedToken.ops_wallet_address.slice(-6)}\`\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🔐 *Ownership Verification Required*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `To reactivate this token, you must provide the private keys for *BOTH* wallets to prove you are the rightful owner.\n\n` +
            `⚠️ _This is a security measure to prevent unauthorized access._`,
            reactivateTokenKeyboard
          )
          return
        }

        // Get telegram user
        const { data: telegramUser } = await db
          .from('telegram_users')
          .select('id')
          .eq('telegram_id', telegramId)
          .single()

        if (telegramUser) {
          // Check if this token is already registered (active)
          const { data: existingToken } = await db
            .from('user_tokens')
            .select('id, token_symbol, token_name, is_active')
            .eq('telegram_user_id', telegramUser.id)
            .eq('token_mint_address', text)
            .eq('is_active', true)
            .single()

          if (existingToken) {
            await ctx.replyWithMarkdown(`⚠️ *Token Already Registered!*

This token (${existingToken.token_symbol || existingToken.token_name || 'Unknown'}) is already registered to your account.

Use \`/status ${existingToken.token_symbol || 'TOKEN'}\` to check its status.
Use \`/settings ${existingToken.token_symbol || 'TOKEN'}\` to adjust config.

To register a different token, run /register again.`)
            ctx.session.registerData = undefined
            return
          }
        }

        // Also check if token is registered globally (active)
        const { data: globalToken } = await db
          .from('user_tokens')
          .select('id, token_symbol, is_active')
          .eq('token_mint_address', text)
          .eq('is_active', true)
          .single()

        if (globalToken) {
          await ctx.replyWithMarkdown(`⚠️ *Token Already Registered!*

This token (${globalToken.token_symbol || 'Unknown'}) is already registered by another user.

Each token can only have one flywheel operator.`)
          ctx.session.registerData = undefined
          return
        }
      } catch (error) {
        // Continue if check fails (table might not exist yet)
        loggers.telegram.warn({ error: String(error), tokenMint: text }, 'Could not check for existing token')
      }

      // Fetch token data from DexScreener and Bags.fm
      await ctx.reply('🔍 Fetching token data...')

      try {
        const { bagsFmService } = await import('../services/bags-fm')
        const tokenInfo = await bagsFmService.getTokenCreatorInfo(text)

        if (tokenInfo && (tokenInfo.tokenSymbol || tokenInfo.tokenName)) {
          data.tokenSymbol = tokenInfo.tokenSymbol || ''
          data.tokenName = tokenInfo.tokenName || ''
          data.tokenImage = tokenInfo.tokenImage || ''
          data.isGraduated = tokenInfo.isGraduated
          data.creatorWallet = tokenInfo.creatorWallet || '' // Store for verification

          const statusBadge = tokenInfo.isGraduated ? '🟢 GRADUATED' : '🟡 BONDING'
          const marketCapStr = tokenInfo.marketCap > 0 ? `$${tokenInfo.marketCap.toLocaleString()}` : 'N/A'
          const creatorInfo = tokenInfo.creatorWallet
            ? `\`${tokenInfo.creatorWallet.slice(0, 8)}...${tokenInfo.creatorWallet.slice(-6)}\``
            : '_Unknown_'

          const tokenFoundMessage = `✅ *Token Found*

*${tokenInfo.tokenName || 'Unknown'}* (${tokenInfo.tokenSymbol || '???'})

├ Status: ${statusBadge}
├ MCap: ${marketCapStr}
├ Holders: ${tokenInfo.holders > 0 ? tokenInfo.holders.toLocaleString() : 'N/A'}
└ Creator: ${creatorInfo}

Mint: \`${text.slice(0, 8)}...${text.slice(-6)}\`
${tokenInfo.creatorWallet ? `
⚠️ _Dev wallet must match creator_` : ''}
─────────────────────────

Is this correct?`
          await ctx.replyWithMarkdown(tokenFoundMessage, confirmTokenKeyboard)

          data.step = 'confirm_token'
          return
        }
      } catch (error) {
        loggers.telegram.warn({ error: String(error), tokenMint: data.tokenMint }, 'Could not fetch token info')
      }

      // Token not found on Bags.fm - reject registration
      await ctx.replyWithMarkdown(`❌ *Token Not Found on Bags.fm*

The token address you provided could not be found on Bags.fm.

*Possible reasons:*
• Token doesn't exist or hasn't launched yet
• Token is on a different platform (only Bags.fm tokens supported)
• Network error - try again later

Please verify the token mint address and try again with /register.

_Only tokens launched on Bags.fm can use the flywheel._`)
      ctx.session.registerData = undefined
      break

    case 'confirm_token':
      const response = text.toLowerCase()
      if (response === 'yes' || response === 'y') {
        // Token confirmed, proceed to dev key
        data.step = 'dev_key'
        await ctx.replyWithMarkdown(`🔐 *Dev Wallet Private Key*

Needed to claim Bags.fm fees

🔒 *Security*
├ AES-256-GCM encrypted
├ Only system can decrypt
└ Used for fee claiming only

⚠️ *DELETE your message after!*

─────────────────────────

📝 *PRIVATE KEY* (base58):`)
        return
      } else if (response === 'no' || response === 'n') {
        // Wrong token, start over
        data.step = 'mint'
        await ctx.reply('Please enter the correct token mint address:')
        return
      } else {
        await ctx.reply('Please reply "yes" to continue or "no" to enter a different mint.')
        return
      }

    case 'symbol':
      const symbol = text.toUpperCase()
      if (symbol.length < 2 || symbol.length > 8) {
        await ctx.reply('Symbol must be 2-8 characters. Please try again:')
        return
      }
      data.tokenSymbol = symbol
      data.step = 'dev_key'
      await ctx.replyWithMarkdown(`🔐 *Dev Wallet Private Key*

Needed to claim Bags.fm fees

🔒 *Security*
├ AES-256-GCM encrypted
├ Only system can decrypt
└ Used for fee claiming only

⚠️ *DELETE your message after!*

─────────────────────────

📝 *PRIVATE KEY* (base58):
`)
      break

    case 'dev_key':
      const devAddress = validatePrivateKey(text)
      if (!devAddress) {
        await ctx.reply('Invalid private key format. Must be a base58 encoded Solana keypair. Please try again:')
        return
      }

      // Try to delete the message with private key immediately
      try {
        await ctx.deleteMessage()
      } catch (deleteError) {
        // Warn user if deletion fails - their private key may still be visible
        try {
          await ctx.reply(
            '⚠️ *Security Warning*: I could not delete your private key message. Please manually delete it from this chat for security.',
            { parse_mode: 'Markdown' }
          )
        } catch (warnError) {
          loggers.telegram.error({ deleteError: String(deleteError), warnError: String(warnError) }, 'Failed to delete private key message and warn user')
        }
      }

      // SECURITY: Verify wallet ownership against token creator
      // The dev wallet should match the token creator from Bags.fm
      if (data.creatorWallet && data.creatorWallet.length > 0) {
        if (devAddress !== data.creatorWallet) {
          await ctx.replyWithMarkdown(`
⛔ *Wallet Verification Failed*
━━━━━━━━━━━━━━━━━━━━━━━━━━

The wallet you provided does not match the token creator.

*Your wallet:* \`${devAddress.slice(0, 8)}...${devAddress.slice(-6)}\`
*Token creator:* \`${data.creatorWallet.slice(0, 8)}...${data.creatorWallet.slice(-6)}\`

You can only register tokens where you are the creator (fee recipient).

━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
          ctx.session.registerData = undefined
          return
        }
      }

      data.devWalletPrivateKey = text
      data.devWalletAddress = devAddress

      await ctx.replyWithMarkdown(`
✅ *Dev wallet verified & encrypted!*
Address: \`${devAddress.slice(0, 8)}...\`

⚠️ *DELETE your previous message NOW!*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Now enter your *OPS WALLET PRIVATE KEY* (base58):
(This wallet executes buy/sell trades)
`)
      data.step = 'ops_key'
      break

    case 'ops_key':
      const opsAddress = validatePrivateKey(text)
      if (!opsAddress) {
        await ctx.reply('Invalid private key format. Please try again:')
        return
      }
      data.opsWalletPrivateKey = text
      data.opsWalletAddress = opsAddress

      // Try to delete the message with private key
      try {
        await ctx.deleteMessage()
      } catch (deleteError) {
        // Warn user if deletion fails - their private key may still be visible
        try {
          await ctx.reply(
            '⚠️ *Security Warning*: I could not delete your private key message. Please manually delete it from this chat for security.',
            { parse_mode: 'Markdown' }
          )
        } catch (warnError) {
          loggers.telegram.error({ deleteError: String(deleteError), warnError: String(warnError) }, 'Failed to delete private key message and warn user')
        }
      }

      await ctx.replyWithMarkdown(`
✅ *Ops wallet encrypted!*
Address: \`${opsAddress.slice(0, 8)}...\`

⚠️ *DELETE your previous message NOW!*
`)

      // Show confirmation
      data.step = 'confirm'
      const confirmMsg = `📋 *Review & Confirm*

*Token:* ${data.tokenSymbol}
*Mint:* \`${data.tokenMint?.slice(0, 8)}...${data.tokenMint?.slice(-6)}\`

💼 *Wallets*
├ Dev: \`${data.devWalletAddress?.slice(0, 8)}...\`
└ Ops: \`${data.opsWalletAddress?.slice(0, 8)}...\`

⚙️ *Defaults*
├ Flywheel: OFF
├ Mode: Simple
├ Buy: 0.01-0.05 SOL
└ Slippage: 3%

─────────────────────────

Reply *"confirm"* or /cancel`
      await ctx.replyWithMarkdown(confirmMsg)
      break

    // ═══════════════════════════════════════════════════════════════════════════
    // REACTIVATION FLOW - For suspended tokens
    // ═══════════════════════════════════════════════════════════════════════════

    case 'reactivate_dev_key':
      // Validate dev private key for reactivation
      const reactivateDevAddress = validatePrivateKey(text)
      if (!reactivateDevAddress) {
        await ctx.reply('Invalid private key format. Must be a base58 encoded Solana keypair. Please try again:')
        return
      }

      // Try to delete the message with private key immediately
      try {
        await ctx.deleteMessage()
      } catch (deleteError) {
        // Warn user if deletion fails - their private key may still be visible
        try {
          await ctx.reply(
            '⚠️ *Security Warning*: I could not delete your private key message. Please manually delete it from this chat for security.',
            { parse_mode: 'Markdown' }
          )
        } catch (warnError) {
          loggers.telegram.error({ deleteError: String(deleteError), warnError: String(warnError) }, 'Failed to delete private key message and warn user')
        }
      }

      // Verify the key matches the expected dev wallet
      if (reactivateDevAddress !== data.suspendedDevWallet) {
        await ctx.replyWithMarkdown(
          `⛔ *Dev Wallet Verification Failed*\n\n` +
          `The private key you provided does not match the registered dev wallet.\n\n` +
          `*Your key derives to:*\n\`${reactivateDevAddress.slice(0, 8)}...${reactivateDevAddress.slice(-6)}\`\n\n` +
          `*Expected address:*\n\`${data.suspendedDevWallet?.slice(0, 8)}...${data.suspendedDevWallet?.slice(-6)}\`\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Please provide the correct dev wallet private key:`,
        )
        return
      }

      // Dev key verified, store it and ask for ops key
      data.devWalletPrivateKey = text
      data.devWalletAddress = reactivateDevAddress
      data.step = 'reactivate_ops_key'

      await ctx.replyWithMarkdown(
        `✅ *Dev Wallet Verified!*\n` +
        `Address: \`${reactivateDevAddress.slice(0, 8)}...\`\n\n` +
        `⚠️ *DELETE your previous message NOW!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ *OPS WALLET VERIFICATION*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Expected address:\n\`${data.suspendedOpsWallet?.slice(0, 8)}...${data.suspendedOpsWallet?.slice(-6)}\`\n\n` +
        `📝 *Send your OPS WALLET PRIVATE KEY* (base58):`
      )
      break

    case 'reactivate_ops_key':
      // Validate ops private key for reactivation
      const reactivateOpsAddress = validatePrivateKey(text)
      if (!reactivateOpsAddress) {
        await ctx.reply('Invalid private key format. Please try again:')
        return
      }

      // Try to delete the message with private key
      try {
        await ctx.deleteMessage()
      } catch (deleteError) {
        // Warn user if deletion fails - their private key may still be visible
        try {
          await ctx.reply(
            '⚠️ *Security Warning*: I could not delete your private key message. Please manually delete it from this chat for security.',
            { parse_mode: 'Markdown' }
          )
        } catch (warnError) {
          loggers.telegram.error({ deleteError: String(deleteError), warnError: String(warnError) }, 'Failed to delete private key message and warn user')
        }
      }

      // Verify the key matches the expected ops wallet
      if (reactivateOpsAddress !== data.suspendedOpsWallet) {
        await ctx.replyWithMarkdown(
          `⛔ *Ops Wallet Verification Failed*\n\n` +
          `The private key you provided does not match the registered ops wallet.\n\n` +
          `*Your key derives to:*\n\`${reactivateOpsAddress.slice(0, 8)}...${reactivateOpsAddress.slice(-6)}\`\n\n` +
          `*Expected address:*\n\`${data.suspendedOpsWallet?.slice(0, 8)}...${data.suspendedOpsWallet?.slice(-6)}\`\n\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Please provide the correct ops wallet private key:`,
        )
        return
      }

      // Both keys verified! Proceed to reactivate
      data.opsWalletPrivateKey = text
      data.opsWalletAddress = reactivateOpsAddress

      await ctx.replyWithMarkdown(
        `✅ *Ops Wallet Verified!*\n` +
        `Address: \`${reactivateOpsAddress.slice(0, 8)}...\`\n\n` +
        `⚠️ *DELETE your previous message NOW!*\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `🔓 *Ownership Verified!*\n\n` +
        `Both wallet keys have been verified. Reactivating your token...`
      )

      // Perform the reactivation
      try {
        const { reactivateSuspendedToken } = await import('../services/user-token.service')
        const db = requireSupabase()
        const telegramId = ctx.from?.id

        // Get or create telegram user
        let { data: telegramUser } = await db
          .from('telegram_users')
          .select('id')
          .eq('telegram_id', telegramId)
          .single()

        if (!telegramUser) {
          const { data: newUser } = await db
            .from('telegram_users')
            .insert({
              telegram_id: telegramId,
              telegram_username: ctx.from?.username,
            })
            .select('id')
            .single()
          telegramUser = newUser
        }

        // Reactivate the token
        if (!data.suspendedTokenId || !data.devWalletPrivateKey || !data.opsWalletPrivateKey) {
          await ctx.reply('❌ Missing required data. Please try again with /register')
          ctx.session.registerData = undefined
          return
        }
        const reactivatedToken = await reactivateSuspendedToken(
          data.suspendedTokenId,
          data.devWalletPrivateKey,
          data.opsWalletPrivateKey,
          telegramUser?.id
        )

        if (!reactivatedToken) {
          await ctx.reply('❌ Failed to reactivate token. Please try again or contact support.')
          ctx.session.registerData = undefined
          return
        }

        // Log audit event
        await db.from('audit_log').insert({
          event_type: 'token_reactivated',
          user_token_id: reactivatedToken.id,
          telegram_id: telegramId,
          details: {
            token_symbol: reactivatedToken.token_symbol,
            reactivated_by: 'telegram_ownership_verification',
          },
        })

        const successMsg = `🎉 *${reactivatedToken.token_name || reactivatedToken.token_symbol}* Reactivated!

✅ Ownership verified
✅ Keys re-encrypted
✅ Token active

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Status:*
├ Flywheel: OFF (enable below)
├ Auto-claim: ON
└ Mode: Simple

─────────────────────────

*Next Steps:*
1. Fund ops wallet if needed
2. Enable flywheel below`

        const successKeyboard = Markup.inlineKeyboard([
          [Markup.button.callback(`🟢 Enable Flywheel`, `toggle_${reactivatedToken.token_symbol}`)],
          [
            Markup.button.callback(`📊 View Status`, `status_${reactivatedToken.token_symbol}`),
            Markup.button.callback('📊 My Tokens', 'action_mytokens'),
          ],
          [Markup.button.url('🌐 Dashboard', 'https://claudewheel.com/dashboard')],
        ])

        await ctx.replyWithMarkdown(successMsg, successKeyboard)
        ctx.session.registerData = undefined
      } catch (error) {
        loggers.telegram.error({ error: String(error), tokenId: data.suspendedTokenId, userId: ctx.from?.id }, 'Error reactivating token')
        await ctx.reply('❌ Error reactivating token. Please try again with /register')
        ctx.session.registerData = undefined
      }
      break

    case 'confirm':
      if (text.toLowerCase() !== 'confirm') {
        await ctx.reply('Please reply "confirm" to proceed or /cancel to abort.')
        return
      }

      try {
        const { encrypt } = await import('../services/encryption.service')
        const db = requireSupabase()
        const telegramId = ctx.from?.id

        // Get or create telegram user
        let { data: telegramUser } = await db
          .from('telegram_users')
          .select('id')
          .eq('telegram_id', telegramId)
          .single()

        if (!telegramUser) {
          const { data: newUser } = await db
            .from('telegram_users')
            .insert({
              telegram_id: telegramId,
              telegram_username: ctx.from?.username,
            })
            .select('id')
            .single()
          telegramUser = newUser
        }

        // Get or create main user
        let { data: mainUser } = await db
          .from('users')
          .select('id')
          .eq('wallet_address', data.devWalletAddress)
          .single()

        if (!mainUser) {
          const { data: newMainUser } = await db
            .from('users')
            .insert({ wallet_address: data.devWalletAddress })
            .select('id')
            .single()
          mainUser = newMainUser
        }

        // Validate required fields before encryption - check for null, undefined, and empty/whitespace strings
        const devPrivateKey = data.devWalletPrivateKey?.trim()
        const opsPrivateKey = data.opsWalletPrivateKey?.trim()
        const tokenMint = data.tokenMint?.trim()
        const tokenSymbol = data.tokenSymbol?.trim()
        const devWalletAddress = data.devWalletAddress?.trim()
        const opsWalletAddress = data.opsWalletAddress?.trim()

        if (!devPrivateKey || !opsPrivateKey || !tokenMint || !tokenSymbol || !devWalletAddress || !opsWalletAddress) {
          await ctx.reply('❌ Missing required fields. Please try again with /register')
          ctx.session.registerData = undefined
          return
        }

        // Encrypt keys
        const devEncrypted = encrypt(devPrivateKey)
        const opsEncrypted = encrypt(opsPrivateKey)

        // Create user token
        const { data: userToken, error: tokenError } = await db
          .from('user_tokens')
          .insert({
            user_id: mainUser?.id,
            telegram_user_id: telegramUser?.id,
            token_mint_address: tokenMint,
            token_symbol: tokenSymbol,
            token_name: data.tokenName || null,
            token_image: data.tokenImage || null,
            dev_wallet_address: devWalletAddress,
            dev_wallet_private_key_encrypted: devEncrypted.ciphertext,
            dev_encryption_iv: devEncrypted.iv,
            dev_encryption_auth_tag: devEncrypted.authTag,
            ops_wallet_address: opsWalletAddress,
            ops_wallet_private_key_encrypted: opsEncrypted.ciphertext,
            ops_encryption_iv: opsEncrypted.iv,
            ops_encryption_auth_tag: opsEncrypted.authTag,
            launched_via_telegram: false,
            is_graduated: data.isGraduated || false,
          })
          .select('id')
          .single()

        if (tokenError) {
          loggers.telegram.error({ error: String(tokenError), tokenMint, userId: ctx.from?.id }, 'Error creating token')
          await ctx.reply('Error registering token. It may already be registered.')
          ctx.session.registerData = undefined
          return
        }

        // Clear private keys from session after successful token creation
        data.devWalletPrivateKey = undefined
        data.opsWalletPrivateKey = undefined

        // Create default config
        await db.from('user_token_config').insert({
          user_token_id: userToken?.id,
          flywheel_active: false,
          algorithm_mode: 'simple',
          min_buy_amount_sol: 0.01,
          max_buy_amount_sol: 0.05,
          slippage_bps: 300,
        })

        // Create initial state
        await db.from('user_flywheel_state').insert({
          user_token_id: userToken?.id,
          cycle_phase: 'buy',
          buy_count: 0,
          sell_count: 0,
        })

        // Log audit event
        await db.from('audit_log').insert({
          event_type: 'token_registered',
          user_token_id: userToken?.id,
          telegram_id: telegramId,
          details: { token_symbol: tokenSymbol },
        })

        const tokenDisplay = data.tokenName ? `${data.tokenName}` : tokenSymbol
        const graduatedStatus = data.isGraduated ? '✨ Graduated' : '📈 Bonding'

        const successMsg = `🎉 *${tokenDisplay}* registered!

${graduatedStatus} • \`${tokenSymbol}\`

─────────────────────────

*Next:*
1. Fund ops wallet with SOL
2. Enable flywheel below
3. Auto-trading begins!`
        const successKeyboard = Markup.inlineKeyboard([
          [Markup.button.callback(`🟢 Enable Flywheel`, `toggle_${data.tokenSymbol}`)],
          [
            Markup.button.callback(`📊 View Status`, `status_${data.tokenSymbol}`),
            Markup.button.callback('📊 My Tokens', 'action_mytokens'),
          ],
          [Markup.button.url('🌐 Dashboard', 'https://claudewheel.com/dashboard')],
        ])

        await ctx.replyWithMarkdown(successMsg, successKeyboard)
        ctx.session.registerData = undefined
      } catch (error) {
        loggers.telegram.error({ error: String(error), tokenMint: data.tokenMint, userId: ctx.from?.id }, 'Error registering token')
        await ctx.reply('Error registering token. Please try again with /register')
        ctx.session.registerData = undefined
      }
      break
  }
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
    loggers.telegram.warn('⚠️ Telegram bot not configured (set TELEGRAM_BOT_TOKEN)')
    return
  }

  try {
    // Get bot info to verify connection
    const botInfo = await botInstance.telegram.getMe()
    loggers.telegram.info({ username: botInfo.username, botId: botInfo.id }, '🤖 Bot connected')

    // Use webhook in production, polling in development
    if (env.isProd && env.telegramWebhookUrl) {
      try {
        await botInstance.telegram.setWebhook(env.telegramWebhookUrl)
        loggers.telegram.info({ webhookUrl: env.telegramWebhookUrl }, '✅ Telegram bot webhook set')
      } catch (webhookError) {
        loggers.telegram.warn({
          webhookUrl: env.telegramWebhookUrl,
          error: webhookError instanceof Error ? webhookError.message : String(webhookError)
        }, '⚠️ Webhook setup failed, falling back to polling mode. Tip: Update TELEGRAM_WEBHOOK_URL to your actual backend URL')
        // Delete any existing webhook before falling back to polling
        try {
          await botInstance.telegram.deleteWebhook()
          loggers.telegram.info('🗑️ Deleted existing webhook to enable polling')
        } catch (deleteError) {
          loggers.telegram.warn({ error: String(deleteError) }, 'Could not delete webhook')
        }
        // Fall back to polling
        await botInstance.launch()
        loggers.telegram.info('✅ Telegram bot started (polling mode - fallback)')
      }
    } else {
      // Use polling for development
      await botInstance.launch()
      loggers.telegram.info('✅ Telegram bot started (polling mode)')
    }

    loggers.telegram.info({ commands: ['/start', '/help', '/launch', '/register', '/mytokens', '/status', '/toggle', '/cancel', '/alerts', '/botstatus'] }, '📝 Registered commands')
  } catch (error) {
    loggers.telegram.error({ error: String(error) }, 'Failed to start Telegram bot')
  }
}

/**
 * Stop the Telegram bot
 */
export function stopTelegramBot(): void {
  if (bot) {
    bot.stop('SIGTERM')
    loggers.telegram.info('Telegram bot stopped')
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
