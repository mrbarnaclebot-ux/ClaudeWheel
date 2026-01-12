import * as crypto from 'crypto'

// ═══════════════════════════════════════════════════════════════════════════
// DISCORD ERROR REPORTING SERVICE
// Sends errors to Discord webhook with rich formatting, rate limiting, and deduplication
// ═══════════════════════════════════════════════════════════════════════════

// Types for Discord webhook payloads
interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

interface DiscordEmbed {
  title: string
  description?: string
  color: number
  fields: DiscordEmbedField[]
  timestamp: string
  footer?: {
    text: string
  }
}

interface DiscordWebhookPayload {
  username?: string
  avatar_url?: string
  embeds: DiscordEmbed[]
}

// Error context that can be attached to errors
export interface ErrorContext {
  module?: string
  operation?: string
  userId?: string
  walletAddress?: string
  tokenMint?: string
  transactionSignature?: string
  requestPath?: string
  requestMethod?: string
  requestBody?: unknown
  additionalInfo?: Record<string, unknown>
}

// Severity levels with colors
enum Severity {
  ERROR = 0xff0000, // Red
  FATAL = 0x8b0000, // Dark red
  WARN = 0xffa500, // Orange
  CRITICAL = 0xff00ff, // Magenta - for uncaught exceptions
}

// Configuration loaded lazily to avoid circular dependency with env.ts
let config: {
  webhookUrl: string | undefined
  rateLimitSeconds: number
  enabled: boolean
} | null = null

function getConfig() {
  if (!config) {
    // Lazy load to avoid circular dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('../config/env')
    config = {
      webhookUrl: env.discordErrorWebhookUrl,
      rateLimitSeconds: env.discordErrorRateLimitSeconds || 60,
      enabled: env.discordErrorEnabled,
    }
  }
  return config
}

class DiscordErrorService {
  // Track sent errors to prevent spam (hash -> timestamp)
  private sentErrors: Map<string, number> = new Map()
  // Service start time for uptime calculation
  private readonly startTime = Date.now()
  // Cleanup interval for old entries
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Clean up old error hashes every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanupOldHashes(), 5 * 60 * 1000)
  }

  /**
   * Generate a hash for error deduplication
   * Uses error message + stack trace first line + module
   */
  private generateErrorHash(error: Error, context: ErrorContext): string {
    const stackFirstLine = error.stack?.split('\n')[1]?.trim() || ''
    const key = `${error.name}:${error.message}:${stackFirstLine}:${context.module || 'unknown'}`
    return crypto.createHash('md5').update(key).digest('hex').slice(0, 12)
  }

  /**
   * Check if this error was recently sent (rate limiting)
   */
  private isRateLimited(errorHash: string): boolean {
    const { rateLimitSeconds } = getConfig()
    const lastSent = this.sentErrors.get(errorHash)
    if (!lastSent) return false

    const elapsed = (Date.now() - lastSent) / 1000
    return elapsed < rateLimitSeconds
  }

  /**
   * Clean up old error hashes to prevent memory leak
   */
  private cleanupOldHashes(): void {
    const { rateLimitSeconds } = getConfig()
    const now = Date.now()
    const expireThreshold = rateLimitSeconds * 1000 * 2 // Keep for 2x rate limit period

    // Convert to array to avoid iterator compatibility issues
    const entries = Array.from(this.sentErrors.entries())
    for (const [hash, timestamp] of entries) {
      if (now - timestamp > expireThreshold) {
        this.sentErrors.delete(hash)
      }
    }
  }

  /**
   * Get system info for context
   */
  private getSystemInfo(): Record<string, string> {
    const memUsage = process.memoryUsage()
    const uptime = Math.floor((Date.now() - this.startTime) / 1000)

    return {
      'Memory (Heap)': `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      'Memory (RSS)': `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
      Uptime: this.formatUptime(uptime),
      'Node Version': process.version,
      Platform: process.platform,
    }
  }

  /**
   * Format uptime as human-readable string
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    const parts: string[] = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0) parts.push(`${hours}h`)
    if (minutes > 0) parts.push(`${minutes}m`)
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)

    return parts.join(' ')
  }

  /**
   * Truncate string to fit Discord limits
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str
    return str.slice(0, maxLength - 3) + '...'
  }

  /**
   * Format stack trace for Discord (code block, truncated)
   */
  private formatStackTrace(stack: string | undefined): string {
    if (!stack) return '```\nNo stack trace available\n```'

    // Remove the first line (error message - already shown in title)
    const lines = stack.split('\n').slice(1)
    // Take first 10 lines of stack trace
    const truncatedLines = lines.slice(0, 10)
    if (lines.length > 10) {
      truncatedLines.push(`... and ${lines.length - 10} more lines`)
    }

    const formatted = truncatedLines.join('\n')
    // Discord field value limit is 1024 chars
    return '```\n' + this.truncate(formatted, 1000) + '\n```'
  }

  /**
   * Build Discord embed from error and context
   */
  private buildEmbed(error: Error, context: ErrorContext, severity: Severity): DiscordEmbed {
    const fields: DiscordEmbedField[] = []
    const cfg = getConfig()

    // Error details
    fields.push({
      name: '📍 Location',
      value: `\`${context.module || 'unknown'}\`${context.operation ? ` → \`${context.operation}\`` : ''}`,
      inline: true,
    })

    fields.push({
      name: '🏷️ Error Type',
      value: `\`${error.name}\``,
      inline: true,
    })

    // Add error hash for reference
    const errorHash = this.generateErrorHash(error, context)
    fields.push({
      name: '🔑 Error Hash',
      value: `\`${errorHash}\``,
      inline: true,
    })

    // Request info if available
    if (context.requestPath || context.requestMethod) {
      fields.push({
        name: '🌐 Request',
        value: `\`${context.requestMethod || 'N/A'} ${context.requestPath || 'N/A'}\``,
        inline: true,
      })
    }

    // User/wallet info if available
    if (context.userId || context.walletAddress) {
      const userInfo: string[] = []
      if (context.userId) userInfo.push(`User: \`${this.truncate(context.userId, 20)}\``)
      if (context.walletAddress) userInfo.push(`Wallet: \`${this.truncate(context.walletAddress, 12)}...\``)
      fields.push({
        name: '👤 User Context',
        value: userInfo.join('\n'),
        inline: true,
      })
    }

    // Token/transaction info if available
    if (context.tokenMint || context.transactionSignature) {
      const txInfo: string[] = []
      if (context.tokenMint) txInfo.push(`Token: \`${this.truncate(context.tokenMint, 12)}...\``)
      if (context.transactionSignature) txInfo.push(`Tx: \`${this.truncate(context.transactionSignature, 12)}...\``)
      fields.push({
        name: '💰 Transaction Context',
        value: txInfo.join('\n'),
        inline: true,
      })
    }

    // Stack trace
    fields.push({
      name: '📚 Stack Trace',
      value: this.formatStackTrace(error.stack),
      inline: false,
    })

    // Additional info if provided
    if (context.additionalInfo && Object.keys(context.additionalInfo).length > 0) {
      const infoStr = Object.entries(context.additionalInfo)
        .map(([k, v]) => `**${k}:** ${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join('\n')
      fields.push({
        name: '📎 Additional Info',
        value: this.truncate(infoStr, 1024),
        inline: false,
      })
    }

    // System info
    const sysInfo = this.getSystemInfo()
    const sysInfoStr = Object.entries(sysInfo)
      .map(([k, v]) => `**${k}:** ${v}`)
      .join('\n')
    fields.push({
      name: '🖥️ System',
      value: sysInfoStr,
      inline: false,
    })

    // Environment
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { env } = require('../config/env')
    const envLabel = env.isProd ? '🔴 PRODUCTION' : env.isDev ? '🟡 DEVELOPMENT' : '🔵 TEST'

    return {
      title: `${this.getSeverityEmoji(severity)} ${this.truncate(error.message, 200)}`,
      color: severity,
      fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: `Claude Wheel ${envLabel} • Rate limit: ${cfg.rateLimitSeconds}s`,
      },
    }
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: Severity): string {
    switch (severity) {
      case Severity.FATAL:
        return '💀'
      case Severity.CRITICAL:
        return '🚨'
      case Severity.WARN:
        return '⚠️'
      case Severity.ERROR:
      default:
        return '❌'
    }
  }

  /**
   * Send error to Discord webhook
   */
  private async sendToDiscord(payload: DiscordWebhookPayload): Promise<boolean> {
    const { webhookUrl } = getConfig()

    if (!webhookUrl) {
      return false
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        // Log to console since we can't use logger here (circular dep)
        console.error(`[Discord Error Service] Failed to send: ${response.status} ${response.statusText}`)
        return false
      }

      return true
    } catch (err) {
      console.error(`[Discord Error Service] Network error: ${err instanceof Error ? err.message : err}`)
      return false
    }
  }

  /**
   * Report an error to Discord
   * Main public method - call this from anywhere in the codebase
   */
  async reportError(
    error: Error,
    context: ErrorContext = {},
    options: { severity?: 'error' | 'fatal' | 'warn' | 'critical'; force?: boolean } = {}
  ): Promise<boolean> {
    const cfg = getConfig()

    // Check if Discord error reporting is enabled
    if (!cfg.enabled || !cfg.webhookUrl) {
      return false
    }

    const severity = this.getSeverityLevel(options.severity || 'error')
    const errorHash = this.generateErrorHash(error, context)

    // Check rate limiting (unless forced)
    if (!options.force && this.isRateLimited(errorHash)) {
      return false
    }

    // Mark as sent
    this.sentErrors.set(errorHash, Date.now())

    // Build and send embed
    const embed = this.buildEmbed(error, context, severity)
    const payload: DiscordWebhookPayload = {
      username: 'Claude Wheel Error Reporter',
      embeds: [embed],
    }

    return this.sendToDiscord(payload)
  }

  /**
   * Convert severity string to enum
   */
  private getSeverityLevel(severity: 'error' | 'fatal' | 'warn' | 'critical'): Severity {
    switch (severity) {
      case 'fatal':
        return Severity.FATAL
      case 'critical':
        return Severity.CRITICAL
      case 'warn':
        return Severity.WARN
      case 'error':
      default:
        return Severity.ERROR
    }
  }

  /**
   * Report an uncaught exception (always sends, bypasses rate limit)
   */
  async reportUncaughtException(error: Error, origin: string): Promise<boolean> {
    return this.reportError(
      error,
      {
        module: 'process',
        operation: 'uncaughtException',
        additionalInfo: { origin },
      },
      { severity: 'critical', force: true }
    )
  }

  /**
   * Report an unhandled promise rejection (always sends, bypasses rate limit)
   */
  async reportUnhandledRejection(reason: unknown, promise: Promise<unknown>): Promise<boolean> {
    const error = reason instanceof Error ? reason : new Error(String(reason))
    return this.reportError(
      error,
      {
        module: 'process',
        operation: 'unhandledRejection',
        additionalInfo: {
          promiseInfo: String(promise),
        },
      },
      { severity: 'critical', force: true }
    )
  }

  /**
   * Send a test error to verify webhook configuration
   */
  async sendTestError(): Promise<boolean> {
    const testError = new Error('Test error from Claude Wheel - Discord integration is working!')
    return this.reportError(
      testError,
      {
        module: 'discord-error-service',
        operation: 'test',
        additionalInfo: {
          purpose: 'Configuration verification',
          triggeredAt: new Date().toISOString(),
        },
      },
      { severity: 'warn', force: true }
    )
  }

  /**
   * Get current stats
   */
  getStats(): {
    trackedErrors: number
    webhookConfigured: boolean
    enabled: boolean
    rateLimitSeconds: number
  } {
    const cfg = getConfig()
    return {
      trackedErrors: this.sentErrors.size,
      webhookConfigured: !!cfg.webhookUrl,
      enabled: cfg.enabled,
      rateLimitSeconds: cfg.rateLimitSeconds,
    }
  }

  /**
   * Cleanup resources
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.sentErrors.clear()
  }
}

// Export singleton instance
export const discordErrorService = new DiscordErrorService()
