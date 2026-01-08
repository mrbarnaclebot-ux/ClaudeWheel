'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useWallet } from '@solana/wallet-adapter-react'
import { useAdminAuth, useAdminUI, useAdminRefresh } from '../../_stores/adminStore'
import { StatusBadge, ConnectionBadge } from '../shared/StatusBadge'

interface AdminHeaderProps {
  onAuthenticate: () => Promise<void>
  isAuthenticating?: boolean
}

export function AdminHeader({ onAuthenticate, isAuthenticating = false }: AdminHeaderProps) {
  const { publicKey, connected, disconnect } = useWallet()
  const { isAuthenticated, clearAuth } = useAdminAuth()
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

  const handleDisconnect = () => {
    clearAuth()
    disconnect()
  }

  const tabTitles: Record<string, string> = {
    overview: 'Dashboard Overview',
    tokens: 'Token Management',
    telegram: 'Telegram Bot',
    logs: 'System Logs',
    wheel: '$WHEEL Platform Token',
    settings: 'Platform Settings',
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
            >
              🔄
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
        {connected && publicKey ? (
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <StatusBadge variant="success" dot pulse>
                  Authenticated
                </StatusBadge>
                <div className="text-xs text-text-muted font-mono">
                  {publicKey.toString().slice(0, 4)}...{publicKey.toString().slice(-4)}
                </div>
                <button
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 text-xs font-mono bg-error/20 text-error border border-error/30 rounded-lg hover:bg-error/30 transition-colors"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={onAuthenticate}
                disabled={isAuthenticating}
                className="px-4 py-2 text-sm font-mono bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg hover:bg-accent-primary/30 transition-colors disabled:opacity-50"
              >
                {isAuthenticating ? 'Signing...' : 'Sign to Authenticate'}
              </button>
            )}
          </div>
        ) : (
          <StatusBadge variant="warning" dot>
            Wallet Not Connected
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
