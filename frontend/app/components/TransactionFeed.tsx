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
      className="card overflow-hidden h-full flex flex-col"
    >
      {/* Header */}
      <div className="p-5 border-b border-border-subtle flex items-center justify-between flex-shrink-0 bg-bg-secondary/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-accent-primary/10 flex items-center justify-center">
            <motion.svg
              className="w-4 h-4 text-accent-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </motion.svg>
          </div>
          <div>
            <h3 className="text-sm font-display font-semibold text-accent-primary uppercase tracking-wide">
              Live Feed
            </h3>
            <p className="text-xs font-mono text-text-muted">Real-time transactions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <motion.span
            className="w-2 h-2 rounded-full bg-success"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <span className="px-2 py-1 rounded-md bg-success/15 text-success text-xs font-mono font-semibold uppercase">
            Streaming
          </span>
        </div>
      </div>

      {/* Transaction list */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto min-h-0"
        style={{ maxHeight: '350px' }}
      >
        <AnimatePresence mode="popLayout">
          {transactions.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-secondary flex items-center justify-center">
                <svg className="w-6 h-6 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-sm font-mono text-text-muted">Waiting for transactions...</p>
            </div>
          ) : (
            transactions.map((tx) => {
              const config = typeConfig[tx.type]
              return (
                <motion.div
                  key={tx.id}
                  initial={{ opacity: 0, x: -20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="px-4 py-3 border-b border-border-subtle hover:bg-bg-card-hover transition-colors flex items-center gap-3"
                >
                  {/* Type indicator */}
                  <div className={`w-2 h-2 rounded-full ${
                    tx.type === 'fee' ? 'bg-accent-primary' :
                    tx.type === 'buy' ? 'bg-success' :
                    tx.type === 'sell' ? 'bg-error' :
                    'bg-accent-cyan'
                  }`} />

                  {/* Timestamp */}
                  <span className="text-xs font-mono text-text-muted hidden md:block min-w-[65px]">
                    {formatTimestamp(tx.timestamp)}
                  </span>

                  {/* Type badge */}
                  <span className={`
                    px-2 py-0.5 rounded text-xs font-mono font-semibold uppercase
                    ${config.bgColor} ${config.color}
                  `}>
                    {config.label}
                  </span>

                  {/* Dashed line */}
                  <span className="hidden md:block flex-1 border-b border-dashed border-border-subtle" />

                  {/* Amount */}
                  <span className={`font-mono font-semibold ${config.color}`}>
                    {config.prefix}
                    {tx.token === 'SOL'
                      ? formatSOL(tx.amount)
                      : formatNumber(tx.amount)
                    }
                    {' '}
                    <span className="text-text-muted text-sm">{tx.token}</span>
                  </span>

                  {/* Status */}
                  {tx.status === 'confirmed' && (
                    <motion.svg
                      className="w-4 h-4 text-success"
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
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border-subtle flex items-center justify-center bg-bg-secondary/30">
        <motion.span
          className="text-xs font-mono text-text-muted flex items-center gap-2"
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          Auto-scrolling
        </motion.span>
      </div>
    </motion.div>
  )
}
