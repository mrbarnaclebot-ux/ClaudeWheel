'use client';

import { CopyAddress } from './CopyButton';

interface WalletAddressProps {
  address: string;
  className?: string;
  showCopyButton?: boolean;
  showToast?: boolean;
  startChars?: number;
  endChars?: number;
  variant?: 'truncated' | 'full';
}

export function WalletAddress({
  address,
  className = '',
  showCopyButton = true,
  showToast = false,
  startChars = 4,
  endChars = 4,
  variant = 'truncated',
}: WalletAddressProps) {
  const displayAddress = variant === 'full'
    ? address
    : `${address.slice(0, startChars)}...${address.slice(-endChars)}`;

  if (!showCopyButton) {
    return (
      <p className={`font-mono text-xs text-accent-primary ${className} ${variant === 'full' ? 'break-all' : ''}`}>
        {displayAddress}
      </p>
    );
  }

  return (
    <CopyAddress
      address={address}
      startChars={variant === 'full' ? address.length : startChars}
      endChars={variant === 'full' ? 0 : endChars}
      showToast={showToast}
      className={className}
    />
  );
}
