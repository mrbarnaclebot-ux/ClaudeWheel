'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTelegram } from '@/components/WebProvider';
import { TokenAvatar } from './TokenAvatar';
import { FlywheelIndicator, AlgorithmBadge, SourceBadge } from './StatusBadge';
import { WalletAddress } from './WalletAddress';

type CardVariant = 'default' | 'compact' | 'detailed';

interface TokenCardProps {
  id: string;
  symbol: string;
  name?: string;
  imageUrl?: string;
  mintAddress: string;
  balance?: number;
  balanceUsd?: number;
  flywheelActive?: boolean;
  algorithmMode?: 'simple' | 'turbo_lite' | 'rebalance';
  tokenSource?: 'launched' | 'registered' | 'mm_only';
  claimable?: number;
  variant?: CardVariant;
  showActions?: boolean;
  className?: string;
  onClick?: () => void;
}

export function TokenCard({
  id,
  symbol,
  name,
  imageUrl,
  mintAddress,
  balance,
  balanceUsd,
  flywheelActive = false,
  algorithmMode = 'simple',
  tokenSource = 'launched',
  claimable,
  variant = 'default',
  showActions = false,
  className = '',
  onClick,
}: TokenCardProps) {
  const { hapticFeedback } = useTelegram();

  const handleClick = () => {
    hapticFeedback('light');
    onClick?.();
  };

  // Compact variant - minimal info for lists
  if (variant === 'compact') {
    return (
      <Link href={`/user/token/${id}`} onClick={handleClick}>
        <motion.div
          whileTap={{ scale: 0.98 }}
          className={`bg-bg-card border border-border-subtle hover:border-border-accent rounded-xl p-3 flex items-center gap-3 transition-all cursor-pointer ${className}`}
        >
          <TokenAvatar symbol={symbol} imageUrl={imageUrl} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-text-primary truncate">${symbol}</p>
          </div>
          <FlywheelIndicator active={flywheelActive} showLabel={false} />
        </motion.div>
      </Link>
    );
  }

  // Detailed variant - full info with actions
  if (variant === 'detailed') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-bg-card border border-border-subtle rounded-xl overflow-hidden ${className}`}
      >
        {/* Header */}
        <Link href={`/user/token/${id}`} onClick={handleClick}>
          <div className="p-4 hover:bg-bg-card-hover transition-colors cursor-pointer">
            <div className="flex items-center gap-3 mb-3">
              <TokenAvatar symbol={symbol} imageUrl={imageUrl} size="lg" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-bold text-lg text-text-primary">${symbol}</p>
                  <SourceBadge source={tokenSource} />
                </div>
                {name && <p className="text-sm text-text-muted truncate">{name}</p>}
              </div>
              <div className="text-right">
                {balance !== undefined && (
                  <>
                    <p className="text-xs text-text-muted">Balance</p>
                    <p className="font-medium text-text-primary">{balance.toLocaleString()}</p>
                    {balanceUsd !== undefined && (
                      <p className="text-xs text-text-muted">${balanceUsd.toFixed(2)}</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Status row */}
            <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
              <div className="flex items-center gap-3">
                <FlywheelIndicator active={flywheelActive} />
                <AlgorithmBadge mode={algorithmMode} size="sm" />
              </div>
              {claimable !== undefined && claimable > 0 && (
                <p className="text-sm text-success font-medium">
                  +{claimable.toFixed(4)} SOL claimable
                </p>
              )}
            </div>
          </div>
        </Link>

        {/* Actions */}
        {showActions && (
          <div className="px-4 pb-4 flex gap-2">
            <Link
              href={`/user/token/${id}`}
              onClick={handleClick}
              className="flex-1 bg-bg-secondary hover:bg-bg-card-hover text-center py-2 rounded-lg text-sm font-medium text-text-secondary transition-colors"
            >
              View Details
            </Link>
            <Link
              href={`/user/token/${id}/settings`}
              onClick={handleClick}
              className="flex-1 bg-bg-secondary hover:bg-bg-card-hover text-center py-2 rounded-lg text-sm font-medium text-text-secondary transition-colors"
            >
              Settings
            </Link>
          </div>
        )}
      </motion.div>
    );
  }

  // Default variant - balanced info
  return (
    <Link href={`/user/token/${id}`} onClick={handleClick}>
      <motion.div
        whileTap={{ scale: 0.98 }}
        className={`bg-bg-card border border-border-subtle hover:border-border-accent rounded-xl p-4 transition-all cursor-pointer ${className}`}
      >
        <div className="flex items-center gap-3">
          <TokenAvatar symbol={symbol} imageUrl={imageUrl} size="md" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-medium text-text-primary">${symbol}</p>
              <SourceBadge source={tokenSource} size="sm" showIcon={false} />
            </div>
            <div className="flex items-center gap-2">
              <FlywheelIndicator active={flywheelActive} size="sm" />
              <AlgorithmBadge mode={algorithmMode} size="sm" showIcon={false} />
            </div>
          </div>

          <div className="text-right">
            {balance !== undefined && (
              <>
                <p className="text-xs text-text-muted">Balance</p>
                <p className="font-medium text-text-primary text-sm">
                  {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
              </>
            )}
            {claimable !== undefined && claimable > 0 && (
              <p className="text-xs text-success mt-1">
                +{claimable.toFixed(4)} SOL
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
