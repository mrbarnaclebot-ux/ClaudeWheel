'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { useAdminAuth } from '../../_stores/adminStore'
import { adminQueryKeys } from '../../_lib/queryClient'
import {
  fetchPlatformSettings,
  updatePlatformSettings,
  emergencyStopAll,
  clearAllCaches,
  type PlatformSettings,
} from '../../_lib/adminApi'
import { StatusBadge } from '../shared/StatusBadge'
import { PanelSkeleton } from '../shared/LoadingSkeleton'

export function SettingsView() {
  const { publicKey, signature, message } = useAdminAuth()
  const queryClient = useQueryClient()

  // Local state for form
  const [localSettings, setLocalSettings] = useState<PlatformSettings | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [emergencyReason, setEmergencyReason] = useState('')
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false)

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: adminQueryKeys.settings(),
    queryFn: () => fetchPlatformSettings(publicKey!, signature!, message!),
    enabled: Boolean(publicKey && signature && message),
    staleTime: 30000,
  })

  // Initialize local state when settings load
  useEffect(() => {
    if (settings && !localSettings) {
      setLocalSettings(settings)
    }
  }, [settings, localSettings])

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: (newSettings: Partial<PlatformSettings>) =>
      updatePlatformSettings(publicKey!, signature!, message!, newSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminQueryKeys.settings() })
      setHasChanges(false)
    },
  })

  // Emergency stop mutation
  const emergencyMutation = useMutation({
    mutationFn: (reason: string) =>
      emergencyStopAll(publicKey!, signature!, message!, reason),
    onSuccess: () => {
      queryClient.invalidateQueries()
      setShowEmergencyConfirm(false)
      setEmergencyReason('')
    },
  })

  // Clear caches mutation
  const clearCachesMutation = useMutation({
    mutationFn: () => clearAllCaches(publicKey!, signature!, message!),
    onSuccess: () => {
      queryClient.invalidateQueries()
    },
  })

  const handleChange = (key: keyof PlatformSettings, value: number | boolean) => {
    if (!localSettings) return
    setLocalSettings({ ...localSettings, [key]: value })
    setHasChanges(true)
  }

  const handleSave = () => {
    if (!localSettings) return
    updateMutation.mutate(localSettings)
  }

  const handleReset = () => {
    if (settings) {
      setLocalSettings(settings)
      setHasChanges(false)
    }
  }

  const handleEmergencyStop = () => {
    if (emergencyReason.trim()) {
      emergencyMutation.mutate(emergencyReason)
    }
  }

  if (isLoading || !localSettings) {
    return (
      <div className="p-6 space-y-6 max-w-4xl">
        <PanelSkeleton />
        <PanelSkeleton />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Platform Settings</h2>
          <p className="text-sm text-text-muted">Configure global platform behavior</p>
        </div>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <StatusBadge variant="warning">Unsaved Changes</StatusBadge>
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="px-4 py-2 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-primary/80 transition-colors disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </motion.div>
        )}
      </div>

      {/* Success/Error Messages */}
      {updateMutation.isSuccess && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 bg-success/10 border border-success/30 rounded-lg text-sm text-success"
        >
          Settings saved successfully. Some changes may require a server restart to take effect.
        </motion.div>
      )}

      {/* Job Settings */}
      <div className="bg-bg-card border border-border-subtle rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle">
          <h3 className="text-sm font-semibold text-text-primary">Background Jobs</h3>
        </div>
        <div className="p-4 space-y-6">
          {/* Flywheel Job */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-text-primary">Flywheel Job</span>
                <p className="text-xs text-text-muted">Executes trading cycles for all active tokens</p>
              </div>
              <button
                onClick={() => handleChange('flywheelJobEnabled', !localSettings.flywheelJobEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  localSettings.flywheelJobEnabled ? 'bg-success' : 'bg-bg-secondary'
                }`}
              >
                <motion.div
                  className="w-5 h-5 rounded-full bg-white shadow m-0.5"
                  animate={{ x: localSettings.flywheelJobEnabled ? 24 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-muted mb-1">Interval (minutes)</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={localSettings.flywheelIntervalMinutes}
                  onChange={(e) => handleChange('flywheelIntervalMinutes', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Max Trades/Minute</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={localSettings.maxTradesPerMinute}
                  onChange={(e) => handleChange('maxTradesPerMinute', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-border-subtle/30" />

          {/* Fast Claim Job */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-text-primary">Fast Claim Job</span>
                <p className="text-xs text-text-muted">Rapid fee collection (every 30 seconds)</p>
              </div>
              <button
                onClick={() => handleChange('fastClaimEnabled', !localSettings.fastClaimEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  localSettings.fastClaimEnabled ? 'bg-success' : 'bg-bg-secondary'
                }`}
              >
                <motion.div
                  className="w-5 h-5 rounded-full bg-white shadow m-0.5"
                  animate={{ x: localSettings.fastClaimEnabled ? 24 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Interval (seconds)</label>
              <input
                type="number"
                min={10}
                max={300}
                value={localSettings.fastClaimIntervalSeconds}
                onChange={(e) => handleChange('fastClaimIntervalSeconds', Number(e.target.value))}
                className="w-32 px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
              />
            </div>
          </div>

          <div className="border-t border-border-subtle/30" />

          {/* Claim Job */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-text-primary">Legacy Claim Job</span>
                <p className="text-xs text-text-muted">Hourly fee collection (usually disabled)</p>
              </div>
              <button
                onClick={() => handleChange('claimJobEnabled', !localSettings.claimJobEnabled)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  localSettings.claimJobEnabled ? 'bg-success' : 'bg-bg-secondary'
                }`}
              >
                <motion.div
                  className="w-5 h-5 rounded-full bg-white shadow m-0.5"
                  animate={{ x: localSettings.claimJobEnabled ? 24 : 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Interval (minutes)</label>
              <input
                type="number"
                min={1}
                max={1440}
                value={localSettings.claimJobIntervalMinutes}
                onChange={(e) => handleChange('claimJobIntervalMinutes', Number(e.target.value))}
                className="w-32 px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-bg-card border border-error/30 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-error/30 bg-error/5">
          <h3 className="text-sm font-semibold text-error">Danger Zone</h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-text-primary">Emergency Stop All</span>
              <p className="text-xs text-text-muted">Immediately suspend all tokens and stop all jobs</p>
            </div>
            <button
              onClick={() => setShowEmergencyConfirm(true)}
              className="px-4 py-2 text-sm bg-error/20 text-error border border-error/30 rounded-lg hover:bg-error/30 transition-colors"
            >
              Stop All
            </button>
          </div>
          <div className="border-t border-border-subtle/30" />
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-text-primary">Clear All Caches</span>
              <p className="text-xs text-text-muted">Clear all cached data and force refresh</p>
            </div>
            <button
              onClick={() => clearCachesMutation.mutate()}
              disabled={clearCachesMutation.isPending}
              className="px-4 py-2 text-sm bg-warning/20 text-warning border border-warning/30 rounded-lg hover:bg-warning/30 transition-colors disabled:opacity-50"
            >
              {clearCachesMutation.isPending ? 'Clearing...' : 'Clear Caches'}
            </button>
          </div>
          {clearCachesMutation.isSuccess && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-success"
            >
              Caches cleared successfully.
            </motion.div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="bg-bg-secondary/50 border border-border-subtle rounded-xl p-4 text-sm text-text-muted">
        <p>
          <strong>Note:</strong> Changes to job intervals will take effect after the current cycle completes.
          Use the job control panel on the Overview tab to trigger immediate execution.
        </p>
      </div>

      {/* Emergency Stop Confirmation Modal */}
      {showEmergencyConfirm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowEmergencyConfirm(false)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="bg-bg-card border border-error/30 rounded-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-error mb-4">Emergency Stop</h3>
            <p className="text-text-muted mb-4">
              This will immediately suspend all tokens (except $WHEEL) and stop all background jobs.
              Are you sure you want to proceed?
            </p>
            <div className="mb-4">
              <label className="block text-xs text-text-muted mb-2">Reason (required)</label>
              <input
                type="text"
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                placeholder="Enter reason for emergency stop..."
                className="w-full px-3 py-2 bg-bg-secondary border border-border-subtle rounded-lg text-sm text-text-primary focus:outline-none focus:border-error"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowEmergencyConfirm(false)
                  setEmergencyReason('')
                }}
                className="px-4 py-2 text-sm bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEmergencyStop}
                disabled={!emergencyReason.trim() || emergencyMutation.isPending}
                className="px-4 py-2 text-sm bg-error text-white rounded-lg hover:bg-error/80 transition-colors disabled:opacity-50"
              >
                {emergencyMutation.isPending ? 'Stopping...' : 'Confirm Emergency Stop'}
              </button>
            </div>
            {emergencyMutation.isError && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 text-sm text-error"
              >
                Failed to execute emergency stop. Please try again.
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
