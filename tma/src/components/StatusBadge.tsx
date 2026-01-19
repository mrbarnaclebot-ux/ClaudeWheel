'use client';

import { motion } from 'framer-motion';

type BadgeType = 'algorithm' | 'flywheel' | 'transaction' | 'source';
type BadgeSize = 'sm' | 'md' | 'lg';

// Algorithm mode badges
type AlgorithmMode = 'simple' | 'turbo_lite' | 'rebalance';

// Flywheel status badges
type FlywheelStatus = 'active' | 'paused' | 'error';

// Transaction type badges
type TransactionType = 'buy' | 'sell' | 'transfer' | 'claim';

// Token source badges
type TokenSource = 'launched' | 'registered' | 'mm_only';

interface StatusBadgeProps {
  type: BadgeType;
  value: AlgorithmMode | FlywheelStatus | TransactionType | TokenSource;
  size?: BadgeSize;
  showIcon?: boolean;
  showLabel?: boolean;
  pulse?: boolean;
  className?: string;
}

// Badge configurations
const algorithmConfig: Record<AlgorithmMode, { icon: string; label: string; className: string }> = {
  simple: { icon: '🐢', label: 'Simple', className: 'badge-accent' },
  turbo_lite: { icon: '🚀', label: 'Turbo', className: 'badge-success' },
  rebalance: { icon: '⚖️', label: 'Rebalance', className: 'badge-warning' },
};

const flywheelConfig: Record<FlywheelStatus, { icon: string; label: string; className: string; pulse?: boolean }> = {
  active: { icon: '●', label: 'Active', className: 'text-success', pulse: true },
  paused: { icon: '●', label: 'Paused', className: 'text-text-muted' },
  error: { icon: '●', label: 'Error', className: 'text-error' },
};

const transactionConfig: Record<TransactionType, { icon: string; label: string; className: string }> = {
  buy: { icon: '↓', label: 'Buy', className: 'bg-success/20 text-success border-success/30' },
  sell: { icon: '↑', label: 'Sell', className: 'bg-error/20 text-error border-error/30' },
  transfer: { icon: '→', label: 'Transfer', className: 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30' },
  claim: { icon: '◆', label: 'Claim', className: 'bg-accent-primary/20 text-accent-primary border-accent-primary/30' },
};

const sourceConfig: Record<TokenSource, { icon: string; label: string; className: string }> = {
  launched: { icon: '🚀', label: 'Launched', className: 'badge-success' },
  registered: { icon: '📝', label: 'Registered', className: 'badge-accent' },
  mm_only: { icon: '📈', label: 'MM Only', className: 'badge-warning' },
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-1.5 py-0',
  md: 'text-xs px-2 py-0.5',
  lg: 'text-sm px-3 py-1',
};

export function StatusBadge({
  type,
  value,
  size = 'md',
  showIcon = true,
  showLabel = true,
  pulse = false,
  className = '',
}: StatusBadgeProps) {
  let config: { icon: string; label: string; className: string; pulse?: boolean };

  switch (type) {
    case 'algorithm':
      config = algorithmConfig[value as AlgorithmMode] || algorithmConfig.simple;
      break;
    case 'flywheel':
      config = flywheelConfig[value as FlywheelStatus] || flywheelConfig.paused;
      break;
    case 'transaction':
      config = transactionConfig[value as TransactionType] || transactionConfig.buy;
      break;
    case 'source':
      config = sourceConfig[value as TokenSource] || sourceConfig.launched;
      break;
    default:
      config = { icon: '•', label: String(value), className: 'badge-accent' };
  }

  const shouldPulse = pulse || config.pulse;

  // Flywheel status uses a different layout (dot + text)
  if (type === 'flywheel') {
    return (
      <span className={`inline-flex items-center gap-1.5 ${className}`}>
        {showIcon && (
          <span className={`relative flex h-2 w-2 ${config.className}`}>
            {shouldPulse && (
              <motion.span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${config.className}`}
                animate={{ scale: [1, 1.5, 1], opacity: [0.75, 0, 0.75] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                style={{ backgroundColor: 'currentColor' }}
              />
            )}
            <span
              className="relative inline-flex rounded-full h-2 w-2"
              style={{ backgroundColor: 'currentColor' }}
            />
          </span>
        )}
        {showLabel && <span className={config.className}>{config.label}</span>}
      </span>
    );
  }

  // Transaction type uses icon in a circle
  if (type === 'transaction') {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full border ${config.className} ${sizeStyles[size]} ${className}`}
      >
        {showIcon && <span className="font-bold">{config.icon}</span>}
        {showLabel && <span className="ml-1">{config.label}</span>}
      </span>
    );
  }

  // Algorithm and source use badge style
  return (
    <span className={`badge ${config.className} ${sizeStyles[size]} ${className}`}>
      {showIcon && <span className="mr-1">{config.icon}</span>}
      {showLabel && config.label}
    </span>
  );
}

/**
 * Flywheel status indicator with dot and optional label
 */
interface FlywheelIndicatorProps {
  active: boolean;
  showLabel?: boolean;
  size?: BadgeSize;
  className?: string;
}

export function FlywheelIndicator({
  active,
  showLabel = true,
  size = 'md',
  className = '',
}: FlywheelIndicatorProps) {
  return (
    <StatusBadge
      type="flywheel"
      value={active ? 'active' : 'paused'}
      size={size}
      showLabel={showLabel}
      className={className}
    />
  );
}

/**
 * Algorithm mode badge with icon
 */
interface AlgorithmBadgeProps {
  mode: AlgorithmMode;
  size?: BadgeSize;
  showIcon?: boolean;
  className?: string;
}

export function AlgorithmBadge({
  mode,
  size = 'md',
  showIcon = true,
  className = '',
}: AlgorithmBadgeProps) {
  return (
    <StatusBadge
      type="algorithm"
      value={mode}
      size={size}
      showIcon={showIcon}
      className={className}
    />
  );
}

/**
 * Transaction type icon
 */
interface TransactionIconProps {
  type: TransactionType;
  size?: BadgeSize;
  showLabel?: boolean;
  className?: string;
}

export function TransactionIcon({
  type,
  size = 'md',
  showLabel = false,
  className = '',
}: TransactionIconProps) {
  return (
    <StatusBadge
      type="transaction"
      value={type}
      size={size}
      showLabel={showLabel}
      showIcon={true}
      className={className}
    />
  );
}

/**
 * Token source badge
 */
interface SourceBadgeProps {
  source: TokenSource;
  size?: BadgeSize;
  showIcon?: boolean;
  className?: string;
}

export function SourceBadge({
  source,
  size = 'sm',
  showIcon = false,
  className = '',
}: SourceBadgeProps) {
  return (
    <StatusBadge
      type="source"
      value={source}
      size={size}
      showIcon={showIcon}
      className={className}
    />
  );
}
