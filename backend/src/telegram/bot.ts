// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM BOT
// Claude Wheel Telegram Bot for token launch and management
// ═══════════════════════════════════════════════════════════════════════════

import { Telegraf, Context, Scenes, session } from 'telegraf'
import { env } from '../config/env'
import { supabase } from '../config/database'

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
  }
  // Register wizard data
  registerData?: {
    tokenMint?: string
    tokenSymbol?: string
    devWalletPrivateKey?: string
    opsWalletPrivateKey?: string
    devWalletAddress?: string
    opsWalletAddress?: string
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
    const welcomeMessage = `
🔷 *Welcome to Claude Wheel Bot!*

I help you launch and manage tokens on Bags.fm with automatic market-making.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*WHAT I CAN DO*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 */launch* - Launch a NEW token
   • We generate wallets for you
   • You send SOL to fund the launch
   • Flywheel starts automatically!

📝 */register* - Register EXISTING token
   • Connect your launched token
   • Provide your wallet keys
   • Enable automated trading

📊 */mytokens* - View your tokens
⚙️ */settings* - Configure flywheel
❓ */help* - Full command list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready to get started?
`
    await ctx.replyWithMarkdown(welcomeMessage)
  })

  // /help - Full command list
  bot.command('help', async (ctx) => {
    const helpMessage = `
📚 *Claude Wheel Bot Commands*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*TOKEN LAUNCH & REGISTRATION*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/launch - Launch a new token on Bags.fm
/register - Register an existing token
/cancel - Cancel current operation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*TOKEN MANAGEMENT*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/mytokens - List all your tokens
/status <symbol> - Check token status
/settings <symbol> - Configure flywheel
/toggle <symbol> - Enable/disable flywheel
/fund <symbol> - Show wallet to add SOL
/withdraw <symbol> <amount> - Withdraw SOL

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*ALGORITHM MODES*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/mode <symbol> simple - 5 buys → 5 sells
/mode <symbol> smart - RSI + Bollinger
/mode <symbol> rebalance - Target allocation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 *Web Dashboard:* claudewheel.com
📖 *Documentation:* /docs
`
    await ctx.replyWithMarkdown(helpMessage)
  })

  // /launch - Start token launch wizard
  bot.command('launch', async (ctx) => {
    // Check if in private chat
    if (ctx.chat?.type !== 'private') {
      await ctx.reply('⚠️ For security, please use /launch in a private chat with me.')
      return
    }

    // Initialize session data
    ctx.session = ctx.session || {}
    ctx.session.launchData = {}

    const launchIntro = `
🚀 *Launch a New Token on Bags.fm*

I'll help you launch a token with automatic market-making enabled from day one!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*HOW IT WORKS*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ You provide token details
2️⃣ We generate secure wallets
3️⃣ You send SOL to fund launch
4️⃣ Token mints automatically
5️⃣ Flywheel starts immediately

No private keys to manage - we handle it!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready? Let's create your token!

📝 *What's your TOKEN NAME?*
(e.g., "Claude Wheel", "My Awesome Token")

_Reply with your token name or /cancel to exit_
`
    await ctx.replyWithMarkdown(launchIntro)

    // Set state to expect token name
    ctx.session.launchData = { step: 'name' } as any
  })

  // /register - Start token registration wizard
  bot.command('register', async (ctx) => {
    // Check if in private chat
    if (ctx.chat?.type !== 'private') {
      await ctx.reply('⚠️ For security, please use /register in a private chat with me.')
      return
    }

    // Initialize session data
    ctx.session = ctx.session || {}
    ctx.session.registerData = {}

    const registerIntro = `
📝 *Register an Existing Token*

For tokens already launched on Bags.fm.
You'll need to provide your wallet private keys.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *SECURITY NOTICE*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Keys encrypted with AES-256-GCM
• Only system can decrypt for operations
• *DELETE messages with keys immediately*
• Source code is open for audit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 *Enter your TOKEN MINT ADDRESS:*
(The Solana address of your token)

_Reply with the mint address or /cancel to exit_
`
    await ctx.replyWithMarkdown(registerIntro)

    // Set state to expect mint address
    ctx.session.registerData = { step: 'mint' } as any
  })

  // /mytokens - List user's tokens
  bot.command('mytokens', async (ctx) => {
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
        await ctx.reply('You haven\'t registered any tokens yet. Use /launch or /register to get started!')
        return
      }

      // Get user's tokens
      const { data: tokens, error } = await db
        .from('user_tokens')
        .select(`
          id,
          token_symbol,
          token_mint_address,
          is_active,
          launched_via_telegram,
          user_token_config (
            flywheel_active,
            algorithm_mode
          )
        `)
        .eq('telegram_user_id', telegramUser.id)
        .eq('is_active', true)

      if (error || !tokens || tokens.length === 0) {
        await ctx.reply('You haven\'t registered any tokens yet. Use /launch or /register to get started!')
        return
      }

      let message = `📊 *Your Tokens*\n\n`

      for (const token of tokens) {
        const config = Array.isArray(token.user_token_config)
          ? token.user_token_config[0]
          : token.user_token_config
        const status = config?.flywheel_active ? '🟢' : '🔴'
        const mode = config?.algorithm_mode || 'simple'
        const source = token.launched_via_telegram ? '🚀 Launched' : '📝 Registered'

        message += `*${token.token_symbol}*\n`
        message += `├ Status: ${status} ${config?.flywheel_active ? 'Active' : 'Inactive'}\n`
        message += `├ Mode: ${mode}\n`
        message += `├ Source: ${source}\n`
        message += `└ Mint: \`${token.token_mint_address.slice(0, 8)}...\`\n\n`
      }

      message += `\n_Use /status <symbol> for details_`

      await ctx.replyWithMarkdown(message)
    } catch (error) {
      console.error('Error fetching tokens:', error)
      await ctx.reply('Error fetching your tokens. Please try again.')
    }
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
      data.step = 'symbol'
      await ctx.replyWithMarkdown(`✅ Token mint verified!\n\n📝 *TOKEN SYMBOL?* (e.g., BAGS)`)
      break

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
      data.devWalletPrivateKey = text
      data.devWalletAddress = devAddress

      // Try to delete the message with private key
      try {
        await ctx.deleteMessage()
      } catch (e) {
        // Can't delete in some cases
      }

      await ctx.replyWithMarkdown(`
✅ *Dev wallet encrypted!*
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
            dev_wallet_address: data.devWalletAddress,
            dev_wallet_private_key_encrypted: devEncrypted.ciphertext,
            encryption_iv: devEncrypted.iv,
            encryption_auth_tag: devEncrypted.authTag,
            ops_wallet_address: data.opsWalletAddress,
            ops_wallet_private_key_encrypted: opsEncrypted.ciphertext,
            ops_encryption_iv: opsEncrypted.iv,
            ops_encryption_auth_tag: opsEncrypted.authTag,
            launched_via_telegram: false,
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

        const successMsg = `
🎉 *Token Registered Successfully!*

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*${data.tokenSymbol}* is now connected to Claude Wheel!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 *Next Steps:*
1. Fund your ops wallet with SOL
2. Run /toggle ${data.tokenSymbol} to enable flywheel
3. Use /settings ${data.tokenSymbol} to adjust config

*Commands:*
• /status ${data.tokenSymbol} - Check status
• /mytokens - View all tokens

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🌐 *Dashboard:* claudewheel.com/dashboard
`
        await ctx.replyWithMarkdown(successMsg)
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
        // Fall back to polling
        await botInstance.launch()
        console.log('✅ Telegram bot started (polling mode - fallback)')
      }
    } else {
      // Use polling for development
      await botInstance.launch()
      console.log('✅ Telegram bot started (polling mode)')
    }
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
