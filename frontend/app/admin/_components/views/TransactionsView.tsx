'use client'

import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useCallback } from 'react'
import { StatusBadge } from '../shared/StatusBadge'
import { PanelSkeleton } from '../shared/LoadingSkeleton'

// Types
interface Transaction {
  id: string
  type: 'fee_collection' | 'transfer' | 'buy' | 'sell'
  amount: number
  token: string
  signature: string
  status: string
  created_at: string
}

type TransactionType = 'all' | 'buy' | 'sell' | 'fee_collection'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

async function fetchTransactionsFromApi(
  type?: TransactionType,
  limit: number = 100
): Promise<Transaction[]> {
  try {
    let url = `${API_BASE_URL}/api/status/transactions?limit=${limit}`
    if (type && type !== 'all') {
      url += `&type=${type}`
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error('Failed to fetch transactions')
    }

    const data = await response.json()
    return data.transactions || []
  } catch (error) {
    console.error('Error fetching transactions:', error)
    return []
  }
}

export function TransactionsView() {
  const [typeFilter, setTypeFilter] = useState<TransactionType>('all')
  const [transactions, setTransactions] = useState<Transaction[]>([])

  // Fetch transactions
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-transactions', typeFilter],
    queryFn: () => fetchTransactionsFromApi(typeFilter, 100),
    staleTime: 10000,
    refetchInterval: 30000, // Poll every 30 seconds for updates
  })

  // Update local state when data changes
  useEffect(() => {
    if (data) {
      setTransactions(data)
    }
  }, [data])

  const typeConfig: Record<string, { label: string; color: string; bg: string }> = {
    fee_collection: { label: 'FEE', color: 'text-accent-primary', bg: 'bg-accent-primary/10' },
    buy: { label: 'BUY', color: 'text-success', bg: 'bg-success/10' },
    sell: { label: 'SELL', color: 'text-error', bg: 'bg-error/10' },
    transfer: { label: 'TRANSFER', color: 'text-accent-cyan', bg: 'bg-accent-cyan/10' },
  }

  const formatAmount = (tx: Transaction) => {
    const prefix = tx.type === 'buy' || tx.type === 'fee_collection' ? '+' : '-'
    return `${prefix}${tx.amount.toFixed(4)} ${tx.token || 'SOL'}`
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  if (isLoading) {
    return <PanelSkeleton />
  }

  if (error) {
    return (
      <div className="p-6 text-center text-error">
        <p>Failed to load transactions</p>
        <button
          onClick={() => refetch()}
          className="mt-2 px-4 py-2 bg-error/20 rounded-md hover:bg-error/30 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-lg font-semibold text-text-primary">Transactions</h2>
        <div className="flex items-center gap-2">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TransactionType)}
            className="px-3 py-1.5 bg-panel-dark border border-border rounded-md text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
          >
            <option value="all">All Types</option>
            <option value="buy">Buys</option>
            <option value="sell">Sells</option>
            <option value="fee_collection">Fee Collections</option>
          </select>
          <button
            onClick={() => refetch()}
            className="px-3 py-1.5 bg-accent-primary/20 text-accent-primary rounded-md text-sm hover:bg-accent-primary/30 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Transaction List */}
      <div className="flex-1 overflow-auto">
        {transactions.length === 0 ? (
          <div className="p-6 text-center text-text-secondary">
            No transactions found
          </div>
        ) : (
          <div className="divide-y divide-border">
            <AnimatePresence mode="popLayout">
              {transactions.map((tx) => (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="flex items-center justify-between px-4 py-3 hover:bg-panel-dark/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${typeConfig[tx.type]?.color || 'text-text-secondary'} ${typeConfig[tx.type]?.bg || 'bg-panel-dark'}`}
                    >
                      {typeConfig[tx.type]?.label || tx.type.toUpperCase()}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-text-primary">
                        {formatAmount(tx)}
                      </span>
                      <a
                        href={`https://solscan.io/tx/${tx.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-text-secondary hover:text-accent-primary truncate max-w-[200px]"
                      >
                        {tx.signature.slice(0, 16)}...
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge variant={tx.status === 'success' ? 'success' : 'error'} dot>
                      {tx.status === 'success' ? 'Success' : 'Failed'}
                    </StatusBadge>
                    <div className="text-right">
                      <div className="text-sm text-text-primary">{formatTime(tx.created_at)}</div>
                      <div className="text-xs text-text-secondary">{formatDate(tx.created_at)}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
