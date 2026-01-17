'use client'

import { useQuery } from '@tanstack/react-query'
import { useAdminAuth } from '../../_stores/adminStore'
import { adminQueryKeys } from '../../_lib/queryClient'
import { fetchPlatformStats, fetchTelegramStats } from '../../_lib/adminApi'
import { DataCard, DataCardGrid } from '../shared/DataCard'
import { StatsGridSkeleton } from '../shared/LoadingSkeleton'
import {
  Icon,
  Users,
  Coins,
  RotateCw,
  AlertTriangle,
  MessageCircle,
  CheckCircle,
  Clock,
  Wallet,
} from '../shared/Icons'

export function OverviewStats() {
  const { isAuthenticated, getToken } = useAdminAuth()

  // Fetch platform stats
  const { data: platformStats, isLoading: isPlatformLoading } = useQuery({
    queryKey: adminQueryKeys.platformStats(),
    queryFn: async () => {
      const token = await getToken()
      if (!token) return null
      return fetchPlatformStats(token)
    },
    enabled: isAuthenticated,
    staleTime: 10000, // 10 seconds
  })

  // Fetch telegram stats
  const { data: telegramStats, isLoading: isTelegramLoading } = useQuery({
    queryKey: adminQueryKeys.telegramStats(),
    queryFn: async () => {
      const token = await getToken()
      if (!token) return null
      return fetchTelegramStats(token)
    },
    enabled: isAuthenticated,
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
            icon={<Icon icon={Users} size="lg" color="muted" />}
            variant="default"
          />
          <DataCard
            title="Active Tokens"
            value={platformStats?.tokens.active ?? 0}
            subtitle={`${platformStats?.tokens.total ?? 0} total`}
            icon={<Icon icon={Coins} size="lg" color="success" />}
            variant="success"
          />
          <DataCard
            title="Active Flywheels"
            value={platformStats?.tokens.activeFlywheels ?? 0}
            icon={<Icon icon={RotateCw} size="lg" color="accent" />}
            variant="accent"
          />
          <DataCard
            title="Suspended"
            value={platformStats?.tokens.suspended ?? 0}
            icon={<Icon icon={AlertTriangle} size="lg" color={platformStats?.tokens.suspended ? 'warning' : 'muted'} />}
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
              icon={<Icon icon={MessageCircle} size="lg" color="muted" />}
              variant="default"
            />
            <DataCard
              title="Completed"
              value={telegramStats.completed}
              subtitle={`${((telegramStats.successRate || 0) * 100).toFixed(1)}% success`}
              icon={<Icon icon={CheckCircle} size="lg" color="success" />}
              variant="success"
            />
            <DataCard
              title="Awaiting"
              value={telegramStats.awaitingDeposit}
              subtitle={`${telegramStats.launching} launching`}
              icon={<Icon icon={Clock} size="lg" color="warning" />}
              variant="warning"
            />
            <DataCard
              title="Total Deposits"
              value={`${(telegramStats.totalDeposits ?? 0).toFixed(2)} SOL`}
              icon={<Icon icon={Wallet} size="lg" color="accent" />}
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
  const { isAuthenticated, getToken } = useAdminAuth()

  const { data: platformStats } = useQuery({
    queryKey: adminQueryKeys.platformStats(),
    queryFn: async () => {
      const token = await getToken()
      if (!token) return null
      return fetchPlatformStats(token)
    },
    enabled: isAuthenticated,
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
