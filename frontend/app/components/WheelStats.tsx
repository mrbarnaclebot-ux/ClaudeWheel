'use client'

import { motion } from 'framer-motion'
import { formatSOL } from '@/lib/utils'

interface WheelStatsProps {
  devWallet: {
    address: string
    solBalance: number
  }
  opsWallet: {
    address: string
    solBalance: number
    tokenBalance: number
  }
  tokenSymbol: string
  totalFeesCollected: number
  todayFeesCollected: number
}

// Wallet card component
function WalletCard({
  type,
  address,
  solBalance,
  tokenBalance,
  tokenSymbol,
  delay = 0,
}: {
  type: 'dev' | 'ops'
  address: string
  solBalance: number
  tokenBalance?: number
  tokenSymbol?: string
  delay?: number
}) {
  const truncatedAddress = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : '...'
  const isDev = type === 'dev'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
      className={`
        relative overflow-hidden rounded-xl p-5
        bg-gradient-to-br ${isDev ? 'from-wood-medium/20 to-wood-dark/10' : 'from-copper/20 to-bronze/10'}
        border ${isDev ? 'border-wood-light/20' : 'border-copper/20'}
        hover:${isDev ? 'border-wood-light/40' : 'border-copper/40'}
        transition-all duration-300
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`
            w-8 h-8 rounded-lg flex items-center justify-center
            ${isDev ? 'bg-wood-medium/30' : 'bg-copper/30'}
          `}>
            <svg className={`w-4 h-4 ${isDev ? 'text-wood-light' : 'text-copper-light'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
          </div>
          <span className={`text-sm font-mono font-semibold ${isDev ? 'text-wood-light' : 'text-copper-light'}`}>
            {isDev ? 'Dev Wallet' : 'Ops Wallet'}
          </span>
        </div>
        <a
          href={`https://solscan.io/account/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-text-muted/60 hover:text-wood-light transition-colors"
        >
          {truncatedAddress}
        </a>
      </div>

      {/* SOL Balance */}
      <div className="text-2xl font-mono font-bold text-text-primary">
        {formatSOL(solBalance)} <span className="text-sm text-wood-light">SOL</span>
      </div>

      {/* Token Balance (for ops wallet) */}
      {tokenBalance !== undefined && tokenBalance > 0 && (
        <div className="text-sm font-mono text-text-muted mt-1">
          {tokenBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} {tokenSymbol}
        </div>
      )}
    </motion.div>
  )
}

// Fee stat card component
function FeeCard({
  label,
  value,
  delay = 0,
  accent = false,
}: {
  label: string
  value: number
  delay?: number
  accent?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
      className={`
        relative overflow-hidden rounded-xl p-5
        ${accent
          ? 'bg-gradient-to-br from-success/20 to-success/5 border border-success/20'
          : 'bg-gradient-to-br from-accent-cyan/20 to-accent-cyan/5 border border-accent-cyan/20'
        }
        transition-all duration-300
      `}
    >
      {/* Label */}
      <div className="text-xs font-mono uppercase tracking-wider text-text-muted mb-2">
        {label}
      </div>

      {/* Value */}
      <div className="text-2xl font-mono font-bold text-text-primary">
        {formatSOL(value)} <span className={`text-sm ${accent ? 'text-success' : 'text-accent-cyan'}`}>SOL</span>
      </div>
    </motion.div>
  )
}

export default function WheelStats({
  devWallet,
  opsWallet,
  tokenSymbol,
  totalFeesCollected,
  todayFeesCollected,
}: WheelStatsProps) {
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-3"
      >
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border-accent to-transparent" />
        <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-text-muted">
          WHEEL Token Stats
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border-accent to-transparent" />
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <WalletCard
          type="dev"
          address={devWallet.address}
          solBalance={devWallet.solBalance}
          delay={0}
        />
        <WalletCard
          type="ops"
          address={opsWallet.address}
          solBalance={opsWallet.solBalance}
          tokenBalance={opsWallet.tokenBalance}
          tokenSymbol={tokenSymbol}
          delay={0.1}
        />
        <FeeCard
          label="Total Fees Collected"
          value={totalFeesCollected}
          delay={0.2}
          accent
        />
        <FeeCard
          label="Today's Fees"
          value={todayFeesCollected}
          delay={0.3}
        />
      </div>
    </div>
  )
}
