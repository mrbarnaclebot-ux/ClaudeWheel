'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTelegram } from './TelegramProvider';
import { TokenAvatar } from './TokenAvatar';
import { SourceBadge, AlgorithmBadge, FlywheelIndicator } from './StatusBadge';

interface Token {
  id: string;
  token_mint: string;
  token_name: string;
  token_symbol: string;
  token_image?: string;
  token_source?: 'launched' | 'registered' | 'mm_only';
  config?: {
    flywheel_active: boolean;
    algorithm_mode?: string;
  };
  balance?: {
    dev_sol: number;
    ops_sol: number;
    token_balance: number;
  };
}

interface TokenCardProps {
  token: Token;
  index?: number;
  variant?: 'default' | 'compact' | 'detailed';
}

export function TokenCard({ token, index = 0, variant = 'default' }: TokenCardProps) {
  const { hapticFeedback } = useTelegram();
  const isActive = token.config?.flywheel_active;

  const handleClick = () => {
    hapticFeedback('light');
  };

  if (variant === 'compact') {
    return (
      <CompactTokenCard token={token} index={index} onLinkClick={handleClick} />
    );
  }

  if (variant === 'detailed') {
    return (
      <DetailedTokenCard token={token} index={index} onLinkClick={handleClick} />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: index * 0.08,
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
    >
      <Link href={`/token/${token.id}`} onClick={handleClick}>
        <motion.div
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={`
            relative overflow-hidden rounded-2xl p-4
            border transition-all duration-300
            ${isActive
              ? 'bg-gradient-to-br from-[#1f1810] via-[#252018] to-[#1f1810] border-[rgba(230,116,40,0.35)] shadow-[0_4px_24px_rgba(230,116,40,0.15)]'
              : 'bg-[#1f1810] border-[rgba(230,116,40,0.12)] hover:border-[rgba(230,116,40,0.25)]'
            }
            hover:shadow-[0_8px_32px_rgba(230,116,40,0.2)]
            group
          `}
        >
          {/* Active glow effect */}
          {isActive && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              animate={{
                background: [
                  'radial-gradient(ellipse at 30% 20%, rgba(230,116,40,0.08) 0%, transparent 50%)',
                  'radial-gradient(ellipse at 70% 80%, rgba(230,116,40,0.08) 0%, transparent 50%)',
                  'radial-gradient(ellipse at 30% 20%, rgba(230,116,40,0.08) 0%, transparent 50%)',
                ],
              }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            />
          )}

          {/* Wood grain texture overlay for active */}
          {isActive && (
            <div
              className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
              }}
            />
          )}

          <div className="relative flex items-center justify-between gap-4">
            {/* Left: Avatar + Info */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {/* Avatar with glow ring for active */}
              <div className="relative flex-shrink-0">
                <TokenAvatar
                  symbol={token.token_symbol}
                  imageUrl={token.token_image}
                  size="md"
                />
                {isActive && (
                  <motion.div
                    className="absolute -inset-1 rounded-full border border-[#5D8C3E]/40"
                    animate={{ opacity: [0.4, 0.8, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </div>

              {/* Token Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-[#f8f0ec] text-base truncate">
                    {token.token_symbol}
                  </span>
                  {token.token_source && (
                    <SourceBadge source={token.token_source} size="sm" />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <FlywheelIndicator active={!!isActive} size="sm" />
                  {token.config?.algorithm_mode && (
                    <AlgorithmBadge
                      mode={token.config.algorithm_mode as any}
                      size="sm"
                      showIcon={true}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Right: Balance */}
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-[#7A756B] mb-0.5 font-medium uppercase tracking-wider">
                Balance
              </div>
              <div className="font-mono text-base font-semibold text-[#e67428]">
                {token.balance?.dev_sol !== undefined
                  ? `${token.balance.dev_sol.toFixed(3)}`
                  : '—'}
                <span className="text-xs text-[#7A756B] ml-1">SOL</span>
              </div>
            </div>

            {/* Chevron indicator */}
            <motion.div
              className="text-[#7A756B] group-hover:text-[#e67428] transition-colors"
              initial={{ x: 0 }}
              whileHover={{ x: 4 }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M7.5 4.5L13 10L7.5 15.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </motion.div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

/**
 * Compact variant for smaller spaces
 */
function CompactTokenCard({
  token,
  index,
  onLinkClick,
}: {
  token: Token;
  index: number;
  onLinkClick: () => void;
}) {
  const isActive = token.config?.flywheel_active;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link href={`/token/${token.id}`} onClick={onLinkClick}>
        <motion.div
          whileHover={{ backgroundColor: 'rgba(42,36,32,1)' }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-3 p-3 rounded-xl border border-transparent hover:border-[rgba(230,116,40,0.2)] transition-all"
        >
          <TokenAvatar
            symbol={token.token_symbol}
            imageUrl={token.token_image}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <span className="font-medium text-[#f8f0ec] text-sm truncate block">
              {token.token_symbol}
            </span>
          </div>
          <FlywheelIndicator active={!!isActive} showLabel={false} size="sm" />
        </motion.div>
      </Link>
    </motion.div>
  );
}

/**
 * Detailed variant with expanded information
 */
function DetailedTokenCard({
  token,
  index,
  onLinkClick,
}: {
  token: Token;
  index: number;
  onLinkClick: () => void;
}) {
  const isActive = token.config?.flywheel_active;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.5 }}
    >
      <Link href={`/token/${token.id}`} onClick={onLinkClick}>
        <motion.div
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className={`
            relative overflow-hidden rounded-2xl
            border transition-all duration-300
            ${isActive
              ? 'bg-gradient-to-br from-[#1f1810] via-[#252018] to-[#1f1810] border-[rgba(230,116,40,0.35)]'
              : 'bg-[#1f1810] border-[rgba(230,116,40,0.12)]'
            }
            hover:shadow-[0_12px_40px_rgba(230,116,40,0.2)]
          `}
        >
          {/* Header with gradient */}
          <div className="relative p-4 pb-3 border-b border-[rgba(230,116,40,0.1)]">
            {isActive && (
              <div className="absolute inset-0 bg-gradient-to-r from-[#5D8C3E]/10 via-transparent to-transparent" />
            )}

            <div className="relative flex items-center gap-4">
              <div className="relative">
                <TokenAvatar
                  symbol={token.token_symbol}
                  imageUrl={token.token_image}
                  size="lg"
                />
                {isActive && (
                  <motion.div
                    className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-[#5D8C3E] border-2 border-[#1f1810]"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-display font-bold text-lg text-[#f8f0ec] truncate">
                    {token.token_name}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#e67428] font-mono">
                    ${token.token_symbol}
                  </span>
                  {token.token_source && (
                    <SourceBadge source={token.token_source} size="sm" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="p-4 grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xs text-[#7A756B] mb-1 uppercase tracking-wider">
                Status
              </div>
              <FlywheelIndicator active={!!isActive} size="md" />
            </div>
            <div className="text-center">
              <div className="text-xs text-[#7A756B] mb-1 uppercase tracking-wider">
                Algorithm
              </div>
              <AlgorithmBadge
                mode={(token.config?.algorithm_mode as any) || 'simple'}
                size="sm"
              />
            </div>
            <div className="text-center">
              <div className="text-xs text-[#7A756B] mb-1 uppercase tracking-wider">
                Balance
              </div>
              <div className="font-mono text-sm font-semibold text-[#e67428]">
                {token.balance?.dev_sol?.toFixed(3) || '0.000'}
              </div>
            </div>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}

/**
 * Skeleton loader for token cards
 */
export function TokenCardSkeleton({ variant = 'default' }: { variant?: 'default' | 'compact' | 'detailed' }) {
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl animate-pulse">
        <div className="w-8 h-8 rounded-full bg-[#2a2420]" />
        <div className="flex-1">
          <div className="h-4 w-16 rounded bg-[#2a2420]" />
        </div>
        <div className="w-2 h-2 rounded-full bg-[#2a2420]" />
      </div>
    );
  }

  if (variant === 'detailed') {
    return (
      <div className="rounded-2xl border border-[rgba(230,116,40,0.12)] bg-[#1f1810] overflow-hidden animate-pulse">
        <div className="p-4 border-b border-[rgba(230,116,40,0.1)]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#2a2420]" />
            <div className="flex-1">
              <div className="h-5 w-32 rounded bg-[#2a2420] mb-2" />
              <div className="h-4 w-20 rounded bg-[#2a2420]" />
            </div>
          </div>
        </div>
        <div className="p-4 grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="text-center">
              <div className="h-3 w-12 rounded bg-[#2a2420] mx-auto mb-2" />
              <div className="h-4 w-16 rounded bg-[#2a2420] mx-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[rgba(230,116,40,0.12)] bg-[#1f1810] p-4 animate-pulse">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#2a2420]" />
          <div>
            <div className="h-4 w-20 rounded bg-[#2a2420] mb-2" />
            <div className="h-3 w-16 rounded bg-[#2a2420]" />
          </div>
        </div>
        <div className="text-right">
          <div className="h-3 w-12 rounded bg-[#2a2420] mb-2 ml-auto" />
          <div className="h-4 w-16 rounded bg-[#2a2420]" />
        </div>
      </div>
    </div>
  );
}
