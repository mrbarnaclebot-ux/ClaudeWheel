// ═══════════════════════════════════════════════════════════════════════════
// BALANCE UPDATE JOB
// Periodically updates wallet balances for all active tokens
// Runs every 5 minutes by default
// ═══════════════════════════════════════════════════════════════════════════

import { balanceMonitorService } from '../services/balance-monitor.service'
import { loggers } from '../utils/logger'

let balanceUpdateInterval: NodeJS.Timeout | null = null

// Default interval: 5 minutes (300 seconds)
const DEFAULT_INTERVAL_SECONDS = 300

/**
 * Start the balance update job scheduler
 */
export function startBalanceUpdateJob(): void {
  const intervalSeconds = parseInt(process.env.BALANCE_UPDATE_INTERVAL_SECONDS || String(DEFAULT_INTERVAL_SECONDS), 10)

  // Check if job is enabled
  if (process.env.BALANCE_UPDATE_JOB_ENABLED === 'false') {
    loggers.balance.info('ℹ️ Balance update job disabled via BALANCE_UPDATE_JOB_ENABLED=false')
    return
  }

  const batchSize = process.env.BALANCE_UPDATE_BATCH_SIZE || '50'
  loggers.balance.info({ intervalSeconds, intervalMinutes: (intervalSeconds / 60).toFixed(1), batchSize }, '💰 Starting BALANCE UPDATE job scheduler')

  // Run immediately on startup (after a short delay)
  setTimeout(() => {
    loggers.balance.info('💰 Running initial balance update...')
    runBalanceUpdateCycle()
  }, 10000) // 10 second delay to let other services initialize

  // Schedule recurring runs
  balanceUpdateInterval = setInterval(
    () => runBalanceUpdateCycle(),
    intervalSeconds * 1000
  )

  loggers.balance.info('📅 Balance update job scheduled successfully')
}

/**
 * Stop the balance update job scheduler
 */
export function stopBalanceUpdateJob(): void {
  if (balanceUpdateInterval) {
    clearInterval(balanceUpdateInterval)
    balanceUpdateInterval = null
    loggers.balance.info('🛑 Balance update job stopped')
  }
}

/**
 * Run a single balance update cycle
 * Updates balances for both legacy (Supabase) and Privy tokens, plus platform wallets
 */
async function runBalanceUpdateCycle(): Promise<void> {
  try {
    // Update legacy Supabase tokens
    await balanceMonitorService.updateAllBalances()

    // Update Privy tokens
    await balanceMonitorService.updateAllPrivyBalances()

    // Update platform wallet balances
    await balanceMonitorService.updatePlatformWallets()
  } catch (error) {
    loggers.balance.error({ error: String(error) }, '❌ Balance update job error')
  }
}

/**
 * Manually trigger a balance update cycle
 */
export async function triggerBalanceUpdate(): Promise<void> {
  loggers.balance.info('💰 Manual balance update triggered')
  await runBalanceUpdateCycle()
}

/**
 * Update balance for a single token (on-demand)
 */
export async function updateSingleTokenBalance(userTokenId: string): Promise<any> {
  return balanceMonitorService.updateSingleTokenBalance(userTokenId)
}

/**
 * Get job status
 */
export function getBalanceUpdateJobStatus(): {
  enabled: boolean
  running: boolean
  intervalSeconds: number
  lastRunAt: Date | null
  updateCount: number
} {
  const status = balanceMonitorService.getStatus()
  return {
    enabled: balanceUpdateInterval !== null,
    running: status.isRunning,
    intervalSeconds: parseInt(process.env.BALANCE_UPDATE_INTERVAL_SECONDS || String(DEFAULT_INTERVAL_SECONDS), 10),
    lastRunAt: status.lastRunAt,
    updateCount: status.updateCount,
  }
}

/**
 * Restart balance update job with new interval
 */
export function restartBalanceUpdateJob(newIntervalSeconds?: number): void {
  if (newIntervalSeconds) {
    process.env.BALANCE_UPDATE_INTERVAL_SECONDS = String(newIntervalSeconds)
  }

  stopBalanceUpdateJob()
  startBalanceUpdateJob()

  loggers.balance.info('🔄 Balance update job restarted')
}
