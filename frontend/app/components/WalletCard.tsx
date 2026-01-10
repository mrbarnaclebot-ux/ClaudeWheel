'use client'

import { motion } from 'framer-motion'
import { formatSOL, formatUSD, formatTimeAgo, shortenAddress, formatNumber } from '@/lib/utils'

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
      className="card-glow p-5 relative overflow-hidden group"
    >
      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-accent-primary/40 rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-accent-primary/40 rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-accent-primary/40 rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-accent-primary/40 rounded-br-lg" />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-primary/10 flex items-center justify-center">
            {isDevWallet ? (
              <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-accent-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </div>
          <div>
            <span className="text-sm font-display font-semibold text-accent-primary uppercase tracking-wide">
              {isDevWallet ? 'Dev Wallet' : 'Ops Wallet'}
            </span>
            <div className="text-xs font-mono text-text-muted">
              Fee {isDevWallet ? 'Collection' : 'Operations'}
            </div>
          </div>
        </div>
        <a
          href={`https://solscan.io/account/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center text-text-muted hover:text-accent-primary hover:bg-bg-card-hover transition-all"
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
          className="text-3xl font-display font-bold text-text-primary mb-1"
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
            {formatNumber(tokenBalance)} <span className="text-sm">{tokenSymbol}</span>
          </div>
        </div>
      )}

      {/* Last fee (for dev wallet) */}
      {lastFee !== undefined && lastFeeTime && (
        <div className="flex items-center gap-2 text-sm font-mono text-text-muted">
          <span className="text-success">+{formatSOL(lastFee)} SOL</span>
          <span className="text-text-muted">•</span>
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
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Connected
          </span>
        </div>
      </div>

      {/* Hover glow effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/5 to-transparent rounded-xl" />
      </div>
    </motion.div>
  )
}
