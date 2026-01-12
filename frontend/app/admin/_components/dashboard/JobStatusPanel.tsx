'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useAdminAuth } from '../../_stores/adminStore'
import { adminQueryKeys } from '../../_lib/queryClient'
import {
  fetchPlatformStats,
  triggerFlywheelCycle,
  triggerFastClaim,
  triggerBalanceUpdate,
} from '../../_lib/adminApi'
import { JobStatusBadge } from '../shared/StatusBadge'
import { PanelSkeleton } from '../shared/LoadingSkeleton'
import type { JobStatus } from '../../_types/admin.types'

interface JobInfo {
  name: string
  key: string
  icon: string
  description: string
  trigger: (token: string) => Promise<{ success: boolean; message?: string; error?: string }>
}

const jobs: JobInfo[] = [
  {
    name: 'Flywheel',
    key: 'flywheel',
    icon: '🎡',
    description: 'Multi-user trading cycles',
    trigger: triggerFlywheelCycle,
  },
  {
    name: 'Fast Claim',
    key: 'fastClaim',
    icon: '⚡',
    description: 'Fee collection',
    trigger: triggerFastClaim,
  },
  {
    name: 'Balance Update',
    key: 'balanceUpdate',
    icon: '💰',
    description: 'Wallet balance sync',
    trigger: triggerBalanceUpdate,
  },
]

export function JobStatusPanel() {
  const { isAuthenticated, getToken } = useAdminAuth()
  const queryClient = useQueryClient()

  // Fetch platform stats which includes job status
  const { data: platformStats, isLoading } = useQuery({
    queryKey: adminQueryKeys.platformStats(),
    queryFn: async () => {
      const token = await getToken()
      if (!token) return null
      return fetchPlatformStats(token)
    },
    enabled: isAuthenticated,
    staleTime: 5000, // 5 seconds for job status
  })

  // Trigger job mutation
  const triggerMutation = useMutation({
    mutationFn: async (job: JobInfo) => {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      return job.trigger(token)
    },
    onSuccess: () => {
      // Refetch stats after triggering
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.platformStats() })
    },
  })

  if (isLoading) {
    return <PanelSkeleton />
  }

  const jobsStatus = platformStats?.jobs

  const getJobStatus = (key: string): JobStatus | undefined => {
    if (!jobsStatus) return undefined
    return jobsStatus[key as keyof typeof jobsStatus] as JobStatus | undefined
  }

  const formatLastRun = (date: string | null): string => {
    if (!date) return 'Never'
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle">
        <h3 className="text-sm font-semibold text-text-primary">Background Jobs</h3>
      </div>

      <div className="divide-y divide-border-subtle/30">
        {jobs.map((job) => {
          const status = getJobStatus(job.key)
          const isTriggering = triggerMutation.isPending && triggerMutation.variables?.key === job.key

          return (
            <div key={job.key} className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{job.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-text-primary">{job.name}</div>
                    <div className="text-xs text-text-muted">{job.description}</div>
                  </div>
                </div>

                {status && (
                  <JobStatusBadge running={status.running} enabled={status.enabled} />
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-text-muted">
                <div className="flex items-center gap-4">
                  {status && (
                    <>
                      <span>Interval: {status.intervalMinutes}m</span>
                      <span>Last: {formatLastRun(status.lastRunAt)}</span>
                    </>
                  )}
                </div>

                <motion.button
                  onClick={() => triggerMutation.mutate(job)}
                  disabled={isTriggering || status?.running}
                  className="px-2 py-1 font-mono text-xs bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded hover:bg-accent-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isTriggering ? 'Triggering...' : 'Trigger'}
                </motion.button>
              </div>

              {/* Trigger result message */}
              {triggerMutation.isSuccess && triggerMutation.variables?.key === job.key && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-xs text-success"
                >
                  {triggerMutation.data?.message || 'Job triggered successfully'}
                </motion.div>
              )}

              {triggerMutation.isError && triggerMutation.variables?.key === job.key && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 text-xs text-error"
                >
                  Failed to trigger job
                </motion.div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Compact job status for header or inline use
 */
export function JobStatusCompact() {
  const { isAuthenticated, getToken } = useAdminAuth()

  const { data: platformStats } = useQuery({
    queryKey: adminQueryKeys.platformStats(),
    queryFn: async () => {
      const token = await getToken()
      if (!token) return null
      return fetchPlatformStats(token)
    },
    enabled: isAuthenticated,
    staleTime: 5000,
  })

  const runningCount = Object.values(platformStats?.jobs || {}).filter(
    (job) => (job as JobStatus)?.running
  ).length

  const totalCount = Object.keys(platformStats?.jobs || {}).length

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={runningCount > 0 ? 'text-success' : 'text-text-muted'}>
        {runningCount}/{totalCount} jobs active
      </span>
    </div>
  )
}
