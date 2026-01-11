'use client'

import { motion } from 'framer-motion'
import { formatSOL } from '@/lib/utils'

interface PlatformStatsProps {
  tokensLaunched: number
  tokensRegistered: number
  tokensMmOnly: number
  activeFlywheels: number
  totalUsers: number
  totalVolume: number
  totalFees: number
}

// Animated counter component
function AnimatedNumber({ value, suffix = '', prefix = '' }: { value: number, suffix?: string, prefix?: string }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="tabular-nums"
    >
      {prefix}{value.toLocaleString()}{suffix}
    </motion.span>
  )
}

// Individual stat card with distinctive styling
function StatCard({
  label,
  value,
  icon,
  accent = 'primary',
  delay = 0
}: {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  accent?: 'primary' | 'secondary' | 'cyan' | 'success'
  delay?: number
}) {
  const accentColors = {
    primary: 'from-wood-light/20 to-wood-medium/10 border-wood-light/30 hover:border-wood-light/50',
    secondary: 'from-copper/20 to-bronze/10 border-copper/30 hover:border-copper/50',
    cyan: 'from-accent-cyan/20 to-accent-cyan/5 border-accent-cyan/30 hover:border-accent-cyan/50',
    success: 'from-success/20 to-success/5 border-success/30 hover:border-success/50',
  }

  const iconColors = {
    primary: 'text-wood-light',
    secondary: 'text-copper-light',
    cyan: 'text-accent-cyan',
    success: 'text-success',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: [0.23, 1, 0.32, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className={`
        relative overflow-hidden rounded-xl border
        bg-gradient-to-br ${accentColors[accent]}
        backdrop-blur-sm p-5 group cursor-default
        transition-all duration-300
      `}
    >
      {/* Decorative corner accent */}
      <div className="absolute top-0 right-0 w-20 h-20 opacity-50">
        <svg viewBox="0 0 80 80" className={iconColors[accent]} fill="currentColor" opacity="0.1">
          <path d="M80 0 L80 80 L0 80 Q80 80 80 0" />
        </svg>
      </div>

      {/* Icon */}
      <div className={`w-10 h-10 mb-3 ${iconColors[accent]} opacity-80`}>
        {icon}
      </div>

      {/* Value */}
      <div className="text-3xl font-display font-bold text-text-primary mb-1 tracking-tight">
        {value}
      </div>

      {/* Label */}
      <div className="text-xs font-mono uppercase tracking-widest text-text-muted">
        {label}
      </div>

      {/* Hover glow */}
      <motion.div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${accent === 'primary' ? 'rgba(205, 133, 63, 0.1)' : accent === 'cyan' ? 'rgba(78, 205, 196, 0.1)' : 'rgba(184, 115, 51, 0.1)'} 0%, transparent 70%)`
        }}
      />
    </motion.div>
  )
}

// Token category card with more detail
function TokenCategoryCard({
  title,
  count,
  description,
  icon,
  gradient,
  delay = 0,
}: {
  title: string
  count: number
  description: string
  icon: React.ReactNode
  gradient: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, delay, ease: [0.23, 1, 0.32, 1] }}
      className="relative group"
    >
      <div className={`
        relative overflow-hidden rounded-2xl p-6
        bg-gradient-to-br ${gradient}
        border border-white/5
        transition-all duration-500
        hover:shadow-wood-glow
      `}>
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-5">
          <svg width="100%" height="100%" className="absolute inset-0">
            <defs>
              <pattern id={`grid-${title}`} width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1" fill="currentColor" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#grid-${title})`} />
          </svg>
        </div>

        {/* Content */}
        <div className="relative z-10 flex items-start justify-between">
          <div className="flex-1">
            {/* Category label */}
            <div className="text-xs font-mono uppercase tracking-[0.2em] text-white/40 mb-2">
              {title}
            </div>

            {/* Big number */}
            <motion.div
              className="text-5xl font-display font-bold text-white mb-2"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: delay + 0.2, type: 'spring', stiffness: 200 }}
            >
              <AnimatedNumber value={count} />
            </motion.div>

            {/* Description */}
            <p className="text-sm text-white/60 font-body leading-relaxed">
              {description}
            </p>
          </div>

          {/* Icon */}
          <div className="w-14 h-14 text-white/20 group-hover:text-white/30 transition-colors duration-300">
            {icon}
          </div>
        </div>

        {/* Animated border glow on hover */}
        <motion.div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            boxShadow: 'inset 0 0 30px rgba(255,255,255,0.1)',
          }}
        />
      </div>
    </motion.div>
  )
}

// Icons
const RocketIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
)

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
)

const ChartIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" />
    <path d="m19 9-5 5-4-4-3 3" />
  </svg>
)

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const CogIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

const CoinsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="6" />
    <path d="M18.09 10.37A6 6 0 1 1 10.34 18" />
    <path d="M7 6h1v4" />
    <path d="m16.71 13.88.7.71-2.82 2.82" />
  </svg>
)

export default function PlatformStats({
  tokensLaunched,
  tokensRegistered,
  tokensMmOnly,
  activeFlywheels,
  totalUsers,
  totalVolume,
  totalFees,
}: PlatformStatsProps) {
  return (
    <div className="space-y-8">
      {/* Section Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center gap-3"
      >
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border-accent to-transparent" />
        <h2 className="text-sm font-mono uppercase tracking-[0.3em] text-text-muted">
          Platform Statistics
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border-accent to-transparent" />
      </motion.div>

      {/* Token Categories - Large Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TokenCategoryCard
          title="Tokens Launched"
          count={tokensLaunched}
          description="New tokens created and launched through Claude Wheel"
          icon={<RocketIcon />}
          gradient="from-wood-medium via-wood-dark to-bg-card"
          delay={0}
        />
        <TokenCategoryCard
          title="Tokens Registered"
          count={tokensRegistered}
          description="Existing tokens brought to Claude Wheel for market making"
          icon={<LinkIcon />}
          gradient="from-copper via-bronze to-bg-card"
          delay={0.1}
        />
        <TokenCategoryCard
          title="MM Only Mode"
          count={tokensMmOnly}
          description="Tokens using market making without fee claiming"
          icon={<ChartIcon />}
          gradient="from-accent-cyan/80 via-accent-cyan/40 to-bg-card"
          delay={0.2}
        />
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Flywheels"
          value={<AnimatedNumber value={activeFlywheels} />}
          icon={<CogIcon />}
          accent="success"
          delay={0.3}
        />
        <StatCard
          label="Total Users"
          value={<AnimatedNumber value={totalUsers} />}
          icon={<UsersIcon />}
          accent="primary"
          delay={0.35}
        />
        <StatCard
          label="Volume (SOL)"
          value={formatSOL(totalVolume)}
          icon={<CoinsIcon />}
          accent="secondary"
          delay={0.4}
        />
        <StatCard
          label="Fees Collected"
          value={formatSOL(totalFees)}
          icon={<CoinsIcon />}
          accent="cyan"
          delay={0.45}
        />
      </div>
    </div>
  )
}
