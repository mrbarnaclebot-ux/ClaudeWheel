// ═══════════════════════════════════════════════════════════════════════════
// REACTIVE MONITOR JOB
// Initializes real-time transaction monitoring and triggers reactive trades
// Bridges the transaction monitor service with the MM service
// ═══════════════════════════════════════════════════════════════════════════

import { transactionMonitorService } from '../services/transaction-monitor.service'
import { multiUserMMService } from '../services/multi-user-mm.service'
import { loggers } from '../utils/logger'
import { env } from '../config/env'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface TransactionEvent {
  tokenMint: string
  signature: string
  type: 'buy' | 'sell'
  solAmount: number
  timestamp: Date
  privyTokenId: string
  reactiveConfig: {
    minTriggerSol: number
    scalePercent: number
    maxResponsePercent: number
    cooldownMs: number
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB STATE
// ═══════════════════════════════════════════════════════════════════════════

let isInitialized = false

// ═══════════════════════════════════════════════════════════════════════════
// EVENT HANDLER
// ═══════════════════════════════════════════════════════════════════════════

async function handleTransactionEvent(event: TransactionEvent): Promise<void> {
  try {
    loggers.flywheel.info({
      tokenMint: event.tokenMint,
      type: event.type,
      solAmount: event.solAmount,
      signature: event.signature,
    }, `🔔 Processing reactive event: ${event.type.toUpperCase()} ${event.solAmount} SOL`)

    // Execute reactive trade
    const result = await multiUserMMService.executeReactiveTrade(
      event.privyTokenId,
      event.type,
      event.solAmount,
      event.reactiveConfig
    )

    if (result) {
      if (result.success) {
        loggers.flywheel.info({
          tokenSymbol: result.tokenSymbol,
          tradeType: result.tradeType,
          amount: result.amount,
          signature: result.signature,
          triggerSolAmount: event.solAmount,
        }, `✅ Reactive trade completed`)
      } else {
        loggers.flywheel.warn({
          tokenSymbol: result.tokenSymbol,
          error: result.error,
          triggerSolAmount: event.solAmount,
        }, `⚠️ Reactive trade failed`)
      }
    }
  } catch (error) {
    loggers.flywheel.error({
      tokenMint: event.tokenMint,
      error: String(error),
    }, 'Error handling transaction event')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB CONTROL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start the reactive monitor job
 * Initializes transaction monitoring and sets up event handlers
 */
export async function startReactiveMonitorJob(): Promise<void> {
  if (isInitialized) {
    loggers.server.warn('Reactive monitor job already initialized')
    return
  }

  // Check if reactive monitoring is enabled (via env or default)
  const reactiveEnabled = process.env.REACTIVE_MONITOR_ENABLED !== 'false'
  if (!reactiveEnabled) {
    loggers.server.info('Reactive monitor job disabled via REACTIVE_MONITOR_ENABLED=false')
    return
  }

  // Check if WebSocket URL is configured
  if (!env.solanaWsUrl) {
    loggers.server.warn('SOLANA_WS_URL not configured, reactive monitoring disabled')
    return
  }

  loggers.server.info('🚀 Starting reactive monitor job...')

  try {
    // Initialize the transaction monitor service
    await transactionMonitorService.initialize()

    // Set up event listener for detected transactions
    transactionMonitorService.on('transaction', handleTransactionEvent)

    isInitialized = true
    loggers.server.info('✅ Reactive monitor job started successfully')
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Failed to start reactive monitor job')
  }
}

/**
 * Stop the reactive monitor job
 */
export async function stopReactiveMonitorJob(): Promise<void> {
  if (!isInitialized) {
    return
  }

  loggers.server.info('Stopping reactive monitor job...')

  try {
    transactionMonitorService.removeListener('transaction', handleTransactionEvent)
    await transactionMonitorService.shutdown()
    isInitialized = false
    loggers.server.info('Reactive monitor job stopped')
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error stopping reactive monitor job')
  }
}

/**
 * Add a token to reactive monitoring
 */
export async function addTokenToReactiveMonitor(
  tokenMint: string,
  privyTokenId: string,
  opsWalletAddress: string,
  reactiveConfig: {
    minTriggerSol: number
    scalePercent: number
    maxResponsePercent: number
    cooldownMs: number
  }
): Promise<void> {
  if (!isInitialized) {
    loggers.server.warn('Reactive monitor not initialized, cannot add token')
    return
  }

  await transactionMonitorService.addToken(tokenMint, privyTokenId, opsWalletAddress, reactiveConfig)
}

/**
 * Remove a token from reactive monitoring
 */
export async function removeTokenFromReactiveMonitor(tokenMint: string): Promise<void> {
  if (!isInitialized) {
    return
  }

  await transactionMonitorService.removeToken(tokenMint)
}

/**
 * Update reactive config for a monitored token
 */
export function updateTokenReactiveConfig(
  tokenMint: string,
  reactiveConfig: {
    minTriggerSol: number
    scalePercent: number
    maxResponsePercent: number
    cooldownMs: number
  }
): void {
  if (!isInitialized) {
    return
  }

  transactionMonitorService.updateTokenConfig(tokenMint, reactiveConfig)
}

/**
 * Check if reactive monitor is running
 */
export function isReactiveMonitorRunning(): boolean {
  return isInitialized
}

/**
 * Get list of monitored tokens
 */
export function getMonitoredTokens(): string[] {
  if (!isInitialized) {
    return []
  }

  return transactionMonitorService.getMonitoredTokens()
}
