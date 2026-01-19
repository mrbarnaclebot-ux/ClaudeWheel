'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

interface CycleProgressProps {
  phase: 'buy' | 'sell';
  currentCount: number;
  totalCount: number;
  algorithmMode?: string;
  lastTradeAt?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ring' | 'bar' | 'compact';
}

export function CycleProgress({
  phase,
  currentCount,
  totalCount,
  algorithmMode = 'simple',
  lastTradeAt,
  showLabel = true,
  size = 'md',
  variant = 'ring',
}: CycleProgressProps) {
  const progress = totalCount > 0 ? (currentCount / totalCount) * 100 : 0;
  const isBuyPhase = phase === 'buy';

  const colors = useMemo(() => ({
    buy: {
      primary: '#5D8C3E',
      secondary: 'rgba(93, 140, 62, 0.2)',
      glow: 'rgba(93, 140, 62, 0.4)',
    },
    sell: {
      primary: '#A63D2F',
      secondary: 'rgba(166, 61, 47, 0.2)',
      glow: 'rgba(166, 61, 47, 0.4)',
    },
  }), []);

  const activeColors = isBuyPhase ? colors.buy : colors.sell;

  const sizeConfig = {
    sm: { ring: 48, stroke: 4, fontSize: 'text-xs', iconSize: 16 },
    md: { ring: 72, stroke: 6, fontSize: 'text-sm', iconSize: 20 },
    lg: { ring: 96, stroke: 8, fontSize: 'text-base', iconSize: 24 },
  };

  const config = sizeConfig[size];
  const radius = (config.ring - config.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) return 'just now';
    if (diffSecs < 3600) return `${Math.floor(diffSecs / 60)}m ago`;
    if (diffSecs < 86400) return `${Math.floor(diffSecs / 3600)}h ago`;
    return `${Math.floor(diffSecs / 86400)}d ago`;
  };

  if (variant === 'bar') {
    return (
      <div className="w-full">
        {showLabel && (
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className={`text-lg ${isBuyPhase ? 'text-success' : 'text-error'}`}
              >
                {isBuyPhase ? '↓' : '↑'}
              </span>
              <span className={`font-medium ${config.fontSize} text-text-primary`}>
                {isBuyPhase ? 'Buy Phase' : 'Sell Phase'}
              </span>
            </div>
            <span className={`font-mono ${config.fontSize} text-text-secondary`}>
              {currentCount}/{totalCount}
            </span>
          </div>
        )}

        <div className="relative h-2 bg-bg-card rounded-full overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ backgroundColor: activeColors.primary }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
          {/* Animated shimmer */}
          <motion.div
            className="absolute inset-y-0 w-8 bg-gradient-to-r from-transparent via-white/20 to-transparent"
            animate={{ x: ['-100%', '400%'] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          />
        </div>

        {lastTradeAt && (
          <p className="text-xs text-text-muted mt-1.5">
            Last trade {formatTimeAgo(lastTradeAt)}
          </p>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-full ${
            isBuyPhase ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
          }`}
        >
          <span className="text-sm font-bold">{isBuyPhase ? '↓' : '↑'}</span>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-text-muted capitalize">{phase} phase</span>
            <span className="text-xs font-mono text-text-secondary">
              {currentCount}/{totalCount}
            </span>
          </div>
          <div className="h-1.5 bg-bg-card rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: activeColors.primary }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Ring variant (default)
  return (
    <div className="flex items-center gap-4">
      {/* SVG Ring */}
      <div className="relative" style={{ width: config.ring, height: config.ring }}>
        <svg
          className="transform -rotate-90"
          width={config.ring}
          height={config.ring}
        >
          {/* Background ring */}
          <circle
            cx={config.ring / 2}
            cy={config.ring / 2}
            r={radius}
            fill="none"
            stroke={activeColors.secondary}
            strokeWidth={config.stroke}
          />
          {/* Progress ring */}
          <motion.circle
            cx={config.ring / 2}
            cy={config.ring / 2}
            r={radius}
            fill="none"
            stroke={activeColors.primary}
            strokeWidth={config.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{
              filter: `drop-shadow(0 0 8px ${activeColors.glow})`,
            }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-lg font-bold ${
              isBuyPhase ? 'text-success' : 'text-error'
            }`}
          >
            {isBuyPhase ? '↓' : '↑'}
          </span>
        </div>

        {/* Glow effect for active */}
        {currentCount > 0 && (
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: `0 0 20px ${activeColors.glow}, 0 0 40px ${activeColors.glow}`,
            }}
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </div>

      {/* Labels */}
      {showLabel && (
        <div>
          <p className="font-medium text-text-primary capitalize">
            {phase} Phase
          </p>
          <p className={`font-mono ${config.fontSize} text-text-secondary`}>
            {currentCount} of {totalCount}
          </p>
          {lastTradeAt && (
            <p className="text-xs text-text-muted mt-0.5">
              {formatTimeAgo(lastTradeAt)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Full cycle visualization showing both buy and sell phases
 */
interface FullCycleProgressProps {
  buyCount: number;
  sellCount: number;
  cycleSize: number;
  phase: 'buy' | 'sell';
  isActive: boolean;
  algorithmMode?: string;
}

export function FullCycleProgress({
  buyCount,
  sellCount,
  cycleSize,
  phase,
  isActive,
  algorithmMode = 'simple',
}: FullCycleProgressProps) {
  const totalSteps = cycleSize * 2;
  const currentStep = phase === 'buy' ? buyCount : cycleSize + sellCount;
  const overallProgress = (currentStep / totalSteps) * 100;

  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <motion.div
            className={`w-2 h-2 rounded-full ${isActive ? 'bg-success' : 'bg-text-muted'}`}
            animate={isActive ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span className="text-sm font-medium text-text-primary">
            {isActive ? 'Cycle Active' : 'Cycle Paused'}
          </span>
        </div>
        <span className="text-xs text-text-muted font-mono">
          {algorithmMode === 'turbo_lite' ? 'Turbo' : 'Simple'}
        </span>
      </div>

      {/* Progress Steps */}
      <div className="flex gap-1 mb-3">
        {/* Buy steps */}
        {Array.from({ length: cycleSize }).map((_, i) => (
          <motion.div
            key={`buy-${i}`}
            className={`flex-1 h-2 rounded-full transition-colors ${
              i < buyCount
                ? 'bg-success'
                : phase === 'buy' && i === buyCount && isActive
                ? 'bg-success/50'
                : 'bg-bg-secondary'
            }`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: i * 0.05 }}
          />
        ))}

        {/* Divider */}
        <div className="w-px bg-border-subtle mx-1" />

        {/* Sell steps */}
        {Array.from({ length: cycleSize }).map((_, i) => (
          <motion.div
            key={`sell-${i}`}
            className={`flex-1 h-2 rounded-full transition-colors ${
              i < sellCount
                ? 'bg-error'
                : phase === 'sell' && i === sellCount && isActive
                ? 'bg-error/50'
                : 'bg-bg-secondary'
            }`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: (cycleSize + i) * 0.05 }}
          />
        ))}
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <span className="text-success">↓</span>
          <span className="text-text-muted">
            Buy {buyCount}/{cycleSize}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">
            Sell {sellCount}/{cycleSize}
          </span>
          <span className="text-error">↑</span>
        </div>
      </div>
    </div>
  );
}
