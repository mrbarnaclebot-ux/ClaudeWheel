'use client'

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useAdminAuth } from '../../_stores/adminStore'
import { adminQueryKeys } from '../../_lib/queryClient'
import { fetchPlatformStats, fetchTelegramStats } from '../../_lib/adminApi'
import { DataCard, DataCardGrid } from '../shared/DataCard'
import { StatsGridSkeleton } from '../shared/LoadingSkeleton'
import type { PlatformStats, TelegramLaunchStats } from '../../_types/admin.types'

export function OverviewStats() {
  const { publicKey, signature, message } = useAdminAuth()

  // Fetch platform stats
  const { data: platformStats, isLoading: isPlatformLoading } = useQuery({
    queryKey: adminQueryKeys.platformStats(),
    queryFn: () => fetchPlatformStats(publicKey!, signature!, message!),
    enabled: Boolean(publicKey && signature && message),
    staleTime: 10000, // 10 seconds
  })

  // Fetch telegram stats
  const { data: telegramStats, isLoading: isTelegramLoading } = useQuery({
    queryKey: adminQueryKeys.telegramStats(),
    queryFn: () => fetchTelegramStats(publicKey!, signature!, message!),
    enabled: Boolean(publicKey && signature && message),
    staleTime: 10000,
  })

  const isLoading = isPlatformLoading || isTelegramLoading

  if (isLoading) {
    return (
      <div className="space-y-6">
        <StatsGridSkeleton count={4} />
        <StatsGridSkeleton count={4} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Platform Stats */}
      <div>
        <h3 className="text-sm font-medium text-text-muted mb-3">Platform Overview</h3>
        <DataCardGrid columns={4}>
          <DataCard
            title="Total Users"
            value={platformStats?.users.total ?? 0}
            icon={<span>👥</span>}
            variant="default"
          />
          <DataCard
            title="Active Tokens"
            value={platformStats?.tokens.active ?? 0}
            subtitle={`${platformStats?.tokens.total ?? 0} total`}
            icon={<span>🪙</span>}
            variant="success"
          />
          <DataCard
            title="Active Flywheels"
            value={platformStats?.tokens.activeFlywheels ?? 0}
            icon={<span>🎡</span>}
            variant="accent"
          />
          <DataCard
            title="Suspended"
            value={platformStats?.tokens.suspended ?? 0}
            icon={<span>⚠️</span>}
            variant={platformStats?.tokens.suspended ? 'warning' : 'default'}
          />
        </DataCardGrid>
      </div>

      {/* Telegram Stats */}
      {telegramStats && (
        <div>
          <h3 className="text-sm font-medium text-text-muted mb-3">Telegram Launches</h3>
          <DataCardGrid columns={4}>
            <DataCard
              title="Total Launches"
              value={telegramStats.total}
              icon={<span>📱</span>}
              variant="default"
            />
            <DataCard
              title="Completed"
              value={telegramStats.completed}
              subtitle={`${((telegramStats.successRate || 0) * 100).toFixed(1)}% success`}
              icon={<span>✅</span>}
              variant="success"
            />
            <DataCard
              title="Awaiting"
              value={telegramStats.awaitingDeposit}
              subtitle={`${telegramStats.launching} launching`}
              icon={<span>⏳</span>}
              variant="warning"
            />
            <DataCard
              title="Total Deposits"
              value={`${telegramStats.totalDeposits.toFixed(2)} SOL`}
              icon={<span>💰</span>}
              variant="accent"
            />
          </DataCardGrid>
        </div>
      )}
    </div>
  )
}

/**
 * Compact version for sidebar or small spaces
 */
export function OverviewStatsCompact() {
  const { publicKey, signature, message } = useAdminAuth()

  const { data: platformStats } = useQuery({
    queryKey: adminQueryKeys.platformStats(),
    queryFn: () => fetchPlatformStats(publicKey!, signature!, message!),
    enabled: Boolean(publicKey && signature && message),
    staleTime: 10000,
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">Users</span>
        <span className="font-mono text-text-primary">
          {platformStats?.users.total ?? '-'}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">Active Tokens</span>
        <span className="font-mono text-success">
          {platformStats?.tokens.active ?? '-'}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">Flywheels</span>
        <span className="font-mono text-accent-primary">
          {platformStats?.tokens.activeFlywheels ?? '-'}
        </span>
      </div>
    </div>
  )
}
