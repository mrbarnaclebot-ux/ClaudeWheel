'use client'

import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { motion } from 'framer-motion'
import Link from 'next/link'
import bs58 from 'bs58'
import {
  fetchAdminAuthNonce,
  fetchTelegramStats,
  fetchTelegramLaunches,
  fetchPendingRefunds,
  fetchTelegramLogs,
  executeRefund,
  cancelTelegramLaunch,
  type TelegramLaunchStats,
  type TelegramLaunch,
  type TelegramAuditLog,
} from '@/lib/api'

const DEV_WALLET_ADDRESS = process.env.NEXT_PUBLIC_DEV_WALLET_ADDRESS || ''

type StatusFilter = 'all' | 'awaiting_deposit' | 'launching' | 'completed' | 'failed' | 'expired' | 'refunded'

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
  const [isLoading, setIsLoading] = useState(false)

  // Filter state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showLogs, setShowLogs] = useState(false)

  // Refund modal state
  const [refundModal, setRefundModal] = useState<TelegramLaunch | null>(null)
  const [refundAddress, setRefundAddress] = useState('')
  const [isRefunding, setIsRefunding] = useState(false)
  const [refundMessage, setRefundMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

  // Load all data
  const loadAllData = async (pubkey: string, sig: string, msg: string) => {
    setIsLoading(true)
    try {
      const [statsData, launchesData, refundsData, logsData] = await Promise.all([
        fetchTelegramStats(pubkey, sig, msg),
        fetchTelegramLaunches(pubkey, sig, msg, { status: statusFilter === 'all' ? undefined : statusFilter }),
        fetchPendingRefunds(pubkey, sig, msg),
        fetchTelegramLogs(pubkey, sig, msg, { limit: 100 }),
      ])

      if (statsData) setStats(statsData)
      if (launchesData) setLaunches(launchesData.launches)
      if (refundsData) setPendingRefunds(refundsData.refunds)
      if (logsData) setLogs(logsData.logs)
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Reload data with current auth
  const reloadData = useCallback(async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return
    await loadAllData(publicKey.toString(), adminAuthSignature, adminAuthMessage)
  }, [publicKey, adminAuthSignature, adminAuthMessage, statusFilter])

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

  return (
    <div className="min-h-screen bg-void p-4 md:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2">
              <span className="text-accent-primary">📱</span>
              Telegram Launches
            </h1>
            <p className="text-text-muted font-mono text-sm mt-1">
              Monitor launches and process refunds
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="px-4 py-2 text-sm font-mono bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
            >
              ← Back to Admin
            </Link>
            <WalletMultiButton className="!bg-success/20 !text-success !font-mono !rounded-lg !border !border-success/30 !text-sm" />
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto space-y-6">
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

        {/* Stats Cards */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 md:grid-cols-6 gap-3"
          >
            <div className="card-glow bg-bg-card p-4 text-center">
              <div className="text-2xl font-bold text-text-primary">{stats.total}</div>
              <div className="text-xs text-text-muted font-mono">Total</div>
            </div>
            <div className="card-glow bg-bg-card p-4 text-center">
              <div className="text-2xl font-bold text-warning">{stats.awaiting}</div>
              <div className="text-xs text-text-muted font-mono">Awaiting</div>
            </div>
            <div className="card-glow bg-bg-card p-4 text-center">
              <div className="text-2xl font-bold text-success">{stats.completed}</div>
              <div className="text-xs text-text-muted font-mono">Completed</div>
            </div>
            <div className="card-glow bg-bg-card p-4 text-center">
              <div className="text-2xl font-bold text-error">{stats.failed}</div>
              <div className="text-xs text-text-muted font-mono">Failed</div>
            </div>
            <div className="card-glow bg-bg-card p-4 text-center">
              <div className="text-2xl font-bold text-text-muted">{stats.expired}</div>
              <div className="text-xs text-text-muted font-mono">Expired</div>
            </div>
            <div className="card-glow bg-bg-card p-4 text-center">
              <div className="text-2xl font-bold text-accent-secondary">{stats.refunded}</div>
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
            <div className="space-y-2">
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

        {/* Launches List */}
        {adminAuthSignature && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-glow bg-bg-card p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-text-primary">
                All Launches
              </h2>
              <div className="flex items-center gap-2">
                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as StatusFilter)
                    if (adminAuthSignature && adminAuthMessage && publicKey) {
                      fetchTelegramLaunches(
                        publicKey.toString(),
                        adminAuthSignature,
                        adminAuthMessage,
                        { status: e.target.value === 'all' ? undefined : e.target.value }
                      ).then((data) => {
                        if (data) setLaunches(data.launches)
                      })
                    }
                  }}
                  className="bg-bg-secondary border border-border-subtle rounded-lg px-3 py-1 text-sm font-mono text-text-primary focus:outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="awaiting_deposit">Awaiting</option>
                  <option value="launching">Launching</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                  <option value="expired">Expired</option>
                  <option value="refunded">Refunded</option>
                </select>
                <button
                  onClick={reloadData}
                  disabled={isLoading}
                  className="px-3 py-1 text-xs font-mono bg-bg-secondary hover:bg-bg-card-hover border border-border-subtle rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* Launches Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle">
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
                      <td colSpan={6} className="text-center py-8 text-text-muted font-mono">
                        No launches found
                      </td>
                    </tr>
                  ) : (
                    launches.map((launch) => (
                      <tr key={launch.id} className="border-b border-border-subtle hover:bg-bg-secondary/50">
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
                        <td className="py-3 px-3 text-right">
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
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Audit Logs */}
        {adminAuthSignature && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-glow bg-bg-card p-4"
          >
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="w-full flex items-center justify-between"
            >
              <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
                <span className="text-accent-primary">◈</span>
                Audit Logs
                <span className="text-xs font-mono text-text-muted">({logs.length})</span>
              </h2>
              <span className="text-text-muted text-sm">{showLogs ? '▼' : '▶'}</span>
            </button>

            {showLogs && (
              <div className="mt-4 bg-bg-secondary rounded-lg p-3 font-mono text-xs max-h-80 overflow-y-auto">
                {logs.length === 0 ? (
                  <div className="text-text-muted">No audit logs available</div>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="py-1 border-b border-border-subtle last:border-0">
                      <div className="flex items-center gap-2">
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
                        <div className="text-text-muted pl-4 mt-1">
                          {JSON.stringify(log.details)}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </motion.div>
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
      </div>
    </div>
  )
}
