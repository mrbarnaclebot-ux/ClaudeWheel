import pino from 'pino'
import { discordErrorService, ErrorContext } from '../services/discord-error.service'

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED LOGGING WITH PINO
// Production-ready logging with JSON output and child loggers
// Integrated with Discord error reporting
// ═══════════════════════════════════════════════════════════════════════════

const isDevelopment = process.env.NODE_ENV !== 'production'

// Base logger configuration
const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined,
  base: {
    service: 'claude-wheel',
    env: process.env.NODE_ENV || 'development',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

// Child loggers for different modules
export const createLogger = (module: string) => logger.child({ module })

// Pre-configured child loggers for common modules
export const loggers = {
  server: createLogger('server'),
  telegram: createLogger('telegram'),
  flywheel: createLogger('flywheel'),
  claim: createLogger('claim'),
  deposit: createLogger('deposit'),
  balance: createLogger('balance'),
  auth: createLogger('auth'),
  bags: createLogger('bags'),
  user: createLogger('user'),
  db: createLogger('database'),
  encryption: createLogger('encryption'),
  solana: createLogger('solana'),
  twap: createLogger('twap'),
  refund: createLogger('refund'),
  token: createLogger('token'),
  alerts: createLogger('alerts'),
  privy: createLogger('privy'),
  notification: createLogger('notification'),
  platformConfig: createLogger('platform-config'),
  discord: createLogger('discord'),
}

// Utility for logging transaction details
export const logTransaction = (
  logger: pino.Logger,
  action: string,
  details: {
    wallet?: string
    token?: string
    amount?: number
    signature?: string
    error?: unknown
  }
) => {
  const { error, ...rest } = details
  if (error) {
    logger.error({ action, ...rest, error: String(error) }, `${action} failed`)
  } else {
    logger.info({ action, ...rest }, `${action} completed`)
  }
}

// Utility for logging with timing
export const withTiming = async <T>(
  logger: pino.Logger,
  operation: string,
  fn: () => Promise<T>
): Promise<T> => {
  const start = Date.now()
  try {
    const result = await fn()
    logger.info({ operation, durationMs: Date.now() - start }, `${operation} completed`)
    return result
  } catch (error) {
    logger.error(
      { operation, durationMs: Date.now() - start, error: String(error) },
      `${operation} failed`
    )
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DISCORD ERROR INTEGRATION
// Utilities for logging errors with automatic Discord notification
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log an error and send it to Discord
 * Use this for errors that should trigger Discord notifications
 */
export const logErrorWithDiscord = async (
  logger: pino.Logger,
  error: unknown,
  message: string,
  context: ErrorContext = {}
): Promise<void> => {
  // Extract module from logger bindings if not provided
  const bindings = logger.bindings?.() || {}
  const module = context.module || bindings.module || 'unknown'

  // Convert to Error object if needed
  const errorObj = error instanceof Error ? error : new Error(String(error))

  // Log locally first
  logger.error({ error: String(error), ...context.additionalInfo }, message)

  // Send to Discord (fire and forget - don't block on this)
  discordErrorService
    .reportError(errorObj, {
      ...context,
      module,
      operation: context.operation || message,
    })
    .catch(() => {
      // Silently fail - we already logged locally
    })
}

/**
 * Log a fatal error and send it to Discord with high priority
 * Use this for critical errors that need immediate attention
 */
export const logFatalWithDiscord = async (
  logger: pino.Logger,
  error: unknown,
  message: string,
  context: ErrorContext = {}
): Promise<void> => {
  const bindings = logger.bindings?.() || {}
  const module = context.module || bindings.module || 'unknown'
  const errorObj = error instanceof Error ? error : new Error(String(error))

  // Log locally first at fatal level
  logger.fatal({ error: String(error), ...context.additionalInfo }, message)

  // Send to Discord with fatal severity (bypasses rate limit)
  discordErrorService
    .reportError(
      errorObj,
      {
        ...context,
        module,
        operation: context.operation || message,
      },
      { severity: 'fatal', force: true }
    )
    .catch(() => {
      // Silently fail
    })
}

/**
 * Utility for logging with timing and Discord error reporting
 * Like withTiming but also sends errors to Discord
 */
export const withTimingAndDiscord = async <T>(
  logger: pino.Logger,
  operation: string,
  fn: () => Promise<T>,
  context: ErrorContext = {}
): Promise<T> => {
  const start = Date.now()
  try {
    const result = await fn()
    logger.info({ operation, durationMs: Date.now() - start }, `${operation} completed`)
    return result
  } catch (error) {
    const durationMs = Date.now() - start
    logger.error({ operation, durationMs, error: String(error) }, `${operation} failed`)

    // Send to Discord
    const errorObj = error instanceof Error ? error : new Error(String(error))
    const bindings = logger.bindings?.() || {}
    discordErrorService
      .reportError(errorObj, {
        ...context,
        module: context.module || bindings.module || 'unknown',
        operation,
        additionalInfo: {
          ...context.additionalInfo,
          durationMs,
        },
      })
      .catch(() => {
        // Silently fail
      })

    throw error
  }
}

/**
 * Report error to Discord without local logging
 * Use when you've already logged locally and just want Discord notification
 */
export const reportToDiscord = (
  error: unknown,
  context: ErrorContext,
  options: { severity?: 'error' | 'fatal' | 'warn' | 'critical'; force?: boolean } = {}
): void => {
  const errorObj = error instanceof Error ? error : new Error(String(error))
  discordErrorService.reportError(errorObj, context, options).catch(() => {
    // Silently fail
  })
}

// Re-export the ErrorContext type for convenience
export type { ErrorContext }

export default logger
