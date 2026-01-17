'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { usePrivy } from '@privy-io/react-auth'
import { useAdminAuth, useAdminUI, useAdminRefresh } from '../../_stores/adminStore'
import { StatusBadge, ConnectionBadge } from '../shared/StatusBadge'
import { Icon, RefreshCw } from '../shared/Icons'

export function AdminHeader() {
  const { user } = usePrivy()
  const { isAuthenticated, logout } = useAdminAuth()
  const { activeTab } = useAdminUI()
  const { autoRefresh, refreshInterval, setAutoRefresh, setRefreshInterval, wsConnected } =
    useAdminRefresh()

  const [currentTime, setCurrentTime] = useState(new Date())
  const [showRefreshSettings, setShowRefreshSettings] = useState(false)

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const tabTitles: Record<string, string> = {
    overview: 'Dashboard Overview',
    tokens: 'Token Management',
    telegram: 'Telegram Bot',
    logs: 'System Logs',
    wheel: '$WHEEL Platform Token',
    settings: 'Platform Settings',
  }

  // Get display name from Privy user
  const getDisplayName = () => {
    if (!user) return null
    if (user.email?.address) return user.email.address
    if (user.telegram?.username) return `@${user.telegram.username}`
    if (user.wallet?.address) {
      return `${user.wallet.address.slice(0, 4)}...${user.wallet.address.slice(-4)}`
    }
    return 'User'
  }

  return (
    <header className="bg-bg-card border-b border-border-subtle px-6 py-3 flex items-center justify-between sticky top-0 z-20">
      {/* Left - Page Title */}
      <div>
        <h1 className="text-lg font-semibold text-text-primary">
          {tabTitles[activeTab] || 'Admin Dashboard'}
        </h1>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-text-muted font-mono">
            {currentTime.toLocaleTimeString()}
          </span>
          <span className="text-xs text-text-muted">|</span>
          <ConnectionBadge connected={wsConnected} />
        </div>
      </div>

      {/* Right - Controls */}
      <div className="flex items-center gap-4">
        {/* Refresh Settings */}
        <div className="relative">
          <button
            onClick={() => setShowRefreshSettings(!showRefreshSettings)}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors
              ${autoRefresh
                ? 'border-success/30 bg-success/10 text-success'
                : 'border-border-subtle bg-bg-secondary text-text-muted'
              }
            `}
          >
            <motion.span
              animate={autoRefresh ? { rotate: 360 } : { rotate: 0 }}
              transition={autoRefresh ? { duration: 2, repeat: Infinity, ease: 'linear' } : {}}
              className="flex items-center justify-center"
            >
              <Icon icon={RefreshCw} size="sm" color="inherit" />
            </motion.span>
            <span className="text-xs font-mono">
              {autoRefresh ? `${refreshInterval}s` : 'Paused'}
            </span>
          </button>

          {/* Refresh Settings Dropdown */}
          {showRefreshSettings && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute right-0 top-full mt-2 w-48 bg-bg-card border border-border-subtle rounded-lg shadow-lg p-3 z-30"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Auto Refresh</span>
                  <button
                    onClick={() => setAutoRefresh(!autoRefresh)}
                    className={`w-10 h-5 rounded-full transition-colors ${
                      autoRefresh ? 'bg-success' : 'bg-bg-secondary'
                    }`}
                  >
                    <motion.div
                      className="w-4 h-4 rounded-full bg-white shadow"
                      animate={{ x: autoRefresh ? 20 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  </button>
                </div>

                <div>
                  <span className="text-xs text-text-muted block mb-2">Interval</span>
                  <div className="flex gap-1">
                    {[15, 30, 60].map((interval) => (
                      <button
                        key={interval}
                        onClick={() => setRefreshInterval(interval)}
                        className={`flex-1 px-2 py-1 text-xs rounded ${
                          refreshInterval === interval
                            ? 'bg-accent-primary text-white'
                            : 'bg-bg-secondary text-text-muted hover:bg-bg-card-hover'
                        }`}
                      >
                        {interval}s
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Auth Status */}
        {isAuthenticated ? (
          <div className="flex items-center gap-3">
            <StatusBadge variant="success" dot pulse>
              Authenticated
            </StatusBadge>
            <div className="text-xs text-text-muted font-mono">
              {getDisplayName()}
            </div>
            <button
              onClick={logout}
              className="px-3 py-1.5 text-xs font-mono bg-error/20 text-error border border-error/30 rounded-lg hover:bg-error/30 transition-colors"
            >
              Sign Out
            </button>
          </div>
        ) : (
          <StatusBadge variant="warning" dot>
            Not Authenticated
          </StatusBadge>
        )}
      </div>

      {/* Click outside to close dropdown */}
      {showRefreshSettings && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setShowRefreshSettings(false)}
        />
      )}
    </header>
  )
}
