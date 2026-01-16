'use client';

import { CopyAddress } from './CopyButton';

interface WalletAddressProps {
  address: string;
  className?: string;
  showCopyButton?: boolean;
  showToast?: boolean;
  startChars?: number;
  endChars?: number;
}

export function WalletAddress({
  address,
  className = '',
  showCopyButton = true,
  showToast = false,
  startChars = 4,
  endChars = 4,
}: WalletAddressProps) {
  if (!showCopyButton) {
    const truncated = `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
    return (
      <p className={`font-mono text-xs text-accent-primary ${className}`}>
        {truncated}
      </p>
    );
  }

  return (
    <CopyAddress
      address={address}
      startChars={startChars}
      endChars={endChars}
      showToast={showToast}
      className={className}
    />
  );
}