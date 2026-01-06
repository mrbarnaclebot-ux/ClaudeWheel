'use client'

import { motion } from 'framer-motion'
import { formatSOL, formatUSD, formatTimeAgo, shortenAddress } from '@/lib/utils'

interface WalletCardProps {
  type: 'dev' | 'ops'
  address: string
  solBalance: number
  usdValue: number
  tokenBalance?: number
  tokenSymbol?: string
  lastFee?: number
  lastFeeTime?: Date
}

export default function WalletCard({
  type,
  address,
  solBalance,
  usdValue,
  tokenBalance,
  tokenSymbol = 'TOKEN',
  lastFee,
  lastFeeTime,
}: WalletCardProps) {
  const isDevWallet = type === 'dev'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      whileHover={{ y: -4 }}
      className="card-glow p-5 bg-bg-card relative overflow-hidden group"
    >
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-accent-primary opacity-50" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-accent-primary opacity-50" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-accent-primary opacity-50" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-accent-primary opacity-50" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-accent-primary text-lg">
            {isDevWallet ? '◇' : '◈'}
          </span>
          <span className="text-sm font-mono font-semibold text-text-primary uppercase">
            {isDevWallet ? 'Dev Wallet' : 'Ops Wallet'}
          </span>
        </div>
        <a
          href={`https://solscan.io/account/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-muted hover:text-accent-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-border-accent to-transparent mb-4" />

      {/* Balance */}
      <div className="mb-4">
        <motion.div
          className="text-3xl font-mono font-bold text-text-primary mb-1"
          key={solBalance}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 1 }}
        >
          {formatSOL(solBalance)} <span className="text-lg text-accent-primary">SOL</span>
        </motion.div>
        <div className="text-sm font-mono text-text-secondary">
          ≈ {formatUSD(usdValue)}
        </div>
      </div>

      {/* Token balance (for ops wallet) */}
      {tokenBalance !== undefined && (
        <div className="mb-4 p-3 bg-bg-secondary rounded-lg border border-border-subtle">
          <div className="text-xs font-mono text-text-muted mb-1">Token Holdings</div>
          <div className="text-lg font-mono font-semibold text-accent-cyan">
            {(tokenBalance / 1000).toFixed(0)}K <span className="text-sm">{tokenSymbol}</span>
          </div>
        </div>
      )}

      {/* Last fee (for dev wallet) */}
      {lastFee !== undefined && lastFeeTime && (
        <div className="flex items-center gap-2 text-sm font-mono text-text-muted">
          <span className="text-success">+{formatSOL(lastFee)} SOL</span>
          <span>•</span>
          <span>{formatTimeAgo(lastFeeTime)}</span>
        </div>
      )}

      {/* Address */}
      <div className="mt-4 pt-4 border-t border-border-subtle">
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-text-muted">
            {shortenAddress(address, 6)}
          </span>
          <span className="text-xs text-success flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" />
            Connected
          </span>
        </div>
      </div>

      {/* Hover glow effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/5 to-transparent" />
      </div>
    </motion.div>
  )
}
