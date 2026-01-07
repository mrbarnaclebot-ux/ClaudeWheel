// ═══════════════════════════════════════════════════════════════════════════
// MULTI-USER FLYWHEEL JOB
// Scheduled job for running flywheels across all active users
// ═══════════════════════════════════════════════════════════════════════════

import { multiUserMMService } from '../services/multi-user-mm.service'

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
    console.log('ℹ️ Multi-user flywheel job disabled via MULTI_USER_FLYWHEEL_ENABLED=false')
    return
  }

  console.log(`\n🔄 Starting multi-user flywheel job scheduler`)
  console.log(`   Interval: every ${intervalMinutes} minute(s)`)
  console.log(`   Max trades per minute: ${maxTradesPerMinute}`)

  // Schedule recurring runs
  flywheelJobInterval = setInterval(
    () => runFlywheelCycle(maxTradesPerMinute),
    intervalMinutes * 60 * 1000
  )

  console.log('📅 Multi-user flywheel job scheduled successfully\n')
}

/**
 * Stop the flywheel job scheduler
 */
export function stopMultiUserFlywheelJob(): void {
  if (flywheelJobInterval) {
    clearInterval(flywheelJobInterval)
    flywheelJobInterval = null
    console.log('🛑 Multi-user flywheel job stopped')
  }
}

/**
 * Run a single flywheel cycle
 */
async function runFlywheelCycle(maxTradesPerMinute: number): Promise<void> {
  try {
    console.log('\n⏰ Multi-user flywheel job triggered')
    await multiUserMMService.runFlywheelCycle(maxTradesPerMinute)
  } catch (error) {
    console.error('❌ Multi-user flywheel job failed:', error)
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

  console.log(`🔄 Flywheel job restarted with interval: ${process.env.MULTI_USER_FLYWHEEL_INTERVAL_MINUTES}m, max trades: ${process.env.MAX_TRADES_PER_MINUTE}`)
}
