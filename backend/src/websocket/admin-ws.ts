/**
 * Admin WebSocket Server
 * Real-time updates for the admin dashboard
 * Uses Privy JWT authentication instead of wallet signatures
 */

import { WebSocketServer, WebSocket } from 'ws'
import { Server, IncomingMessage } from 'http'
import { URL } from 'url'
import { privyService } from '../services/privy.service'
import { prisma } from '../config/prisma'

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
  | 'reactive_events'

export interface WsMessage {
  type: 'subscribe' | 'unsubscribe' | 'auth' | 'ping'
  channel?: WsChannel
  channels?: WsChannel[]
  token?: string // Privy JWT token for auth message
}

export interface WsEvent {
  channel: WsChannel
  event: string
  data: unknown
  timestamp: string
}

interface AuthenticatedClient {
  ws: WebSocket
  privyUserId: string
  isAdmin: boolean
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

    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      console.log('[WS] New connection')

      // Try to authenticate via query parameter token
      const token = this.extractTokenFromUrl(req.url)
      if (token) {
        const authenticated = await this.authenticateWithToken(ws, token)
        if (!authenticated) {
          ws.send(JSON.stringify({ type: 'auth_error', error: 'Invalid token' }))
          ws.close(1008, 'Invalid token')
          return
        }
      } else {
        // Send welcome message if no token in query param (client can auth via message)
        ws.send(JSON.stringify({
          type: 'connected',
          message: 'Connected to admin WebSocket. Please authenticate.',
        }))
      }

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
    })

    // Start ping interval to keep connections alive
    this.pingInterval = setInterval(() => {
      this.pingClients()
    }, 30000)

    console.log('[WS] Admin WebSocket server initialized on /ws/admin')
  }

  /**
   * Extract token from URL query parameters
   */
  private extractTokenFromUrl(url: string | undefined): string | null {
    if (!url) return null
    try {
      const parsedUrl = new URL(url, 'http://localhost')
      return parsedUrl.searchParams.get('token')
    } catch {
      return null
    }
  }

  /**
   * Authenticate client with Privy JWT token
   */
  private async authenticateWithToken(ws: WebSocket, token: string): Promise<boolean> {
    try {
      // Verify the Privy JWT token
      const { valid, userId } = await privyService.verifyAuthToken(token)

      if (!valid || !userId) {
        console.log('[WS] Invalid Privy token')
        return false
      }

      // Check if user has admin role
      let isAdmin = false
      try {
        const adminRole = await prisma.adminRole.findUnique({
          where: { privyUserId: userId },
        })
        isAdmin = !!adminRole
      } catch (error) {
        // AdminRole table might not exist yet during migration
        console.warn('[WS] Could not check admin role:', error)
      }

      // Store authenticated client
      this.clients.set(ws, {
        ws,
        privyUserId: userId,
        isAdmin,
        subscribedChannels: new Set(),
        lastPing: Date.now(),
      })

      ws.send(JSON.stringify({
        type: 'auth_success',
        message: 'Authentication successful',
        userId,
        isAdmin,
      }))

      console.log(`[WS] Client authenticated: ${userId.slice(0, 20)}... (admin: ${isAdmin})`)
      return true
    } catch (error) {
      console.error('[WS] Authentication error:', error)
      return false
    }
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
   * Authenticate a WebSocket client via message
   */
  private async handleAuth(ws: WebSocket, message: WsMessage): Promise<void> {
    const { token } = message

    if (!token) {
      ws.send(JSON.stringify({ type: 'auth_error', error: 'Missing auth token' }))
      return
    }

    const authenticated = await this.authenticateWithToken(ws, token)
    if (!authenticated) {
      ws.send(JSON.stringify({ type: 'auth_error', error: 'Invalid token' }))
    }
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
   * Broadcast event to admin users only
   */
  broadcastToAdmins(channel: WsChannel, event: string, data: unknown): void {
    const message: WsEvent = {
      channel,
      event,
      data,
      timestamp: new Date().toISOString(),
    }

    const messageStr = JSON.stringify(message)

    this.clients.forEach((client) => {
      if (
        client.isAdmin &&
        client.subscribedChannels.has(channel) &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(messageStr)
      }
    })
  }

  /**
   * Broadcast event to a specific user by Privy user ID
   */
  broadcastToUser(privyUserId: string, channel: WsChannel, event: string, data: unknown): void {
    const message: WsEvent = {
      channel,
      event,
      data,
      timestamp: new Date().toISOString(),
    }

    const messageStr = JSON.stringify(message)

    this.clients.forEach((client) => {
      if (
        client.privyUserId === privyUserId &&
        client.subscribedChannels.has(channel) &&
        client.ws.readyState === WebSocket.OPEN
      ) {
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
   * Get count of admin clients
   */
  getAdminClientCount(): number {
    let count = 0
    this.clients.forEach((client) => {
      if (client.isAdmin) count++
    })
    return count
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
