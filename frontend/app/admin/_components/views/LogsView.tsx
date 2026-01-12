'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useAdminAuth } from '../../_stores/adminStore'
import { adminQueryKeys } from '../../_lib/queryClient'
import { fetchAuditLogs } from '../../_lib/adminApi'
import { useRealtimeLogs } from '../../_hooks/useWebSocket'
import { StatusBadge, ConnectionBadge } from '../shared/StatusBadge'
import { TableSkeleton } from '../shared/LoadingSkeleton'

type LogType = 'flywheel' | 'telegram' | 'system'
type LogLevel = 'all' | 'info' | 'warn' | 'error' | 'debug'

interface FormattedLogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source: string
  details?: unknown
}

export function LogsView() {
  const { isAuthenticated, getToken } = useAdminAuth()
  const [activeTab, setActiveTab] = useState<LogType>('flywheel')
  const [levelFilter, setLevelFilter] = useState<LogLevel>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)

  const logContainerRef = useRef<HTMLDivElement>(null)

  // WebSocket connection for real-time logs
  const {
    connected: wsConnected,
    connecting: wsConnecting,
    flywheelLogs,
    telegramLogs,
    clearLogs,
  } = useRealtimeLogs()

  // Fetch historical telegram logs for system tab
  const { data: historicalLogs, isLoading: isHistoricalLoading } = useQuery({
    queryKey: adminQueryKeys.logList({ limit: 100 }),
    queryFn: async () => {
      const token = await getToken()
      if (!token) return null
      return fetchAuditLogs(token, { limit: 100 })
    },
    enabled: isAuthenticated && activeTab === 'system',
    staleTime: 30000,
  })

  // Format logs for display
  const getDisplayLogs = (): FormattedLogEntry[] => {
    let logs: FormattedLogEntry[] = []

    if (activeTab === 'flywheel') {
      logs = flywheelLogs.map((log, index) => ({
        id: `flywheel-${log.timestamp}-${index}`,
        timestamp: log.timestamp,
        level: log.level,
        message: log.message,
        source: log.tokenSymbol || 'flywheel',
        details: log.details,
      }))
    } else if (activeTab === 'telegram') {
      logs = telegramLogs.map((log, index) => ({
        id: `telegram-${log.timestamp}-${index}`,
        timestamp: log.timestamp,
        level: log.level,
        message: log.message,
        source: log.username || log.event || 'telegram',
        details: log.details,
      }))
    } else if (activeTab === 'system' && historicalLogs?.logs) {
      logs = historicalLogs.logs.map((log) => ({
        id: log.id,
        timestamp: log.created_at,
        level: 'info' as const,
        message: log.event_type,
        source: 'system',
        details: log.details,
      }))
    }

    // Apply level filter
    if (levelFilter !== 'all') {
      logs = logs.filter((log) => log.level === levelFilter)
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      logs = logs.filter(
        (log) =>
          log.message.toLowerCase().includes(query) ||
          log.source.toLowerCase().includes(query)
      )
    }

    return logs
  }

  const displayLogs = getDisplayLogs()

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0
    }
  }, [displayLogs.length, autoScroll])

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-error'
      case 'warn':
        return 'text-warning'
      case 'info':
        return 'text-success'
      case 'debug':
        return 'text-text-muted'
      default:
        return 'text-text-primary'
    }
  }

  const getLevelBadge = (level: string) => {
    const variants: Record<string, 'error' | 'warning' | 'success' | 'default'> = {
      error: 'error',
      warn: 'warning',
      info: 'success',
      debug: 'default',
    }
    return variants[level] || 'default'
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div className="p-6 h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-text-primary">System Logs</h2>
          <ConnectionBadge
            connected={wsConnected}
            label={wsConnecting ? 'Connecting...' : wsConnected ? 'Live' : 'Disconnected'}
          />
        </div>

        <div className="flex items-center gap-3">
          {/* Level Filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as LogLevel)}
            className="px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
          >
            <option value="all">All Levels</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
          />

          {/* Auto-scroll toggle */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
              autoScroll
                ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/30'
                : 'bg-bg-secondary text-text-muted border-border-subtle'
            }`}
          >
            Auto-scroll
          </button>

          {/* Clear Logs */}
          <button
            onClick={() => clearLogs(activeTab === 'system' ? 'all' : activeTab)}
            className="px-3 py-2 text-sm bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-bg-secondary p-1 rounded-lg w-fit">
        {[
          { key: 'flywheel', label: 'Flywheel', icon: '🎡', count: flywheelLogs.length },
          { key: 'telegram', label: 'Telegram', icon: '📱', count: telegramLogs.length },
          { key: 'system', label: 'System', icon: '⚙️', count: historicalLogs?.logs?.length || 0 },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as LogType)}
            className={`
              flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors
              ${activeTab === tab.key
                ? 'bg-bg-card text-text-primary shadow-sm'
                : 'text-text-muted hover:text-text-primary'
              }
            `}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-accent-primary/20 text-accent-primary rounded">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Log Container */}
      <div
        ref={logContainerRef}
        className="flex-1 bg-bg-card border border-border-subtle rounded-xl overflow-hidden"
      >
        {(activeTab === 'system' && isHistoricalLoading) ? (
          <TableSkeleton rows={10} />
        ) : displayLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-muted">
            <div className="text-4xl mb-4">
              {activeTab === 'flywheel' ? '🎡' : activeTab === 'telegram' ? '📱' : '📋'}
            </div>
            <p className="text-lg mb-2">No logs yet</p>
            <p className="text-sm">
              {wsConnected
                ? 'Waiting for events...'
                : 'Connect to see real-time logs'}
            </p>
          </div>
        ) : (
          <div className="h-full overflow-y-auto font-mono text-sm">
            <table className="w-full">
              <thead className="sticky top-0 bg-bg-secondary border-b border-border-subtle">
                <tr>
                  <th className="text-left px-4 py-2 text-xs text-text-muted font-medium w-24">Time</th>
                  <th className="text-left px-4 py-2 text-xs text-text-muted font-medium w-20">Level</th>
                  <th className="text-left px-4 py-2 text-xs text-text-muted font-medium w-32">Source</th>
                  <th className="text-left px-4 py-2 text-xs text-text-muted font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {displayLogs.map((log) => (
                    <motion.tr
                      key={log.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-border-subtle/30 hover:bg-bg-secondary/50"
                    >
                      <td className="px-4 py-2 text-text-muted whitespace-nowrap">
                        {formatTimestamp(log.timestamp)}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge variant={getLevelBadge(log.level)} size="xs">
                          {log.level.toUpperCase()}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2 text-accent-primary truncate max-w-[128px]">
                        {log.source}
                      </td>
                      <td className={`px-4 py-2 ${getLevelColor(log.level)}`}>
                        <span className="line-clamp-2">{log.message}</span>
                        {log.details != null && (
                          <details className="mt-1">
                            <summary className="text-xs text-text-muted cursor-pointer hover:text-text-primary">
                              Show details
                            </summary>
                            <pre className="mt-1 p-2 bg-bg-secondary rounded text-xs overflow-x-auto max-w-xl">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </details>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer Status */}
      <div className="flex items-center justify-between mt-4 text-xs text-text-muted">
        <span>
          Showing {displayLogs.length} log{displayLogs.length !== 1 ? 's' : ''}
          {levelFilter !== 'all' && ` (filtered by ${levelFilter})`}
          {searchQuery && ` matching "${searchQuery}"`}
        </span>
        <span>
          {wsConnected ? (
            <span className="text-success">Connected to real-time feed</span>
          ) : (
            <span className="text-warning">Disconnected - logs may be stale</span>
          )}
        </span>
      </div>
    </div>
  )
}
