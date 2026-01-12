'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { useAdminAuth } from '../../_stores/adminStore'
import { adminQueryKeys } from '../../_lib/queryClient'
import {
  bulkSuspendTokens,
  bulkUnsuspendTokens,
  migrateOrphanedLaunches,
  enableMaintenanceMode,
  disableMaintenanceMode,
} from '../../_lib/adminApi'

interface ActionResult {
  type: 'success' | 'error'
  message: string
}

export function QuickActions() {
  const { isAuthenticated, getToken } = useAdminAuth()
  const queryClient = useQueryClient()

  const [confirmAction, setConfirmAction] = useState<string | null>(null)
  const [suspendReason, setSuspendReason] = useState('')
  const [maintenanceReason, setMaintenanceReason] = useState('')
  const [result, setResult] = useState<ActionResult | null>(null)

  // Bulk suspend mutation
  const suspendMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      return bulkSuspendTokens(token, suspendReason)
    },
    onSuccess: (data) => {
      if (data) {
        setResult({ type: 'success', message: `Suspended ${data.suspended} tokens (${data.skipped} skipped)` })
      } else {
        setResult({ type: 'error', message: 'Failed to suspend tokens' })
      }
      setConfirmAction(null)
      setSuspendReason('')
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.tokens() })
    },
    onError: () => {
      setResult({ type: 'error', message: 'Failed to suspend tokens' })
    },
  })

  // Bulk unsuspend mutation
  const unsuspendMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      return bulkUnsuspendTokens(token)
    },
    onSuccess: (data) => {
      if (data) {
        setResult({ type: 'success', message: `Unsuspended ${data.unsuspended} tokens` })
      } else {
        setResult({ type: 'error', message: 'Failed to unsuspend tokens' })
      }
      setConfirmAction(null)
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.tokens() })
    },
    onError: () => {
      setResult({ type: 'error', message: 'Failed to unsuspend tokens' })
    },
  })

  // Migrate orphaned launches mutation
  const migrateMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      return migrateOrphanedLaunches(token)
    },
    onSuccess: (data) => {
      if (data.success) {
        setResult({ type: 'success', message: `Migrated ${data.migrated} launches (${data.failed} failed)` })
      } else {
        setResult({ type: 'error', message: data.error || 'Migration failed' })
      }
      setConfirmAction(null)
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.telegram() })
    },
    onError: () => {
      setResult({ type: 'error', message: 'Failed to migrate launches' })
    },
  })

  // Maintenance mode mutations
  const enableMaintenanceMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      return enableMaintenanceMode(token, maintenanceReason)
    },
    onSuccess: (data) => {
      if (data.success) {
        setResult({ type: 'success', message: `Maintenance mode enabled. Notified ${data.notifiedUsers} users.` })
      } else {
        setResult({ type: 'error', message: data.error || 'Failed to enable maintenance' })
      }
      setConfirmAction(null)
      setMaintenanceReason('')
    },
    onError: () => {
      setResult({ type: 'error', message: 'Failed to enable maintenance mode' })
    },
  })

  const disableMaintenanceMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      return disableMaintenanceMode(token)
    },
    onSuccess: (data) => {
      if (data.success) {
        setResult({ type: 'success', message: `Maintenance mode disabled. Notified ${data.notifiedUsers} users.` })
      } else {
        setResult({ type: 'error', message: data.error || 'Failed to disable maintenance' })
      }
      setConfirmAction(null)
    },
    onError: () => {
      setResult({ type: 'error', message: 'Failed to disable maintenance mode' })
    },
  })

  const actions = [
    {
      id: 'suspend',
      label: 'Emergency Suspend All',
      icon: '🛑',
      variant: 'error' as const,
      description: 'Suspend all tokens except platform token',
      needsReason: true,
    },
    {
      id: 'unsuspend',
      label: 'Unsuspend All',
      icon: '✅',
      variant: 'success' as const,
      description: 'Reactivate all suspended tokens',
      needsReason: false,
    },
    {
      id: 'migrate',
      label: 'Migrate Orphaned',
      icon: '🔗',
      variant: 'warning' as const,
      description: 'Link orphaned launches to tokens',
      needsReason: false,
    },
    {
      id: 'maintenance-on',
      label: 'Enable Maintenance',
      icon: '🔧',
      variant: 'warning' as const,
      description: 'Enable bot maintenance mode',
      needsReason: true,
    },
    {
      id: 'maintenance-off',
      label: 'Disable Maintenance',
      icon: '🟢',
      variant: 'success' as const,
      description: 'Resume normal operations',
      needsReason: false,
    },
  ]

  const getButtonClasses = (variant: string) => {
    const variants = {
      error: 'bg-error/20 text-error border-error/30 hover:bg-error/30',
      success: 'bg-success/20 text-success border-success/30 hover:bg-success/30',
      warning: 'bg-warning/20 text-warning border-warning/30 hover:bg-warning/30',
    }
    return variants[variant as keyof typeof variants] || variants.warning
  }

  const handleConfirm = () => {
    switch (confirmAction) {
      case 'suspend':
        suspendMutation.mutate()
        break
      case 'unsuspend':
        unsuspendMutation.mutate()
        break
      case 'migrate':
        migrateMutation.mutate()
        break
      case 'maintenance-on':
        enableMaintenanceMutation.mutate()
        break
      case 'maintenance-off':
        disableMaintenanceMutation.mutate()
        break
    }
  }

  const isPending =
    suspendMutation.isPending ||
    unsuspendMutation.isPending ||
    migrateMutation.isPending ||
    enableMaintenanceMutation.isPending ||
    disableMaintenanceMutation.isPending

  return (
    <div className="bg-bg-card border border-border-subtle rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border-subtle">
        <h3 className="text-sm font-semibold text-text-primary">Quick Actions</h3>
      </div>

      <div className="p-4 space-y-2">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => setConfirmAction(action.id)}
            disabled={!isAuthenticated || isPending}
            className={`
              w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors
              ${getButtonClasses(action.variant)}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            <span className="text-lg">{action.icon}</span>
            <div className="text-left">
              <div className="text-sm font-medium">{action.label}</div>
              <div className="text-xs opacity-70">{action.description}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Result message */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`px-4 py-3 text-sm ${
              result.type === 'success' ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
            }`}
          >
            <div className="flex items-center justify-between">
              <span>{result.message}</span>
              <button onClick={() => setResult(null)} className="text-xs opacity-70 hover:opacity-100">
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setConfirmAction(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-bg-card border border-border-subtle rounded-xl p-6 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Confirm Action
              </h3>

              <p className="text-text-muted mb-4">
                {actions.find((a) => a.id === confirmAction)?.description}
              </p>

              {/* Reason input for suspend/maintenance */}
              {(confirmAction === 'suspend' || confirmAction === 'maintenance-on') && (
                <div className="mb-4">
                  <label className="block text-xs text-text-muted mb-2">
                    Reason {confirmAction === 'suspend' ? '(optional)' : '(required)'}
                  </label>
                  <input
                    type="text"
                    value={confirmAction === 'suspend' ? suspendReason : maintenanceReason}
                    onChange={(e) =>
                      confirmAction === 'suspend'
                        ? setSuspendReason(e.target.value)
                        : setMaintenanceReason(e.target.value)
                    }
                    placeholder="Enter reason..."
                    className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  />
                </div>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setConfirmAction(null)
                    setSuspendReason('')
                    setMaintenanceReason('')
                  }}
                  className="px-4 py-2 text-sm bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={
                    isPending ||
                    (confirmAction === 'maintenance-on' && !maintenanceReason.trim())
                  }
                  className={`px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 ${getButtonClasses(
                    actions.find((a) => a.id === confirmAction)?.variant || 'warning'
                  )}`}
                >
                  {isPending ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
