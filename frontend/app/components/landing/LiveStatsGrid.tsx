'use client'

import { motion, useSpring, useTransform, useInView } from 'framer-motion'
import { useRef, useEffect } from 'react'
import {
  Zap,
  Users,
  TrendingUp,
  Rocket,
  Coins,
  CircleDollarSign,
} from 'lucide-react'

interface StatCardProps {
  label: string
  value: number
  prefix?: string
  suffix?: string
  icon: React.ReactNode
  delay?: number
  color?: 'orange' | 'copper' | 'warm' | 'tan'
  decimals?: number
}

function AnimatedNumber({
  value,
  decimals = 0,
}: {
  value: number
  decimals?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })
  const spring = useSpring(0, { mass: 0.8, stiffness: 75, damping: 15 })
  const display = useTransform(spring, (current) =>
    decimals > 0 ? current.toFixed(decimals) : Math.floor(current).toLocaleString()
  )

  useEffect(() => {
    if (isInView) {
      spring.set(value)
    }
  }, [spring, value, isInView])

  return <motion.span ref={ref}>{display}</motion.span>
}

function StatCard({
  label,
  value,
  prefix = '',
  suffix = '',
  icon,
  delay = 0,
  color = 'orange',
  decimals = 0,
}: StatCardProps) {
  const colorClasses = {
    orange: {
      icon: 'text-[#e67428]',
      glow: 'group-hover:shadow-[0_0_30px_rgba(230,116,40,0.15)]',
      border: 'group-hover:border-[#e67428]/30',
    },
    copper: {
      icon: 'text-[#e2aa84]',
      glow: 'group-hover:shadow-[0_0_30px_rgba(226,170,132,0.15)]',
      border: 'group-hover:border-[#e2aa84]/30',
    },
    warm: {
      icon: 'text-[#e67428]',
      glow: 'group-hover:shadow-[0_0_30px_rgba(230,116,40,0.15)]',
      border: 'group-hover:border-[#e67428]/30',
    },
    tan: {
      icon: 'text-[#e2aa84]',
      glow: 'group-hover:shadow-[0_0_30px_rgba(226,170,132,0.15)]',
      border: 'group-hover:border-[#e2aa84]/30',
    },
  }

  const colors = colorClasses[color]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative p-5 rounded-2xl bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 backdrop-blur-sm transition-all duration-300 ${colors.glow} ${colors.border}`}
    >
      {/* Background gradient on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#f8f0ec]/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-[#e2aa84]/60 uppercase tracking-wider">
            {label}
          </span>
          <div className={`${colors.icon} opacity-60 group-hover:opacity-100 transition-opacity`}>
            {icon}
          </div>
        </div>

        <div className="flex items-baseline gap-1">
          {prefix && (
            <span className="text-lg font-medium text-[#e2aa84]/70">{prefix}</span>
          )}
          <span className="text-2xl sm:text-3xl font-semibold text-[#f8f0ec] tabular-nums">
            <AnimatedNumber value={value} decimals={decimals} />
          </span>
          {suffix && (
            <span className="text-sm font-medium text-[#e2aa84]/70 ml-1">
              {suffix}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

interface LiveStatsGridProps {
  activeFlywheels: number
  totalUsers: number
  totalVolume: number
  tokensLaunched: number
  feesCollected: number
  solPrice: number | null
  isLoading?: boolean
}

export default function LiveStatsGrid({
  activeFlywheels,
  totalUsers,
  totalVolume,
  tokensLaunched,
  feesCollected,
  solPrice,
  isLoading = false,
}: LiveStatsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 animate-pulse"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <StatCard
        label="Active Flywheels"
        value={activeFlywheels}
        icon={<Zap className="w-5 h-5" />}
        color="orange"
        delay={0}
      />
      <StatCard
        label="Total Users"
        value={totalUsers}
        icon={<Users className="w-5 h-5" />}
        color="copper"
        delay={0.1}
      />
      <StatCard
        label="Volume"
        value={totalVolume}
        suffix="SOL"
        icon={<TrendingUp className="w-5 h-5" />}
        color="warm"
        delay={0.2}
        decimals={2}
      />
      <StatCard
        label="Tokens Launched"
        value={tokensLaunched}
        icon={<Rocket className="w-5 h-5" />}
        color="tan"
        delay={0.3}
      />
      <StatCard
        label="Fees Collected"
        value={feesCollected}
        suffix="SOL"
        icon={<Coins className="w-5 h-5" />}
        color="orange"
        delay={0.4}
        decimals={2}
      />
      <StatCard
        label="SOL Price"
        value={solPrice || 0}
        prefix="$"
        icon={<CircleDollarSign className="w-5 h-5" />}
        color="copper"
        delay={0.5}
        decimals={2}
      />
    </div>
  )
}
