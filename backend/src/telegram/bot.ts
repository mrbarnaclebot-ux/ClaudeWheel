// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM BOT
// Claude Wheel Telegram Bot for token launch and management
// ═══════════════════════════════════════════════════════════════════════════

import { Telegraf, Context, Scenes, session, Markup } from 'telegraf'
import { env } from '../config/env'
import { supabase } from '../config/database'

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
function setupBot(bot: Telegraf<BotContext>) {
  // Session middleware
  bot.use(session())

  // Error handling
  bot.catch((err, ctx) => {
    console.error('Telegram bot error:', err)
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

  bot.action('action_cancel', async (ctx) => {
    await ctx.answerCbQuery('Cancelled')
    ctx.session = ctx.session || {}
    ctx.session.launchData = undefined
    ctx.session.registerData = undefined
    await ctx.editMessageText('❌ Operation cancelled.\n\nUse /start to begin again.')
  })

  bot.action('confirm_token_yes', async (ctx) => {
    await ctx.answerCbQuery()
    const data = ctx.session?.registerData as any
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
    const data = ctx.session?.registerData as any
    if (data) {
      data.step = 'mint'
      await ctx.editMessageText(
        '🔄 *Let\'s try again*\n\nPlease send the correct token mint address:',
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

  // /launch - Start token launch wizard
  bot.command('launch', async (ctx) => {
    console.log(`📱 /launch command received from user ${ctx.from?.id}`)
    try {
      await startLaunchWizard(ctx)
    } catch (error) {
      console.error('Error in /launch command:', error)
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
      console.error('Error fetching token status:', error)
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
      console.error('Error toggling flywheel:', error)
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
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function sendWelcomeMessage(ctx: BotContext) {
  const welcomeMessage = `
🔷 *Claude Wheel Bot*
━━━━━━━━━━━━━━━━━━━━━━━━━━

Automated market-making for Bags.fm tokens

*What I can do:*

🚀 *Launch* — Create a new token
   • Auto-generated wallets
   • Flywheel starts immediately

📝 *Register* — Connect existing token
   • Enable automated trading
   • Claim fees automatically

━━━━━━━━━━━━━━━━━━━━━━━━━━

Select an option below to get started:
`
  await ctx.replyWithMarkdown(welcomeMessage, mainMenuKeyboard)
}

async function sendHelpMessage(ctx: BotContext) {
  const helpMessage = `
📚 *Command Reference*
━━━━━━━━━━━━━━━━━━━━━━━━━━

*Getting Started*
├ /launch — Launch new token
├ /register — Register existing token
└ /cancel — Cancel current operation

*Token Management*
├ /mytokens — List your tokens
├ /status \`symbol\` — Check status
├ /settings \`symbol\` — Configure
└ /toggle \`symbol\` — Enable/disable

*Algorithm Modes*
├ \`simple\` — 5 buys → 5 sells
├ \`smart\` — RSI + Bollinger
└ \`rebalance\` — Target allocation

━━━━━━━━━━━━━━━━━━━━━━━━━━

📖 [Documentation](https://claudewheel.com/docs)
🌐 [Dashboard](https://claudewheel.com/dashboard)
`
  await ctx.replyWithMarkdown(helpMessage, helpKeyboard)
}

async function startLaunchWizard(ctx: BotContext) {
  console.log(`🚀 startLaunchWizard called for chat ${ctx.chat?.id}, type: ${ctx.chat?.type}`)

  // Check if in private chat
  if (ctx.chat?.type !== 'private') {
    console.log(`⚠️ Launch rejected - not private chat`)
    await ctx.reply('⚠️ For security, please use /launch in a private chat with me.')
    return
  }

  // Initialize session data
  ctx.session = ctx.session || {}
  ctx.session.launchData = { step: 'name' } as any
  console.log(`📝 Session initialized with launchData:`, ctx.session.launchData)

  const launchIntro = `
🚀 *Launch New Token*
━━━━━━━━━━━━━━━━━━━━━━━━━━

*How it works:*

1️⃣ Provide token details
2️⃣ We generate secure wallets
3️⃣ You send SOL to fund
4️⃣ Token mints automatically
5️⃣ Flywheel starts immediately

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 *What's your TOKEN NAME?*
_Example: "Claude Wheel", "My Token"_
`
  console.log(`📤 Sending launch intro message...`)
  await ctx.replyWithMarkdown(launchIntro, cancelKeyboard)
  console.log(`✅ Launch intro sent successfully`)
}

async function startRegisterWizard(ctx: BotContext) {
  // Check if in private chat
  if (ctx.chat?.type !== 'private') {
    await ctx.reply('⚠️ For security, please use /register in a private chat with me.')
    return
  }

  // Initialize session data
  ctx.session = ctx.session || {}
  ctx.session.registerData = { step: 'mint' } as any

  const registerIntro = `
📝 *Register Existing Token*
━━━━━━━━━━━━━━━━━━━━━━━━━━

For tokens already on Bags.fm.

⚠️ *Security Notice:*
• Keys encrypted with AES-256-GCM
• Only system can decrypt
• Delete messages with keys!

━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 *Enter TOKEN MINT ADDRESS:*
_The Solana address of your token_
`
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
      const noTokensMessage = `
📊 *My Tokens*
━━━━━━━━━━━━━━━━━━━━━━━━━━

You haven't registered any tokens yet.

Get started by launching a new token or registering an existing one!
`
      const noTokensKeyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('🚀 Launch Token', 'action_launch'),
          Markup.button.callback('📝 Register Token', 'action_register'),
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
      const noTokensMessage = `
📊 *My Tokens*
━━━━━━━━━━━━━━━━━━━━━━━━━━

You haven't registered any tokens yet.

Get started by launching a new token or registering an existing one!
`
      const noTokensKeyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('🚀 Launch Token', 'action_launch'),
          Markup.button.callback('📝 Register Token', 'action_register'),
        ],
      ])
      await ctx.replyWithMarkdown(noTokensMessage, noTokensKeyboard)
      return
    }

    let message = `📊 *My Tokens*\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`

    const buttons: any[][] = []

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
    console.error('Error fetching tokens:', error)
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

    const statusMessage = `
📊 *${token.token_name || token.token_symbol}*
━━━━━━━━━━━━━━━━━━━━━━━━━━

*Status*
┌ Flywheel: ${statusEmoji} ${statusText}
├ Market: ${graduatedBadge}
├ Mode: ${config?.algorithm_mode || 'simple'}
└ Phase: ${phase} (${phase === 'buy' ? buyCount : sellCount}/5)

*Configuration*
┌ Buy: ${config?.min_buy_amount_sol || 0.01} - ${config?.max_buy_amount_sol || 0.05} SOL
└ Slippage: ${((config?.slippage_bps || 300) / 100).toFixed(1)}%

*Wallets*
┌ Dev: \`${token.dev_wallet_address.slice(0, 8)}...\`
└ Ops: \`${token.ops_wallet_address.slice(0, 8)}...\`

━━━━━━━━━━━━━━━━━━━━━━━━━━
`

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
    console.error('Error fetching token status:', error)
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

    const toggleMessage = `
${emoji} *Flywheel ${stateText}*
━━━━━━━━━━━━━━━━━━━━━━━━━━

*${token.token_symbol}* flywheel is now ${stateText.toLowerCase()}.

${newState ? '✅ The bot will now automatically execute trades.' : '⏸️ Trading has been paused.'}
`

    const toggleKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback(`📊 View Status`, `status_${symbol}`)],
      [Markup.button.callback('📊 My Tokens', 'action_mytokens')],
    ])

    await ctx.replyWithMarkdown(toggleMessage, toggleKeyboard)
  } catch (error) {
    console.error('Error toggling flywheel:', error)
    await ctx.reply('Error toggling flywheel. Please try again.')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

async function handleLaunchWizard(ctx: BotContext, text: string) {
  const data = ctx.session.launchData as any

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
      await ctx.reply(`Perfect!\n\n🖼️ *IMAGE URL?*\n(Direct link to PNG/JPG, recommended 400x400)\n\nOr type "skip" to use a default image.`, { parse_mode: 'Markdown' })
      break

    case 'image':
      if (text.toLowerCase() !== 'skip') {
        // Basic URL validation
        if (!text.startsWith('http://') && !text.startsWith('https://')) {
          await ctx.reply('Please provide a valid URL starting with http:// or https://, or type "skip":')
          return
        }
        data.tokenImageUrl = text
      }
      data.step = 'confirm'

      // Generate wallets and show confirmation
      await ctx.reply('🔐 *Generating Secure Wallets...*', { parse_mode: 'Markdown' })

      try {
        const { generateEncryptedWalletPair } = await import('../services/wallet-generator')
        const wallets = generateEncryptedWalletPair()
        const db = requireSupabase()

        data.devWalletAddress = wallets.devWallet.address
        data.opsWalletAddress = wallets.opsWallet.address

        // Store pending launch in database
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

        // Create pending launch
        const { data: pendingLaunch, error } = await db
          .from('pending_token_launches')
          .insert({
            telegram_user_id: telegramUser?.id,
            token_name: data.tokenName,
            token_symbol: data.tokenSymbol,
            token_description: data.tokenDescription,
            token_image_url: data.tokenImageUrl,
            dev_wallet_address: wallets.devWallet.address,
            dev_wallet_private_key_encrypted: wallets.devWallet.encryptedPrivateKey,
            dev_encryption_iv: wallets.devWallet.iv,
            dev_encryption_auth_tag: wallets.devWallet.authTag,
            ops_wallet_address: wallets.opsWallet.address,
            ops_wallet_private_key_encrypted: wallets.opsWallet.encryptedPrivateKey,
            ops_encryption_iv: wallets.opsWallet.iv,
            ops_encryption_auth_tag: wallets.opsWallet.authTag,
            status: 'awaiting_deposit',
          })
          .select('id')
          .single()

        if (error) {
          console.error('Error creating pending launch:', error)
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

        const confirmMessage = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*YOUR TOKEN SETUP*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Token:* ${data.tokenName} (${data.tokenSymbol})

*Dev Wallet* (receives fees):
\`${wallets.devWallet.address}\`

*Ops Wallet* (runs flywheel):
\`${wallets.opsWallet.address}\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*FUND TO LAUNCH*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Send *0.5+ SOL* to your DEV WALLET:
\`${wallets.devWallet.address}\`

• 0.1 SOL = Token launch fee
• 0.4+ SOL = Initial liquidity

I'm monitoring for your deposit...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏳ *Waiting for SOL deposit...*

_The launch will expire in 24 hours if no deposit is received._
_Use /cancel to abort this launch._
`
        await ctx.replyWithMarkdown(confirmMessage)

        // Clear launch data from session (deposit monitor will handle the rest)
        ctx.session.launchData = undefined
      } catch (error) {
        console.error('Error generating wallets:', error)
        await ctx.reply('Error generating wallets. Please try again with /launch')
        ctx.session.launchData = undefined
      }
      break
  }
}

async function handleRegisterWizard(ctx: BotContext, text: string) {
  const data = ctx.session.registerData as any
  const { isValidSolanaAddress, validatePrivateKey } = await import('../services/wallet-generator')

  switch (data.step) {
    case 'mint':
      if (!isValidSolanaAddress(text)) {
        await ctx.reply('Invalid Solana address. Please enter a valid token mint address:')
        return
      }
      data.tokenMint = text

      // Check if token is already registered for this user
      try {
        const db = requireSupabase()
        const telegramId = ctx.from?.id

        // Get telegram user
        const { data: telegramUser } = await db
          .from('telegram_users')
          .select('id')
          .eq('telegram_id', telegramId)
          .single()

        if (telegramUser) {
          // Check if this token is already registered
          const { data: existingToken } = await db
            .from('user_tokens')
            .select('id, token_symbol, token_name')
            .eq('telegram_user_id', telegramUser.id)
            .eq('token_mint_address', text)
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

        // Also check if token is registered globally
        const { data: globalToken } = await db
          .from('user_tokens')
          .select('id, token_symbol')
          .eq('token_mint_address', text)
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
        console.warn('Could not check for existing token:', error)
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

          const tokenFoundMessage = `
✅ *Token Found!*
━━━━━━━━━━━━━━━━━━━━━━━━━━

*${tokenInfo.tokenName || 'Unknown'}*
\`${tokenInfo.tokenSymbol || '???'}\`

┌ Status: ${statusBadge}
├ Market Cap: ${marketCapStr}
├ Holders: ${tokenInfo.holders > 0 ? tokenInfo.holders.toLocaleString() : 'N/A'}
└ Creator: ${creatorInfo}

Mint: \`${text.slice(0, 12)}...${text.slice(-8)}\`

━━━━━━━━━━━━━━━━━━━━━━━━━━
${tokenInfo.creatorWallet ? `
⚠️ *Ownership Verification Enabled*
Your dev wallet must match the creator address.
` : ''}
Is this the correct token?
`
          await ctx.replyWithMarkdown(tokenFoundMessage, confirmTokenKeyboard)

          data.step = 'confirm_token'
          return
        }
      } catch (error) {
        console.warn('Could not fetch token info:', error)
      }

      // Could not fetch token data, ask for symbol manually
      data.step = 'symbol'
      await ctx.replyWithMarkdown(`✅ Token mint verified!

⚠️ Could not fetch token data automatically.

📝 *TOKEN SYMBOL?* (e.g., BAGS)`)
      break

    case 'confirm_token':
      const response = text.toLowerCase()
      if (response === 'yes' || response === 'y') {
        // Token confirmed, proceed to dev key
        data.step = 'dev_key'
        await ctx.replyWithMarkdown(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *PRIVATE KEY REQUIRED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The dev wallet receives Bags.fm trading fees.
We need the private key to claim fees.

*Security:*
• Encrypted with AES-256-GCM before storage
• Only automated system can decrypt
• Used solely for fee claiming

⚠️ *DELETE YOUR MESSAGE after I confirm!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 *DEV WALLET PRIVATE KEY* (base58):
`)
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
      await ctx.replyWithMarkdown(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *PRIVATE KEY REQUIRED*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The dev wallet receives Bags.fm trading fees.
We need the private key to claim fees.

*Security:*
• Encrypted with AES-256-GCM before storage
• Only automated system can decrypt
• Used solely for fee claiming

⚠️ *DELETE YOUR MESSAGE after I confirm!*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 *DEV WALLET PRIVATE KEY* (base58):
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
      } catch (e) {
        // Can't delete in some cases
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
      } catch (e) {
        // Can't delete in some cases
      }

      await ctx.replyWithMarkdown(`
✅ *Ops wallet encrypted!*
Address: \`${opsAddress.slice(0, 8)}...\`

⚠️ *DELETE your previous message NOW!*
`)

      // Show confirmation
      data.step = 'confirm'
      const confirmMsg = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*REVIEW & CONFIRM*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Token:* ${data.tokenSymbol}
*Mint:* \`${data.tokenMint.slice(0, 12)}...\`

*Dev Wallet:* \`${data.devWalletAddress.slice(0, 8)}...\`
*Ops Wallet:* \`${data.opsWalletAddress.slice(0, 8)}...\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*Default Settings:*
• Flywheel: OFF
• Algorithm: Simple
• Buy Range: 0.01 - 0.05 SOL
• Slippage: 3%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Reply *"confirm"* to register or /cancel to abort.
`
      await ctx.replyWithMarkdown(confirmMsg)
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

        // Encrypt keys
        const devEncrypted = encrypt(data.devWalletPrivateKey)
        const opsEncrypted = encrypt(data.opsWalletPrivateKey)

        // Create user token
        const { data: userToken, error: tokenError } = await db
          .from('user_tokens')
          .insert({
            user_id: mainUser?.id,
            telegram_user_id: telegramUser?.id,
            token_mint_address: data.tokenMint,
            token_symbol: data.tokenSymbol,
            token_name: data.tokenName || null,
            token_image: data.tokenImage || null,
            dev_wallet_address: data.devWalletAddress,
            dev_wallet_private_key_encrypted: devEncrypted.ciphertext,
            encryption_iv: devEncrypted.iv,
            encryption_auth_tag: devEncrypted.authTag,
            ops_wallet_address: data.opsWalletAddress,
            ops_wallet_private_key_encrypted: opsEncrypted.ciphertext,
            ops_encryption_iv: opsEncrypted.iv,
            ops_encryption_auth_tag: opsEncrypted.authTag,
            launched_via_telegram: false,
            is_graduated: data.isGraduated || false,
          })
          .select('id')
          .single()

        if (tokenError) {
          console.error('Error creating token:', tokenError)
          await ctx.reply('Error registering token. It may already be registered.')
          ctx.session.registerData = undefined
          return
        }

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
          details: { token_symbol: data.tokenSymbol },
        })

        const tokenDisplay = data.tokenName ? `${data.tokenName}` : data.tokenSymbol
        const graduatedStatus = data.isGraduated ? '✨ Graduated' : '📈 Bonding'

        const successMsg = `
🎉 *Registration Complete!*
━━━━━━━━━━━━━━━━━━━━━━━━━━

*${tokenDisplay}*
\`${data.tokenSymbol}\`

Status: ${graduatedStatus}

━━━━━━━━━━━━━━━━━━━━━━━━━━

*Next Steps:*

1️⃣ Fund your ops wallet with SOL
2️⃣ Enable the flywheel below
3️⃣ Watch your token trade automatically!

━━━━━━━━━━━━━━━━━━━━━━━━━━
`
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
        console.error('Error registering token:', error)
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
    console.log('⚠️ Telegram bot not configured (set TELEGRAM_BOT_TOKEN)')
    return
  }

  try {
    // Get bot info to verify connection
    const botInfo = await botInstance.telegram.getMe()
    console.log(`🤖 Bot connected: @${botInfo.username} (ID: ${botInfo.id})`)

    // Use webhook in production, polling in development
    if (env.isProd && env.telegramWebhookUrl) {
      try {
        await botInstance.telegram.setWebhook(env.telegramWebhookUrl)
        console.log(`✅ Telegram bot webhook set: ${env.telegramWebhookUrl}`)
      } catch (webhookError) {
        console.warn(`⚠️ Webhook setup failed, falling back to polling mode`)
        console.warn(`   Webhook URL: ${env.telegramWebhookUrl}`)
        console.warn(`   Error: ${webhookError instanceof Error ? webhookError.message : webhookError}`)
        console.warn(`   Tip: Update TELEGRAM_WEBHOOK_URL to your actual backend URL (e.g., https://your-backend.onrender.com/telegram/webhook)`)
        // Delete any existing webhook before falling back to polling
        try {
          await botInstance.telegram.deleteWebhook()
          console.log('🗑️ Deleted existing webhook to enable polling')
        } catch (deleteError) {
          console.warn('Could not delete webhook:', deleteError)
        }
        // Fall back to polling
        await botInstance.launch()
        console.log('✅ Telegram bot started (polling mode - fallback)')
      }
    } else {
      // Use polling for development
      await botInstance.launch()
      console.log('✅ Telegram bot started (polling mode)')
    }

    console.log('📝 Registered commands: /start, /help, /launch, /register, /mytokens, /status, /toggle, /cancel')
  } catch (error) {
    console.error('Failed to start Telegram bot:', error)
  }
}

/**
 * Stop the Telegram bot
 */
export function stopTelegramBot(): void {
  if (bot) {
    bot.stop('SIGTERM')
    console.log('Telegram bot stopped')
  }
}

/**
 * Get Express middleware for webhook
 */
export function getTelegramWebhookMiddleware() {
  const botInstance = getBot()
  if (!botInstance) return null
  return botInstance.webhookCallback('/telegram/webhook')
}
