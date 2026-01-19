'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface DepositProgressProps {
  currentBalance: number;
  requiredAmount: number;
  recommendedAmount?: number;
  variant?: 'default' | 'compact';
  accentColor?: 'primary' | 'cyan';
}

export function DepositProgress({
  currentBalance,
  requiredAmount,
  recommendedAmount,
  variant = 'default',
  accentColor = 'primary',
}: DepositProgressProps) {
  const progress = useMemo(() => {
    if (requiredAmount <= 0) return 0;
    return Math.min(100, (currentBalance / requiredAmount) * 100);
  }, [currentBalance, requiredAmount]);

  const recommendedProgress = useMemo(() => {
    if (!recommendedAmount || recommendedAmount <= 0) return null;
    return Math.min(100, (currentBalance / recommendedAmount) * 100);
  }, [currentBalance, recommendedAmount]);

  const isMinimumReached = currentBalance >= requiredAmount;
  const isRecommendedReached = recommendedAmount ? currentBalance >= recommendedAmount : false;

  const colorClasses = accentColor === 'cyan'
    ? {
        bar: 'bg-accent-cyan',
        text: 'text-accent-cyan',
        glow: 'shadow-[0_0_10px_rgba(0,200,200,0.5)]',
      }
    : {
        bar: 'bg-accent-primary',
        text: 'text-accent-primary',
        glow: 'shadow-[0_0_10px_rgba(230,116,40,0.5)]',
      };

  if (variant === 'compact') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-muted">Progress</span>
          <span className={`font-mono ${isMinimumReached ? 'text-success' : colorClasses.text}`}>
            {currentBalance.toFixed(4)} / {requiredAmount.toFixed(2)} SOL
          </span>
        </div>
        <div className="relative h-2 bg-bg-secondary rounded-full overflow-hidden">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full ${isMinimumReached ? 'bg-success' : colorClasses.bar}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-primary">Deposit Progress</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          isMinimumReached
            ? 'bg-success/20 text-success'
            : 'bg-warning/20 text-warning'
        }`}>
          {isMinimumReached ? 'Ready to activate' : 'Awaiting deposit'}
        </span>
      </div>

      {/* Main progress bar */}
      <div className="space-y-2">
        <div className="relative h-4 bg-bg-secondary rounded-full overflow-hidden">
          {/* Recommended marker (if exists) */}
          {recommendedAmount && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-text-muted/30 z-10"
              style={{ left: `${(requiredAmount / recommendedAmount) * 100}%` }}
            />
          )}

          {/* Progress fill */}
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full transition-colors ${
              isMinimumReached ? 'bg-success' : colorClasses.bar
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${recommendedAmount ? Math.min(100, (currentBalance / recommendedAmount) * 100) : progress}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            {/* Animated shimmer */}
            {!isMinimumReached && (
              <motion.div
                className="absolute inset-y-0 w-12 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                animate={{ x: ['-100%', '300%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
            )}
          </motion.div>
        </div>

        {/* Milestones */}
        <div className="flex justify-between items-start">
          <div className="text-left">
            <p className="text-xs text-text-muted">Current</p>
            <p className={`font-mono text-sm font-bold ${
              currentBalance > 0 ? (isMinimumReached ? 'text-success' : colorClasses.text) : 'text-text-secondary'
            }`}>
              {currentBalance.toFixed(4)} SOL
            </p>
          </div>

          <div className="text-center">
            <p className="text-xs text-text-muted">Minimum</p>
            <p className={`font-mono text-sm ${isMinimumReached ? 'text-success' : 'text-text-secondary'}`}>
              {requiredAmount.toFixed(2)} SOL
              {isMinimumReached && ' ✓'}
            </p>
          </div>

          {recommendedAmount && (
            <div className="text-right">
              <p className="text-xs text-text-muted">Recommended</p>
              <p className={`font-mono text-sm ${isRecommendedReached ? 'text-success' : 'text-text-secondary'}`}>
                {recommendedAmount.toFixed(2)} SOL
                {isRecommendedReached && ' ✓'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Status message */}
      <div className={`text-xs p-2 rounded-lg ${
        isMinimumReached
          ? 'bg-success/10 text-success'
          : 'bg-bg-secondary text-text-muted'
      }`}>
        {isMinimumReached ? (
          isRecommendedReached ? (
            <span>Excellent! You have enough for effective market making.</span>
          ) : (
            <span>Minimum reached! Consider adding more for better performance.</span>
          )
        ) : (
          <span>
            Need <span className="font-mono font-bold">{(requiredAmount - currentBalance).toFixed(4)} SOL</span> more to activate
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Minimal inline version for tight spaces
 */
export function DepositProgressInline({
  currentBalance,
  requiredAmount,
  accentColor = 'primary',
}: {
  currentBalance: number;
  requiredAmount: number;
  accentColor?: 'primary' | 'cyan';
}) {
  const progress = Math.min(100, (currentBalance / requiredAmount) * 100);
  const isComplete = currentBalance >= requiredAmount;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-bg-secondary rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${isComplete ? 'bg-success' : accentColor === 'cyan' ? 'bg-accent-cyan' : 'bg-accent-primary'}`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <span className={`text-xs font-mono ${isComplete ? 'text-success' : 'text-text-muted'}`}>
        {progress.toFixed(0)}%
      </span>
    </div>
  );
}
