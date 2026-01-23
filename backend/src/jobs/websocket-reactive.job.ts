// ═══════════════════════════════════════════════════════════════════════════
// WEBSOCKET REACTIVE JOB
// Job wrapper for Helius WebSocket reactive MM service
// ═══════════════════════════════════════════════════════════════════════════

import {
  startHeliusWebSocketService,
  stopHeliusWebSocketService,
  getHeliusWebSocketStatus,
  restartHeliusWebSocketService,
} from '../services/helius-websocket.service'
import { loggers } from '../utils/logger'

/**
 * Start the WebSocket reactive job
 * Gated by WEBSOCKET_REACTIVE_ENABLED env var
 */
export async function startWebSocketReactiveJob(): Promise<void> {
  if (process.env.WEBSOCKET_REACTIVE_ENABLED === 'false') {
    loggers.server.info('WebSocket reactive job disabled via WEBSOCKET_REACTIVE_ENABLED=false')
    return
  }

  await startHeliusWebSocketService()
}

/**
 * Stop the WebSocket reactive job
 */
export async function stopWebSocketReactiveJob(): Promise<void> {
  await stopHeliusWebSocketService()
}

/**
 * Get WebSocket reactive job status
 */
export function getWebSocketReactiveStatus() {
  return getHeliusWebSocketStatus()
}

/**
 * Restart the WebSocket reactive job
 */
export async function restartWebSocketReactiveJob(): Promise<void> {
  await restartHeliusWebSocketService()
}
