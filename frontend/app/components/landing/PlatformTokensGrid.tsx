'use client'

import { motion } from 'framer-motion'
import { Zap, ExternalLink } from 'lucide-react'
import type { PublicToken } from '@/app/hooks/useLiveStats'

interface PlatformTokensGridProps {
  tokens: PublicToken[]
  isLoading?: boolean
}

function TokenCard({ token, index }: { token: PublicToken; index: number }) {
  const sourceColors = {
    launched: { bg: 'bg-[#e67428]/20', text: 'text-[#e67428]', label: 'Launched' },
    registered: { bg: 'bg-[#e2aa84]/20', text: 'text-[#e2aa84]', label: 'Registered' },
    mm_only: { bg: 'bg-[#f8f0ec]/10', text: 'text-[#f8f0ec]/70', label: 'MM Only' },
  }

  const source = sourceColors[token.source] || sourceColors.launched

  return (
    <motion.a
      href={`https://bags.fm/${token.mint}`}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="group relative p-4 rounded-xl bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 hover:border-[#e67428]/30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(230,116,40,0.1)] cursor-pointer"
    >
      {/* Active indicator */}
      {token.isActive && (
        <div className="absolute top-3 right-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e67428] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e67428]" />
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        {/* Token Image */}
        {token.image ? (
          <img
            src={token.image}
            alt={token.symbol}
            className="w-10 h-10 rounded-full object-cover border border-[#e2aa84]/20"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-[#e67428]/20 flex items-center justify-center text-[#e67428] font-semibold">
            {token.symbol[0]}
          </div>
        )}

        {/* Token Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#f8f0ec] truncate">{token.symbol}</span>
            {token.isActive && (
              <Zap className="w-3 h-3 text-[#e67428]" />
            )}
          </div>
          <div className="text-xs text-[#e2aa84]/50 truncate">{token.name}</div>
        </div>

        {/* External link icon */}
        <ExternalLink className="w-4 h-4 text-[#e2aa84]/30 group-hover:text-[#e67428] transition-colors" />
      </div>

      {/* Source Badge */}
      <div className="mt-3 flex items-center justify-between">
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${source.bg} ${source.text}`}>
          {source.label}
        </span>
        {token.isActive && (
          <span className="text-[10px] text-[#e67428]">Active</span>
        )}
      </div>
    </motion.a>
  )
}

export default function PlatformTokensGrid({ tokens, isLoading = false }: PlatformTokensGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-xl bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (tokens.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-[#e2aa84]/50">No tokens launched yet. Be the first!</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {tokens.map((token, index) => (
        <TokenCard key={token.id} token={token} index={index} />
      ))}
    </div>
  )
}
