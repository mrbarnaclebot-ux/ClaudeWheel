'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useAdminAuth } from '../../_stores/adminStore'
import { adminQueryKeys } from '../../_lib/queryClient'
import { fetchWheelData, executeWheelSell, type WheelData } from '../../_lib/adminApi'
import { DataCard, DataCardGrid } from '../shared/DataCard'
import { StatusBadge, FlywheelPhaseBadge } from '../shared/StatusBadge'
import { StatsGridSkeleton, PanelSkeleton } from '../shared/LoadingSkeleton'
import {
  Icon,
  RotateCw,
  CheckCircle,
  XCircle,
  Wallet,
  TrendingUp,
  BarChart3,
  Activity,
  Users,
  ExternalLink,
} from '../shared/Icons'

export function WheelView() {
  const { isAuthenticated, getToken } = useAdminAuth()
  const queryClient = useQueryClient()
  const [sellPercentage, setSellPercentage] = useState<number | null>(null)
  const [showSellConfirm, setShowSellConfirm] = useState(false)

  // Fetch $WHEEL data
  const { data: wheelData, isLoading, error } = useQuery({
    queryKey: adminQueryKeys.wheelData(),
    queryFn: async () => {
      const token = await getToken()
      if (!token) return null
      return fetchWheelData(token)
    },
    enabled: isAuthenticated,
    staleTime: 10000,
  })

  // Execute sell mutation
  const sellMutation = useMutation({
    mutationFn: async (percentage: number) => {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      return executeWheelSell(token, percentage)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.wheel() })
      setSellPercentage(null)
      setShowSellConfirm(false)
    },
  })

  const handleExecuteSell = () => {
    if (sellPercentage) {
      sellMutation.mutate(sellPercentage)
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <StatsGridSkeleton count={4} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PanelSkeleton />
          <PanelSkeleton />
          <PanelSkeleton />
        </div>
      </div>
    )
  }

  if (error || !wheelData) {
    return (
      <div className="p-6">
        <div className="bg-bg-card border border-border-subtle rounded-xl p-8 text-center">
          <div className="flex justify-center mb-4">
            <Icon icon={RotateCw} size="xl" color="muted" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">Platform Token Not Found</h3>
          <p className="text-text-muted">
            The $WHEEL platform token has not been registered yet or could not be loaded.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent-primary/20 flex items-center justify-center">
            {wheelData.tokenImage ? (
              <img src={wheelData.tokenImage} alt={wheelData.symbol} className="w-12 h-12 rounded-full" />
            ) : (
              <Icon icon={RotateCw} size="lg" color="accent" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{wheelData.symbol}</h2>
            <p className="text-sm text-text-muted font-mono">{wheelData.tokenMint}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {wheelData.flywheelState && (
            <FlywheelPhaseBadge
              phase={wheelData.flywheelState.phase}
              count={wheelData.flywheelState.phase === 'buy'
                ? wheelData.flywheelState.buyCount
                : wheelData.flywheelState.sellCount}
            />
          )}
          <a
            href={`https://solscan.io/token/${wheelData.tokenMint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm font-mono bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg hover:bg-accent-primary/30 transition-colors"
          >
            <span>View on Solscan</span>
            <Icon icon={ExternalLink} size="sm" color="inherit" />
          </a>
        </div>
      </div>

      {/* Token Stats */}
      <DataCardGrid columns={4}>
        <DataCard
          title="Status"
          value={wheelData.isActive ? 'Active' : 'Inactive'}
          icon={<Icon icon={wheelData.isActive ? CheckCircle : XCircle} size="lg" color={wheelData.isActive ? 'success' : 'error'} />}
          variant={wheelData.isActive ? 'success' : 'error'}
        />
        <DataCard
          title="Flywheel"
          value={wheelData.config?.flywheelActive ? 'Active' : 'Inactive'}
          subtitle={wheelData.config?.algorithmMode || 'N/A'}
          icon={<Icon icon={RotateCw} size="lg" color={wheelData.config?.flywheelActive ? 'accent' : 'muted'} className={wheelData.config?.flywheelActive ? 'animate-spin' : ''} />}
          variant={wheelData.config?.flywheelActive ? 'accent' : 'default'}
        />
        <DataCard
          title="Total Fees Collected"
          value={`${wheelData.feeStats.totalCollected.toFixed(4)} SOL`}
          icon={<Icon icon={Wallet} size="lg" color="success" />}
          variant="success"
        />
        <DataCard
          title="Today's Fees"
          value={`${wheelData.feeStats.todayCollected.toFixed(4)} SOL`}
          subtitle={`${wheelData.feeStats.hourCollected.toFixed(4)} SOL this hour`}
          icon={<Icon icon={TrendingUp} size="lg" color="muted" />}
          variant="default"
        />
      </DataCardGrid>

      {/* Market Data */}
      {wheelData.marketData && (
        <DataCardGrid columns={4}>
          <DataCard
            title="Market Cap"
            value={wheelData.marketData.marketCap > 0
              ? `$${(wheelData.marketData.marketCap / 1000).toFixed(1)}K`
              : 'N/A'}
            icon={<Icon icon={BarChart3} size="lg" color="accent" />}
            variant="accent"
          />
          <DataCard
            title="24h Volume"
            value={wheelData.marketData.volume24h > 0
              ? `$${wheelData.marketData.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : 'N/A'}
            icon={<Icon icon={Activity} size="lg" color="muted" />}
            variant="default"
          />
          <DataCard
            title="Bonding Curve"
            value={wheelData.marketData.isGraduated
              ? 'Graduated'
              : `${(wheelData.marketData.bondingCurveProgress * 100).toFixed(1)}%`}
            subtitle={wheelData.marketData.isGraduated ? 'On Raydium' : 'On Bonding Curve'}
            icon={<Icon icon={wheelData.marketData.isGraduated ? CheckCircle : TrendingUp} size="lg" color={wheelData.marketData.isGraduated ? 'success' : 'warning'} />}
            variant={wheelData.marketData.isGraduated ? 'success' : 'warning'}
          />
          <DataCard
            title="Holders"
            value={wheelData.marketData.holders > 0
              ? wheelData.marketData.holders.toLocaleString()
              : 'N/A'}
            icon={<Icon icon={Users} size="lg" color="muted" />}
            variant="default"
          />
        </DataCardGrid>
      )}

      {/* Wallets & Config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dev Wallet */}
        <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Dev Wallet</h3>
            <StatusBadge variant="success" size="xs">Active</StatusBadge>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">SOL Balance</span>
              <span className="font-mono text-success">{wheelData.devWallet.solBalance.toFixed(4)} SOL</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Token Balance</span>
              <span className="font-mono text-accent-primary">{wheelData.devWallet.tokenBalance.toLocaleString()}</span>
            </div>
            <div className="text-xs text-text-muted font-mono truncate">{wheelData.devWallet.address || 'Not configured'}</div>
          </div>
        </div>

        {/* Ops Wallet */}
        <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Ops Wallet</h3>
            <StatusBadge variant="success" size="xs">Active</StatusBadge>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">SOL Balance</span>
              <span className="font-mono text-success">{wheelData.opsWallet.solBalance.toFixed(4)} SOL</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Token Balance</span>
              <span className="font-mono text-accent-primary">{wheelData.opsWallet.tokenBalance.toLocaleString()}</span>
            </div>
            <div className="text-xs text-text-muted font-mono truncate">{wheelData.opsWallet.address || 'Not configured'}</div>
          </div>
        </div>

        {/* Fee Stats */}
        <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">Fee Collection</h3>
            <StatusBadge variant="accent" size="xs">Auto-Claim</StatusBadge>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Total Collected</span>
              <span className="font-mono text-success">{wheelData.feeStats.totalCollected.toFixed(4)} SOL</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Today</span>
              <span className="font-mono text-text-primary">{wheelData.feeStats.todayCollected.toFixed(4)} SOL</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">This Hour</span>
              <span className="font-mono text-text-primary">{wheelData.feeStats.hourCollected.toFixed(4)} SOL</span>
            </div>
          </div>
        </div>
      </div>

      {/* Config Details */}
      {wheelData.config && (
        <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Configuration</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-bg-secondary rounded-lg p-3">
              <span className="text-text-muted text-xs block">Algorithm</span>
              <span className="text-text-primary capitalize">{wheelData.config.algorithmMode}</span>
            </div>
            <div className="bg-bg-secondary rounded-lg p-3">
              <span className="text-text-muted text-xs block">Buy Range</span>
              <span className="text-text-primary font-mono">
                {wheelData.config.minBuySol}-{wheelData.config.maxBuySol} SOL
              </span>
            </div>
            <div className="bg-bg-secondary rounded-lg p-3">
              <span className="text-text-muted text-xs block">Slippage</span>
              <span className="text-text-primary font-mono">{wheelData.config.slippageBps / 100}%</span>
            </div>
            <div className="bg-bg-secondary rounded-lg p-3">
              <span className="text-text-muted text-xs block">Flywheel</span>
              <span className={wheelData.config.flywheelActive ? 'text-success' : 'text-text-muted'}>
                {wheelData.config.flywheelActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Manual Sell Controls */}
      <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Manual Token Sell</h3>
        <p className="text-sm text-text-muted mb-4">
          Execute a manual sell of platform tokens. This will sell from the dev wallet.
        </p>
        <div className="flex items-center gap-4">
          {[25, 50, 100].map((pct) => (
            <button
              key={pct}
              onClick={() => setSellPercentage(pct)}
              className={`px-4 py-2 text-sm font-mono rounded-lg border transition-colors ${
                sellPercentage === pct
                  ? pct === 100
                    ? 'bg-error/20 text-error border-error/30'
                    : 'bg-warning/20 text-warning border-warning/30'
                  : 'bg-bg-secondary text-text-muted border-border-subtle hover:bg-bg-card-hover'
              }`}
            >
              {pct}%
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setShowSellConfirm(true)}
            disabled={!sellPercentage || sellMutation.isPending}
            className="px-6 py-2 text-sm font-mono bg-error/20 text-error border border-error/30 rounded-lg hover:bg-error/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sellMutation.isPending ? 'Processing...' : 'Execute Sell'}
          </button>
        </div>
        {sellPercentage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-warning/10 border border-warning/30 rounded-lg text-sm text-warning"
          >
            This will sell {sellPercentage}% of tokens ({(wheelData.devWallet.tokenBalance * sellPercentage / 100).toLocaleString()} tokens).
            A confirmation will be required.
          </motion.div>
        )}
        {sellMutation.isSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success"
          >
            Sell initiated successfully. The transaction will be processed in the next cycle.
          </motion.div>
        )}
        {sellMutation.isError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 p-3 bg-error/10 border border-error/30 rounded-lg text-sm text-error"
          >
            Failed to initiate sell. Please try again.
          </motion.div>
        )}
      </div>

      {/* Sell Confirmation Modal */}
      {showSellConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowSellConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="bg-bg-card border border-border-subtle rounded-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-text-primary mb-4">Confirm Sell</h3>
            <p className="text-text-muted mb-4">
              You are about to sell <span className="text-warning font-bold">{sellPercentage}%</span> of the platform tokens.
              This action cannot be undone.
            </p>
            <div className="bg-bg-secondary rounded-lg p-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Amount to sell</span>
                <span className="font-mono text-warning">
                  {(wheelData.devWallet.tokenBalance * (sellPercentage || 0) / 100).toLocaleString()} tokens
                </span>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowSellConfirm(false)}
                className="px-4 py-2 text-sm bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteSell}
                disabled={sellMutation.isPending}
                className="px-4 py-2 text-sm bg-error/20 text-error border border-error/30 rounded-lg hover:bg-error/30 transition-colors disabled:opacity-50"
              >
                {sellMutation.isPending ? 'Processing...' : 'Confirm Sell'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
