'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAdminAuth } from '../../_stores/adminStore'
import { adminQueryKeys } from '../../_lib/queryClient'
import { fetchTelegramStats, fetchTelegramLaunches, fetchBotHealth } from '../../_lib/adminApi'
import { DataCard, DataCardGrid } from '../shared/DataCard'
import { PaginatedTable } from '../shared/TableWrapper'
import { LaunchStatusBadge, ConnectionBadge } from '../shared/StatusBadge'
import { StatsGridSkeleton } from '../shared/LoadingSkeleton'
import type { TelegramLaunch } from '../../_types/admin.types'

const PAGE_SIZE = 20

export function TelegramView() {
  const { publicKey, signature, message } = useAdminAuth()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  // Fetch stats
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: adminQueryKeys.telegramStats(),
    queryFn: () => fetchTelegramStats(publicKey!, signature!, message!),
    enabled: Boolean(publicKey && signature && message),
    staleTime: 10000,
  })

  // Fetch bot health
  const { data: botHealth } = useQuery({
    queryKey: adminQueryKeys.telegramHealth(),
    queryFn: () => fetchBotHealth(publicKey!, signature!, message!),
    enabled: Boolean(publicKey && signature && message),
    staleTime: 10000,
  })

  // Fetch launches
  const { data: launchesData, isLoading: isLaunchesLoading } = useQuery({
    queryKey: adminQueryKeys.telegramLaunches({
      status: statusFilter,
      search: searchQuery,
      page: currentPage,
    }),
    queryFn: () =>
      fetchTelegramLaunches(publicKey!, signature!, message!, {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: searchQuery || undefined,
        limit: PAGE_SIZE,
        offset: (currentPage - 1) * PAGE_SIZE,
      }),
    enabled: Boolean(publicKey && signature && message),
    staleTime: 30000,
  })

  const columns = [
    {
      key: 'token',
      header: 'Token',
      render: (launch: TelegramLaunch) => (
        <div className="flex items-center gap-3">
          {launch.token_image_url ? (
            <img src={launch.token_image_url} alt={launch.token_symbol} className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center text-xs font-bold">
              {launch.token_symbol.slice(0, 2)}
            </div>
          )}
          <div>
            <div className="font-medium text-text-primary">{launch.token_symbol}</div>
            <div className="text-xs text-text-muted">{launch.token_name}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'user',
      header: 'User',
      render: (launch: TelegramLaunch) => (
        <div className="text-sm">
          {launch.telegram_users?.telegram_username ? (
            <span className="text-accent-primary">@{launch.telegram_users.telegram_username}</span>
          ) : (
            <span className="text-text-muted font-mono">{launch.telegram_users?.telegram_id}</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (launch: TelegramLaunch) => <LaunchStatusBadge status={launch.status} />,
    },
    {
      key: 'deposit',
      header: 'Deposit',
      align: 'right' as const,
      render: (launch: TelegramLaunch) => (
        <span className="font-mono text-sm text-text-primary">
          {launch.deposit_received_sol.toFixed(4)} SOL
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (launch: TelegramLaunch) => (
        <span className="text-xs text-text-muted">
          {new Date(launch.created_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (launch: TelegramLaunch) => (
        <div className="flex gap-2 justify-end">
          {launch.token_mint_address && (
            <a
              href={`https://solscan.io/token/${launch.token_mint_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 text-xs font-mono bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded hover:bg-accent-primary/30"
            >
              View
            </a>
          )}
          {['failed', 'expired'].includes(launch.status) && (
            <button className="px-2 py-1 text-xs font-mono bg-warning/20 text-warning border border-warning/30 rounded hover:bg-warning/30">
              Refund
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Bot Health */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Telegram Bot Management</h2>
        <div className="flex items-center gap-4">
          <ConnectionBadge
            connected={botHealth?.status === 'healthy'}
            label={botHealth?.isMaintenanceMode ? 'Maintenance' : botHealth?.status || 'Unknown'}
          />
        </div>
      </div>

      {/* Stats */}
      {isStatsLoading ? (
        <StatsGridSkeleton count={6} />
      ) : stats ? (
        <DataCardGrid columns={6}>
          <DataCard title="Total" value={stats.total} icon={<span>📊</span>} />
          <DataCard title="Completed" value={stats.completed} variant="success" icon={<span>✅</span>} />
          <DataCard title="Awaiting" value={stats.awaitingDeposit} variant="warning" icon={<span>⏳</span>} />
          <DataCard title="Launching" value={stats.launching} variant="accent" icon={<span>🚀</span>} />
          <DataCard title="Failed" value={stats.failed} variant="error" icon={<span>❌</span>} />
          <DataCard
            title="Success Rate"
            value={`${((stats.successRate || 0) * 100).toFixed(1)}%`}
            variant={stats.successRate > 0.8 ? 'success' : stats.successRate > 0.5 ? 'warning' : 'error'}
            icon={<span>📈</span>}
          />
        </DataCardGrid>
      ) : null}

      {/* Filters */}
      <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by symbol, name, or username..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full px-4 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="px-4 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
          >
            <option value="all">All Status</option>
            <option value="awaiting_deposit">Awaiting Deposit</option>
            <option value="launching">Launching</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
      </div>

      {/* Launches Table */}
      <PaginatedTable
        data={launchesData?.launches || []}
        columns={columns}
        keyExtractor={(launch) => launch.id}
        isLoading={isLaunchesLoading}
        emptyMessage="No launches found"
        currentPage={currentPage}
        totalItems={launchesData?.total || 0}
        pageSize={PAGE_SIZE}
        onPageChange={setCurrentPage}
        title={`Launches (${launchesData?.total || 0})`}
      />
    </div>
  )
}
