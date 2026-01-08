'use client'

import { motion } from 'framer-motion'
import { ReactNode } from 'react'

type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'accent'
  | 'muted'

type BadgeSize = 'xs' | 'sm' | 'md'

interface StatusBadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  size?: BadgeSize
  pulse?: boolean
  dot?: boolean
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-bg-secondary text-text-primary border-border-subtle',
  success: 'bg-success/20 text-success border-success/30',
  warning: 'bg-warning/20 text-warning border-warning/30',
  error: 'bg-error/20 text-error border-error/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  accent: 'bg-accent-primary/20 text-accent-primary border-accent-primary/30',
  muted: 'bg-bg-secondary/50 text-text-muted border-border-subtle/50',
}

const sizeStyles: Record<BadgeSize, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
}

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-text-muted',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
  info: 'bg-blue-400',
  accent: 'bg-accent-primary',
  muted: 'bg-text-muted/50',
}

export function StatusBadge({
  children,
  variant = 'default',
  size = 'sm',
  pulse = false,
  dot = false,
  className = '',
}: StatusBadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 font-mono font-medium rounded border
        ${variantStyles[variant]} ${sizeStyles[size]} ${className}
      `}
    >
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <motion.span
              className={`absolute inline-flex h-full w-full rounded-full ${dotColors[variant]} opacity-75`}
              animate={{ scale: [1, 1.5, 1], opacity: [0.75, 0, 0.75] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColors[variant]}`} />
        </span>
      )}
      {children}
    </span>
  )
}

/**
 * Pre-configured status badges for common states
 */

export function ActiveBadge({ pulse = true }: { pulse?: boolean }) {
  return (
    <StatusBadge variant="success" dot pulse={pulse}>
      Active
    </StatusBadge>
  )
}

export function InactiveBadge() {
  return (
    <StatusBadge variant="muted" dot>
      Inactive
    </StatusBadge>
  )
}

export function SuspendedBadge() {
  return (
    <StatusBadge variant="error" dot>
      Suspended
    </StatusBadge>
  )
}

export function PendingBadge({ pulse = true }: { pulse?: boolean }) {
  return (
    <StatusBadge variant="warning" dot pulse={pulse}>
      Pending
    </StatusBadge>
  )
}

export function VerifiedBadge() {
  return (
    <StatusBadge variant="accent">
      Verified
    </StatusBadge>
  )
}

/**
 * Launch status badge mapper
 */
export function LaunchStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { variant: BadgeVariant; label: string; pulse?: boolean }> = {
    awaiting_deposit: { variant: 'warning', label: 'Awaiting Deposit', pulse: true },
    launching: { variant: 'accent', label: 'Launching', pulse: true },
    completed: { variant: 'success', label: 'Completed' },
    failed: { variant: 'error', label: 'Failed' },
    expired: { variant: 'muted', label: 'Expired' },
    refunded: { variant: 'info', label: 'Refunded' },
  }

  const config = statusConfig[status] || { variant: 'default', label: status }

  return (
    <StatusBadge variant={config.variant} dot pulse={config.pulse}>
      {config.label}
    </StatusBadge>
  )
}

/**
 * Risk level badge
 */
export function RiskLevelBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const config: Record<string, { variant: BadgeVariant; label: string }> = {
    low: { variant: 'success', label: 'Low Risk' },
    medium: { variant: 'warning', label: 'Medium Risk' },
    high: { variant: 'error', label: 'High Risk' },
  }

  const { variant, label } = config[level] || config.low

  return <StatusBadge variant={variant}>{label}</StatusBadge>
}

/**
 * Flywheel phase badge
 */
export function FlywheelPhaseBadge({
  phase,
  count,
  total = 5,
}: {
  phase: 'buy' | 'sell'
  count: number
  total?: number
}) {
  const variant = phase === 'buy' ? 'success' : 'warning'

  return (
    <StatusBadge variant={variant} dot pulse>
      {phase.toUpperCase()} {count}/{total}
    </StatusBadge>
  )
}

/**
 * Connection status badge
 */
export function ConnectionBadge({
  connected,
  label,
}: {
  connected: boolean
  label?: string
}) {
  return (
    <StatusBadge variant={connected ? 'success' : 'error'} dot pulse={connected}>
      {label || (connected ? 'Connected' : 'Disconnected')}
    </StatusBadge>
  )
}

/**
 * Job status badge
 */
export function JobStatusBadge({
  running,
  enabled,
}: {
  running: boolean
  enabled: boolean
}) {
  if (!enabled) {
    return (
      <StatusBadge variant="muted" dot>
        Disabled
      </StatusBadge>
    )
  }

  return (
    <StatusBadge variant={running ? 'success' : 'warning'} dot pulse={running}>
      {running ? 'Running' : 'Idle'}
    </StatusBadge>
  )
}

/**
 * Source badge (Website vs Telegram)
 */
export function SourceBadge({ source }: { source: 'website' | 'telegram' }) {
  const config = {
    website: { variant: 'accent' as BadgeVariant, label: 'Website' },
    telegram: { variant: 'info' as BadgeVariant, label: 'Telegram' },
  }

  const { variant, label } = config[source]

  return <StatusBadge variant={variant} size="xs">{label}</StatusBadge>
}
