'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTelegram } from '@/components/WebProvider';
import { toast } from '@/lib/toast';

type CopyVariant = 'default' | 'minimal' | 'icon-only';
type CopySize = 'sm' | 'md' | 'lg';

interface CopyButtonProps {
  value: string;
  label?: string;
  showToast?: boolean;
  toastMessage?: string;
  variant?: CopyVariant;
  size?: CopySize;
  className?: string;
  onCopy?: () => void;
}

const sizeStyles: Record<CopySize, string> = {
  sm: 'p-1 text-xs',
  md: 'p-1.5 text-sm',
  lg: 'p-2 text-base',
};

export function CopyButton({
  value,
  label,
  showToast = false,
  toastMessage = 'Copied to clipboard',
  variant = 'default',
  size = 'md',
  className = '',
  onCopy,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const { hapticFeedback } = useTelegram();

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      hapticFeedback('light');

      if (showToast) {
        toast.copied(toastMessage);
      }

      onCopy?.();

      // Reset after animation
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy');
    }
  }, [value, hapticFeedback, showToast, toastMessage, onCopy]);

  if (variant === 'minimal') {
    return (
      <button
        onClick={handleCopy}
        className={`inline-flex items-center gap-1.5 text-text-muted hover:text-accent-primary transition-colors ${className}`}
        title="Copy to clipboard"
      >
        {label && <span className="truncate">{label}</span>}
        <AnimatePresence mode="wait">
          {copied ? (
            <motion.span
              key="check"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="text-success"
            >
              ✓
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
            >
              📋
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    );
  }

  if (variant === 'icon-only') {
    return (
      <button
        onClick={handleCopy}
        className={`copy-btn ${copied ? 'copied' : ''} ${sizeStyles[size]} ${className}`}
        title="Copy to clipboard"
      >
        <AnimatePresence mode="wait">
          {copied ? (
            <motion.span
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="text-success"
            >
              ✓
            </motion.span>
          ) : (
            <motion.span
              key="copy"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
            >
              📋
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    );
  }

  // Default variant - button with label
  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-2 bg-bg-card hover:bg-bg-card-hover border border-border-subtle hover:border-border-accent rounded-lg ${sizeStyles[size]} transition-all btn-press ${className}`}
      title="Copy to clipboard"
    >
      {label && <span className="text-text-secondary truncate max-w-[200px]">{label}</span>}
      <AnimatePresence mode="wait">
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="text-success font-medium"
          >
            ✓ Copied
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="text-accent-primary"
          >
            Copy
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/**
 * Truncated address with copy functionality
 */
interface CopyAddressProps {
  address: string;
  startChars?: number;
  endChars?: number;
  showToast?: boolean;
  className?: string;
}

export function CopyAddress({
  address,
  startChars = 4,
  endChars = 4,
  showToast = false,
  className = '',
}: CopyAddressProps) {
  const truncated = `${address.slice(0, startChars)}...${address.slice(-endChars)}`;

  return (
    <CopyButton
      value={address}
      label={truncated}
      showToast={showToast}
      toastMessage="Address copied"
      variant="minimal"
      className={`font-mono text-xs text-accent-primary ${className}`}
    />
  );
}
