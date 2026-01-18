'use client'

import { motion } from 'framer-motion'
import { Copy, Check, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react'
import { useState } from 'react'

interface WalletInfo {
  address: string
  solBalance: number
  tokenBalance: number
}

interface WheelTokenCardProps {
  tokenMint: string
  symbol: string
  devWallet: WalletInfo
  opsWallet: WalletInfo
  totalFees: number
  todayFees: number
  isActive: boolean
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-neutral-500 hover:text-neutral-300" />
      )}
    </button>
  )
}

function WalletRow({
  label,
  wallet,
  symbol,
}: {
  label: string
  wallet: WalletInfo
  symbol: string
}) {
  const truncatedAddress = `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}`

  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
          <span className="text-xs font-medium text-neutral-400">{label}</span>
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-mono text-neutral-300">
              {truncatedAddress}
            </span>
            <CopyButton text={wallet.address} />
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-medium text-white">
          {wallet.solBalance.toFixed(4)} SOL
        </div>
        <div className="text-xs text-neutral-500">
          {wallet.tokenBalance.toLocaleString()} {symbol}
        </div>
      </div>
    </div>
  )
}

export default function WheelTokenCard({
  tokenMint,
  symbol,
  devWallet,
  opsWallet,
  totalFees,
  todayFees,
  isActive,
}: WheelTokenCardProps) {
  const truncatedMint = `${tokenMint.slice(0, 8)}...${tokenMint.slice(-8)}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5"
    >
      {/* Ambient glow */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-violet-500/10 rounded-full blur-3xl" />

      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-semibold text-white">{symbol}</h3>
              <motion.div
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'bg-neutral-500/20 text-neutral-400'
                }`}
                animate={{
                  opacity: isActive ? [1, 0.7, 1] : 1,
                }}
                transition={{
                  duration: 2,
                  repeat: isActive ? Infinity : 0,
                }}
              >
                {isActive ? 'Flywheel Active' : 'Paused'}
              </motion.div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-neutral-500">
                {truncatedMint}
              </span>
              <CopyButton text={tokenMint} />
            </div>
          </div>

          <a
            href={`https://dexscreener.com/solana/${tokenMint}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-neutral-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-all hover:bg-white/5"
          >
            Chart
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Fee Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
              Total Fees
            </div>
            <div className="text-xl font-semibold text-white">
              {totalFees.toFixed(4)} <span className="text-sm text-neutral-400">SOL</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
              Today
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold text-white">
                {todayFees.toFixed(4)}
              </span>
              <span className="text-sm text-neutral-400">SOL</span>
              {todayFees > 0 && (
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              )}
            </div>
          </div>
        </div>

        {/* Wallets */}
        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4">
          <h4 className="text-xs text-neutral-500 uppercase tracking-wider mb-3">
            Wallets
          </h4>
          <WalletRow label="DEV" wallet={devWallet} symbol={symbol} />
          <WalletRow label="OPS" wallet={opsWallet} symbol={symbol} />
        </div>

        {/* DexScreener Embed */}
        <div className="mt-6 rounded-xl overflow-hidden border border-white/5">
          <iframe
            src={`https://dexscreener.com/solana/${tokenMint}?embed=1&theme=dark&info=0`}
            className="w-full h-[300px]"
            title="Price Chart"
          />
        </div>
      </div>
    </motion.div>
  )
}
