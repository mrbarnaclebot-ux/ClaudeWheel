'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import bs58 from 'bs58'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts'
import {
  fetchAdminAuthNonce,
  fetchTelegramStats,
  fetchTelegramLaunches,
  fetchPendingRefunds,
  fetchTelegramLogs,
  executeRefund,
  cancelTelegramLaunch,
  fetchBotHealth,
  fetchFinancialMetrics,
  fetchTelegramUsers,
  executeBulkRefunds,
  searchTelegramLaunches,
  exportTelegramLaunches,
  fetchChartData,
  fetchBotAlertStatus,
  enableMaintenanceMode,
  disableMaintenanceMode,
  sendBroadcast,
  previewBroadcast,
  previewTokenRefund,
  stopFlywheelAndRefund,
  migrateOrphanedLaunches,
  type TelegramLaunchStats,
  type TelegramLaunch,
  type TelegramAuditLog,
  type BotHealthStatus,
  type FinancialMetrics,
  type TelegramUser,
  type ChartData,
  type BotAlertStatus,
  type RefundPreview,
  type StopAndRefundResult,
} from '@/lib/api'

const DEV_WALLET_ADDRESS = process.env.NEXT_PUBLIC_DEV_WALLET_ADDRESS || ''

type StatusFilter = 'all' | 'awaiting_deposit' | 'launching' | 'completed' | 'failed' | 'expired' | 'refunded'
type TabView = 'launches' | 'users' | 'logs' | 'charts' | 'broadcast'

export default function TelegramAdminPage() {
  const { publicKey, connected, signMessage } = useWallet()
  const [isAuthorized, setIsAuthorized] = useState(false)

  // Auth state
  const [adminAuthSignature, setAdminAuthSignature] = useState<string | null>(null)
  const [adminAuthMessage, setAdminAuthMessage] = useState<string | null>(null)
  const [isAuthenticating, setIsAuthenticating] = useState(false)

  // Data state
  const [stats, setStats] = useState<TelegramLaunchStats | null>(null)
  const [launches, setLaunches] = useState<TelegramLaunch[]>([])
  const [pendingRefunds, setPendingRefunds] = useState<TelegramLaunch[]>([])
  const [logs, setLogs] = useState<TelegramAuditLog[]>([])
  const [botHealth, setBotHealth] = useState<BotHealthStatus | null>(null)
  const [financialMetrics, setFinancialMetrics] = useState<FinancialMetrics | null>(null)
  const [telegramUsers, setTelegramUsers] = useState<TelegramUser[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [chartDays, setChartDays] = useState(30)
  const [isLoading, setIsLoading] = useState(false)

  // UI state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentTab, setCurrentTab] = useState<TabView>('launches')
  const [expandedLaunch, setExpandedLaunch] = useState<string | null>(null)
  const [selectedLaunches, setSelectedLaunches] = useState<Set<string>>(new Set())

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [totalLaunches, setTotalLaunches] = useState(0)
  const pageSize = 20

  // Auto-refresh state
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(30)
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Refund modal state
  const [refundModal, setRefundModal] = useState<TelegramLaunch | null>(null)
  const [refundAddress, setRefundAddress] = useState('')
  const [isRefunding, setIsRefunding] = useState(false)
  const [refundMessage, setRefundMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Bulk refund state
  const [showBulkRefundModal, setShowBulkRefundModal] = useState(false)
  const [isBulkRefunding, setIsBulkRefunding] = useState(false)
  const [bulkRefundResults, setBulkRefundResults] = useState<{ total: number; successful: number; failed: number } | null>(null)

  // Broadcast/Maintenance state
  const [alertStatus, setAlertStatus] = useState<BotAlertStatus | null>(null)
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastBody, setBroadcastBody] = useState('')
  const [maintenanceReason, setMaintenanceReason] = useState('')
  const [maintenanceEndTime, setMaintenanceEndTime] = useState('')
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false)
  const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false)
  const [broadcastResult, setBroadcastResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Stop & Refund state (for completed launches)
  const [stopRefundModal, setStopRefundModal] = useState<TelegramLaunch | null>(null)
  const [stopRefundPreview, setStopRefundPreview] = useState<RefundPreview | null>(null)
  const [isLoadingStopRefundPreview, setIsLoadingStopRefundPreview] = useState(false)
  const [stopRefundAddress, setStopRefundAddress] = useState('')
  const [isStopRefunding, setIsStopRefunding] = useState(false)
  const [stopRefundResult, setStopRefundResult] = useState<StopAndRefundResult | null>(null)

  // Link orphaned launches state
  const [isLinking, setIsLinking] = useState(false)

  // Check authorization
  useEffect(() => {
    if (connected && publicKey) {
      const walletAddress = publicKey.toString()
      setIsAuthorized(walletAddress === DEV_WALLET_ADDRESS)
    } else {
      setIsAuthorized(false)
    }
  }, [connected, publicKey])

  // Authenticate and load data
  const authenticate = useCallback(async () => {
    if (!publicKey || !signMessage) return

    setIsAuthenticating(true)
    try {
      const nonceData = await fetchAdminAuthNonce()
      if (!nonceData) {
        console.error('Failed to get admin auth nonce')
        return
      }

      const messageBytes = new TextEncoder().encode(nonceData.message)
      const signatureBytes = await signMessage(messageBytes)
      const signature = bs58.encode(signatureBytes)

      setAdminAuthSignature(signature)
      setAdminAuthMessage(nonceData.message)

      // Load all data
      await loadAllData(publicKey.toString(), signature, nonceData.message)
    } catch (error) {
      console.error('Authentication failed:', error)
    } finally {
      setIsAuthenticating(false)
    }
  }, [publicKey, signMessage])

  // Load all data - accepts filter params to avoid stale closure issues
  const loadAllData = async (
    pubkey: string,
    sig: string,
    msg: string,
    filters?: { status?: StatusFilter; search?: string; page?: number }
  ) => {
    const currentStatus = filters?.status ?? statusFilter
    const currentSearch = filters?.search ?? searchQuery
    const currentPageNum = filters?.page ?? currentPage

    setIsLoading(true)
    try {
      const [statsData, launchesData, refundsData, logsData, healthData, metricsData, usersData, chartsData, alertsData] = await Promise.all([
        fetchTelegramStats(pubkey, sig, msg),
        searchTelegramLaunches(pubkey, sig, msg, {
          status: currentStatus === 'all' ? undefined : currentStatus,
          search: currentSearch || undefined,
          limit: pageSize,
          offset: (currentPageNum - 1) * pageSize,
        }),
        fetchPendingRefunds(pubkey, sig, msg),
        fetchTelegramLogs(pubkey, sig, msg, { limit: 100 }),
        fetchBotHealth(pubkey, sig, msg),
        fetchFinancialMetrics(pubkey, sig, msg),
        fetchTelegramUsers(pubkey, sig, msg, { limit: 50 }),
        fetchChartData(pubkey, sig, msg, chartDays),
        fetchBotAlertStatus(pubkey, sig, msg),
      ])

      if (statsData) setStats(statsData)
      if (launchesData) {
        setLaunches(launchesData.launches)
        setTotalLaunches(launchesData.total)
      }
      if (refundsData) setPendingRefunds(refundsData.refunds)
      if (logsData) setLogs(logsData.logs)
      if (healthData) setBotHealth(healthData)
      if (metricsData) setFinancialMetrics(metricsData)
      if (usersData) {
        setTelegramUsers(usersData.users)
        setTotalUsers(usersData.total)
      }
      if (chartsData) setChartData(chartsData)
      if (alertsData) setAlertStatus(alertsData)
      setLastRefresh(new Date())
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Reload data with current auth - passes current filter values to avoid stale closures
  const reloadData = useCallback(async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return
    await loadAllData(publicKey.toString(), adminAuthSignature, adminAuthMessage, {
      status: statusFilter,
      search: searchQuery,
      page: currentPage,
    })
  }, [publicKey, adminAuthSignature, adminAuthMessage, statusFilter, searchQuery, currentPage])

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh && adminAuthSignature) {
      autoRefreshRef.current = setInterval(() => {
        reloadData()
      }, refreshInterval * 1000)
    }

    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current)
      }
    }
  }, [autoRefresh, refreshInterval, reloadData, adminAuthSignature])

  // Search effect - reload when search changes
  useEffect(() => {
    if (adminAuthSignature && adminAuthMessage && publicKey) {
      const debounce = setTimeout(() => {
        reloadData()
      }, 300)
      return () => clearTimeout(debounce)
    }
  }, [searchQuery])

  // Filter and pagination effect - reload when filter or page changes
  useEffect(() => {
    if (adminAuthSignature && adminAuthMessage && publicKey) {
      reloadData()
    }
  }, [statusFilter, currentPage])

  // Handle refund
  const handleRefund = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage || !refundModal) return
    if (!refundAddress.trim()) {
      setRefundMessage({ type: 'error', text: 'Please enter a refund address' })
      return
    }

    setIsRefunding(true)
    setRefundMessage(null)

    const result = await executeRefund(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      refundModal.id,
      refundAddress
    )

    if (result.success) {
      setRefundMessage({
        type: 'success',
        text: `Refunded ${result.amountRefunded?.toFixed(6)} SOL - TX: ${result.signature?.slice(0, 8)}...`,
      })
      setTimeout(() => {
        setRefundModal(null)
        setRefundAddress('')
        setRefundMessage(null)
        reloadData()
      }, 2000)
    } else {
      setRefundMessage({ type: 'error', text: result.error || 'Refund failed' })
    }

    setIsRefunding(false)
  }

  // Handle bulk refund
  const handleBulkRefund = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return
    if (selectedLaunches.size === 0) return

    setIsBulkRefunding(true)
    setBulkRefundResults(null)

    const result = await executeBulkRefunds(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      Array.from(selectedLaunches)
    )

    if (result) {
      setBulkRefundResults(result.summary)
      setTimeout(() => {
        setShowBulkRefundModal(false)
        setSelectedLaunches(new Set())
        setBulkRefundResults(null)
        reloadData()
      }, 3000)
    }

    setIsBulkRefunding(false)
  }

  // Handle cancel launch
  const handleCancel = async (launch: TelegramLaunch) => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return
    if (!confirm(`Cancel ${launch.token_symbol} launch? This will notify the user.`)) return

    const success = await cancelTelegramLaunch(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      launch.id,
      'Cancelled by admin'
    )

    if (success) {
      reloadData()
    }
  }

  // Open Stop & Refund modal for completed launches
  const openStopRefundModal = async (launch: TelegramLaunch) => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage || !launch.user_token_id) return

    setStopRefundModal(launch)
    setStopRefundPreview(null)
    setStopRefundAddress('')
    setStopRefundResult(null)
    setIsLoadingStopRefundPreview(true)

    const preview = await previewTokenRefund(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      launch.user_token_id
    )
    if (preview) {
      setStopRefundPreview(preview)
      if (preview.suggestedRefundAddress) {
        setStopRefundAddress(preview.suggestedRefundAddress)
      } else if (launch.original_funder) {
        setStopRefundAddress(launch.original_funder)
      }
    }

    setIsLoadingStopRefundPreview(false)
  }

  // Execute Stop & Refund
  const handleStopAndRefund = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage || !stopRefundModal?.user_token_id) return

    setIsStopRefunding(true)
    setStopRefundResult(null)

    const result = await stopFlywheelAndRefund(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      stopRefundModal.user_token_id,
      stopRefundAddress || undefined
    )

    setStopRefundResult(result)

    if (result.success && result.refundExecuted) {
      setTimeout(() => {
        setStopRefundModal(null)
        reloadData()
      }, 2000)
    }

    setIsStopRefunding(false)
  }

  // Link orphaned launches to user_tokens
  const handleLinkOrphanedLaunches = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return

    setIsLinking(true)
    try {
      const result = await migrateOrphanedLaunches(
        publicKey.toString(),
        adminAuthSignature,
        adminAuthMessage
      )
      if (result) {
        // Reload data to show updated launches with user_token_id
        await reloadData()
      }
    } catch (error) {
      console.error('Failed to link orphaned launches:', error)
    }
    setIsLinking(false)
  }

  // Handle export
  const handleExport = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return

    const blob = await exportTelegramLaunches(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      { status: statusFilter === 'all' ? undefined : statusFilter }
    )

    if (blob) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `telegram-launches-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  // Toggle launch selection
  const toggleLaunchSelection = (launchId: string) => {
    const newSelected = new Set(selectedLaunches)
    if (newSelected.has(launchId)) {
      newSelected.delete(launchId)
    } else {
      newSelected.add(launchId)
    }
    setSelectedLaunches(newSelected)
  }

  // Select all refundable launches
  const selectAllRefundable = () => {
    const refundable = launches.filter(l => ['failed', 'expired'].includes(l.status) && l.deposit_received_sol > 0)
    setSelectedLaunches(new Set(refundable.map(l => l.id)))
  }

  // Get status badge
  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      awaiting_deposit: { bg: 'bg-warning/20', text: 'text-warning', label: 'Awaiting' },
      launching: { bg: 'bg-accent-primary/20', text: 'text-accent-primary', label: 'Launching' },
      completed: { bg: 'bg-success/20', text: 'text-success', label: 'Completed' },
      failed: { bg: 'bg-error/20', text: 'text-error', label: 'Failed' },
      expired: { bg: 'bg-text-muted/20', text: 'text-text-muted', label: 'Expired' },
      refunded: { bg: 'bg-accent-secondary/20', text: 'text-accent-secondary', label: 'Refunded' },
    }
    const badge = badges[status] || { bg: 'bg-text-muted/20', text: 'text-text-muted', label: status }
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
  }

  // Not connected
  if (!connected) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-glow bg-bg-card p-8 max-w-md w-full text-center"
        >
          <div className="text-accent-primary text-4xl mb-4">📱</div>
          <h1 className="font-display text-2xl font-bold text-text-primary mb-2">
            Telegram Launches
          </h1>
          <p className="text-text-secondary mb-6 font-mono text-sm">
            Connect your Dev Wallet to monitor Telegram launches
          </p>
          <WalletMultiButton className="!bg-accent-primary hover:!bg-accent-secondary !text-bg-void !font-mono !rounded-lg" />
        </motion.div>
      </div>
    )
  }

  // Not authorized
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-glow bg-bg-card p-8 max-w-md w-full text-center"
        >
          <div className="text-error text-4xl mb-4">⛔</div>
          <h1 className="font-display text-2xl font-bold text-text-primary mb-2">
            Access Denied
          </h1>
          <p className="text-text-secondary mb-4 font-mono text-sm">
            Only the Dev Wallet can access this panel.
          </p>
          <WalletMultiButton className="!bg-bg-secondary !text-text-primary !font-mono !rounded-lg !border !border-border-subtle" />
        </motion.div>
      </div>
    )
  }

  const totalPages = Math.ceil(totalLaunches / pageSize)

  return (
    <div className="min-h-screen bg-void p-4 md:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto mb-6"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2">
              <span className="text-accent-primary">📱</span>
              Telegram Dashboard
            </h1>
            <p className="text-text-muted font-mono text-sm mt-1">
              Monitor launches, users, and process refunds
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 text-sm font-mono bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
            >
              ← Back
            </Link>
            <WalletMultiButton className="!bg-success/20 !text-success !font-mono !rounded-lg !border !border-success/30 !text-sm" />
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Auth Button */}
        {!adminAuthSignature && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-glow bg-bg-card p-6 text-center"
          >
            <p className="text-text-muted font-mono text-sm mb-4">
              Sign a message to authenticate and view Telegram launch data
            </p>
            <button
              onClick={authenticate}
              disabled={isAuthenticating}
              className="px-6 py-3 text-sm font-mono bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg hover:bg-accent-primary/30 transition-colors disabled:opacity-50"
            >
              {isAuthenticating ? 'Authenticating...' : 'Authenticate & Load Data'}
            </button>
          </motion.div>
        )}

        {adminAuthSignature && (
          <>
            {/* Bot Health & Auto-Refresh Bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card-glow bg-bg-card p-4 flex items-center justify-between flex-wrap gap-4"
            >
              {/* Bot Health */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${botHealth?.botHealthy ? 'bg-success animate-pulse' : 'bg-error'}`} />
                  <span className="text-sm font-mono text-text-primary">
                    Deposit Monitor: {botHealth?.depositMonitor.running ? 'Running' : 'Stopped'}
                  </span>
                </div>
                {botHealth?.lastActivity && (
                  <span className="text-xs text-text-muted font-mono">
                    Last activity: {botHealth.lastActivity.minutesAgo}m ago ({botHealth.lastActivity.eventType})
                  </span>
                )}
              </div>

              {/* Auto-Refresh Controls */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="rounded border-border-subtle"
                  />
                  <span className="text-sm font-mono text-text-secondary">Auto-refresh</span>
                </label>
                {autoRefresh && (
                  <select
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    className="bg-bg-secondary border border-border-subtle rounded px-2 py-1 text-xs font-mono text-text-primary"
                  >
                    <option value={15}>15s</option>
                    <option value={30}>30s</option>
                    <option value={60}>60s</option>
                  </select>
                )}
                {lastRefresh && (
                  <span className="text-xs text-text-muted font-mono">
                    Updated: {lastRefresh.toLocaleTimeString()}
                  </span>
                )}
                <button
                  onClick={reloadData}
                  disabled={isLoading}
                  className="px-3 py-1 text-xs font-mono bg-bg-secondary hover:bg-bg-card-hover border border-border-subtle rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading ? '...' : '↻ Refresh'}
                </button>
              </div>
            </motion.div>

            {/* Financial Metrics */}
            {financialMetrics && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3"
              >
                <div className="card-glow bg-bg-card p-4">
                  <div className="text-xs text-text-muted font-mono mb-1">Total SOL Processed</div>
                  <div className="text-xl font-bold text-success">{financialMetrics.totalSolProcessed.toFixed(2)}</div>
                </div>
                <div className="card-glow bg-bg-card p-4">
                  <div className="text-xs text-text-muted font-mono mb-1">Platform Revenue</div>
                  <div className="text-xl font-bold text-accent-primary">{financialMetrics.platformRevenue.toFixed(4)}</div>
                </div>
                <div className="card-glow bg-bg-card p-4">
                  <div className="text-xs text-text-muted font-mono mb-1">Pending SOL</div>
                  <div className="text-xl font-bold text-warning">{financialMetrics.pendingSol.toFixed(2)}</div>
                </div>
                <div className="card-glow bg-bg-card p-4">
                  <div className="text-xs text-text-muted font-mono mb-1">Total Refunded</div>
                  <div className="text-xl font-bold text-error">{financialMetrics.totalRefunded.toFixed(2)}</div>
                </div>
                <div className="card-glow bg-bg-card p-4">
                  <div className="text-xs text-text-muted font-mono mb-1">Today&apos;s Launches</div>
                  <div className="text-xl font-bold text-text-primary">{financialMetrics.today.launches}</div>
                </div>
                <div className="card-glow bg-bg-card p-4">
                  <div className="text-xs text-text-muted font-mono mb-1">Today&apos;s Deposits</div>
                  <div className="text-xl font-bold text-text-primary">{financialMetrics.today.deposits.toFixed(2)}</div>
                </div>
              </motion.div>
            )}

            {/* Stats Cards */}
            {stats && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-3 md:grid-cols-7 gap-2"
              >
                <div className="card-glow bg-bg-card p-3 text-center">
                  <div className="text-lg font-bold text-text-primary">{stats.total}</div>
                  <div className="text-xs text-text-muted font-mono">Total</div>
                </div>
                <div className="card-glow bg-bg-card p-3 text-center">
                  <div className="text-lg font-bold text-warning">{stats.awaiting}</div>
                  <div className="text-xs text-text-muted font-mono">Awaiting</div>
                </div>
                <div className="card-glow bg-bg-card p-3 text-center">
                  <div className="text-lg font-bold text-accent-primary">{stats.launching}</div>
                  <div className="text-xs text-text-muted font-mono">Launching</div>
                </div>
                <div className="card-glow bg-bg-card p-3 text-center">
                  <div className="text-lg font-bold text-success">{stats.completed}</div>
                  <div className="text-xs text-text-muted font-mono">Completed</div>
                </div>
                <div className="card-glow bg-bg-card p-3 text-center">
                  <div className="text-lg font-bold text-error">{stats.failed}</div>
                  <div className="text-xs text-text-muted font-mono">Failed</div>
                </div>
                <div className="card-glow bg-bg-card p-3 text-center">
                  <div className="text-lg font-bold text-text-muted">{stats.expired}</div>
                  <div className="text-xs text-text-muted font-mono">Expired</div>
                </div>
                <div className="card-glow bg-bg-card p-3 text-center">
                  <div className="text-lg font-bold text-accent-secondary">{stats.refunded}</div>
                  <div className="text-xs text-text-muted font-mono">Refunded</div>
                </div>
              </motion.div>
            )}

            {/* Pending Refunds Alert */}
            {pendingRefunds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-glow bg-error/10 border border-error/30 p-4"
              >
                <h2 className="font-display text-lg font-semibold text-error mb-3 flex items-center gap-2">
                  <span>⚠️</span>
                  {pendingRefunds.length} Launch{pendingRefunds.length > 1 ? 'es' : ''} Need Refund
                </h2>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {pendingRefunds.map((launch) => (
                    <div
                      key={launch.id}
                      className="flex items-center justify-between bg-bg-card rounded-lg p-3"
                    >
                      <div>
                        <span className="font-semibold text-text-primary">{launch.token_symbol}</span>
                        <span className="text-text-muted text-sm ml-2">
                          {launch.current_balance?.toFixed(6) || launch.deposit_received_sol.toFixed(6)} SOL
                        </span>
                        {launch.original_funder && (
                          <span className="text-text-muted text-xs ml-2">
                            → {launch.original_funder.slice(0, 6)}...
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setRefundModal(launch)
                          setRefundAddress(launch.original_funder || '')
                        }}
                        className="px-3 py-1 text-xs font-mono bg-error/20 text-error border border-error/30 rounded hover:bg-error/30 transition-colors"
                      >
                        Refund
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 border-b border-border-subtle pb-2">
              {(['launches', 'users', 'logs', 'charts', 'broadcast'] as TabView[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCurrentTab(tab)}
                  className={`px-4 py-2 text-sm font-mono rounded-t-lg transition-colors ${
                    currentTab === tab
                      ? 'bg-bg-card text-accent-primary border-b-2 border-accent-primary'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {tab === 'launches' && `Launches (${totalLaunches})`}
                  {tab === 'users' && `Users (${totalUsers})`}
                  {tab === 'logs' && `Logs (${logs.length})`}
                  {tab === 'charts' && `Charts`}
                  {tab === 'broadcast' && `Broadcast (${alertStatus?.subscriberCount || 0})`}
                </button>
              ))}
            </div>

            {/* Launches Tab */}
            {currentTab === 'launches' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-glow bg-bg-card p-4"
              >
                {/* Controls Bar */}
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Search */}
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search token..."
                      className="bg-bg-secondary border border-border-subtle rounded-lg px-3 py-1.5 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary w-48"
                    />
                    {/* Status Filter */}
                    <select
                      value={statusFilter}
                      onChange={(e) => {
                        setStatusFilter(e.target.value as StatusFilter)
                        setCurrentPage(1)
                      }}
                      className="bg-bg-secondary border border-border-subtle rounded-lg px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none"
                    >
                      <option value="all">All Status</option>
                      <option value="awaiting_deposit">Awaiting</option>
                      <option value="launching">Launching</option>
                      <option value="completed">Completed</option>
                      <option value="failed">Failed</option>
                      <option value="expired">Expired</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Bulk Actions */}
                    {selectedLaunches.size > 0 && (
                      <button
                        onClick={() => setShowBulkRefundModal(true)}
                        className="px-3 py-1.5 text-xs font-mono bg-error/20 text-error border border-error/30 rounded-lg hover:bg-error/30 transition-colors"
                      >
                        Bulk Refund ({selectedLaunches.size})
                      </button>
                    )}
                    <button
                      onClick={selectAllRefundable}
                      className="px-3 py-1.5 text-xs font-mono bg-bg-secondary hover:bg-bg-card-hover border border-border-subtle rounded-lg transition-colors"
                    >
                      Select Refundable
                    </button>
                    <button
                      onClick={handleExport}
                      className="px-3 py-1.5 text-xs font-mono bg-bg-secondary hover:bg-bg-card-hover border border-border-subtle rounded-lg transition-colors"
                    >
                      Export
                    </button>
                  </div>
                </div>

                {/* Launches Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle">
                        <th className="text-left py-2 px-2 w-8">
                          <input
                            type="checkbox"
                            checked={selectedLaunches.size === launches.length && launches.length > 0}
                            onChange={() => {
                              if (selectedLaunches.size === launches.length) {
                                setSelectedLaunches(new Set())
                              } else {
                                setSelectedLaunches(new Set(launches.map(l => l.id)))
                              }
                            }}
                            className="rounded border-border-subtle"
                          />
                        </th>
                        <th className="text-left py-2 px-3 font-mono text-text-muted">Token</th>
                        <th className="text-left py-2 px-3 font-mono text-text-muted">User</th>
                        <th className="text-left py-2 px-3 font-mono text-text-muted">Status</th>
                        <th className="text-right py-2 px-3 font-mono text-text-muted">Deposit</th>
                        <th className="text-left py-2 px-3 font-mono text-text-muted">Created</th>
                        <th className="text-right py-2 px-3 font-mono text-text-muted">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {launches.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-text-muted font-mono">
                            No launches found
                          </td>
                        </tr>
                      ) : (
                        launches.map((launch) => (
                          <>
                            <tr
                              key={launch.id}
                              className={`border-b border-border-subtle hover:bg-bg-secondary/50 cursor-pointer ${expandedLaunch === launch.id ? 'bg-bg-secondary/30' : ''}`}
                              onClick={() => setExpandedLaunch(expandedLaunch === launch.id ? null : launch.id)}
                            >
                              <td className="py-3 px-2" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedLaunches.has(launch.id)}
                                  onChange={() => toggleLaunchSelection(launch.id)}
                                  className="rounded border-border-subtle"
                                />
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-semibold text-text-primary">{launch.token_symbol}</div>
                                <div className="text-xs text-text-muted">{launch.token_name}</div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-mono text-xs text-text-primary">
                                  @{launch.telegram_users?.telegram_username || 'Unknown'}
                                </div>
                                <div className="text-xs text-text-muted">
                                  ID: {launch.telegram_users?.telegram_id}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                {getStatusBadge(launch.status)}
                                {launch.error_message && (
                                  <div className="text-xs text-error mt-1 max-w-[150px] truncate" title={launch.error_message}>
                                    {launch.error_message}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <div className="font-mono text-text-primary">
                                  {launch.deposit_received_sol > 0 ? `${launch.deposit_received_sol.toFixed(4)} SOL` : '-'}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="text-xs text-text-muted">
                                  {new Date(launch.created_at).toLocaleDateString()}
                                </div>
                                <div className="text-xs text-text-muted">
                                  {new Date(launch.created_at).toLocaleTimeString()}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2">
                                  {['failed', 'expired'].includes(launch.status) && launch.deposit_received_sol > 0 && (
                                    <button
                                      onClick={() => {
                                        setRefundModal(launch)
                                        setRefundAddress(launch.original_funder || '')
                                      }}
                                      className="px-2 py-1 text-xs font-mono bg-error/20 text-error border border-error/30 rounded hover:bg-error/30 transition-colors"
                                    >
                                      Refund
                                    </button>
                                  )}
                                  {['awaiting_deposit', 'launching'].includes(launch.status) && (
                                    <button
                                      onClick={() => handleCancel(launch)}
                                      className="px-2 py-1 text-xs font-mono bg-text-muted/20 text-text-muted border border-text-muted/30 rounded hover:bg-text-muted/30 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  )}
                                  {launch.token_mint_address && (
                                    <a
                                      href={`https://solscan.io/token/${launch.token_mint_address}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2 py-1 text-xs font-mono bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded hover:bg-accent-primary/30 transition-colors"
                                    >
                                      View
                                    </a>
                                  )}
                                  {launch.status === 'completed' && launch.user_token_id && (
                                    <button
                                      onClick={() => openStopRefundModal(launch)}
                                      className="px-2 py-1 text-xs font-mono bg-warning/20 text-warning border border-warning/30 rounded hover:bg-warning/30 transition-colors"
                                    >
                                      Stop
                                    </button>
                                  )}
                                  {launch.status === 'completed' && !launch.user_token_id && (
                                    <button
                                      onClick={handleLinkOrphanedLaunches}
                                      disabled={isLinking}
                                      className="px-2 py-1 text-xs font-mono bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded hover:bg-accent-primary/30 transition-colors disabled:opacity-50"
                                    >
                                      {isLinking ? '...' : 'Link'}
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {/* Expanded Details Row */}
                            <AnimatePresence>
                              {expandedLaunch === launch.id && (
                                <motion.tr
                                  key={`${launch.id}-details`}
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                >
                                  <td colSpan={7} className="bg-bg-secondary/30 p-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                      <div>
                                        <div className="text-text-muted font-mono mb-1">Dev Wallet</div>
                                        <div className="text-text-primary font-mono break-all">{launch.dev_wallet_address}</div>
                                      </div>
                                      <div>
                                        <div className="text-text-muted font-mono mb-1">Ops Wallet</div>
                                        <div className="text-text-primary font-mono break-all">{launch.ops_wallet_address}</div>
                                      </div>
                                      {launch.token_mint_address && (
                                        <div>
                                          <div className="text-text-muted font-mono mb-1">Token Mint</div>
                                          <div className="text-text-primary font-mono break-all">{launch.token_mint_address}</div>
                                        </div>
                                      )}
                                      <div>
                                        <div className="text-text-muted font-mono mb-1">Expires</div>
                                        <div className="text-text-primary font-mono">{new Date(launch.expires_at).toLocaleString()}</div>
                                      </div>
                                      {launch.token_description && (
                                        <div className="col-span-2 md:col-span-4">
                                          <div className="text-text-muted font-mono mb-1">Description</div>
                                          <div className="text-text-primary">{launch.token_description}</div>
                                        </div>
                                      )}
                                      {launch.error_message && (
                                        <div className="col-span-2 md:col-span-4">
                                          <div className="text-error font-mono mb-1">Error</div>
                                          <div className="text-error">{launch.error_message}</div>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </motion.tr>
                              )}
                            </AnimatePresence>
                          </>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-border-subtle">
                    <div className="text-sm text-text-muted font-mono">
                      Page {currentPage} of {totalPages} ({totalLaunches} total)
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 text-sm font-mono bg-bg-secondary border border-border-subtle rounded disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 text-sm font-mono bg-bg-secondary border border-border-subtle rounded disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Users Tab */}
            {currentTab === 'users' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-glow bg-bg-card p-4"
              >
                <h2 className="font-display text-lg font-semibold text-text-primary mb-4">
                  Telegram Users ({totalUsers})
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle">
                        <th className="text-left py-2 px-3 font-mono text-text-muted">Username</th>
                        <th className="text-left py-2 px-3 font-mono text-text-muted">Telegram ID</th>
                        <th className="text-center py-2 px-3 font-mono text-text-muted">Launches</th>
                        <th className="text-left py-2 px-3 font-mono text-text-muted">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {telegramUsers.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-8 text-text-muted font-mono">
                            No users found
                          </td>
                        </tr>
                      ) : (
                        telegramUsers.map((user) => (
                          <tr key={user.id} className="border-b border-border-subtle hover:bg-bg-secondary/50">
                            <td className="py-3 px-3">
                              <span className="font-mono text-text-primary">
                                @{user.username || 'Unknown'}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="font-mono text-text-muted">{user.telegramId}</span>
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className={`font-mono ${user.launchCount > 0 ? 'text-accent-primary' : 'text-text-muted'}`}>
                                {user.launchCount}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <span className="text-text-muted text-xs">
                                {new Date(user.createdAt).toLocaleDateString()}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}

            {/* Logs Tab */}
            {currentTab === 'logs' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card-glow bg-bg-card p-4"
              >
                <h2 className="font-display text-lg font-semibold text-text-primary mb-4">
                  Audit Logs ({logs.length})
                </h2>
                <div className="bg-bg-secondary rounded-lg p-3 font-mono text-xs max-h-96 overflow-y-auto">
                  {logs.length === 0 ? (
                    <div className="text-text-muted">No audit logs available</div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="py-2 border-b border-border-subtle last:border-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-text-muted">
                            [{new Date(log.created_at).toLocaleString()}]
                          </span>
                          <span className={`font-semibold ${
                            log.event_type.includes('failed') || log.event_type.includes('error') ? 'text-error' :
                            log.event_type.includes('completed') || log.event_type.includes('success') ? 'text-success' :
                            'text-accent-primary'
                          }`}>
                            {log.event_type.toUpperCase()}
                          </span>
                          {log.telegram_id && (
                            <span className="text-text-muted">User: {log.telegram_id}</span>
                          )}
                        </div>
                        {log.details && (
                          <div className="text-text-muted pl-4 mt-1 break-all">
                            {JSON.stringify(log.details)}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* Charts Tab */}
            {currentTab === 'charts' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Chart Controls */}
                <div className="card-glow bg-bg-card p-4 flex items-center justify-between flex-wrap gap-4">
                  <h2 className="font-display text-lg font-semibold text-text-primary">
                    Trends & Analytics
                  </h2>
                  <div className="flex items-center gap-4">
                    <label className="text-sm font-mono text-text-muted">Time Range:</label>
                    <select
                      value={chartDays}
                      onChange={(e) => {
                        setChartDays(Number(e.target.value))
                        if (publicKey && adminAuthSignature && adminAuthMessage) {
                          fetchChartData(publicKey.toString(), adminAuthSignature, adminAuthMessage, Number(e.target.value))
                            .then(data => data && setChartData(data))
                        }
                      }}
                      className="bg-bg-secondary border border-border-subtle rounded-lg px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none"
                    >
                      <option value={7}>Last 7 days</option>
                      <option value={14}>Last 14 days</option>
                      <option value={30}>Last 30 days</option>
                      <option value={60}>Last 60 days</option>
                      <option value={90}>Last 90 days</option>
                    </select>
                  </div>
                </div>

                {chartData ? (
                  <>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="card-glow bg-bg-card p-4 text-center">
                        <div className="text-3xl font-bold text-accent-primary">{chartData.summary.totalLaunches}</div>
                        <div className="text-sm text-text-muted font-mono">Total Launches ({chartDays}d)</div>
                      </div>
                      <div className="card-glow bg-bg-card p-4 text-center">
                        <div className="text-3xl font-bold text-success">{chartData.summary.overallSuccessRate}%</div>
                        <div className="text-sm text-text-muted font-mono">Success Rate</div>
                      </div>
                      <div className="card-glow bg-bg-card p-4 text-center">
                        <div className="text-3xl font-bold text-warning">{chartData.summary.avgLaunchesPerDay}</div>
                        <div className="text-sm text-text-muted font-mono">Avg/Day</div>
                      </div>
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Daily Launch Volume */}
                      <div className="card-glow bg-bg-card p-4">
                        <h3 className="font-display text-md font-semibold text-text-primary mb-4">
                          Daily Launch Volume
                        </h3>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData.dailyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                              <XAxis
                                dataKey="displayDate"
                                tick={{ fill: '#888', fontSize: 10 }}
                                interval={Math.ceil(chartData.dailyData.length / 10)}
                              />
                              <YAxis tick={{ fill: '#888', fontSize: 10 }} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                                labelStyle={{ color: '#fff' }}
                              />
                              <Legend wrapperStyle={{ fontSize: 12 }} />
                              <Bar dataKey="completed" name="Completed" stackId="a" fill="#22c55e" />
                              <Bar dataKey="failed" name="Failed" stackId="a" fill="#ef4444" />
                              <Bar dataKey="expired" name="Expired" stackId="a" fill="#6b7280" />
                              <Bar dataKey="refunded" name="Refunded" stackId="a" fill="#8b5cf6" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Status Distribution Pie Chart */}
                      <div className="card-glow bg-bg-card p-4">
                        <h3 className="font-display text-md font-semibold text-text-primary mb-4">
                          Status Distribution
                        </h3>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={chartData.statusDistribution as any}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="name"
                                label={({ name, percent }: any) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}
                                labelLine={{ stroke: '#666' }}
                              >
                                {chartData.statusDistribution.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Success Rate Trend */}
                      <div className="card-glow bg-bg-card p-4">
                        <h3 className="font-display text-md font-semibold text-text-primary mb-4">
                          Success Rate Trend (7-day rolling)
                        </h3>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData.successRateData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                              <XAxis
                                dataKey="displayDate"
                                tick={{ fill: '#888', fontSize: 10 }}
                                interval={Math.ceil(chartData.successRateData.length / 10)}
                              />
                              <YAxis tick={{ fill: '#888', fontSize: 10 }} domain={[0, 100]} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                                labelStyle={{ color: '#fff' }}
                                formatter={(value: any) => [`${value}%`, 'Success Rate']}
                              />
                              <Line
                                type="monotone"
                                dataKey="successRate"
                                stroke="#22c55e"
                                strokeWidth={2}
                                dot={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* SOL Processed Over Time */}
                      <div className="card-glow bg-bg-card p-4">
                        <h3 className="font-display text-md font-semibold text-text-primary mb-4">
                          SOL Processed Daily
                        </h3>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData.dailyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                              <XAxis
                                dataKey="displayDate"
                                tick={{ fill: '#888', fontSize: 10 }}
                                interval={Math.ceil(chartData.dailyData.length / 10)}
                              />
                              <YAxis tick={{ fill: '#888', fontSize: 10 }} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
                                labelStyle={{ color: '#fff' }}
                                formatter={(value: any) => [`${Number(value).toFixed(2)} SOL`, 'Processed']}
                              />
                              <Area
                                type="monotone"
                                dataKey="solProcessed"
                                stroke="#f59e0b"
                                fill="#f59e0b"
                                fillOpacity={0.3}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="card-glow bg-bg-card p-8 text-center">
                    <div className="text-text-muted font-mono">
                      {isLoading ? 'Loading chart data...' : 'No chart data available'}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Broadcast Tab */}
            {currentTab === 'broadcast' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Maintenance Mode Control */}
                <div className="card-glow bg-bg-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display text-lg font-semibold text-text-primary">
                      Maintenance Mode
                    </h2>
                    <div className={`px-3 py-1 rounded-full text-xs font-mono ${
                      alertStatus?.botStatus.isMaintenanceMode
                        ? 'bg-warning/20 text-warning border border-warning/30'
                        : 'bg-success/20 text-success border border-success/30'
                    }`}>
                      {alertStatus?.botStatus.isMaintenanceMode ? 'MAINTENANCE ACTIVE' : 'OPERATIONAL'}
                    </div>
                  </div>

                  {alertStatus?.botStatus.isMaintenanceMode ? (
                    <div className="space-y-4">
                      <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
                        <p className="text-sm text-text-muted font-mono mb-2">Current reason:</p>
                        <p className="text-text-primary">{alertStatus.botStatus.maintenanceReason}</p>
                        {alertStatus.botStatus.estimatedEndTime && (
                          <p className="text-sm text-text-muted font-mono mt-2">
                            Estimated end: {alertStatus.botStatus.estimatedEndTime}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          if (!publicKey || !adminAuthSignature || !adminAuthMessage) return
                          setIsTogglingMaintenance(true)
                          try {
                            const result = await disableMaintenanceMode(
                              publicKey.toString(),
                              adminAuthSignature,
                              adminAuthMessage,
                              true
                            )
                            if (result.success) {
                              setBroadcastResult({ type: 'success', text: `Maintenance disabled. Notified ${result.notifiedUsers} subscribers.` })
                              await reloadData()
                            } else {
                              setBroadcastResult({ type: 'error', text: result.error || 'Failed to disable maintenance' })
                            }
                          } finally {
                            setIsTogglingMaintenance(false)
                          }
                        }}
                        disabled={isTogglingMaintenance}
                        className="w-full py-2 px-4 bg-success/20 text-success border border-success/30 rounded-lg font-mono text-sm hover:bg-success/30 transition-colors disabled:opacity-50"
                      >
                        {isTogglingMaintenance ? 'Disabling...' : 'Disable Maintenance Mode & Notify Users'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-mono text-text-muted mb-2">Reason *</label>
                        <input
                          type="text"
                          value={maintenanceReason}
                          onChange={(e) => setMaintenanceReason(e.target.value)}
                          placeholder="e.g., Scheduled upgrade, Bug fix deployment"
                          className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-mono text-text-muted mb-2">Estimated End Time (optional)</label>
                        <input
                          type="text"
                          value={maintenanceEndTime}
                          onChange={(e) => setMaintenanceEndTime(e.target.value)}
                          placeholder="e.g., 30 minutes, 2 hours, 5:00 PM UTC"
                          className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                        />
                      </div>
                      <button
                        onClick={async () => {
                          if (!publicKey || !adminAuthSignature || !adminAuthMessage || !maintenanceReason) return
                          setIsTogglingMaintenance(true)
                          try {
                            const result = await enableMaintenanceMode(
                              publicKey.toString(),
                              adminAuthSignature,
                              adminAuthMessage,
                              maintenanceReason,
                              maintenanceEndTime || undefined,
                              true
                            )
                            if (result.success) {
                              setBroadcastResult({ type: 'success', text: `Maintenance enabled. Notified ${result.notifiedUsers} subscribers.` })
                              setMaintenanceReason('')
                              setMaintenanceEndTime('')
                              await reloadData()
                            } else {
                              setBroadcastResult({ type: 'error', text: result.error || 'Failed to enable maintenance' })
                            }
                          } finally {
                            setIsTogglingMaintenance(false)
                          }
                        }}
                        disabled={isTogglingMaintenance || !maintenanceReason}
                        className="w-full py-2 px-4 bg-warning/20 text-warning border border-warning/30 rounded-lg font-mono text-sm hover:bg-warning/30 transition-colors disabled:opacity-50"
                      >
                        {isTogglingMaintenance ? 'Enabling...' : 'Enable Maintenance Mode & Notify Users'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Broadcast Message */}
                <div className="card-glow bg-bg-card p-6">
                  <h2 className="font-display text-lg font-semibold text-text-primary mb-4">
                    Send Broadcast Message
                  </h2>
                  <p className="text-sm text-text-muted font-mono mb-4">
                    Send a message to all {alertStatus?.subscriberCount || 0} alert subscribers
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-mono text-text-muted mb-2">Title *</label>
                      <input
                        type="text"
                        value={broadcastTitle}
                        onChange={(e) => setBroadcastTitle(e.target.value)}
                        placeholder="e.g., New Feature Announcement"
                        maxLength={100}
                        className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                      />
                      <span className="text-xs text-text-muted font-mono">{broadcastTitle.length}/100</span>
                    </div>
                    <div>
                      <label className="block text-sm font-mono text-text-muted mb-2">Message *</label>
                      <textarea
                        value={broadcastBody}
                        onChange={(e) => setBroadcastBody(e.target.value)}
                        placeholder="Write your announcement message..."
                        maxLength={2000}
                        rows={5}
                        className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary resize-none"
                      />
                      <span className="text-xs text-text-muted font-mono">{broadcastBody.length}/2000</span>
                    </div>
                    <button
                      onClick={async () => {
                        if (!publicKey || !adminAuthSignature || !adminAuthMessage || !broadcastTitle || !broadcastBody) return
                        setIsSendingBroadcast(true)
                        try {
                          const result = await sendBroadcast(
                            publicKey.toString(),
                            adminAuthSignature,
                            adminAuthMessage,
                            broadcastTitle,
                            broadcastBody
                          )
                          if (result.success && result.result) {
                            setBroadcastResult({
                              type: 'success',
                              text: `Broadcast sent! ${result.result.successful}/${result.result.total} delivered.`
                            })
                            setBroadcastTitle('')
                            setBroadcastBody('')
                          } else {
                            setBroadcastResult({ type: 'error', text: result.error || 'Failed to send broadcast' })
                          }
                        } finally {
                          setIsSendingBroadcast(false)
                        }
                      }}
                      disabled={isSendingBroadcast || !broadcastTitle || !broadcastBody}
                      className="w-full py-2 px-4 bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg font-mono text-sm hover:bg-accent-primary/30 transition-colors disabled:opacity-50"
                    >
                      {isSendingBroadcast ? 'Sending...' : `Send Broadcast to ${alertStatus?.subscriberCount || 0} Subscribers`}
                    </button>
                  </div>
                </div>

                {/* Result Message */}
                {broadcastResult && (
                  <div className={`p-4 rounded-lg border ${
                    broadcastResult.type === 'success'
                      ? 'bg-success/10 border-success/30 text-success'
                      : 'bg-error/10 border-error/30 text-error'
                  }`}>
                    <p className="font-mono text-sm">{broadcastResult.text}</p>
                    <button
                      onClick={() => setBroadcastResult(null)}
                      className="text-xs font-mono underline mt-2"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Subscribers List */}
                <div className="card-glow bg-bg-card p-6">
                  <h2 className="font-display text-lg font-semibold text-text-primary mb-4">
                    Alert Subscribers ({alertStatus?.subscriberCount || 0})
                  </h2>
                  {alertStatus?.subscribers && alertStatus.subscribers.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border-subtle">
                            <th className="text-left py-2 px-3 text-text-muted font-mono text-xs">Telegram ID</th>
                            <th className="text-left py-2 px-3 text-text-muted font-mono text-xs">Username</th>
                            <th className="text-left py-2 px-3 text-text-muted font-mono text-xs">Subscribed At</th>
                          </tr>
                        </thead>
                        <tbody>
                          {alertStatus.subscribers.map((sub) => (
                            <tr key={sub.telegramId} className="border-b border-border-subtle/50 hover:bg-bg-secondary/50">
                              <td className="py-2 px-3 font-mono text-xs text-text-primary">{sub.telegramId}</td>
                              <td className="py-2 px-3 font-mono text-xs text-text-muted">{sub.username || '-'}</td>
                              <td className="py-2 px-3 font-mono text-xs text-text-muted">
                                {new Date(sub.subscribedAt).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-text-muted font-mono text-sm">No subscribers yet.</p>
                  )}
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* Refund Modal */}
        {refundModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-bg-card border border-border-subtle rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Refund {refundModal.token_symbol}
              </h3>

              <div className="space-y-4">
                <div className="bg-bg-secondary rounded-lg p-3">
                  <div className="text-xs text-text-muted mb-1">Balance to Refund</div>
                  <div className="text-xl font-bold text-success">
                    {refundModal.current_balance?.toFixed(6) || refundModal.deposit_received_sol.toFixed(6)} SOL
                  </div>
                </div>

                <div>
                  <label className="block text-text-muted font-mono text-xs mb-2">
                    Refund Address
                  </label>
                  <input
                    type="text"
                    value={refundAddress}
                    onChange={(e) => setRefundAddress(e.target.value)}
                    placeholder="Enter Solana address..."
                    className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                  />
                  {refundModal.original_funder && refundAddress !== refundModal.original_funder && (
                    <button
                      onClick={() => setRefundAddress(refundModal.original_funder!)}
                      className="text-xs text-accent-primary mt-2 hover:underline"
                    >
                      Use original funder: {refundModal.original_funder.slice(0, 8)}...
                    </button>
                  )}
                </div>

                {refundMessage && (
                  <div className={`p-3 rounded-lg font-mono text-sm ${
                    refundMessage.type === 'success'
                      ? 'bg-success/20 text-success border border-success/30'
                      : 'bg-error/20 text-error border border-error/30'
                  }`}>
                    {refundMessage.text}
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setRefundModal(null)
                      setRefundAddress('')
                      setRefundMessage(null)
                    }}
                    className="px-4 py-2 text-sm font-mono bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleRefund}
                    disabled={isRefunding || !refundAddress.trim()}
                    className="px-4 py-2 text-sm font-mono bg-success/20 text-success border border-success/30 rounded-lg hover:bg-success/30 transition-colors disabled:opacity-50"
                  >
                    {isRefunding ? 'Processing...' : 'Execute Refund'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Refund Modal */}
        {showBulkRefundModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-bg-card border border-border-subtle rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Bulk Refund
              </h3>

              <div className="space-y-4">
                <div className="bg-bg-secondary rounded-lg p-3">
                  <div className="text-xs text-text-muted mb-1">Selected Launches</div>
                  <div className="text-xl font-bold text-error">
                    {selectedLaunches.size} launch{selectedLaunches.size !== 1 ? 'es' : ''}
                  </div>
                </div>

                <p className="text-text-muted text-sm">
                  This will automatically refund each selected launch to its original funder address.
                </p>

                {bulkRefundResults && (
                  <div className="bg-success/20 text-success border border-success/30 p-3 rounded-lg font-mono text-sm">
                    Completed: {bulkRefundResults.successful}/{bulkRefundResults.total} successful
                    {bulkRefundResults.failed > 0 && `, ${bulkRefundResults.failed} failed`}
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setShowBulkRefundModal(false)
                      setBulkRefundResults(null)
                    }}
                    className="px-4 py-2 text-sm font-mono bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkRefund}
                    disabled={isBulkRefunding}
                    className="px-4 py-2 text-sm font-mono bg-error/20 text-error border border-error/30 rounded-lg hover:bg-error/30 transition-colors disabled:opacity-50"
                  >
                    {isBulkRefunding ? 'Processing...' : 'Execute Bulk Refund'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stop & Refund Modal (for completed launches) */}
        {stopRefundModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-bg-card border border-border-subtle rounded-xl p-6 max-w-lg w-full mx-4">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Stop Flywheel & Refund - {stopRefundModal.token_symbol}
              </h3>

              <div className="space-y-4">
                {isLoadingStopRefundPreview ? (
                  <div className="text-center py-4 text-text-muted">Loading wallet balances...</div>
                ) : stopRefundPreview ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-bg-secondary rounded-lg p-3">
                        <div className="text-xs text-text-muted mb-1">Dev Wallet</div>
                        <div className="text-lg font-bold text-success">
                          {stopRefundPreview.wallets.dev.balance.toFixed(6)} SOL
                        </div>
                        <div className="text-xs text-text-muted truncate">{stopRefundPreview.wallets.dev.address.slice(0,8)}...</div>
                      </div>
                      <div className="bg-bg-secondary rounded-lg p-3">
                        <div className="text-xs text-text-muted mb-1">Ops Wallet</div>
                        <div className="text-lg font-bold text-success">
                          {stopRefundPreview.wallets.ops.balance.toFixed(6)} SOL
                        </div>
                        <div className="text-xs text-text-muted truncate">{stopRefundPreview.wallets.ops.address.slice(0,8)}...</div>
                      </div>
                    </div>

                    <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                      <div className="text-xs text-warning font-mono mb-1">Total Refundable</div>
                      <div className="text-2xl font-bold text-warning">
                        {stopRefundPreview.totalRefundable.toFixed(6)} SOL
                      </div>
                    </div>

                    <div>
                      <label className="block text-text-muted font-mono text-xs mb-2">
                        Refund Address
                      </label>
                      <input
                        type="text"
                        value={stopRefundAddress}
                        onChange={(e) => setStopRefundAddress(e.target.value)}
                        placeholder="Enter Solana address..."
                        className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
                      />
                      {stopRefundPreview.suggestedRefundAddress && stopRefundAddress !== stopRefundPreview.suggestedRefundAddress && (
                        <button
                          onClick={() => setStopRefundAddress(stopRefundPreview.suggestedRefundAddress!)}
                          className="text-xs text-accent-primary mt-2 hover:underline"
                        >
                          Use original funder: {stopRefundPreview.suggestedRefundAddress.slice(0, 8)}...
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-error">Failed to load wallet balances</div>
                )}

                {stopRefundResult && (
                  <div className={`p-3 rounded-lg font-mono text-sm ${
                    stopRefundResult.success
                      ? 'bg-success/20 text-success border border-success/30'
                      : 'bg-error/20 text-error border border-error/30'
                  }`}>
                    {stopRefundResult.success
                      ? `Refunded ${stopRefundResult.totalRefunded?.toFixed(6) || 0} SOL`
                      : stopRefundResult.error || 'Refund failed'}
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setStopRefundModal(null)
                      setStopRefundResult(null)
                    }}
                    className="px-4 py-2 text-sm font-mono bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStopAndRefund}
                    disabled={isStopRefunding || !stopRefundAddress.trim() || !stopRefundPreview}
                    className="px-4 py-2 text-sm font-mono bg-warning/20 text-warning border border-warning/30 rounded-lg hover:bg-warning/30 transition-colors disabled:opacity-50"
                  >
                    {isStopRefunding ? 'Processing...' : 'Stop & Refund'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
