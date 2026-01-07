// ═══════════════════════════════════════════════════════════════════════════
// CLAIM JOB
// Scheduled job for automated fee claiming across all users
// ═══════════════════════════════════════════════════════════════════════════

import { multiUserClaimService } from '../services/multi-user-claim.service'

let claimJobInterval: NodeJS.Timeout | null = null

/**
 * Start the claim job scheduler
 * Runs hourly by default (configurable via CLAIM_JOB_INTERVAL_MINUTES)
 */
export function startClaimJob(): void {
  const intervalMinutes = parseInt(process.env.CLAIM_JOB_INTERVAL_MINUTES || '60', 10)
  const maxTokensPerCycle = parseInt(process.env.MAX_TOKENS_PER_CLAIM_CYCLE || '100', 10)

  // Check if job is enabled
  if (process.env.CLAIM_JOB_ENABLED === 'false') {
    console.log('ℹ️ Claim job disabled via CLAIM_JOB_ENABLED=false')
    return
  }

  console.log(`\n🔄 Starting claim job scheduler`)
  console.log(`   Interval: every ${intervalMinutes} minutes`)
  console.log(`   Max tokens per cycle: ${maxTokensPerCycle}`)

  // Run immediately on startup (optional - comment out if not desired)
  // setTimeout(() => runClaimCycle(maxTokensPerCycle), 5000)

  // Schedule recurring runs
  claimJobInterval = setInterval(
    () => runClaimCycle(maxTokensPerCycle),
    intervalMinutes * 60 * 1000
  )

  console.log('📅 Claim job scheduled successfully\n')
}

/**
 * Stop the claim job scheduler
 */
export function stopClaimJob(): void {
  if (claimJobInterval) {
    clearInterval(claimJobInterval)
    claimJobInterval = null
    console.log('🛑 Claim job stopped')
  }
}

/**
 * Run a single claim cycle
 */
async function runClaimCycle(maxTokensPerCycle: number): Promise<void> {
  try {
    console.log('\n⏰ Claim job triggered')
    await multiUserClaimService.runBatchClaim(maxTokensPerCycle)
  } catch (error) {
    console.error('❌ Claim job failed:', error)
  }
}

/**
 * Manually trigger a claim cycle (for admin use)
 */
export async function triggerClaimCycle(maxTokens?: number): Promise<void> {
  const max = maxTokens || parseInt(process.env.MAX_TOKENS_PER_CLAIM_CYCLE || '100', 10)
  await runClaimCycle(max)
}

/**
 * Get job status
 */
export function getClaimJobStatus(): {
  enabled: boolean
  running: boolean
  intervalMinutes: number
  lastRunAt: Date | null
} {
  return {
    enabled: claimJobInterval !== null,
    running: multiUserClaimService.isJobRunning(),
    intervalMinutes: parseInt(process.env.CLAIM_JOB_INTERVAL_MINUTES || '60', 10),
    lastRunAt: multiUserClaimService.getLastRunAt(),
  }
}

/**
 * Restart claim job with new interval
 */
export function restartClaimJob(newIntervalMinutes: number): void {
  // Update the environment variable for this session
  process.env.CLAIM_JOB_INTERVAL_MINUTES = String(newIntervalMinutes)

  // Stop existing job
  stopClaimJob()

  // Start with new interval
  startClaimJob()

  console.log(`🔄 Claim job restarted with new interval: ${newIntervalMinutes} minutes`)
}
