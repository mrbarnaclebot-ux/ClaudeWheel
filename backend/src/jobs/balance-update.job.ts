// ═══════════════════════════════════════════════════════════════════════════
// BALANCE UPDATE JOB
// Periodically updates wallet balances for all active tokens
// Runs every 5 minutes by default
// ═══════════════════════════════════════════════════════════════════════════

import { balanceMonitorService } from '../services/balance-monitor.service'

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
    console.log('ℹ️ Balance update job disabled via BALANCE_UPDATE_JOB_ENABLED=false')
    return
  }

  console.log(`\n💰 Starting BALANCE UPDATE job scheduler`)
  console.log(`   Interval: every ${intervalSeconds} seconds (${(intervalSeconds / 60).toFixed(1)} minutes)`)
  console.log(`   Batch size: ${process.env.BALANCE_UPDATE_BATCH_SIZE || '50'} tokens per cycle`)

  // Run immediately on startup (after a short delay)
  setTimeout(() => {
    console.log('\n💰 Running initial balance update...')
    runBalanceUpdateCycle()
  }, 10000) // 10 second delay to let other services initialize

  // Schedule recurring runs
  balanceUpdateInterval = setInterval(
    () => runBalanceUpdateCycle(),
    intervalSeconds * 1000
  )

  console.log('📅 Balance update job scheduled successfully\n')
}

/**
 * Stop the balance update job scheduler
 */
export function stopBalanceUpdateJob(): void {
  if (balanceUpdateInterval) {
    clearInterval(balanceUpdateInterval)
    balanceUpdateInterval = null
    console.log('🛑 Balance update job stopped')
  }
}

/**
 * Run a single balance update cycle
 */
async function runBalanceUpdateCycle(): Promise<void> {
  try {
    await balanceMonitorService.updateAllBalances()
  } catch (error) {
    console.error('❌ Balance update job error:', error)
  }
}

/**
 * Manually trigger a balance update cycle
 */
export async function triggerBalanceUpdate(): Promise<void> {
  console.log('💰 Manual balance update triggered')
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

  console.log(`🔄 Balance update job restarted`)
}
