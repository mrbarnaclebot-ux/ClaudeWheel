// ═══════════════════════════════════════════════════════════════════════════
// MULTI-USER FLYWHEEL JOB
// Scheduled job for running flywheels across all active users
// ═══════════════════════════════════════════════════════════════════════════

import { multiUserMMService } from '../services/multi-user-mm.service'
import { loggers } from '../utils/logger'

let flywheelJobInterval: NodeJS.Timeout | null = null

/**
 * Start the multi-user flywheel job scheduler
 * Runs every minute by default (configurable via FLYWHEEL_JOB_INTERVAL_MINUTES)
 */
export function startMultiUserFlywheelJob(): void {
  const intervalMinutes = parseInt(process.env.MULTI_USER_FLYWHEEL_INTERVAL_MINUTES || '1', 10)
  const maxTradesPerMinute = parseInt(process.env.MAX_TRADES_PER_MINUTE || '30', 10)

  // Check if job is enabled
  if (process.env.MULTI_USER_FLYWHEEL_ENABLED === 'false') {
    loggers.flywheel.info('ℹ️ Multi-user flywheel job disabled via MULTI_USER_FLYWHEEL_ENABLED=false')
    return
  }

  loggers.flywheel.info({ intervalMinutes, maxTradesPerMinute }, '🔄 Starting multi-user flywheel job scheduler')

  // Run immediately on start (like single-token flywheel does)
  runFlywheelCycle(maxTradesPerMinute)

  // Schedule recurring runs
  flywheelJobInterval = setInterval(
    () => runFlywheelCycle(maxTradesPerMinute),
    intervalMinutes * 60 * 1000
  )

  loggers.flywheel.info('📅 Multi-user flywheel job scheduled successfully')
}

/**
 * Stop the flywheel job scheduler
 */
export function stopMultiUserFlywheelJob(): void {
  if (flywheelJobInterval) {
    clearInterval(flywheelJobInterval)
    flywheelJobInterval = null
    loggers.flywheel.info('🛑 Multi-user flywheel job stopped')
  }
}

/**
 * Run a single flywheel cycle (both legacy encrypted and Privy tokens)
 */
async function runFlywheelCycle(maxTradesPerMinute: number): Promise<void> {
  try {
    loggers.flywheel.info({ maxTradesPerMinute }, '⏰ Multi-user flywheel job triggered')

    // Run legacy encrypted keypair tokens (e.g., WHEEL)
    await multiUserMMService.runFlywheelCycle(maxTradesPerMinute)

    // Run Privy tokens (TMA users)
    await multiUserMMService.runPrivyFlywheelCycle(maxTradesPerMinute)
  } catch (error) {
    loggers.flywheel.error({ error: String(error) }, '❌ Multi-user flywheel job failed')
  }
}

/**
 * Manually trigger a flywheel cycle (for admin use)
 */
export async function triggerFlywheelCycle(maxTrades?: number): Promise<void> {
  const max = maxTrades || parseInt(process.env.MAX_TRADES_PER_MINUTE || '30', 10)
  await runFlywheelCycle(max)
}

/**
 * Get job status
 */
export function getMultiUserFlywheelJobStatus(): {
  enabled: boolean
  running: boolean
  intervalMinutes: number
  maxTradesPerMinute: number
  lastRunAt: Date | null
} {
  return {
    enabled: flywheelJobInterval !== null,
    running: multiUserMMService.isJobRunning(),
    intervalMinutes: parseInt(process.env.MULTI_USER_FLYWHEEL_INTERVAL_MINUTES || '1', 10),
    maxTradesPerMinute: parseInt(process.env.MAX_TRADES_PER_MINUTE || '30', 10),
    lastRunAt: multiUserMMService.getLastRunAt(),
  }
}

/**
 * Restart flywheel job with new settings
 */
export function restartFlywheelJob(newIntervalMinutes?: number, newMaxTrades?: number): void {
  // Update the environment variables for this session
  if (newIntervalMinutes !== undefined) {
    process.env.MULTI_USER_FLYWHEEL_INTERVAL_MINUTES = String(newIntervalMinutes)
  }
  if (newMaxTrades !== undefined) {
    process.env.MAX_TRADES_PER_MINUTE = String(newMaxTrades)
  }

  // Stop existing job
  stopMultiUserFlywheelJob()

  // Start with new settings
  startMultiUserFlywheelJob()

  loggers.flywheel.info({ intervalMinutes: process.env.MULTI_USER_FLYWHEEL_INTERVAL_MINUTES, maxTrades: process.env.MAX_TRADES_PER_MINUTE }, '🔄 Flywheel job restarted')
}
