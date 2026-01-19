import express from 'express'
import cors from 'cors'
import { env } from './config/env'
import { loggers, logFatalWithDiscord } from './utils/logger'
import { discordErrorService } from './services/discord-error.service'
import { startMultiUserFlywheelJob } from './jobs/multi-flywheel.job'
import { startFastClaimJob, stopFastClaimJob } from './jobs/fast-claim.job'
import { startBalanceUpdateJob, stopBalanceUpdateJob } from './jobs/balance-update.job'
// WHEEL token is now handled by regular Privy flywheel (no separate job needed)
import statusRoutes from './routes/status.routes'
import adminRoutes from './routes/admin.routes'
import bagsRoutes from './routes/bags.routes'
import privyAuthRoutes from './routes/privy-auth.routes'
import privyTokensRoutes from './routes/privy-tokens.routes'
import privyLaunchesRoutes from './routes/privy-launches.routes'
import privyUsersRoutes from './routes/privy-users.routes'
import privyMmRoutes from './routes/privy-mm.routes'
import { bagsFmService } from './services/bags-fm'
import { startTelegramBot, stopTelegramBot, getTelegramWebhookMiddleware } from './telegram/bot'
import { startDepositMonitorJob, stopDepositMonitorJob } from './jobs/deposit-monitor.job'
import { startReactiveMonitorJob, stopReactiveMonitorJob } from './jobs/reactive-monitor.job'
import { adminWs } from './websocket/admin-ws'

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE FLYWHEEL BACKEND
// Autonomous Market Making Engine
// ═══════════════════════════════════════════════════════════════════════════

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/status', statusRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/bags', bagsRoutes)

// Privy Routes (TMA & Web)
app.use('/api/privy', privyAuthRoutes)
app.use('/api/privy/tokens', privyTokensRoutes)
app.use('/api/privy/launches', privyLaunchesRoutes)
app.use('/api/privy/mm', privyMmRoutes)
app.use('/api/users', privyUsersRoutes)

// Telegram webhook (for production)
const telegramWebhook = getTelegramWebhookMiddleware()
if (telegramWebhook) {
  app.use('/telegram/webhook', telegramWebhook)
}

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Claude Flywheel Backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      status: '/api/status',
      wallets: '/api/status/wallets',
      transactions: '/api/status/transactions',
      health: '/api/status/health',
      admin: {
        config: '/api/admin/config (POST - requires signature)',
        nonce: '/api/admin/nonce (GET)',
      },
      bags: {
        token: '/api/bags/token/:mint',
        fees: '/api/bags/fees/:mint',
        claimable: '/api/bags/claimable/:wallet',
        claimStats: '/api/bags/claim-stats/:wallet',
        dashboard: '/api/bags/dashboard',
      },
      telegram: {
        webhook: '/telegram/webhook (POST)',
        note: 'Use Telegram bot @ClaudeWheelBot for token launch and management',
      },
      privy: {
        verify: '/api/privy/verify (POST)',
        status: '/api/privy/status (GET)',
        tokens: '/api/privy/tokens (GET/POST)',
        token: '/api/privy/tokens/:id (GET/DELETE)',
        tokenConfig: '/api/privy/tokens/:id/config (PUT)',
        launches: '/api/privy/launches (POST)',
        pendingLaunch: '/api/privy/launches/pending (GET)',
        launchHistory: '/api/privy/launches/history (GET)',
        cancelLaunch: '/api/privy/launches/:id (DELETE)',
      },
      users: {
        completeOnboarding: '/api/users/complete-onboarding (POST)',
        profile: '/api/users/profile (GET/PUT)',
        onboardingStatus: '/api/users/onboarding-status (GET)',
        updateDelegation: '/api/users/update-delegation (POST)',
      },
    },
  })
})

// Initialize services
async function initializeServices() {
  loggers.server.info('═══════════════════════════════════════════════════════════')
  loggers.server.info('   CLAUDE WHEEL - AUTONOMOUS MARKET MAKING ENGINE')
  loggers.server.info('═══════════════════════════════════════════════════════════')

  // Initialize Bags.fm API key if configured
  if (env.bagsFmApiKey) {
    bagsFmService.setApiKey(env.bagsFmApiKey)
    loggers.server.info('Bags.fm API key configured')
  } else {
    loggers.server.warn('Bags.fm API key not set (BAGS_FM_API_KEY)')
  }

  // Log configuration
  loggers.server.info({ rpc: env.solanaRpcUrl.slice(0, 30) + '...', minFeeThresholdSol: env.minFeeThresholdSol }, 'Configuration loaded')

  // Start automation jobs (Privy-based system - no encryption needed)
  loggers.server.info('Starting automation jobs...')

  // Start FAST claim job (every 30 seconds - claims when >= 0.15 SOL)
  if (process.env.FAST_CLAIM_JOB_ENABLED !== 'false') {
    startFastClaimJob()
  } else {
    loggers.server.info('Fast claim job disabled via FAST_CLAIM_JOB_ENABLED=false')
  }

  // Start multi-user flywheel job (every minute by default)
  if (process.env.MULTI_USER_FLYWHEEL_ENABLED !== 'false') {
    startMultiUserFlywheelJob()
  } else {
    loggers.server.info('Multi-user flywheel job disabled via MULTI_USER_FLYWHEEL_ENABLED=false')
  }

  // Start deposit monitor job for Telegram token launches
  if (process.env.DEPOSIT_MONITOR_ENABLED !== 'false') {
    startDepositMonitorJob()
  } else {
    loggers.server.info('Deposit monitor job disabled via DEPOSIT_MONITOR_ENABLED=false')
  }

  // Start balance update job (every 5 minutes by default)
  if (process.env.BALANCE_UPDATE_JOB_ENABLED !== 'false') {
    startBalanceUpdateJob()
  } else {
    loggers.server.info('Balance update job disabled via BALANCE_UPDATE_JOB_ENABLED=false')
  }

  // Start reactive monitor job for transaction_reactive MM mode
  if (process.env.REACTIVE_MONITOR_ENABLED !== 'false') {
    await startReactiveMonitorJob()
  } else {
    loggers.server.info('Reactive monitor job disabled via REACTIVE_MONITOR_ENABLED=false')
  }

  // WHEEL token is processed by regular Privy flywheel (tokenSource='platform')

  // Start Telegram bot
  if (env.telegramBotToken) {
    await startTelegramBot()
  } else {
    loggers.server.warn('Telegram bot not configured (set TELEGRAM_BOT_TOKEN)')
  }
}

// Start server
const server = app.listen(env.port, async () => {
  loggers.server.info({ port: env.port }, 'Server running')

  // Initialize WebSocket server
  adminWs.init(server)

  await initializeServices()
})

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL ERROR HANDLERS
// Catch uncaught exceptions and unhandled rejections, report to Discord
// ═══════════════════════════════════════════════════════════════════════════

process.on('uncaughtException', async (error: Error, origin: string) => {
  // Log and report to Discord
  await logFatalWithDiscord(loggers.server, error, 'Uncaught Exception', {
    module: 'process',
    operation: 'uncaughtException',
    additionalInfo: { origin },
  })

  // Also use the dedicated method for critical errors
  await discordErrorService.reportUncaughtException(error, origin)

  // Give Discord time to send before exiting
  setTimeout(() => {
    process.exit(1)
  }, 2000)
})

process.on('unhandledRejection', async (reason: unknown, promise: Promise<unknown>) => {
  const error = reason instanceof Error ? reason : new Error(String(reason))

  // Log and report to Discord
  await logFatalWithDiscord(loggers.server, error, 'Unhandled Promise Rejection', {
    module: 'process',
    operation: 'unhandledRejection',
  })

  // Also use the dedicated method
  await discordErrorService.reportUnhandledRejection(reason, promise)

  // Don't exit for unhandled rejections - log and continue
  loggers.server.warn('Continuing after unhandled rejection...')
})

// ═══════════════════════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════════════════════

process.on('SIGTERM', async () => {
  loggers.server.info('Shutting down gracefully...')
  discordErrorService.shutdown()
  adminWs.shutdown()
  stopTelegramBot()
  stopDepositMonitorJob()
  stopFastClaimJob()
  stopBalanceUpdateJob()
  await stopReactiveMonitorJob()
  server.close(() => {
    loggers.server.info('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', async () => {
  loggers.server.info('Shutting down gracefully...')
  discordErrorService.shutdown()
  adminWs.shutdown()
  stopTelegramBot()
  stopDepositMonitorJob()
  stopFastClaimJob()
  stopBalanceUpdateJob()
  await stopReactiveMonitorJob()
  server.close(() => {
    loggers.server.info('Server closed')
    process.exit(0)
  })
})
