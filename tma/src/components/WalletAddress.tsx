'use client';

import { useState } from 'react';
import { useTelegram } from './TelegramProvider';

interface WalletAddressProps {
  address: string;
  className?: string;
  showCopyButton?: boolean;
}

export function WalletAddress({
  address,
  className = '',
  showCopyButton = true,
}: WalletAddressProps) {
  const [copied, setCopied] = useState(false);
  const { hapticFeedback } = useTelegram();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      hapticFeedback('medium');

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
    }
  };

  // Show first 4 + last 4 characters
  const truncated = `${address.slice(0, 4)}...${address.slice(-4)}`;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <p className="font-mono text-xs text-accent-primary">
        {truncated}
      </p>
      {showCopyButton && (
        <button
          onClick={copyToClipboard}
          className={`copy-btn ${copied ? 'copied' : ''}`}
          title="Copy address"
        >
          {copied ? '✓' : '📋'}
        </button>
      )}
    </div>
  );
}