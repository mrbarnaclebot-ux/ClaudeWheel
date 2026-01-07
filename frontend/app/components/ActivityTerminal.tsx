'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ActivityLog, ActivityLogsResponse, getTokenActivityLogs } from '@/lib/api'

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY TERMINAL
// Real-time terminal-style display for claims and trades
// ═══════════════════════════════════════════════════════════════════════════

interface ActivityTerminalProps {
  walletAddress: string
  tokenId: string
  tokenSymbol?: string
  autoRefresh?: boolean
  refreshInterval?: number // in ms
}

export function ActivityTerminal({
  walletAddress,
  tokenId,
  tokenSymbol = 'TOKEN',
  autoRefresh = true,
  refreshInterval = 30000, // 30 seconds default
}: ActivityTerminalProps) {
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [devWallet, setDevWallet] = useState<string>('')
  const [opsWallet, setOpsWallet] = useState<string>('')
  const [flywheelState, setFlywheelState] = useState<{
    cyclePhase: 'buy' | 'sell'
    buyCount: number
    sellCount: number
    lastTradeAt: string | null
    lastCheckedAt: string | null
    lastCheckResult: string | null
  } | null>(null)
  const terminalRef = useRef<HTMLDivElement>(null)

  const fetchActivity = useCallback(async () => {
    try {
      const data = await getTokenActivityLogs(walletAddress, tokenId, 50)
      if (data) {
        setActivities(data.activities)
        setDevWallet(data.devWallet)
        setOpsWallet(data.opsWallet)
        setFlywheelState(data.flywheelState || null)
        setError(null)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load activity')
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress, tokenId])

  // Initial fetch
  useEffect(() => {
    fetchActivity()
  }, [fetchActivity])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(fetchActivity, refreshInterval)
    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, fetchActivity])

  // Format timestamp for terminal
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  // Get icon and color for activity type
  const getActivityStyle = (type: string) => {
    switch (type) {
      case 'claim':
        return { icon: '[$]', color: 'text-yellow-400', prefix: 'CLAIM' }
      case 'buy':
        return { icon: '[+]', color: 'text-green-400', prefix: 'BUY' }
      case 'sell':
        return { icon: '[-]', color: 'text-red-400', prefix: 'SELL' }
      case 'transfer':
        return { icon: '[>]', color: 'text-blue-400', prefix: 'XFER' }
      case 'info':
        return { icon: '[i]', color: 'text-cyan-400', prefix: 'INFO' }
      default:
        return { icon: '[?]', color: 'text-gray-400', prefix: 'LOG' }
    }
  }

  // Truncate signature for display
  const truncateSig = (sig: string | null) => {
    if (!sig) return 'N/A'
    return `${sig.slice(0, 8)}...${sig.slice(-8)}`
  }

  return (
    <div className="bg-gray-900/80 border border-gray-700 rounded-xl overflow-hidden">
      {/* Terminal Header */}
      <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="text-gray-400 text-sm font-mono ml-2">
            {tokenSymbol.toUpperCase()} Activity Terminal
          </span>
        </div>
        <div className="flex items-center gap-3">
          {autoRefresh && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Auto-refresh
            </span>
          )}
          <button
            onClick={fetchActivity}
            disabled={isLoading}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div
        ref={terminalRef}
        className="h-80 overflow-y-auto p-4 font-mono text-sm"
        style={{ backgroundColor: '#0d1117' }}
      >
        {/* System Info */}
        <div className="text-cyan-400 mb-4">
          <div>ClaudeWheel Flywheel v1.0.0</div>
          <div className="text-gray-500">─────────────────────────────────────────</div>
          <div className="text-gray-400 text-xs mt-1">
            DEV: <span className="text-cyan-300">{devWallet ? `${devWallet.slice(0, 4)}...${devWallet.slice(-4)}` : '...'}</span>
            {' | '}
            OPS: <span className="text-cyan-300">{opsWallet ? `${opsWallet.slice(0, 4)}...${opsWallet.slice(-4)}` : '...'}</span>
          </div>
          <div className="text-gray-500 mt-2">─────────────────────────────────────────</div>
        </div>

        {/* Error State */}
        {error && (
          <div className="text-red-400 mb-4">
            [ERROR] {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && activities.length === 0 && (
          <div className="text-gray-500">
            <div className="animate-pulse">Loading activity logs...</div>
          </div>
        )}

        {/* Flywheel Status - Always show when available */}
        {flywheelState && (
          <div className="text-gray-400 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-cyan-400">[STATUS]</span>
              <span>Phase: <span className="text-white capitalize">{flywheelState.cyclePhase}</span></span>
              <span className="text-gray-600">|</span>
              <span>Buys: <span className="text-green-400">{flywheelState.buyCount}/5</span></span>
              <span className="text-gray-600">|</span>
              <span>Sells: <span className="text-red-400">{flywheelState.sellCount}/5</span></span>
            </div>
            {flywheelState.lastCheckedAt && (
              <div className="text-xs text-gray-500 mt-1">
                Last checked: {formatTime(flywheelState.lastCheckedAt)}
                {flywheelState.lastCheckResult && (
                  <span className={`ml-2 ${
                    flywheelState.lastCheckResult === 'traded' ? 'text-green-400' :
                    flywheelState.lastCheckResult === 'insufficient_sol' ? 'text-yellow-400' :
                    flywheelState.lastCheckResult === 'balanced' ? 'text-cyan-400' :
                    'text-gray-400'
                  }`}>
                    ({flywheelState.lastCheckResult.replace(/_/g, ' ')})
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* No Activity State */}
        {!isLoading && activities.length === 0 && !error && (
          <div className="text-gray-500">
            <div>[INFO] No transactions recorded yet.</div>
            {!flywheelState?.lastCheckedAt ? (
              <>
                <div className="mt-2">Waiting for flywheel to start...</div>
                <div className="mt-1 text-gray-600">
                  Enable the flywheel and fund your ops wallet to begin.
                </div>
              </>
            ) : (
              <div className="mt-2 text-gray-600">
                Flywheel is running. Transactions will appear here when executed.
              </div>
            )}
          </div>
        )}

        {/* Activity Logs */}
        {activities.map((activity, index) => {
          const style = getActivityStyle(activity.type)
          return (
            <div
              key={activity.id}
              className={`mb-2 ${index === 0 ? 'animate-pulse' : ''}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-gray-600 text-xs whitespace-nowrap">
                  {formatTime(activity.timestamp)}
                </span>
                <span className={`${style.color} font-bold`}>
                  {style.icon}
                </span>
                <span className="text-gray-300 flex-1">
                  {activity.message}
                </span>
              </div>
              {activity.signature && (
                <div className="ml-[140px] text-xs text-gray-600">
                  TX: <a
                    href={`https://solscan.io/tx/${activity.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-600 hover:text-cyan-400 transition-colors"
                  >
                    {truncateSig(activity.signature)}
                  </a>
                </div>
              )}
            </div>
          )
        })}

        {/* Cursor */}
        <div className="flex items-center gap-2 mt-4 text-gray-500">
          <span>$</span>
          <span className="w-2 h-4 bg-gray-500 animate-pulse" />
        </div>
      </div>

      {/* Terminal Footer */}
      <div className="bg-gray-800 px-4 py-2 border-t border-gray-700 flex items-center justify-between text-xs text-gray-500">
        <span>{activities.length} events logged</span>
        <span>
          Last update: {activities[0] ? formatTime(activities[0].timestamp) : 'Never'}
        </span>
      </div>
    </div>
  )
}
