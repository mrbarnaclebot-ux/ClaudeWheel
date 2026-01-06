'use client'

import { motion } from 'framer-motion'
import { formatSOL } from '@/lib/utils'

interface FeeStatsProps {
  totalCollected: number
  todayCollected: number
  hourCollected: number
  totalChange?: number
  todayChange?: number
  hourChange?: number
}

interface StatCardProps {
  label: string
  value: number
  change?: number
  delay: number
}

function StatCard({ label, value, change, delay }: StatCardProps) {
  const isPositive = change && change > 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -2 }}
      className="card p-4 bg-bg-card relative overflow-hidden group"
    >
      {/* Corner accent */}
      <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-accent-primary/10 to-transparent" />

      {/* Label */}
      <div className="text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
        {label}
      </div>

      {/* Value */}
      <motion.div
        className="text-2xl font-mono font-bold text-text-primary mb-1"
        key={value}
        initial={{ scale: 1.1, color: '#e8956a' }}
        animate={{ scale: 1, color: '#e6edf3' }}
        transition={{ duration: 0.3 }}
      >
        {formatSOL(value)}
        <span className="text-sm text-accent-primary ml-1">SOL</span>
      </motion.div>

      {/* Change indicator */}
      {change !== undefined && (
        <div className={`flex items-center gap-1 text-sm font-mono ${isPositive ? 'text-success' : 'text-error'}`}>
          <span>{isPositive ? '↑' : '↓'}</span>
          <span>{isPositive ? '+' : ''}{change.toFixed(1)}%</span>
        </div>
      )}

      {/* Glow on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/5 to-transparent" />
      </div>
    </motion.div>
  )
}

export default function FeeStats({
  totalCollected,
  todayCollected,
  hourCollected,
  totalChange,
  todayChange,
  hourChange,
}: FeeStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard
        label="Total Collected"
        value={totalCollected}
        change={totalChange}
        delay={0}
      />
      <StatCard
        label="Today"
        value={todayCollected}
        change={todayChange}
        delay={0.1}
      />
      <StatCard
        label="Last Hour"
        value={hourCollected}
        change={hourChange}
        delay={0.2}
      />
    </div>
  )
}
