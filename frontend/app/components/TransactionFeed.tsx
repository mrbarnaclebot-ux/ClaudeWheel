'use client'

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { formatSOL, formatNumber, formatTimestamp } from '@/lib/utils'

interface Transaction {
  id: string
  type: 'fee' | 'buy' | 'sell' | 'transfer'
  amount: number
  token: string
  timestamp: Date
  status: string
}

interface TransactionFeedProps {
  transactions: Transaction[]
}

const typeConfig = {
  fee: {
    label: 'FEE COLLECTED',
    color: 'text-accent-primary',
    bgColor: 'bg-accent-primary/10',
    prefix: '+',
  },
  buy: {
    label: 'BUY EXECUTED',
    color: 'text-success',
    bgColor: 'bg-success/10',
    prefix: '+',
  },
  sell: {
    label: 'SELL EXECUTED',
    color: 'text-error',
    bgColor: 'bg-error/10',
    prefix: '-',
  },
  transfer: {
    label: 'TRANSFER',
    color: 'text-accent-cyan',
    bgColor: 'bg-accent-cyan/10',
    prefix: '',
  },
}

export default function TransactionFeed({ transactions }: TransactionFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest transaction
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = 0
    }
  }, [transactions])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="card-glow bg-bg-card overflow-hidden h-full flex flex-col"
    >
      {/* Header */}
      <div className="p-5 border-b border-border-subtle flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <motion.span
            className="text-accent-primary text-lg"
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            ▶
          </motion.span>
          <h3 className="text-sm font-mono font-semibold text-text-primary uppercase">
            Live Feed
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <motion.span
            className="w-2 h-2 rounded-full bg-success"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="badge badge-success text-xs">STREAMING</span>
        </div>
      </div>

      {/* Divider line */}
      <div className="h-px bg-gradient-to-r from-transparent via-border-accent to-transparent" />

      {/* Transaction list */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto min-h-0"
        style={{ maxHeight: '350px' }}
      >
        <AnimatePresence mode="popLayout">
          {transactions.map((tx, index) => {
            const config = typeConfig[tx.type]
            return (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, x: 20, height: 0 }}
                transition={{ duration: 0.3 }}
                className="feed-item"
              >
                {/* Timestamp */}
                <span className="feed-timestamp hidden md:block min-w-[70px]">
                  [{formatTimestamp(tx.timestamp)}]
                </span>

                {/* Type badge */}
                <span className={`feed-type ${config.color}`}>
                  {config.label}
                </span>

                {/* Dashed line */}
                <span className="hidden md:block flex-1 border-b border-dashed border-border-subtle mx-2" />

                {/* Amount */}
                <span className={`feed-amount ${config.color}`}>
                  {config.prefix}
                  {tx.token === 'SOL'
                    ? formatSOL(tx.amount)
                    : formatNumber(tx.amount)
                  }
                  {' '}
                  <span className="text-text-muted">{tx.token}</span>
                </span>

                {/* Status */}
                <span className="feed-status">
                  {tx.status === 'confirmed' && (
                    <motion.svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </motion.svg>
                  )}
                </span>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border-subtle flex items-center justify-center text-xs font-mono text-text-muted">
        <motion.span
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          ▼ Auto-scrolling
        </motion.span>
      </div>
    </motion.div>
  )
}
