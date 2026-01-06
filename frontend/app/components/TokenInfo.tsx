'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { PLACEHOLDER_CA, shortenAddress } from '@/lib/utils'

interface TokenInfoProps {
  contractAddress?: string
}

export default function TokenInfo({ contractAddress = PLACEHOLDER_CA }: TokenInfoProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(contractAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // DexScreener embed URL for Solana tokens
  const dexScreenerUrl = `https://dexscreener.com/solana/${contractAddress}?embed=1&theme=dark&trades=0&info=0`

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="card-glow bg-bg-card overflow-hidden"
    >
      {/* Header */}
      <div className="p-5 border-b border-border-subtle">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-accent-primary text-lg">◎</span>
            <h3 className="text-sm font-mono font-semibold text-text-primary uppercase">
              Contract Address
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://solscan.io/token/${contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="badge badge-cyan text-xs"
            >
              Solscan
            </a>
            <a
              href={`https://dexscreener.com/solana/${contractAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="badge badge-accent text-xs"
            >
              DexScreener
            </a>
          </div>
        </div>

        {/* Contract Address with copy */}
        <div className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg border border-border-subtle">
          <div className="flex-1 font-mono text-sm text-text-primary truncate">
            <span className="hidden md:inline">{contractAddress}</span>
            <span className="md:hidden">{shortenAddress(contractAddress, 8)}</span>
          </div>
          <motion.button
            onClick={handleCopy}
            className={`copy-btn ${copied ? 'copied' : ''}`}
            whileTap={{ scale: 0.95 }}
          >
            {copied ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </motion.button>
        </div>
      </div>

      {/* DEX Chart */}
      <div className="chart-container h-[350px] md:h-[400px]">
        <iframe
          src={dexScreenerUrl}
          title="DEX Chart"
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>
    </motion.div>
  )
}
