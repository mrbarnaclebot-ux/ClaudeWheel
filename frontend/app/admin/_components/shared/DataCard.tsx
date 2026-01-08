'use client'

import { motion } from 'framer-motion'
import { ReactNode } from 'react'

interface DataCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon?: ReactNode
  trend?: {
    value: number
    label: string
    isPositive?: boolean
  }
  variant?: 'default' | 'success' | 'warning' | 'error' | 'accent'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  onClick?: () => void
}

const variantStyles = {
  default: {
    border: 'border-border-subtle',
    icon: 'text-text-muted',
    value: 'text-text-primary',
  },
  success: {
    border: 'border-success/30',
    icon: 'text-success',
    value: 'text-success',
  },
  warning: {
    border: 'border-warning/30',
    icon: 'text-warning',
    value: 'text-warning',
  },
  error: {
    border: 'border-error/30',
    icon: 'text-error',
    value: 'text-error',
  },
  accent: {
    border: 'border-accent-primary/30',
    icon: 'text-accent-primary',
    value: 'text-accent-primary',
  },
}

const sizeStyles = {
  sm: {
    padding: 'p-3',
    title: 'text-xs',
    value: 'text-lg',
    subtitle: 'text-xs',
  },
  md: {
    padding: 'p-4',
    title: 'text-xs',
    value: 'text-2xl',
    subtitle: 'text-xs',
  },
  lg: {
    padding: 'p-6',
    title: 'text-sm',
    value: 'text-3xl',
    subtitle: 'text-sm',
  },
}

export function DataCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = 'default',
  size = 'md',
  className = '',
  onClick,
}: DataCardProps) {
  const styles = variantStyles[variant]
  const sizes = sizeStyles[size]

  const content = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className={`font-mono ${sizes.title} text-text-muted uppercase tracking-wider`}>
          {title}
        </span>
        {icon && <span className={styles.icon}>{icon}</span>}
      </div>

      <div className={`font-bold ${sizes.value} ${styles.value} font-mono`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>

      {(subtitle || trend) && (
        <div className="flex items-center justify-between mt-2">
          {subtitle && (
            <span className={`${sizes.subtitle} text-text-muted`}>{subtitle}</span>
          )}
          {trend && (
            <span
              className={`${sizes.subtitle} font-mono ${
                trend.isPositive ? 'text-success' : 'text-error'
              }`}
            >
              {trend.isPositive ? '+' : ''}
              {trend.value}% {trend.label}
            </span>
          )}
        </div>
      )}
    </>
  )

  const baseClasses = `
    bg-bg-card border ${styles.border} rounded-xl ${sizes.padding}
    transition-all duration-200 ${className}
  `

  if (onClick) {
    return (
      <motion.button
        className={`${baseClasses} w-full text-left hover:border-accent-primary/50 hover:bg-bg-card-hover cursor-pointer`}
        onClick={onClick}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {content}
      </motion.button>
    )
  }

  return <div className={baseClasses}>{content}</div>
}

/**
 * Grid container for DataCards
 */
export function DataCardGrid({
  children,
  columns = 4,
  className = '',
}: {
  children: ReactNode
  columns?: 2 | 3 | 4 | 5 | 6
  className?: string
}) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
  }

  return <div className={`grid ${gridCols[columns]} gap-4 ${className}`}>{children}</div>
}

/**
 * Compact stat display for inline use
 */
export function StatInline({
  label,
  value,
  variant = 'default',
}: {
  label: string
  value: string | number
  variant?: 'default' | 'success' | 'warning' | 'error'
}) {
  const colors = {
    default: 'text-text-primary',
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-muted">{label}:</span>
      <span className={`text-sm font-mono font-medium ${colors[variant]}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </span>
    </div>
  )
}
