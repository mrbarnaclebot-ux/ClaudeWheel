'use client'

import { forwardRef, ComponentPropsWithoutRef } from 'react'
import {
  // Navigation
  Cog,
  Receipt,
  Search,
  Settings,
  ChevronLeft,
  ChevronRight,

  // Stats & Metrics
  Users,
  Coins,
  AlertTriangle,
  MessageCircle,
  CheckCircle,
  Clock,
  Wallet,
  TrendingUp,
  Activity,
  BarChart3,

  // Jobs & Actions
  Zap,
  RefreshCw,
  RotateCw,
  Octagon,
  Link,
  Wrench,
  Play,
  Pause,
  Square,

  // Status
  CircleDot,
  Circle,
  XCircle,
  Info,

  // Misc
  ExternalLink,
  Copy,
  Download,
  Filter,
  MoreVertical,
  Bell,
  Bot,
  ArrowUpRight,
  Github,
  Twitter,
  Send,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'

// ============================================================================
// SIZE & COLOR VARIANTS
// ============================================================================

export const iconSizes = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const

export type IconSize = keyof typeof iconSizes

export const iconColors = {
  default: 'text-text-primary',
  muted: 'text-text-muted',
  accent: 'text-accent-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  inherit: '',
} as const

export type IconColor = keyof typeof iconColors

// ============================================================================
// ICON WRAPPER COMPONENT
// ============================================================================

export interface IconProps extends Omit<LucideProps, 'size'> {
  icon: LucideIcon
  size?: IconSize | number
  color?: IconColor
  interactive?: boolean
}

/**
 * Unified icon wrapper with consistent sizing and theming
 *
 * @example
 * <Icon icon={Cog} size="lg" color="accent" />
 * <Icon icon={Users} size={18} interactive />
 */
export const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ icon: IconComponent, size = 'md', color = 'default', interactive = false, className = '', ...props }, ref) => {
    const sizeValue = typeof size === 'number' ? size : iconSizes[size]
    const colorClass = iconColors[color]

    const interactiveClass = interactive
      ? 'transition-all duration-200 hover:scale-110 hover:text-accent-primary cursor-pointer'
      : ''

    return (
      <IconComponent
        ref={ref}
        size={sizeValue}
        className={`${colorClass} ${interactiveClass} ${className}`.trim()}
        strokeWidth={1.75}
        {...props}
      />
    )
  }
)

Icon.displayName = 'Icon'

// ============================================================================
// PRE-CONFIGURED NAVIGATION ICONS
// ============================================================================

interface NavIconConfig {
  icon: LucideIcon
  label: string
}

export const NavIcons: Record<string, NavIconConfig> = {
  dashboard: { icon: Cog, label: 'Dashboard' },
  transactions: { icon: Receipt, label: 'Transactions' },
  logs: { icon: Search, label: 'Logs' },
  settings: { icon: Settings, label: 'Settings' },
}

export const NavIconComponent = ({
  navKey,
  isActive = false,
  size = 'md',
  className = '',
}: {
  navKey: keyof typeof NavIcons
  isActive?: boolean
  size?: IconSize
  className?: string
}) => {
  const config = NavIcons[navKey]
  if (!config) return null

  return (
    <Icon
      icon={config.icon}
      size={size}
      color={isActive ? 'accent' : 'inherit'}
      className={`transition-colors duration-200 ${className}`}
    />
  )
}

// ============================================================================
// PRE-CONFIGURED STAT ICONS
// ============================================================================

export const StatIcons = {
  users: Users,
  tokens: Coins,
  wheel: Cog,
  suspended: AlertTriangle,
  telegram: MessageCircle,
  active: CheckCircle,
  pending: Clock,
  balance: Wallet,
  trending: TrendingUp,
  activity: Activity,
  chart: BarChart3,
} as const

// ============================================================================
// PRE-CONFIGURED JOB ICONS
// ============================================================================

export const JobIcons = {
  flywheel: RotateCw,
  fastClaim: Zap,
  balance: Wallet,
  refresh: RefreshCw,
} as const

// ============================================================================
// PRE-CONFIGURED ACTION ICONS
// ============================================================================

export const ActionIcons = {
  emergencyStop: Octagon,
  link: Link,
  wrench: Wrench,
  refresh: RefreshCw,
  play: Play,
  pause: Pause,
  stop: Square,
  collapse: ChevronLeft,
  expand: ChevronRight,
  external: ExternalLink,
  copy: Copy,
  download: Download,
  filter: Filter,
  more: MoreVertical,
  bell: Bell,
} as const

// ============================================================================
// PRE-CONFIGURED STATUS ICONS
// ============================================================================

export const StatusIcons = {
  online: CircleDot,
  offline: Circle,
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  pending: Clock,
} as const

// ============================================================================
// ANIMATED ICON VARIANTS
// ============================================================================

interface SpinningIconProps extends Omit<IconProps, 'icon'> {
  spinning?: boolean
}

export const SpinningRefresh = ({ spinning = false, ...props }: SpinningIconProps) => (
  <Icon
    icon={RefreshCw}
    {...props}
    className={`${props.className || ''} ${spinning ? 'animate-spin' : ''}`}
  />
)

export const PulsingDot = ({
  status = 'online',
  size = 'sm',
}: {
  status?: 'online' | 'offline' | 'pending'
  size?: IconSize
}) => {
  const colors = {
    online: 'text-success',
    offline: 'text-error',
    pending: 'text-warning',
  }

  return (
    <span className="relative inline-flex">
      <Icon
        icon={Circle}
        size={size}
        className={`${colors[status]} fill-current`}
      />
      {status === 'online' && (
        <span className={`absolute inset-0 rounded-full ${colors[status]} animate-ping opacity-40`} />
      )}
    </span>
  )
}

// ============================================================================
// RE-EXPORTS FOR DIRECT USAGE
// ============================================================================

export {
  // Navigation
  Cog,
  Receipt,
  Search,
  Settings,
  ChevronLeft,
  ChevronRight,

  // Stats
  Users,
  Coins,
  AlertTriangle,
  MessageCircle,
  CheckCircle,
  Clock,
  Wallet,
  TrendingUp,
  Activity,
  BarChart3,

  // Jobs & Actions
  Zap,
  RefreshCw,
  RotateCw,
  Octagon,
  Link,
  Wrench,
  Play,
  Pause,
  Square,

  // Status
  CircleDot,
  Circle,
  XCircle,
  Info,

  // Misc
  ExternalLink,
  Copy,
  Download,
  Filter,
  MoreVertical,
  Bell,
  Bot,
  ArrowUpRight,
  Github,
  Twitter,
  Send,
}

export type { LucideIcon }
