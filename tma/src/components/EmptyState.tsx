'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTelegram } from './TelegramProvider';

type EmptyStateVariant = 'default' | 'minimal' | 'card' | 'inline';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
    icon?: string;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  socialProof?: string;
  variant?: EmptyStateVariant;
  className?: string;
  animate?: boolean;
}

// Preset configurations for common empty states
export const emptyStatePresets = {
  noTokens: {
    icon: '🎡',
    title: 'No tokens yet',
    description: 'Launch your first token in under 2 minutes. We\'ll handle the trading for you.',
    primaryAction: {
      label: 'Launch Your First Token',
      href: '/launch',
      icon: '🚀',
    },
    secondaryAction: {
      label: 'Or register existing token',
      href: '/register',
    },
    socialProof: 'Join creators already trading',
  },
  noTransactions: {
    icon: '📊',
    title: 'No trades yet',
    description: 'Trades will appear here once the flywheel starts running.',
  },
  noClaims: {
    icon: '💰',
    title: 'No claims yet',
    description: 'Fee claims will appear here when you have claimable fees.',
  },
  error: {
    icon: '⚠️',
    title: 'Something went wrong',
    description: 'An error occurred. Please try again.',
  },
  loading: {
    icon: '⏳',
    title: 'Loading...',
    description: 'Please wait while we fetch your data.',
  },
  searchNoResults: {
    icon: '🔍',
    title: 'No results found',
    description: 'Try adjusting your search or filters.',
  },
};

export function EmptyState({
  icon = '🎡',
  title,
  description,
  primaryAction,
  secondaryAction,
  socialProof,
  variant = 'default',
  className = '',
  animate = true,
}: EmptyStateProps) {
  const { hapticFeedback } = useTelegram();

  const handleClick = () => {
    hapticFeedback('light');
  };

  const renderAction = (
    action: { label: string; href?: string; onClick?: () => void; icon?: string },
    isPrimary: boolean
  ) => {
    const classes = isPrimary
      ? 'bg-accent-primary hover:bg-accent-secondary text-bg-void px-6 py-3 rounded-xl font-medium transition-all btn-press hover:shadow-wood-glow mb-3 flex items-center gap-2'
      : 'text-xs text-accent-primary hover:text-accent-secondary transition-colors';

    if (action.href) {
      return (
        <Link
          href={action.href}
          onClick={handleClick}
          className={classes}
        >
          {isPrimary && action.icon && <span>{action.icon}</span>}
          {action.label}
          {!isPrimary && ' →'}
        </Link>
      );
    }

    return (
      <button
        onClick={() => {
          handleClick();
          action.onClick?.();
        }}
        className={classes}
      >
        {isPrimary && action.icon && <span>{action.icon}</span>}
        {action.label}
        {!isPrimary && ' →'}
      </button>
    );
  };

  // Minimal variant - just icon and text, no background
  if (variant === 'minimal') {
    return (
      <div className={`flex flex-col items-center justify-center py-8 text-center ${className}`}>
        <span className="text-4xl mb-3 opacity-60">{icon}</span>
        <p className="text-sm text-text-muted">{description}</p>
      </div>
    );
  }

  // Inline variant - horizontal layout
  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-4 py-4 px-4 ${className}`}>
        <span className="text-3xl opacity-60">{icon}</span>
        <div className="flex-1">
          <p className="font-medium text-text-primary text-sm">{title}</p>
          <p className="text-xs text-text-muted">{description}</p>
        </div>
        {primaryAction && (
          <Link
            href={primaryAction.href || '#'}
            onClick={handleClick}
            className="bg-accent-primary hover:bg-accent-secondary text-bg-void px-4 py-2 rounded-lg text-sm font-medium transition-colors btn-press"
          >
            {primaryAction.label}
          </Link>
        )}
      </div>
    );
  }

  // Card variant - with background and border
  if (variant === 'card') {
    return (
      <motion.div
        initial={animate ? { opacity: 0, y: 10 } : false}
        animate={animate ? { opacity: 1, y: 0 } : false}
        className={`bg-bg-card border border-border-subtle rounded-xl p-6 text-center ${className}`}
      >
        <motion.div
          animate={animate ? { rotate: [0, 5, -5, 0] } : false}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="text-4xl mb-4 opacity-70"
        >
          {icon}
        </motion.div>
        <h4 className="font-medium text-text-primary mb-2">{title}</h4>
        <p className="text-text-muted text-sm mb-4">{description}</p>
        {primaryAction && renderAction(primaryAction, true)}
        {secondaryAction && renderAction(secondaryAction, false)}
      </motion.div>
    );
  }

  // Default variant - full page centered
  return (
    <motion.div
      initial={animate ? { opacity: 0, scale: 0.95 } : false}
      animate={animate ? { opacity: 1, scale: 1 } : false}
      transition={{ duration: 0.3 }}
      className={`flex flex-col items-center justify-center min-h-[40vh] text-center px-4 ${className}`}
    >
      {/* Animated icon */}
      <motion.div
        animate={animate ? { rotate: [0, 5, -5, 0] } : false}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="text-7xl mb-6 opacity-70"
      >
        {icon}
      </motion.div>

      {/* Title */}
      <h3 className="text-xl font-bold mb-2 text-text-primary">
        {title}
      </h3>

      {/* Description */}
      <p className="text-text-muted mb-6 max-w-xs text-sm">
        {description}
      </p>

      {/* Primary action */}
      {primaryAction && renderAction(primaryAction, true)}

      {/* Secondary action */}
      {secondaryAction && renderAction(secondaryAction, false)}

      {/* Social proof */}
      {socialProof && (
        <div className="mt-8 text-xs text-text-muted">
          <p>✨ {socialProof}</p>
        </div>
      )}
    </motion.div>
  );
}

/**
 * Shorthand component for common empty states
 */
export function EmptyStatePreset({
  preset,
  ...overrides
}: { preset: keyof typeof emptyStatePresets } & Partial<EmptyStateProps>) {
  const config = emptyStatePresets[preset];
  return <EmptyState {...config} {...overrides} />;
}
