'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useAdminAuth, useAdminFilters } from '../../_stores/adminStore'
import { adminQueryKeys } from '../../_lib/queryClient'
import { fetchAdminTokens } from '../../_lib/adminApi'
import { PaginatedTable, Pagination } from '../shared/TableWrapper'
import {
  StatusBadge,
  ActiveBadge,
  SuspendedBadge,
  InactiveBadge,
  VerifiedBadge,
  RiskLevelBadge,
  SourceBadge,
  FlywheelPhaseBadge,
} from '../shared/StatusBadge'
import { StatsGridSkeleton } from '../shared/LoadingSkeleton'
import type { UserToken, TokenFilters } from '../../_types/admin.types'

const PAGE_SIZE = 20

export function TokensView() {
  const { publicKey, signature, message } = useAdminAuth()
  const { tokenFilters, setTokenFilters } = useAdminFilters()
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedToken, setSelectedToken] = useState<UserToken | null>(null)

  // Fetch tokens
  const { data, isLoading, error } = useQuery({
    queryKey: adminQueryKeys.tokenList({ ...tokenFilters, page: currentPage }),
    queryFn: () =>
      fetchAdminTokens(publicKey!, signature!, message!, {
        ...tokenFilters,
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
      render: (token: UserToken) => (
        <div className="flex items-center gap-3">
          {token.token_image ? (
            <img
              src={token.token_image}
              alt={token.token_symbol}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center text-xs font-bold text-accent-primary">
              {(token.token_symbol ?? '??').slice(0, 2)}
            </div>
          )}
          <div>
            <div className="font-medium text-text-primary">{token.token_symbol}</div>
            <div className="text-xs text-text-muted">{token.token_name || 'Unknown'}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (token: UserToken) => (
        <SourceBadge source={token.launched_via_telegram ? 'telegram' : 'website'} />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (token: UserToken) => (
        <div className="flex flex-col gap-1">
          {token.is_suspended ? (
            <SuspendedBadge />
          ) : token.is_active ? (
            <ActiveBadge pulse={false} />
          ) : (
            <InactiveBadge />
          )}
          {token.is_verified && <VerifiedBadge />}
        </div>
      ),
    },
    {
      key: 'flywheel',
      header: 'Flywheel',
      render: (token: UserToken) => {
        if (!token.config?.flywheel_active) {
          return <StatusBadge variant="muted">Off</StatusBadge>
        }
        if (token.flywheelState) {
          return (
            <FlywheelPhaseBadge
              phase={token.flywheelState.cycle_phase}
              count={
                token.flywheelState.cycle_phase === 'buy'
                  ? token.flywheelState.buy_count
                  : token.flywheelState.sell_count
              }
            />
          )
        }
        return <StatusBadge variant="success" dot pulse>Active</StatusBadge>
      },
    },
    {
      key: 'risk',
      header: 'Risk',
      render: (token: UserToken) => <RiskLevelBadge level={token.risk_level} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (token: UserToken) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setSelectedToken(token)
          }}
          className="px-3 py-1 text-xs font-mono bg-bg-secondary text-text-muted border border-border-subtle rounded hover:bg-bg-card-hover transition-colors"
        >
          Details
        </button>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Filters */}
      <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by symbol or mint..."
              value={tokenFilters.search || ''}
              onChange={(e) => {
                setTokenFilters({ search: e.target.value })
                setCurrentPage(1)
              }}
              className="w-full px-4 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary"
            />
          </div>

          {/* Status Filter */}
          <select
            value={tokenFilters.status || 'all'}
            onChange={(e) => {
              setTokenFilters({ status: e.target.value as TokenFilters['status'] })
              setCurrentPage(1)
            }}
            className="px-4 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Source Filter */}
          <select
            value={tokenFilters.source || 'all'}
            onChange={(e) => {
              setTokenFilters({ source: e.target.value as TokenFilters['source'] })
              setCurrentPage(1)
            }}
            className="px-4 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
          >
            <option value="all">All Sources</option>
            <option value="website">Website</option>
            <option value="telegram">Telegram</option>
          </select>

          {/* Risk Filter */}
          <select
            value={tokenFilters.riskLevel || 'all'}
            onChange={(e) => {
              setTokenFilters({ riskLevel: e.target.value as TokenFilters['riskLevel'] })
              setCurrentPage(1)
            }}
            className="px-4 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
          >
            <option value="all">All Risk</option>
            <option value="low">Low Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="high">High Risk</option>
          </select>

          {/* Flywheel Filter */}
          <select
            value={tokenFilters.flywheel || 'all'}
            onChange={(e) => {
              setTokenFilters({ flywheel: e.target.value as TokenFilters['flywheel'] })
              setCurrentPage(1)
            }}
            className="px-4 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
          >
            <option value="all">All Flywheels</option>
            <option value="active">Flywheel Active</option>
            <option value="inactive">Flywheel Inactive</option>
          </select>
        </div>
      </div>

      {/* Token Table */}
      <PaginatedTable
        data={data?.tokens || []}
        columns={columns}
        keyExtractor={(token) => token.id}
        isLoading={isLoading}
        emptyMessage="No tokens found"
        onRowClick={setSelectedToken}
        selectedKey={selectedToken?.id}
        currentPage={currentPage}
        totalItems={data?.total || 0}
        pageSize={PAGE_SIZE}
        onPageChange={setCurrentPage}
        title={`Tokens (${data?.total || 0})`}
      />

      {/* Token Details Modal */}
      {selectedToken && (
        <TokenDetailsModal
          token={selectedToken}
          onClose={() => setSelectedToken(null)}
        />
      )}
    </div>
  )
}

function TokenDetailsModal({
  token,
  onClose,
}: {
  token: UserToken
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        className="bg-bg-card border border-border-subtle rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {token.token_image ? (
              <img src={token.token_image} alt={token.token_symbol} className="w-12 h-12 rounded-full" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-accent-primary/20 flex items-center justify-center text-lg font-bold text-accent-primary">
                {(token.token_symbol ?? '??').slice(0, 2)}
              </div>
            )}
            <div>
              <h3 className="text-lg font-bold text-text-primary">{token.token_symbol}</h3>
              <p className="text-sm text-text-muted">{token.token_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xl">
            &times;
          </button>
        </div>

        {/* Status Badges */}
        <div className="flex flex-wrap gap-2 mb-6">
          {token.is_suspended ? <SuspendedBadge /> : token.is_active ? <ActiveBadge /> : <InactiveBadge />}
          {token.is_verified && <VerifiedBadge />}
          <RiskLevelBadge level={token.risk_level} />
          <SourceBadge source={token.launched_via_telegram ? 'telegram' : 'website'} />
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-text-muted block mb-1">Mint Address</span>
            <span className="font-mono text-text-primary text-xs break-all">{token.token_mint_address}</span>
          </div>
          <div>
            <span className="text-text-muted block mb-1">Dev Wallet</span>
            <span className="font-mono text-text-primary text-xs break-all">{token.dev_wallet_address}</span>
          </div>
          <div>
            <span className="text-text-muted block mb-1">Ops Wallet</span>
            <span className="font-mono text-text-primary text-xs break-all">{token.ops_wallet_address}</span>
          </div>
          <div>
            <span className="text-text-muted block mb-1">Created</span>
            <span className="text-text-primary">{new Date(token.created_at).toLocaleString()}</span>
          </div>
        </div>

        {/* Config */}
        {token.config && (
          <div className="mt-6 pt-6 border-t border-border-subtle">
            <h4 className="text-sm font-semibold text-text-primary mb-3">Configuration</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-bg-secondary rounded-lg p-3">
                <span className="text-text-muted text-xs block">Flywheel</span>
                <span className={token.config.flywheel_active ? 'text-success' : 'text-text-muted'}>
                  {token.config.flywheel_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="bg-bg-secondary rounded-lg p-3">
                <span className="text-text-muted text-xs block">Algorithm</span>
                <span className="text-text-primary capitalize">{token.config.algorithm_mode}</span>
              </div>
              <div className="bg-bg-secondary rounded-lg p-3">
                <span className="text-text-muted text-xs block">Buy Range</span>
                <span className="text-text-primary font-mono">
                  {token.config.min_buy_amount_sol}-{token.config.max_buy_amount_sol} SOL
                </span>
              </div>
              <div className="bg-bg-secondary rounded-lg p-3">
                <span className="text-text-muted text-xs block">Slippage</span>
                <span className="text-text-primary font-mono">{token.config.slippage_bps / 100}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 pt-6 border-t border-border-subtle flex gap-3 justify-end">
          <button className="px-4 py-2 text-sm bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors">
            View on Solscan
          </button>
          {token.is_suspended ? (
            <button className="px-4 py-2 text-sm bg-success/20 text-success border border-success/30 rounded-lg hover:bg-success/30 transition-colors">
              Unsuspend
            </button>
          ) : (
            <button className="px-4 py-2 text-sm bg-error/20 text-error border border-error/30 rounded-lg hover:bg-error/30 transition-colors">
              Suspend
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
