'use client';

import { useState } from 'react';

interface TokenAvatarProps {
  symbol: string;
  imageUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Generate gradient based on token symbol hash
function getGradientForSymbol(symbol: string): string {
  const gradients = [
    'from-wood-light to-wood-accent',
    'from-copper to-bronze',
    'from-accent-primary to-accent-secondary',
    'from-wood-dark to-wood-medium',
  ];

  // Simple hash function
  const hash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return gradients[hash % gradients.length];
}

export function TokenAvatar({
  symbol,
  imageUrl,
  size = 'md',
  className = '',
}: TokenAvatarProps) {
  const [imageError, setImageError] = useState(false);

  const sizeClasses = {
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-lg',
    lg: 'w-16 h-16 text-2xl',
  };

  const gradient = getGradientForSymbol(symbol);

  // Show gradient fallback if no image or image failed to load
  if (!imageUrl || imageError) {
    return (
      <div
        className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center ${className}`}
      >
        <span className="font-bold text-white drop-shadow">
          {symbol[0]}
        </span>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={symbol}
      onError={() => setImageError(true)}
      className={`${sizeClasses[size]} rounded-full object-cover border-2 border-border-accent ${className}`}
    />
  );
}
