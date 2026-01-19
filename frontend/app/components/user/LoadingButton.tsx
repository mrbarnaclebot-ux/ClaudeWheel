'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTelegram } from '@/components/WebProvider';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'cyan' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  hapticOnClick?: 'light' | 'medium' | 'heavy';
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent-primary hover:bg-accent-secondary text-bg-void disabled:bg-bg-card disabled:text-text-muted',
  secondary: 'bg-bg-card border border-border-subtle hover:bg-bg-card-hover hover:border-border-accent text-text-primary disabled:opacity-50',
  outline: 'bg-transparent border border-border-accent hover:bg-accent-primary/10 text-accent-primary disabled:opacity-50',
  danger: 'bg-error hover:bg-error/80 text-white disabled:bg-bg-card disabled:text-text-muted',
  success: 'bg-success hover:bg-success/80 text-white disabled:bg-bg-card disabled:text-text-muted',
  cyan: 'bg-accent-cyan hover:bg-accent-cyan/80 text-bg-void disabled:bg-bg-card disabled:text-text-muted',
  ghost: 'bg-transparent hover:bg-bg-card text-text-secondary hover:text-text-primary disabled:opacity-50',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-3 text-sm rounded-xl',
  lg: 'px-6 py-4 text-base rounded-xl',
};

export function LoadingButton({
  children,
  isLoading = false,
  loadingText,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  iconPosition = 'left',
  hapticOnClick = 'medium',
  className = '',
  disabled,
  onClick,
  ...props
}: LoadingButtonProps) {
  const { hapticFeedback } = useTelegram();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !isLoading) {
      hapticFeedback(hapticOnClick);
      onClick?.(e);
    }
  };

  const baseStyles = 'font-medium transition-all btn-press flex items-center justify-center gap-2';
  const widthStyle = fullWidth ? 'w-full' : '';
  const cursorStyle = isLoading || disabled ? 'cursor-not-allowed' : 'cursor-pointer';

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${cursorStyle} ${className}`}
      disabled={disabled || isLoading}
      onClick={handleClick}
      {...props}
    >
      {isLoading ? (
        <>
          <motion.span
            className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          {loadingText || children}
        </>
      ) : (
        <>
          {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
          {children}
          {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
        </>
      )}
    </button>
  );
}
