'use client'

import { motion } from 'framer-motion'

interface SkeletonProps {
  className?: string
}

/**
 * Base skeleton with shimmer animation
 */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-border-subtle/50 rounded ${className}`}
    />
  )
}

/**
 * Table row skeleton for loading states
 */
export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-border-subtle/30">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full max-w-[120px]" />
        </td>
      ))}
    </tr>
  )
}

/**
 * Multiple table rows skeleton
 */
export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} columns={columns} />
      ))}
    </>
  )
}

/**
 * Stat card skeleton
 */
export function StatCardSkeleton() {
  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl p-4">
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-8 w-16 mb-2" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

/**
 * Multiple stat cards skeleton
 */
export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Chart skeleton with animated gradient
 */
export function ChartSkeleton({ height = 300 }: { height?: number }) {
  return (
    <div
      className="bg-bg-card border border-border-subtle rounded-xl p-4"
      style={{ height }}
    >
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="relative h-[calc(100%-40px)] flex items-end gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            className="flex-1 bg-border-subtle/30 rounded-t"
            initial={{ height: '20%' }}
            animate={{ height: `${20 + Math.random() * 60}%` }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              repeatType: 'reverse',
              delay: i * 0.1,
            }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Log entry skeleton
 */
export function LogEntrySkeleton() {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border-subtle/20">
      <Skeleton className="h-4 w-20 shrink-0" />
      <Skeleton className="h-4 w-12 shrink-0" />
      <Skeleton className="h-4 flex-1" />
    </div>
  )
}

/**
 * Multiple log entries skeleton
 */
export function LogsSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <LogEntrySkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Panel skeleton (for sidebars, detail views)
 */
export function PanelSkeleton() {
  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl p-6 space-y-4">
      <Skeleton className="h-6 w-48" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="pt-4 border-t border-border-subtle">
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  )
}

/**
 * Full page loading skeleton
 */
export function PageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      {/* Stats Grid */}
      <StatsGridSkeleton count={4} />

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartSkeleton />
        </div>
        <PanelSkeleton />
      </div>

      {/* Table */}
      <div className="bg-bg-card border border-border-subtle rounded-xl overflow-hidden">
        <div className="p-4 border-b border-border-subtle">
          <Skeleton className="h-6 w-32" />
        </div>
        <table className="w-full">
          <tbody>
            <TableSkeleton rows={5} columns={6} />
          </tbody>
        </table>
      </div>
    </div>
  )
}
