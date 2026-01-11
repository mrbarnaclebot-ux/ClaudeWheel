'use client'

import { motion } from 'framer-motion'
import WoodenWheel from './WoodenWheel'

interface WheelHeroProps {
  tokenMintAddress: string
}

export default function WheelHero({
  tokenMintAddress,
}: WheelHeroProps) {
  return (
    <div className="relative">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-radial from-wood-dark/20 via-transparent to-transparent opacity-50" />
      </div>

      {/* Center - Wheel */}
      <div className="flex flex-col items-center py-8">
        {/* The Wooden Wheel */}
        <WoodenWheel />

        {/* Token contract link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex items-center justify-center gap-2 text-xs font-mono text-text-muted/60 mt-6"
        >
          <span>CA:</span>
          <a
            href={`https://solscan.io/token/${tokenMintAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-wood-light transition-colors"
          >
            {tokenMintAddress || '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'}
          </a>
          <button
            onClick={() => navigator.clipboard.writeText(tokenMintAddress || '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS')}
            className="hover:text-wood-light transition-colors p-1"
            title="Copy"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </motion.div>
      </div>
    </div>
  )
}
