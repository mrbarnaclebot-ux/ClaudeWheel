import pino from 'pino'

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED LOGGING WITH PINO
// Production-ready logging with JSON output and child loggers
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

export default logger
