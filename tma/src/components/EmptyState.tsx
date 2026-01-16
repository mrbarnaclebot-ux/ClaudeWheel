'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTelegram } from './TelegramProvider';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    href: string;
    icon?: string;
  };
  secondaryAction?: {
    label: string;
    href: string;
  };
  socialProof?: string;
}

export function EmptyState({
  icon = '🎡',
  title,
  description,
  primaryAction,
  secondaryAction,
  socialProof,
}: EmptyStateProps) {
  const { hapticFeedback } = useTelegram();

  const handleLinkClick = () => {
    hapticFeedback('light');
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4"
    >
      {/* Animated icon */}
      <motion.div
        animate={{ rotate: [0, 5, -5, 0] }}
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
      {primaryAction && (
        <Link
          href={primaryAction.href}
          onClick={handleLinkClick}
          className="bg-accent-primary hover:bg-accent-secondary text-bg-void px-6 py-3 rounded-xl font-medium transition-all btn-press hover:shadow-wood-glow mb-3 flex items-center gap-2"
        >
          {primaryAction.icon && <span>{primaryAction.icon}</span>}
          {primaryAction.label}
        </Link>
      )}

      {/* Secondary action */}
      {secondaryAction && (
        <Link
          href={secondaryAction.href}
          onClick={handleLinkClick}
          className="text-xs text-accent-primary hover:text-accent-secondary transition-colors"
        >
          {secondaryAction.label} →
        </Link>
      )}

      {/* Social proof */}
      {socialProof && (
        <div className="mt-8 text-xs text-text-muted">
          <p>✨ {socialProof}</p>
        </div>
      )}
    </motion.div>
  );
}
