'use client';

import { motion } from 'framer-motion';
import { useTelegram } from './TelegramProvider';

interface ClaimableFeesCardProps {
  claimableSol: number;
  totalEarned?: number;
  lastClaimAt?: string;
  onClaim?: () => void;
  isClaimPending?: boolean;
  variant?: 'default' | 'compact' | 'inline';
  showHistory?: boolean;
}

export function ClaimableFeesCard({
  claimableSol,
  totalEarned,
  lastClaimAt,
  onClaim,
  isClaimPending,
  variant = 'default',
  showHistory = false,
}: ClaimableFeesCardProps) {
  const { hapticFeedback } = useTelegram();
  const hasClaimable = claimableSol >= 0.15; // Auto-claim threshold
  const hasAnyFees = claimableSol > 0;

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (variant === 'inline') {
    return (
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">💰</span>
          <span className="text-sm text-text-muted">Claimable Fees</span>
        </div>
        <div className="text-right">
          <span className={`font-mono text-sm font-medium ${hasClaimable ? 'text-success' : 'text-text-secondary'}`}>
            {claimableSol.toFixed(4)} SOL
          </span>
          {hasClaimable && (
            <span className="ml-2 text-xs text-success/70">Ready!</span>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="bg-bg-card border border-border-subtle rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              hasClaimable ? 'bg-success/20' : 'bg-bg-secondary'
            }`}>
              <span className="text-sm">💰</span>
            </div>
            <div>
              <p className="text-xs text-text-muted">Claimable</p>
              <p className={`font-mono text-sm font-medium ${hasClaimable ? 'text-success' : 'text-text-primary'}`}>
                {claimableSol.toFixed(4)} SOL
              </p>
            </div>
          </div>
          {hasClaimable && (
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: [0.9, 1.05, 0.9] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 bg-success rounded-full"
            />
          )}
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-4 border ${
        hasClaimable
          ? 'bg-success/10 border-success/30'
          : 'bg-bg-card border-border-subtle'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">💰</span>
          <div>
            <h4 className="font-medium text-text-primary">Claimable Fees</h4>
            <p className="text-xs text-text-muted">
              {hasClaimable ? 'Ready to claim!' : 'Auto-claims at 0.15 SOL'}
            </p>
          </div>
        </div>
        {hasClaimable && (
          <motion.div
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="bg-success text-bg-void text-xs px-2 py-0.5 rounded-full font-medium"
          >
            Ready
          </motion.div>
        )}
      </div>

      {/* Main amount */}
      <div className="text-center py-4">
        <p className={`text-3xl font-bold font-mono ${
          hasClaimable ? 'text-success' : hasAnyFees ? 'text-accent-primary' : 'text-text-secondary'
        }`}>
          {claimableSol.toFixed(4)}
        </p>
        <p className="text-sm text-text-muted">SOL</p>
      </div>

      {/* Progress to auto-claim threshold */}
      {!hasClaimable && hasAnyFees && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-text-muted mb-1">
            <span>Progress to auto-claim</span>
            <span>{((claimableSol / 0.15) * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-bg-secondary rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-accent-primary rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (claimableSol / 0.15) * 100)}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      {/* Stats row */}
      {(totalEarned !== undefined || lastClaimAt) && (
        <div className="flex justify-between text-xs border-t border-border-subtle pt-3 mt-3">
          {totalEarned !== undefined && (
            <div>
              <p className="text-text-muted">Total Earned</p>
              <p className="font-mono text-text-primary">{totalEarned.toFixed(4)} SOL</p>
            </div>
          )}
          {lastClaimAt && (
            <div className="text-right">
              <p className="text-text-muted">Last Claim</p>
              <p className="text-text-primary">{formatTimeAgo(lastClaimAt)}</p>
            </div>
          )}
        </div>
      )}

      {/* Manual claim button (if provided) */}
      {onClaim && hasClaimable && (
        <button
          onClick={() => {
            hapticFeedback('medium');
            onClaim();
          }}
          disabled={isClaimPending}
          className="w-full mt-4 bg-success hover:bg-success/80 text-white py-3 rounded-lg font-medium transition-colors btn-press disabled:opacity-50"
        >
          {isClaimPending ? 'Claiming...' : 'Claim Now'}
        </button>
      )}
    </motion.div>
  );
}

/**
 * Summary card showing total fees across all tokens
 */
interface TotalFeesCardProps {
  totalClaimable: number;
  totalEarned: number;
  tokenCount: number;
}

export function TotalFeesCard({ totalClaimable, totalEarned, tokenCount }: TotalFeesCardProps) {
  const hasClaimable = totalClaimable > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-accent-primary/10 to-success/10 border border-accent-primary/20 rounded-xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🎯</span>
        <span className="text-sm font-medium text-text-primary">Fee Summary</span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className={`text-lg font-bold font-mono ${hasClaimable ? 'text-success' : 'text-text-secondary'}`}>
            {totalClaimable.toFixed(3)}
          </p>
          <p className="text-xs text-text-muted">Claimable</p>
        </div>
        <div className="text-center border-x border-border-subtle">
          <p className="text-lg font-bold font-mono text-accent-primary">
            {totalEarned.toFixed(3)}
          </p>
          <p className="text-xs text-text-muted">Total Earned</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold font-mono text-text-primary">
            {tokenCount}
          </p>
          <p className="text-xs text-text-muted">Tokens</p>
        </div>
      </div>
    </motion.div>
  );
}
