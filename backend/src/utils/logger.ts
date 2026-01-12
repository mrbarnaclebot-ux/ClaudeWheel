import pino from 'pino'
import { discordErrorService, ErrorContext } from '../services/discord-error.service'

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED LOGGING WITH PINO
// Production-ready logging with JSON output and child loggers
// Integrated with Discord error reporting - ALL errors auto-sent to Discord
// ═══════════════════════════════════════════════════════════════════════════

const isDevelopment = process.env.NODE_ENV !== 'production'

// Base logger configuration
const baseLogger = pino({
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

// ═══════════════════════════════════════════════════════════════════════════
// DISCORD AUTO-HOOK
// Wraps logger to automatically send error/fatal logs to Discord
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wrap a Pino logger to automatically send error/fatal logs to Discord
 * This intercepts .error() and .fatal() calls and forwards them to Discord
 */
function wrapLoggerWithDiscord(logger: pino.Logger, moduleName: string): pino.Logger {
  // Create a proxy that intercepts error and fatal calls
  const handler: ProxyHandler<pino.Logger> = {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver)

      // Intercept error method
      if (prop === 'error') {
        return function (objOrMsg: unknown, ...args: unknown[]) {
          // Call original logger
          if (typeof original === 'function') {
            original.call(target, objOrMsg, ...args)
          }

          // Extract error info and send to Discord
          try {
            let errorMessage: string
            let errorObj: Error
            let context: Record<string, unknown> = {}

            if (typeof objOrMsg === 'object' && objOrMsg !== null) {
              // First arg is object with context
              context = objOrMsg as Record<string, unknown>
              errorMessage = typeof args[0] === 'string' ? args[0] : 'Error occurred'
              const errorStr = context.error || context.err || errorMessage
              errorObj = new Error(String(errorStr))
            } else {
              // First arg is the message
              errorMessage = String(objOrMsg)
              errorObj = new Error(errorMessage)
            }

            // Send to Discord (fire and forget)
            discordErrorService
              .reportError(errorObj, {
                module: moduleName,
                operation: errorMessage,
                additionalInfo: context,
              })
              .catch(() => {
                // Silently fail - already logged locally
              })
          } catch {
            // Don't let Discord hook crash the logger
          }
        }
      }

      // Intercept fatal method
      if (prop === 'fatal') {
        return function (objOrMsg: unknown, ...args: unknown[]) {
          // Call original logger
          if (typeof original === 'function') {
            original.call(target, objOrMsg, ...args)
          }

          // Extract error info and send to Discord with high priority
          try {
            let errorMessage: string
            let errorObj: Error
            let context: Record<string, unknown> = {}

            if (typeof objOrMsg === 'object' && objOrMsg !== null) {
              context = objOrMsg as Record<string, unknown>
              errorMessage = typeof args[0] === 'string' ? args[0] : 'Fatal error occurred'
              const errorStr = context.error || context.err || errorMessage
              errorObj = new Error(String(errorStr))
            } else {
              errorMessage = String(objOrMsg)
              errorObj = new Error(errorMessage)
            }

            // Send to Discord with fatal severity (bypasses rate limit)
            discordErrorService
              .reportError(
                errorObj,
                {
                  module: moduleName,
                  operation: errorMessage,
                  additionalInfo: context,
                },
                { severity: 'fatal', force: true }
              )
              .catch(() => {
                // Silently fail
              })
          } catch {
            // Don't let Discord hook crash the logger
          }
        }
      }

      // Return original for all other methods
      return original
    },
  }

  return new Proxy(logger, handler)
}

// Child loggers for different modules - wrapped with Discord auto-hook
export const createLogger = (module: string): pino.Logger => {
  const childLogger = baseLogger.child({ module })
  return wrapLoggerWithDiscord(childLogger, module)
}

// Pre-configured child loggers for common modules (all auto-send errors to Discord)
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
// DISCORD ERROR INTEGRATION - EXPLICIT FUNCTIONS
// Use these when you want more control over Discord notifications
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log an error and send it to Discord with additional context
 * Use this when you need to include extra context like userId, tokenMint, etc.
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

  // Log locally first (this will also trigger the auto-hook, but with less context)
  // So we skip the auto-hook by logging directly and sending to Discord ourselves
  baseLogger.child({ module }).error({ error: String(error), ...context.additionalInfo }, message)

  // Send to Discord with full context
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

  // Log locally first
  baseLogger.child({ module }).fatal({ error: String(error), ...context.additionalInfo }, message)

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
 * Like withTiming but also sends errors to Discord with context
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

    // Send to Discord with additional context
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

// Export base logger for cases where Discord hook is not wanted
export const rawLogger = baseLogger

export default baseLogger
