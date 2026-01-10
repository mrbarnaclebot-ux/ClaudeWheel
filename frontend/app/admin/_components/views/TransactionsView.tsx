'use client'

import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import {
  supabase,
  subscribeToTransactions,
  type Transaction,
} from '@/lib/supabase'
import { StatusBadge } from '../shared/StatusBadge'
import { PanelSkeleton } from '../shared/LoadingSkeleton'

type TransactionType = 'all' | 'buy' | 'sell' | 'fee_collection'

async function fetchTransactionsWithFilter(
  type?: TransactionType,
  limit: number = 100
): Promise<Transaction[]> {
  let query = supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (type && type !== 'all') {
    query = query.eq('type', type)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching transactions:', error)
    return []
  }
  return data || []
}

export function TransactionsView() {
  const [typeFilter, setTypeFilter] = useState<TransactionType>('all')
  const [transactions, setTransactions] = useState<Transaction[]>([])

  // Fetch transactions
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-transactions', typeFilter],
    queryFn: () => fetchTransactionsWithFilter(typeFilter, 100),
    staleTime: 10000,
  })

  // Update local state when data changes
  useEffect(() => {
    if (data) {
      setTransactions(data)
    }
  }, [data])

  // Subscribe to real-time updates
  useEffect(() => {
    const subscription = subscribeToTransactions((newTx: Transaction) => {
      // Only add if it matches current filter
      if (typeFilter === 'all' || newTx.type === typeFilter) {
        setTransactions((prev) => [newTx, ...prev.slice(0, 99)])
      }
    })

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [typeFilter])

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

  if (isLoading) {
    return (
      <div className="p-6">
        <PanelSkeleton />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Transaction History</h2>
          <p className="text-sm text-text-muted">All WHEEL token transactions</p>
        </div>

        {/* Type filter */}
        <div className="flex gap-2">
          {(['all', 'buy', 'sell', 'fee_collection'] as TransactionType[]).map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1.5 text-xs font-mono rounded-lg transition-colors ${
                typeFilter === type
                  ? 'bg-accent-primary text-bg-void'
                  : 'bg-bg-secondary text-text-muted hover:bg-bg-card-hover hover:text-text-primary'
              }`}
            >
              {type === 'fee_collection' ? 'Fees' : type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-bg-card border border-border-subtle rounded-xl overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border-subtle bg-bg-secondary text-xs font-mono text-text-muted uppercase">
          <div className="col-span-2">Time</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-3">Amount</div>
          <div className="col-span-3">Signature</div>
          <div className="col-span-2">Status</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-border-subtle/30 max-h-[600px] overflow-y-auto">
          <AnimatePresence mode="popLayout">
            {transactions.length > 0 ? (
              transactions.map((tx, index) => {
                const config = typeConfig[tx.type] || { label: tx.type.toUpperCase(), color: 'text-text-muted', bg: 'bg-bg-secondary' }
                return (
                  <motion.div
                    key={tx.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(index * 0.01, 0.3) }}
                    className="grid grid-cols-12 gap-4 px-4 py-3 text-sm hover:bg-bg-card-hover transition-colors"
                  >
                    {/* Time */}
                    <div className="col-span-2 font-mono text-text-muted">
                      {new Date(tx.created_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>

                    {/* Type */}
                    <div className="col-span-2">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-mono ${config.color} ${config.bg}`}>
                        {config.label}
                      </span>
                    </div>

                    {/* Amount */}
                    <div className={`col-span-3 font-mono ${config.color}`}>
                      {formatAmount(tx)}
                    </div>

                    {/* Signature */}
                    <div className="col-span-3">
                      {tx.signature ? (
                        <a
                          href={`https://solscan.io/tx/${tx.signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-text-muted hover:text-accent-primary transition-colors truncate block"
                        >
                          {tx.signature.slice(0, 8)}...{tx.signature.slice(-8)}
                        </a>
                      ) : (
                        <span className="text-text-muted">-</span>
                      )}
                    </div>

                    {/* Status */}
                    <div className="col-span-2">
                      <StatusBadge
                        variant={tx.status === 'confirmed' ? 'success' : tx.status === 'failed' ? 'error' : 'warning'}
                        size="xs"
                      >
                        {tx.status}
                      </StatusBadge>
                    </div>
                  </motion.div>
                )
              })
            ) : (
              <div className="p-8 text-center text-text-muted">
                No transactions found
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border-subtle flex items-center justify-between">
          <span className="text-xs text-text-muted">
            Showing {transactions.length} transactions
          </span>
          <div className="flex items-center gap-2">
            <motion.span
              className="w-2 h-2 rounded-full bg-success"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span className="text-xs text-text-muted">Live updates</span>
          </div>
        </div>
      </div>
    </div>
  )
}
