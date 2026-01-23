// ═══════════════════════════════════════════════════════════════════════════
// HELIUS WEBSOCKET SERVICE
// WebSocket-based reactive MM using logsSubscribe for lower latency (~200-500ms)
// Uses a single WebSocket connection with multiple subscriptions for efficiency
// ═══════════════════════════════════════════════════════════════════════════

import WebSocket from 'ws'
import { ParsedTransactionWithMeta } from '@solana/web3.js'
import { loggers } from '../utils/logger'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { getConnection } from '../config/solana'
import { multiUserMMService } from './multi-user-mm.service'
import { env } from '../config/env'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface TokenSubscription {
  subscriptionId: number | null
  tokenMint: string
  privyTokenId: string
  opsWalletAddress: string
  devWalletAddress: string | null
  reactiveConfig: ReactiveConfig
}

interface ReactiveConfig {
  minTriggerSol: number
  scalePercent: number
  maxResponsePercent: number
  cooldownMs: number
}

interface LogNotification {
  method: 'logsNotification'
  params: {
    subscription: number
    result: {
      value: {
        signature: string
        err: unknown | null
        logs: string[]
      }
    }
  }
}

interface SubscriptionResult {
  id: number
  result: number
}

// Swap program IDs to filter relevant transactions
const SWAP_PROGRAM_IDS = [
  'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', // Bags.fm AMM (bonding curve)
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter v6
  'JUP', // Jupiter (short prefix for older versions)
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', // Orca Whirlpool
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
  '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // pump.fun
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', // Meteora LB
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB', // Meteora pools
]

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

// Single WebSocket connection
let ws: WebSocket | null = null
let isConnecting = false

// Subscriptions by token mint
const subscriptions = new Map<string, TokenSubscription>()

// Pending subscription requests (request ID → token mint)
const pendingSubscriptions = new Map<number, string>()
let nextRequestId = 1

// Processed signatures (deduplication)
const processedSignatures = new Set<string>()
const SIGNATURE_CLEANUP_THRESHOLD = 4000

// Intervals
let tokenRefreshInterval: NodeJS.Timeout | null = null
let pingInterval: NodeJS.Timeout | null = null
let reconnectTimeout: NodeJS.Timeout | null = null

const TOKEN_REFRESH_INTERVAL_MS = 60000 // Refresh every minute
const PING_INTERVAL_MS = 30000
const CONNECTION_TIMEOUT_MS = 10000

// Reconnection settings
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 60000

// Service state
let isRunning = false
let startedAt: Date | null = null
let lastPong: number = Date.now()

// ═══════════════════════════════════════════════════════════════════════════
// WEBSOCKET CONNECTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Helius WebSocket URL
 */
function getWebSocketUrl(): string {
  const apiKey = env.heliusApiKey
  if (!apiKey) {
    throw new Error('HELIUS_API_KEY not configured')
  }
  return `wss://mainnet.helius-rpc.com/?api-key=${apiKey}`
}

/**
 * Connect to Helius WebSocket
 */
async function connect(): Promise<boolean> {
  if (isConnecting || (ws && ws.readyState === WebSocket.OPEN)) {
    return true
  }

  isConnecting = true

  try {
    const wsUrl = getWebSocketUrl()

    loggers.server.info({
      attempt: reconnectAttempts + 1,
    }, '🔌 [WS] Connecting to Helius WebSocket')

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        isConnecting = false
        if (ws) {
          ws.terminate()
          ws = null
        }
        loggers.server.warn('🔌 [WS] Connection timeout')
        resolve(false)
      }, CONNECTION_TIMEOUT_MS)

      ws = new WebSocket(wsUrl)

      ws.on('open', () => {
        clearTimeout(timeout)
        isConnecting = false
        reconnectAttempts = 0
        lastPong = Date.now()

        loggers.server.info('✅ [WS] Connected to Helius WebSocket')

        // Start keepalive
        startKeepalive()

        // Re-subscribe to all tokens
        resubscribeAll()

        resolve(true)
      })

      ws.on('message', (data: Buffer) => {
        // Use setImmediate to handle async without blocking
        setImmediate(() => {
          handleMessage(data).catch(err => {
            loggers.server.error({ error: String(err) }, '❌ [WS] Error handling message')
          })
        })
      })

      ws.on('close', (code: number, reason: Buffer) => {
        clearTimeout(timeout)
        isConnecting = false
        loggers.server.warn({
          code,
          reason: reason.toString(),
        }, '🔌 [WS] Connection closed')

        stopKeepalive()
        ws = null

        // Clear all subscription IDs (they're invalid after disconnect)
        for (const sub of subscriptions.values()) {
          sub.subscriptionId = null
        }
        pendingSubscriptions.clear()

        // Schedule reconnect if still running
        if (isRunning) {
          scheduleReconnect()
        }
      })

      ws.on('error', (err: Error) => {
        clearTimeout(timeout)
        isConnecting = false
        loggers.server.error({ error: err.message }, '❌ [WS] Connection error')
        resolve(false)
      })

      ws.on('pong', () => {
        lastPong = Date.now()
      })
    })
  } catch (error) {
    isConnecting = false
    loggers.server.error({ error: String(error) }, '❌ [WS] Failed to create connection')
    return false
  }
}

/**
 * Handle incoming WebSocket messages
 */
async function handleMessage(data: Buffer): Promise<void> {
  try {
    const message = JSON.parse(data.toString())

    // Handle subscription confirmation
    if (message.id !== undefined && message.result !== undefined) {
      handleSubscriptionResult(message as SubscriptionResult)
      return
    }

    // Handle log notification
    if (message.method === 'logsNotification') {
      await handleLogNotification(message as LogNotification)
    }
  } catch (error) {
    loggers.server.error({ error: String(error) }, '❌ [WS] Failed to parse message')
  }
}

/**
 * Handle subscription result
 */
function handleSubscriptionResult(result: SubscriptionResult): void {
  const tokenMint = pendingSubscriptions.get(result.id)
  if (!tokenMint) return

  pendingSubscriptions.delete(result.id)

  const sub = subscriptions.get(tokenMint)
  if (sub) {
    sub.subscriptionId = result.result
    loggers.server.info({
      tokenMint: tokenMint.slice(0, 8) + '...',
      subscriptionId: result.result,
    }, '✅ [WS] Subscription confirmed')
  }
}

/**
 * Handle log notification
 */
async function handleLogNotification(notification: LogNotification): Promise<void> {
  try {
    const { signature, err, logs } = notification.params.result.value
    const subscriptionId = notification.params.subscription

    // Log every notification received (for debugging)
    loggers.server.info({
      signature: signature.slice(0, 16) + '...',
      subscriptionId,
      logsCount: logs.length,
      hasError: err !== null,
    }, '📨 [WS] Log notification received')

    // Skip failed transactions
    if (err !== null) {
      loggers.server.debug({ signature: signature.slice(0, 16) + '...' }, '[WS] Skipping failed tx')
      return
    }

    // Find the subscription by ID
    let tokenSub: TokenSubscription | null = null
    for (const sub of subscriptions.values()) {
      if (sub.subscriptionId === subscriptionId) {
        tokenSub = sub
        break
      }
    }

    if (!tokenSub) {
      loggers.server.warn({ subscriptionId }, '[WS] Unknown subscription ID')
      return
    }

    // Skip if already processed (deduplication)
    if (processedSignatures.has(signature)) {
      loggers.server.debug({ signature: signature.slice(0, 16) + '...' }, '[WS] Duplicate signature')
      return
    }

    // Add to processed set with cleanup
    processedSignatures.add(signature)
    if (processedSignatures.size > SIGNATURE_CLEANUP_THRESHOLD) {
      const toDelete = Array.from(processedSignatures).slice(0, Math.floor(processedSignatures.size / 2))
      toDelete.forEach(sig => processedSignatures.delete(sig))
      loggers.server.debug({ remaining: processedSignatures.size }, '[WS] Cleaned up processed signatures')
    }

    // Quick filter: check if logs contain swap program IDs
    const logsStr = logs.join(' ')
    const isSwap = SWAP_PROGRAM_IDS.some(id => logsStr.includes(id))

    // Log first few log lines for debugging
    loggers.server.info({
      signature: signature.slice(0, 16) + '...',
      isSwap,
      logSample: logs.slice(0, 3).join(' | ').slice(0, 200),
    }, isSwap ? '✅ [WS] Detected as swap' : '⏭️ [WS] Not a swap, skipping')

    if (!isSwap) {
      return
    }

    loggers.server.info({
      signature: signature.slice(0, 16) + '...',
      tokenMint: tokenSub.tokenMint.slice(0, 8) + '...',
    }, '📥 [WS] Processing swap transaction')

    // Fetch full transaction details
    await processTransaction(signature, tokenSub)
  } catch (error) {
    loggers.server.error({ error: String(error) }, '❌ [WS] Error in handleLogNotification')
  }
}

/**
 * Process a transaction
 */
async function processTransaction(signature: string, tokenSub: TokenSubscription): Promise<void> {
  const connection = getConnection()
  let parsedTx: ParsedTransactionWithMeta | null = null

  try {
    // Small delay to ensure transaction is indexed
    await sleep(200)

    parsedTx = await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    })
  } catch (error) {
    loggers.server.warn({
      signature: signature.slice(0, 16) + '...',
      error: String(error),
    }, '[WS] Failed to fetch transaction')
    return
  }

  if (!parsedTx) {
    loggers.server.warn({ signature: signature.slice(0, 16) + '...' }, '[WS] Transaction not found')
    return
  }

  // Skip own transactions (check both ops and dev wallets)
  const feePayer = parsedTx.transaction.message.accountKeys[0]?.pubkey.toString()
  if (feePayer === tokenSub.opsWalletAddress || feePayer === tokenSub.devWalletAddress) {
    loggers.server.debug({ signature: signature.slice(0, 16) + '...' }, '[WS] Skipping own transaction')
    return
  }

  // Parse trade type and SOL amount
  const { tradeType, solAmount } = parseTransactionDetails(parsedTx, tokenSub.tokenMint, tokenSub.opsWalletAddress)

  if (solAmount === 0) {
    loggers.server.debug({ signature: signature.slice(0, 16) + '...' }, '[WS] No SOL amount detected')
    return
  }

  // Check minimum threshold
  if (solAmount < tokenSub.reactiveConfig.minTriggerSol) {
    loggers.server.debug({
      signature: signature.slice(0, 16) + '...',
      solAmount,
      minTrigger: tokenSub.reactiveConfig.minTriggerSol,
    }, '[WS] Transaction below threshold')
    return
  }

  loggers.server.info({
    signature: signature.slice(0, 16) + '...',
    tokenMint: tokenSub.tokenMint.slice(0, 8) + '...',
    tradeType,
    solAmount,
  }, `🎯 [WS] Triggering reactive ${tradeType === 'buy' ? 'SELL' : 'BUY'} for ${solAmount.toFixed(4)} SOL trade`)

  // Execute reactive trade
  const result = await multiUserMMService.executeReactiveTrade(
    tokenSub.privyTokenId,
    tradeType,
    solAmount,
    tokenSub.reactiveConfig
  )

  if (result) {
    if (result.success) {
      loggers.server.info({
        tokenSymbol: result.tokenSymbol,
        tradeType: result.tradeType,
        amount: result.amount,
        responseSignature: result.signature,
        triggerSignature: signature,
        latencySource: 'websocket',
      }, '✅ [WS] Reactive trade completed')
    } else {
      loggers.server.warn({
        tokenSymbol: result.tokenSymbol,
        error: result.error,
        triggerSignature: signature,
      }, '⚠️ [WS] Reactive trade failed')
    }
  }
}

/**
 * Parse transaction to extract trade type and SOL amount
 * Uses the fee payer's perspective to determine direction
 */
function parseTransactionDetails(
  parsedTx: ParsedTransactionWithMeta,
  tokenMint: string,
  opsWalletAddress: string
): { tradeType: 'buy' | 'sell'; solAmount: number } {
  let tradeType: 'buy' | 'sell' = 'buy'
  let solAmount = 0

  try {
    const accountKeys = parsedTx.transaction.message.accountKeys
    const preBalances = parsedTx.meta?.preBalances || []
    const postBalances = parsedTx.meta?.postBalances || []
    const preTokenBalances = parsedTx.meta?.preTokenBalances || []
    const postTokenBalances = parsedTx.meta?.postTokenBalances || []

    // Get fee payer (usually index 0) - this is the trader
    const feePayer = accountKeys[0]?.pubkey.toString()
    const feePayerIndex = 0

    // Calculate SOL change for fee payer
    const feePayerSolChange = (postBalances[feePayerIndex] - preBalances[feePayerIndex]) / 1e9
    solAmount = Math.abs(feePayerSolChange)

    // Find token balance change for fee payer
    let feePayerTokenChange = 0
    for (const postBalance of postTokenBalances) {
      if (postBalance.mint !== tokenMint) continue

      const owner = accountKeys[postBalance.accountIndex]?.pubkey.toString()
      if (owner === feePayer || owner === opsWalletAddress) continue // Skip our wallets

      const preBalance = preTokenBalances.find(
        pre => pre.accountIndex === postBalance.accountIndex && pre.mint === tokenMint
      )
      const preAmount = preBalance ? parseFloat(preBalance.uiTokenAmount.uiAmountString || '0') : 0
      const postAmount = parseFloat(postBalance.uiTokenAmount.uiAmountString || '0')
      const change = postAmount - preAmount

      // Use the first significant token balance change we find
      if (Math.abs(change) > 0.001) {
        feePayerTokenChange = change
        break
      }
    }

    // Determine trade type:
    // - If trader gained tokens and lost SOL → they bought (we sell)
    // - If trader lost tokens and gained SOL → they sold (we buy)
    if (feePayerTokenChange > 0 && feePayerSolChange < 0) {
      tradeType = 'buy' // Trader bought tokens, we counter with sell
    } else if (feePayerTokenChange < 0 && feePayerSolChange > 0) {
      tradeType = 'sell' // Trader sold tokens, we counter with buy
    } else if (feePayerSolChange < -0.001) {
      // Fallback: significant SOL outflow = likely a buy
      tradeType = 'buy'
    } else if (feePayerSolChange > 0.001) {
      // Fallback: significant SOL inflow = likely a sell
      tradeType = 'sell'
    }

    // If SOL change is too small, look at total balance changes
    if (solAmount < 0.01) {
      for (let i = 0; i < preBalances.length; i++) {
        const change = Math.abs(postBalances[i] - preBalances[i]) / 1e9
        if (change > solAmount && change > 0.01) {
          solAmount = change
        }
      }
    }
  } catch (error) {
    loggers.server.warn({
      signature: parsedTx.transaction.signatures[0]?.slice(0, 16) + '...',
      error: String(error),
    }, '[WS] Error parsing transaction details')
  }

  return { tradeType, solAmount }
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Subscribe to logs for a token
 */
function subscribe(tokenMint: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return
  }

  const requestId = nextRequestId++
  pendingSubscriptions.set(requestId, tokenMint)

  const subscribeMsg = {
    jsonrpc: '2.0',
    id: requestId,
    method: 'logsSubscribe',
    params: [
      { mentions: [tokenMint] },
      { commitment: 'confirmed' },
    ],
  }

  ws.send(JSON.stringify(subscribeMsg))

  loggers.server.info({
    tokenMint: tokenMint.slice(0, 8) + '...',
    requestId,
  }, '📡 [WS] Subscribing to token')
}

/**
 * Unsubscribe from logs for a token
 */
function unsubscribe(tokenMint: string): void {
  const sub = subscriptions.get(tokenMint)
  if (!sub || !sub.subscriptionId || !ws || ws.readyState !== WebSocket.OPEN) {
    return
  }

  const unsubscribeMsg = {
    jsonrpc: '2.0',
    id: nextRequestId++,
    method: 'logsUnsubscribe',
    params: [sub.subscriptionId],
  }

  ws.send(JSON.stringify(unsubscribeMsg))

  loggers.server.info({
    tokenMint: tokenMint.slice(0, 8) + '...',
    subscriptionId: sub.subscriptionId,
  }, '📡 [WS] Unsubscribed from token')

  sub.subscriptionId = null
}

/**
 * Re-subscribe to all tokens after reconnect
 */
function resubscribeAll(): void {
  for (const tokenMint of subscriptions.keys()) {
    subscribe(tokenMint)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KEEPALIVE
// ═══════════════════════════════════════════════════════════════════════════

function startKeepalive(): void {
  stopKeepalive()

  pingInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.ping()

      // Check for stale connection (no pong received)
      if (Date.now() - lastPong > PING_INTERVAL_MS * 2) {
        loggers.server.warn('🔌 [WS] Connection stale, reconnecting')
        ws.terminate()
      }
    }
  }, PING_INTERVAL_MS)
}

function stopKeepalive(): void {
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RECONNECTION
// ═══════════════════════════════════════════════════════════════════════════

function scheduleReconnect(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
  }

  reconnectAttempts++

  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    loggers.server.error({
      attempts: reconnectAttempts,
    }, '❌ [WS] Max reconnect attempts reached, will retry on next token refresh')
    return
  }

  // Exponential backoff: 1s, 2s, 4s, 8s, ... up to 60s
  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts - 1),
    RECONNECT_MAX_DELAY_MS
  )

  loggers.server.info({
    attempt: reconnectAttempts,
    delayMs: delay,
  }, '🔄 [WS] Scheduling reconnect')

  reconnectTimeout = setTimeout(async () => {
    await connect()
  }, delay)
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load reactive tokens from database and sync subscriptions
 */
async function refreshTokenSubscriptions(): Promise<void> {
  if (!isPrismaConfigured()) return

  try {
    const tokens = await prisma.privyTokenConfig.findMany({
      where: {
        reactiveEnabled: true,
        flywheelActive: true,
        algorithmMode: 'transaction_reactive',
      },
      include: {
        token: {
          include: {
            opsWallet: true,
            devWallet: true,
          },
        },
      },
    })

    const activeTokenMints = new Set<string>()

    for (const config of tokens) {
      if (!config.token || !config.token.opsWallet) continue

      const tokenMint = config.token.tokenMintAddress
      activeTokenMints.add(tokenMint)

      const reactiveConfig: ReactiveConfig = {
        minTriggerSol: Number(config.reactiveMinTriggerSol),
        scalePercent: config.reactiveScalePercent,
        maxResponsePercent: config.reactiveMaxResponsePercent,
        cooldownMs: config.reactiveCooldownMs,
      }

      // Check if subscription already exists
      const existing = subscriptions.get(tokenMint)
      if (existing) {
        // Update config
        existing.reactiveConfig = reactiveConfig
        existing.opsWalletAddress = config.token.opsWallet.walletAddress
        existing.devWalletAddress = config.token.devWallet?.walletAddress || null
      } else {
        // Create new subscription
        const sub: TokenSubscription = {
          subscriptionId: null,
          tokenMint,
          privyTokenId: config.privyTokenId,
          opsWalletAddress: config.token.opsWallet.walletAddress,
          devWalletAddress: config.token.devWallet?.walletAddress || null,
          reactiveConfig,
        }
        subscriptions.set(tokenMint, sub)

        // Subscribe if connected
        if (ws && ws.readyState === WebSocket.OPEN) {
          subscribe(tokenMint)
        }
      }
    }

    // Unsubscribe and remove tokens that are no longer active
    for (const [tokenMint] of subscriptions) {
      if (!activeTokenMints.has(tokenMint)) {
        loggers.server.info({
          tokenMint: tokenMint.slice(0, 8) + '...',
        }, '🔌 [WS] Removing inactive token subscription')
        unsubscribe(tokenMint)
        subscriptions.delete(tokenMint)
      }
    }

    // Ensure connection is established
    if (subscriptions.size > 0 && (!ws || ws.readyState !== WebSocket.OPEN)) {
      reconnectAttempts = 0 // Reset for fresh connection attempt
      await connect()
    }

    loggers.server.info({
      totalSubscriptions: subscriptions.size,
      activeSubscriptions: Array.from(subscriptions.values()).filter(s => s.subscriptionId !== null).length,
      connected: ws?.readyState === WebSocket.OPEN,
    }, '🔄 [WS] Token subscriptions refreshed')
  } catch (error) {
    loggers.server.error({ error: String(error) }, '❌ [WS] Failed to refresh token subscriptions')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Start the WebSocket reactive service
 */
export async function startHeliusWebSocketService(): Promise<void> {
  if (isRunning) {
    loggers.server.warn('[WS] Service already running')
    return
  }

  if (!env.heliusApiKey) {
    loggers.server.warn('[WS] HELIUS_API_KEY not configured, skipping WebSocket service')
    return
  }

  isRunning = true
  startedAt = new Date()

  loggers.server.info('🚀 [WS] Starting Helius WebSocket reactive service')

  // Initial subscription setup
  await refreshTokenSubscriptions()

  // Start token refresh interval
  tokenRefreshInterval = setInterval(async () => {
    await refreshTokenSubscriptions()
  }, TOKEN_REFRESH_INTERVAL_MS)

  loggers.server.info({
    subscriptionCount: subscriptions.size,
    refreshIntervalMs: TOKEN_REFRESH_INTERVAL_MS,
  }, '✅ [WS] Helius WebSocket service started')
}

/**
 * Stop the WebSocket reactive service
 */
export async function stopHeliusWebSocketService(): Promise<void> {
  if (!isRunning) {
    return
  }

  loggers.server.info('🛑 [WS] Stopping Helius WebSocket reactive service')

  isRunning = false

  // Stop intervals
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval)
    tokenRefreshInterval = null
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }

  stopKeepalive()

  // Unsubscribe all and close connection
  for (const tokenMint of subscriptions.keys()) {
    unsubscribe(tokenMint)
  }
  subscriptions.clear()
  pendingSubscriptions.clear()

  if (ws) {
    try {
      ws.close(1000, 'Service shutdown')
    } catch {
      // Ignore close errors
    }
    ws = null
  }

  processedSignatures.clear()
  startedAt = null
  reconnectAttempts = 0

  loggers.server.info('✅ [WS] Helius WebSocket service stopped')
}

/**
 * Get service status
 */
export function getHeliusWebSocketStatus(): {
  running: boolean
  startedAt: string | null
  connected: boolean
  totalSubscriptions: number
  activeSubscriptions: number
  processedSignatures: number
  reconnectAttempts: number
  subscriptions: Array<{
    tokenMint: string
    subscriptionId: number | null
    active: boolean
  }>
} {
  const subs = Array.from(subscriptions.values()).map(sub => ({
    tokenMint: sub.tokenMint.slice(0, 8) + '...' + sub.tokenMint.slice(-4),
    subscriptionId: sub.subscriptionId,
    active: sub.subscriptionId !== null,
  }))

  return {
    running: isRunning,
    startedAt: startedAt?.toISOString() || null,
    connected: ws?.readyState === WebSocket.OPEN,
    totalSubscriptions: subscriptions.size,
    activeSubscriptions: subs.filter(s => s.active).length,
    processedSignatures: processedSignatures.size,
    reconnectAttempts,
    subscriptions: subs,
  }
}

/**
 * Restart the service
 */
export async function restartHeliusWebSocketService(): Promise<void> {
  loggers.server.info('🔄 [WS] Restarting Helius WebSocket service')
  await stopHeliusWebSocketService()
  await sleep(1000)
  await startHeliusWebSocketService()
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
