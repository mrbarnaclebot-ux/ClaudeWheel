/**
 * Admin WebSocket Server
 * Real-time updates for the admin dashboard
 */

import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'http'
import { verifySignature, isMessageRecent } from '../utils/signature-verify'
import { env } from '../config/env'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type WsChannel =
  | 'job_status'
  | 'transactions'
  | 'launch_updates'
  | 'balance_updates'
  | 'logs'
  | 'flywheel_logs'
  | 'telegram_logs'

export interface WsMessage {
  type: 'subscribe' | 'unsubscribe' | 'auth' | 'ping'
  channel?: WsChannel
  channels?: WsChannel[]
  publicKey?: string
  signature?: string
  message?: string
}

export interface WsEvent {
  channel: WsChannel
  event: string
  data: unknown
  timestamp: string
}

interface AuthenticatedClient {
  ws: WebSocket
  publicKey: string
  subscribedChannels: Set<WsChannel>
  lastPing: number
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBSOCKET SERVER
// ═══════════════════════════════════════════════════════════════════════════

class AdminWebSocketServer {
  private wss: WebSocketServer | null = null
  private clients: Map<WebSocket, AuthenticatedClient> = new Map()
  private pingInterval: NodeJS.Timeout | null = null

  /**
   * Initialize WebSocket server attached to HTTP server
   */
  init(server: Server): void {
    if (this.wss) {
      console.log('WebSocket server already initialized')
      return
    }

    this.wss = new WebSocketServer({ server, path: '/ws/admin' })

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WS] New connection')

      ws.on('message', (data: Buffer) => {
        try {
          const message: WsMessage = JSON.parse(data.toString())
          this.handleMessage(ws, message)
        } catch (err) {
          console.error('[WS] Invalid message:', err)
          ws.send(JSON.stringify({ error: 'Invalid message format' }))
        }
      })

      ws.on('close', () => {
        this.clients.delete(ws)
        console.log('[WS] Client disconnected')
      })

      ws.on('error', (err) => {
        console.error('[WS] Client error:', err)
        this.clients.delete(ws)
      })

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to admin WebSocket. Please authenticate.',
      }))
    })

    // Start ping interval to keep connections alive
    this.pingInterval = setInterval(() => {
      this.pingClients()
    }, 30000)

    console.log('[WS] Admin WebSocket server initialized on /ws/admin')
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: WebSocket, message: WsMessage): void {
    switch (message.type) {
      case 'auth':
        this.handleAuth(ws, message)
        break
      case 'subscribe':
        this.handleSubscribe(ws, message)
        break
      case 'unsubscribe':
        this.handleUnsubscribe(ws, message)
        break
      case 'ping':
        this.handlePing(ws)
        break
      default:
        ws.send(JSON.stringify({ error: 'Unknown message type' }))
    }
  }

  /**
   * Authenticate a WebSocket client
   */
  private handleAuth(ws: WebSocket, message: WsMessage): void {
    const { publicKey, signature, message: signedMessage } = message

    if (!publicKey || !signature || !signedMessage) {
      ws.send(JSON.stringify({ type: 'auth_error', error: 'Missing auth credentials' }))
      return
    }

    // Verify public key matches dev wallet
    if (publicKey !== env.devWalletAddress) {
      ws.send(JSON.stringify({ type: 'auth_error', error: 'Unauthorized wallet' }))
      return
    }

    // Verify message is recent (5 minute window for WebSocket)
    if (!isMessageRecent(signedMessage, 5 * 60 * 1000)) {
      ws.send(JSON.stringify({ type: 'auth_error', error: 'Auth message expired' }))
      return
    }

    // Verify signature
    const result = verifySignature(signedMessage, signature, publicKey)
    if (!result.valid) {
      ws.send(JSON.stringify({ type: 'auth_error', error: 'Invalid signature' }))
      return
    }

    // Store authenticated client
    this.clients.set(ws, {
      ws,
      publicKey,
      subscribedChannels: new Set(),
      lastPing: Date.now(),
    })

    ws.send(JSON.stringify({
      type: 'auth_success',
      message: 'Authentication successful',
    }))

    console.log(`[WS] Client authenticated: ${publicKey.slice(0, 8)}...`)
  }

  /**
   * Subscribe to channels
   */
  private handleSubscribe(ws: WebSocket, message: WsMessage): void {
    const client = this.clients.get(ws)
    if (!client) {
      ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }))
      return
    }

    const channels = message.channels || (message.channel ? [message.channel] : [])

    for (const channel of channels) {
      client.subscribedChannels.add(channel)
    }

    ws.send(JSON.stringify({
      type: 'subscribed',
      channels: Array.from(client.subscribedChannels),
    }))

    console.log(`[WS] Client subscribed to: ${channels.join(', ')}`)
  }

  /**
   * Unsubscribe from channels
   */
  private handleUnsubscribe(ws: WebSocket, message: WsMessage): void {
    const client = this.clients.get(ws)
    if (!client) {
      ws.send(JSON.stringify({ type: 'error', error: 'Not authenticated' }))
      return
    }

    const channels = message.channels || (message.channel ? [message.channel] : [])

    for (const channel of channels) {
      client.subscribedChannels.delete(channel)
    }

    ws.send(JSON.stringify({
      type: 'unsubscribed',
      channels: Array.from(client.subscribedChannels),
    }))
  }

  /**
   * Handle ping from client
   */
  private handlePing(ws: WebSocket): void {
    const client = this.clients.get(ws)
    if (client) {
      client.lastPing = Date.now()
    }
    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
  }

  /**
   * Ping all clients and remove stale connections
   */
  private pingClients(): void {
    const now = Date.now()
    const staleTimeout = 60000 // 1 minute

    this.clients.forEach((client, ws) => {
      if (now - client.lastPing > staleTimeout) {
        console.log('[WS] Removing stale client')
        ws.terminate()
        this.clients.delete(ws)
        return
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.ping()
      }
    })
  }

  /**
   * Broadcast event to all subscribed clients
   */
  broadcast(channel: WsChannel, event: string, data: unknown): void {
    const message: WsEvent = {
      channel,
      event,
      data,
      timestamp: new Date().toISOString(),
    }

    const messageStr = JSON.stringify(message)

    this.clients.forEach((client) => {
      if (client.subscribedChannels.has(channel) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(messageStr)
      }
    })
  }

  /**
   * Get count of connected clients
   */
  getClientCount(): number {
    return this.clients.size
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }

    this.clients.forEach((client) => {
      client.ws.close()
    })
    this.clients.clear()

    if (this.wss) {
      this.wss.close()
      this.wss = null
    }

    console.log('[WS] Admin WebSocket server shutdown')
  }
}

// Export singleton instance
export const adminWs = new AdminWebSocketServer()

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS FOR EMITTING EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Emit job status update
 */
export function emitJobStatus(jobName: string, status: {
  running: boolean
  enabled: boolean
  lastRunAt: string | null
  intervalMinutes: number
}): void {
  adminWs.broadcast('job_status', 'job_update', { job: jobName, ...status })
}

/**
 * Emit transaction event
 */
export function emitTransaction(tx: {
  type: 'buy' | 'sell' | 'claim' | 'transfer'
  tokenSymbol: string
  tokenId: string
  amount: number
  token?: string
  signature?: string
  status: 'pending' | 'success' | 'failed'
}): void {
  adminWs.broadcast('transactions', 'transaction', tx)
}

/**
 * Emit launch update
 */
export function emitLaunchUpdate(launch: {
  id: string
  status: string
  tokenSymbol: string
  telegramUsername?: string
  depositReceived?: number
}): void {
  adminWs.broadcast('launch_updates', 'launch_update', launch)
}

/**
 * Emit balance update
 */
export function emitBalanceUpdate(balance: {
  walletAddress: string
  walletType: 'dev' | 'ops'
  solBalance: number
  tokenBalance?: number
  tokenSymbol?: string
}): void {
  adminWs.broadcast('balance_updates', 'balance_update', balance)
}

/**
 * Emit flywheel log
 */
export function emitFlywheelLog(log: {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  tokenSymbol?: string
  tokenId?: string
  phase?: string
  details?: unknown
}): void {
  adminWs.broadcast('flywheel_logs', 'log', {
    ...log,
    timestamp: new Date().toISOString(),
    source: 'flywheel',
  })
}

/**
 * Emit telegram bot log
 */
export function emitTelegramLog(log: {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  telegramId?: number
  username?: string
  event?: string
  details?: unknown
}): void {
  adminWs.broadcast('telegram_logs', 'log', {
    ...log,
    timestamp: new Date().toISOString(),
    source: 'telegram',
  })
}

/**
 * Emit general system log
 */
export function emitSystemLog(log: {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source?: string
  details?: unknown
}): void {
  adminWs.broadcast('logs', 'log', {
    ...log,
    timestamp: new Date().toISOString(),
  })
}
