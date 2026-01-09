// ═══════════════════════════════════════════════════════════════════════════
// WHEEL TOKEN FLYWHEEL JOB
// Scheduled job for running the platform WHEEL token flywheel
// Combines claiming and market making in one job
// ═══════════════════════════════════════════════════════════════════════════

import { wheelMMService } from '../services/wheel-mm.service'
import { wheelClaimService } from '../services/wheel-claim.service'
import { loggers } from '../utils/logger'

let wheelFlywheelInterval: NodeJS.Timeout | null = null
let wheelClaimInterval: NodeJS.Timeout | null = null

// ═══════════════════════════════════════════════════════════════════════════
// JOB SCHEDULER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start the WHEEL token flywheel job scheduler
 * - Claim job: Every 30 seconds (claims when above threshold)
 * - Flywheel job: Every 1 minute (buy/sell cycle)
 */
export function startWheelFlywheelJob(): void {
  const flywheelIntervalMinutes = parseInt(process.env.WHEEL_FLYWHEEL_INTERVAL_MINUTES || '1', 10)
  const claimIntervalSeconds = parseInt(process.env.WHEEL_CLAIM_INTERVAL_SECONDS || '30', 10)

  // Check if WHEEL flywheel is enabled
  if (process.env.WHEEL_FLYWHEEL_ENABLED === 'false') {
    loggers.flywheel.info('WHEEL flywheel job disabled via WHEEL_FLYWHEEL_ENABLED=false')
    return
  }

  loggers.flywheel.info({
    flywheelIntervalMinutes,
    claimIntervalSeconds,
  }, '🔷 Starting WHEEL token flywheel job scheduler')

  // Start claim job (every 30 seconds by default)
  runWheelClaimCycle() // Run immediately
  wheelClaimInterval = setInterval(
    () => runWheelClaimCycle(),
    claimIntervalSeconds * 1000
  )

  // Start flywheel job (every 1 minute by default)
  runWheelFlywheelCycle() // Run immediately
  wheelFlywheelInterval = setInterval(
    () => runWheelFlywheelCycle(),
    flywheelIntervalMinutes * 60 * 1000
  )

  loggers.flywheel.info('📅 WHEEL flywheel job scheduled successfully')
}

/**
 * Stop the WHEEL flywheel job scheduler
 */
export function stopWheelFlywheelJob(): void {
  if (wheelFlywheelInterval) {
    clearInterval(wheelFlywheelInterval)
    wheelFlywheelInterval = null
  }
  if (wheelClaimInterval) {
    clearInterval(wheelClaimInterval)
    wheelClaimInterval = null
  }
  loggers.flywheel.info('🛑 WHEEL flywheel job stopped')
}

/**
 * Run a single WHEEL claim cycle
 */
async function runWheelClaimCycle(): Promise<void> {
  try {
    await wheelClaimService.runClaimCycle()
  } catch (error) {
    loggers.claim.error({ error: String(error) }, '❌ WHEEL claim cycle failed')
  }
}

/**
 * Run a single WHEEL flywheel cycle
 */
async function runWheelFlywheelCycle(): Promise<void> {
  try {
    loggers.flywheel.info('⏰ WHEEL flywheel job triggered')
    await wheelMMService.runFlywheelCycle()
  } catch (error) {
    loggers.flywheel.error({ error: String(error) }, '❌ WHEEL flywheel cycle failed')
  }
}

/**
 * Manually trigger a WHEEL flywheel cycle (for admin use)
 */
export async function triggerWheelFlywheelCycle(): Promise<void> {
  await runWheelFlywheelCycle()
}

/**
 * Manually trigger a WHEEL claim cycle (for admin use)
 */
export async function triggerWheelClaimCycle(): Promise<void> {
  await runWheelClaimCycle()
}

/**
 * Get WHEEL flywheel job status
 */
export function getWheelFlywheelJobStatus(): {
  enabled: boolean
  flywheelRunning: boolean
  claimRunning: boolean
  mmStatus: ReturnType<typeof wheelMMService.getStatus>
  claimStatus: ReturnType<typeof wheelClaimService.getStatus>
} {
  return {
    enabled: wheelFlywheelInterval !== null,
    flywheelRunning: wheelFlywheelInterval !== null,
    claimRunning: wheelClaimInterval !== null,
    mmStatus: wheelMMService.getStatus(),
    claimStatus: wheelClaimService.getStatus(),
  }
}

/**
 * Restart WHEEL flywheel job with new settings
 */
export function restartWheelFlywheelJob(): void {
  stopWheelFlywheelJob()
  startWheelFlywheelJob()
  loggers.flywheel.info('🔄 WHEEL flywheel job restarted')
}
