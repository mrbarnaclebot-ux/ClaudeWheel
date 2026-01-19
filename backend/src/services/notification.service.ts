// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION SERVICE
// Telegram notification service for Privy users
// Sends notifications for deposits, trades, claims, and system events
// ═══════════════════════════════════════════════════════════════════════════

import { getBot } from '../telegram/bot'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import { createLogger } from '../utils/logger'

const logger = createLogger('notification')

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface NotificationOptions {
  telegramId: number
  message: string
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML'
  includeAppButton?: boolean
}

export interface DepositNotification {
  telegramId: number
  amount: number
  tokenSymbol?: string
  walletType: 'dev' | 'ops'
  transactionSignature?: string
}

export interface TokenLaunchedNotification {
  telegramId: number
  tokenName: string
  tokenSymbol: string
  tokenMint: string
  devWalletAddress: string
  opsWalletAddress: string
}

export interface TradeExecutedNotification {
  telegramId: number
  tokenSymbol: string
  side: 'buy' | 'sell'
  amountSol?: number
  amountTokens?: number
  transactionSignature?: string
}

export interface FeesClaimedNotification {
  telegramId: number
  tokenSymbol: string
  amountSol: number
  userShare: number
  platformFee: number
  transactionSignature?: string
}


// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATION SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class NotificationService {
  private tmaUrl: string | undefined

  constructor() {
    this.tmaUrl = env.tmaUrl
  }

  /**
   * Check if notification service is configured
   */
  isConfigured(): boolean {
    return !!env.telegramBotToken
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BASE NOTIFICATION METHOD
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send a notification to a Telegram user
   */
  async notify(options: NotificationOptions): Promise<boolean> {
    const { telegramId, message, parseMode = 'Markdown', includeAppButton = true } = options

    const bot = getBot()
    if (!bot) {
      logger.warn('Telegram bot not configured')
      return false
    }

    try {
      const keyboard = includeAppButton && this.tmaUrl
        ? {
            reply_markup: {
              inline_keyboard: [[
                { text: '📱 Open App', url: this.tmaUrl }
              ]]
            }
          }
        : undefined

      await bot.telegram.sendMessage(telegramId, message, {
        parse_mode: parseMode,
        ...keyboard,
      })

      logger.info({ telegramId }, 'Notification sent')
      return true
    } catch (error: any) {
      // Handle blocked users or deactivated accounts
      if (error.code === 403 || error.description?.includes('blocked') || error.description?.includes('deactivated')) {
        logger.warn({ telegramId }, 'User has blocked the bot or account is deactivated')
        // Could optionally mark user as inactive in database here
        return false
      }

      logger.error({ error: String(error), telegramId }, 'Failed to send notification')
      return false
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPECIALIZED NOTIFICATION METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Notify user of a deposit received
   */
  async notifyDeposit(params: DepositNotification): Promise<boolean> {
    const { telegramId, amount, tokenSymbol, walletType, transactionSignature } = params

    const walletName = walletType === 'dev' ? 'Dev' : 'Ops'
    const assetType = tokenSymbol || 'SOL'
    const explorerUrl = transactionSignature
      ? `https://solscan.io/tx/${transactionSignature}`
      : null

    let message = `💰 *Deposit Received*\n\n`
    message += `*Amount:* ${amount.toFixed(4)} ${assetType}\n`
    message += `*Wallet:* ${walletName}\n`

    if (explorerUrl) {
      message += `\n[View on Solscan](${explorerUrl})`
    }

    return this.notify({ telegramId, message })
  }

  /**
   * Notify user that their token has been launched
   */
  async notifyTokenLaunched(params: TokenLaunchedNotification): Promise<boolean> {
    const { telegramId, tokenName, tokenSymbol, tokenMint, devWalletAddress, opsWalletAddress } = params

    const bagsUrl = `https://bags.fm/token/${tokenMint}`
    const mintShort = `${tokenMint.slice(0, 8)}...${tokenMint.slice(-6)}`

    const message = `🚀 *Token Launched!*

*${tokenName}* (${tokenSymbol})

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

*Token Mint:*
\`${mintShort}\`

*Wallets:*
├ Dev: \`${devWalletAddress.slice(0, 8)}...\`
└ Ops: \`${opsWalletAddress.slice(0, 8)}...\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Flywheel is now active! Your token will automatically:
• Claim fees when threshold is reached
• Execute buy/sell trades

[View on Bags.fm](${bagsUrl})`

    return this.notify({ telegramId, message })
  }

  /**
   * Notify user of a trade execution
   */
  async notifyTradeExecuted(params: TradeExecutedNotification): Promise<boolean> {
    const { telegramId, tokenSymbol, side, amountSol, amountTokens, transactionSignature } = params

    const emoji = side === 'buy' ? '📈' : '📉'
    const action = side === 'buy' ? 'Bought' : 'Sold'
    const explorerUrl = transactionSignature
      ? `https://solscan.io/tx/${transactionSignature}`
      : null

    let message = `${emoji} *Trade Executed*\n\n`
    message += `*Action:* ${action}\n`
    message += `*Token:* ${tokenSymbol}\n`

    if (side === 'buy' && amountSol) {
      message += `*Amount:* ${amountSol.toFixed(4)} SOL\n`
    } else if (side === 'sell' && amountTokens) {
      message += `*Amount:* ${amountTokens.toLocaleString()} ${tokenSymbol}\n`
    }

    if (explorerUrl) {
      message += `\n[View on Solscan](${explorerUrl})`
    }

    return this.notify({ telegramId, message })
  }

  /**
   * Notify user of fees claimed
   */
  async notifyFeesClaimed(params: FeesClaimedNotification): Promise<boolean> {
    const { telegramId, tokenSymbol, amountSol, userShare, platformFee, transactionSignature } = params

    const explorerUrl = transactionSignature
      ? `https://solscan.io/tx/${transactionSignature}`
      : null

    let message = `💸 *Fees Claimed*\n\n`
    message += `*Token:* ${tokenSymbol}\n`
    message += `*Total Claimed:* ${amountSol.toFixed(4)} SOL\n\n`
    message += `*Distribution:*\n`
    message += `├ Your share: ${userShare.toFixed(4)} SOL (90%)\n`
    message += `└ Platform fee: ${platformFee.toFixed(4)} SOL (10%)\n`

    if (explorerUrl) {
      message += `\n[View on Solscan](${explorerUrl})`
    }

    return this.notify({ telegramId, message })
  }

  /**
   * Get Telegram ID from Privy user ID
   */
  async getTelegramIdForPrivyUser(privyUserId: string): Promise<number | null> {
    try {
      const user = await prisma.privyUser.findUnique({
        where: { privyUserId },
        select: { telegramId: true }
      })

      if (!user?.telegramId) {
        return null
      }

      return Number(user.telegramId)
    } catch (error) {
      logger.error({ error: String(error), privyUserId }, 'Failed to get Telegram ID for Privy user')
      return null
    }
  }

  /**
   * Notify by Privy user ID instead of Telegram ID
   */
  async notifyByPrivyUserId(privyUserId: string, message: string): Promise<boolean> {
    const telegramId = await this.getTelegramIdForPrivyUser(privyUserId)

    if (!telegramId) {
      logger.warn({ privyUserId }, 'No Telegram ID found for Privy user')
      return false
    }

    return this.notify({ telegramId, message })
  }
}

// Export singleton instance
export const notificationService = new NotificationService()
