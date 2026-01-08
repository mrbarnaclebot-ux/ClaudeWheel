'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminAuth, useAdminStore } from '../_stores/adminStore'
import { adminQueryKeys } from '../_lib/queryClient'

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

export interface WsEvent {
  channel: WsChannel
  event: string
  data: unknown
  timestamp: string
}

export interface FlywheelLogEntry {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: string
  source: 'flywheel'
  tokenSymbol?: string
  tokenId?: string
  phase?: string
  details?: unknown
}

export interface TelegramLogEntry {
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  timestamp: string
  source: 'telegram'
  telegramId?: number
  username?: string
  event?: string
  details?: unknown
}

interface UseWebSocketOptions {
  channels?: WsChannel[]
  autoReconnect?: boolean
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

interface UseWebSocketResult {
  connected: boolean
  connecting: boolean
  error: string | null
  subscribe: (channels: WsChannel[]) => void
  unsubscribe: (channels: WsChannel[]) => void
  flywheelLogs: FlywheelLogEntry[]
  telegramLogs: TelegramLogEntry[]
  clearLogs: (type: 'flywheel' | 'telegram' | 'all') => void
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBSOCKET HOOK
// ═══════════════════════════════════════════════════════════════════════════

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'
const WS_URL = API_BASE_URL.replace('http', 'ws') + '/ws/admin'
const MAX_LOG_ENTRIES = 500

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketResult {
  const {
    channels = [],
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
  } = options

  const { publicKey, signature, message, isAuthenticated } = useAdminAuth()
  const setWsConnected = useAdminStore((s) => s.setWsConnected)
  const queryClient = useQueryClient()

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flywheelLogs, setFlywheelLogs] = useState<FlywheelLogEntry[]>([])
  const [telegramLogs, setTelegramLogs] = useState<TelegramLogEntry[]>([])

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data)

      // Handle auth responses
      if (data.type === 'auth_success') {
        setConnected(true)
        setConnecting(false)
        setWsConnected(true)
        reconnectAttemptsRef.current = 0
        return
      }

      if (data.type === 'auth_error') {
        setError(data.error)
        setConnecting(false)
        return
      }

      // Handle channel events
      if (data.channel) {
        const wsEvent = data as WsEvent

        switch (wsEvent.channel) {
          case 'job_status':
            // Invalidate platform stats to refresh job status
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.platformStats() })
            break

          case 'transactions':
            // Invalidate token data
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.tokens() })
            break

          case 'launch_updates':
            // Invalidate telegram data
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.telegram() })
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.telegramStats() })
            break

          case 'balance_updates':
            // Invalidate wheel data
            queryClient.invalidateQueries({ queryKey: ['wheel'] })
            break

          case 'flywheel_logs':
            setFlywheelLogs((prev) => {
              const newLog = wsEvent.data as FlywheelLogEntry
              const updated = [newLog, ...prev]
              return updated.slice(0, MAX_LOG_ENTRIES)
            })
            break

          case 'telegram_logs':
            setTelegramLogs((prev) => {
              const newLog = wsEvent.data as TelegramLogEntry
              const updated = [newLog, ...prev]
              return updated.slice(0, MAX_LOG_ENTRIES)
            })
            break

          case 'logs':
            // Invalidate general logs
            queryClient.invalidateQueries({ queryKey: adminQueryKeys.logs() })
            break
        }
      }
    } catch (err) {
      console.error('[WS] Failed to parse message:', err)
    }
  }, [queryClient, setWsConnected])

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!isAuthenticated || !publicKey || !signature || !message) {
      return
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    setConnecting(true)
    setError(null)

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        // Authenticate immediately
        ws.send(JSON.stringify({
          type: 'auth',
          publicKey,
          signature,
          message,
        }))
      }

      ws.onmessage = handleMessage

      ws.onclose = () => {
        setConnected(false)
        setConnecting(false)
        setWsConnected(false)

        // Auto-reconnect if enabled
        if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++
          const delay = reconnectInterval * Math.pow(1.5, reconnectAttemptsRef.current - 1)
          reconnectTimeoutRef.current = setTimeout(connect, Math.min(delay, 30000))
        }
      }

      ws.onerror = () => {
        setError('WebSocket connection failed')
        setConnecting(false)
      }
    } catch (err) {
      setError('Failed to create WebSocket connection')
      setConnecting(false)
    }
  }, [isAuthenticated, publicKey, signature, message, handleMessage, autoReconnect, reconnectInterval, maxReconnectAttempts, setWsConnected])

  // Subscribe to channels
  const subscribe = useCallback((newChannels: WsChannel[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        channels: newChannels,
      }))
    }
  }, [])

  // Unsubscribe from channels
  const unsubscribe = useCallback((channelsToRemove: WsChannel[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        channels: channelsToRemove,
      }))
    }
  }, [])

  // Clear logs
  const clearLogs = useCallback((type: 'flywheel' | 'telegram' | 'all') => {
    if (type === 'flywheel' || type === 'all') {
      setFlywheelLogs([])
    }
    if (type === 'telegram' || type === 'all') {
      setTelegramLogs([])
    }
  }, [])

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      connect()
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [isAuthenticated, connect])

  // Subscribe to initial channels when connected
  useEffect(() => {
    if (connected && channels.length > 0) {
      subscribe(channels)
    }
  }, [connected, channels, subscribe])

  // Ping to keep connection alive
  useEffect(() => {
    if (!connected) return

    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
      }
    }, 25000)

    return () => clearInterval(pingInterval)
  }, [connected])

  return {
    connected,
    connecting,
    error,
    subscribe,
    unsubscribe,
    flywheelLogs,
    telegramLogs,
    clearLogs,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hook for subscribing to real-time logs
 */
export function useRealtimeLogs() {
  return useWebSocket({
    channels: ['flywheel_logs', 'telegram_logs', 'logs'],
    autoReconnect: true,
  })
}

/**
 * Hook for subscribing to all real-time updates
 */
export function useRealtimeUpdates() {
  return useWebSocket({
    channels: ['job_status', 'transactions', 'launch_updates', 'balance_updates'],
    autoReconnect: true,
  })
}
