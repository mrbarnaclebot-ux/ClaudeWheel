// ═══════════════════════════════════════════════════════════════════════════
// FAST CLAIM JOB
// High-frequency fee claiming - runs every 30 seconds by default
// Claims fees when they reach >= 0.15 SOL threshold
// Takes 10% platform fee to WHEEL ops wallet, 90% to user's ops wallet
// ═══════════════════════════════════════════════════════════════════════════

import { fastClaimService } from '../services/fast-claim.service'
import { loggers } from '../utils/logger'

let fastClaimJobInterval: NodeJS.Timeout | null = null

// Default interval: 30 seconds (can be configured via env)
const DEFAULT_INTERVAL_SECONDS = 30

/**
 * Start the fast claim job scheduler
 * Runs every 30 seconds by default to quickly claim fees >= 0.15 SOL
 */
export function startFastClaimJob(): void {
  const intervalSeconds = parseInt(process.env.FAST_CLAIM_INTERVAL_SECONDS || String(DEFAULT_INTERVAL_SECONDS), 10)

  // Check if job is enabled
  if (process.env.FAST_CLAIM_JOB_ENABLED === 'false') {
    loggers.claim.info('ℹ️ Fast claim job disabled via FAST_CLAIM_JOB_ENABLED=false')
    return
  }

  const threshold = process.env.FAST_CLAIM_THRESHOLD_SOL || '0.15'

  loggers.claim.info({ intervalSeconds, threshold, platformFee: '10%', userReceives: '90%' }, '⚡ Starting FAST CLAIM job scheduler')

  // Run immediately on startup (after a short delay)
  setTimeout(() => {
    loggers.claim.info('⚡ Running initial fast claim cycle...')
    runFastClaimCycle()
  }, 5000)

  // Schedule recurring runs
  fastClaimJobInterval = setInterval(
    () => runFastClaimCycle(),
    intervalSeconds * 1000
  )

  loggers.claim.info('📅 Fast claim job scheduled successfully')
}

/**
 * Stop the fast claim job scheduler
 */
export function stopFastClaimJob(): void {
  if (fastClaimJobInterval) {
    clearInterval(fastClaimJobInterval)
    fastClaimJobInterval = null
    loggers.claim.info('🛑 Fast claim job stopped')
  }
}

/**
 * Run a single fast claim cycle (both legacy encrypted and Privy tokens)
 */
async function runFastClaimCycle(): Promise<void> {
  try {
    // Run legacy encrypted keypair tokens (e.g., WHEEL)
    await fastClaimService.runFastClaimCycle()

    // Run Privy tokens (TMA users)
    await fastClaimService.runPrivyFastClaimCycle()
  } catch (error) {
    loggers.claim.error({ error: String(error) }, '❌ Fast claim job error')
  }
}

/**
 * Manually trigger a fast claim cycle (for admin/testing)
 */
export async function triggerFastClaimCycle(): Promise<void> {
  loggers.claim.info('⚡ Manual fast claim cycle triggered')
  await runFastClaimCycle()
}

/**
 * Get job status
 */
export function getFastClaimJobStatus(): {
  enabled: boolean
  running: boolean
  intervalSeconds: number
  lastCycleAt: Date | null
  cycleCount: number
  threshold: number
} {
  const status = fastClaimService.getStatus()
  return {
    enabled: fastClaimJobInterval !== null,
    running: status.isRunning,
    intervalSeconds: parseInt(process.env.FAST_CLAIM_INTERVAL_SECONDS || String(DEFAULT_INTERVAL_SECONDS), 10),
    lastCycleAt: status.lastCycleAt,
    cycleCount: status.cycleCount,
    threshold: status.threshold,
  }
}

/**
 * Restart fast claim job with new interval
 */
export function restartFastClaimJob(newIntervalSeconds?: number): void {
  if (newIntervalSeconds) {
    process.env.FAST_CLAIM_INTERVAL_SECONDS = String(newIntervalSeconds)
  }

  stopFastClaimJob()
  startFastClaimJob()

  loggers.claim.info('🔄 Fast claim job restarted')
}
