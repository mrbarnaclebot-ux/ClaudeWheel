'use client'

import { useQuery } from '@tanstack/react-query'
import { useAdminAuth } from '../../_stores/adminStore'
import { adminQueryKeys } from '../../_lib/queryClient'
import { fetchSystemStatus, fetchSystemLogs } from '../../_lib/adminApi'
import { OverviewStats } from '../dashboard/OverviewStats'
import { JobStatusPanel } from '../dashboard/JobStatusPanel'
import { QuickActions } from '../dashboard/QuickActions'
import { StatusBadge } from '../shared/StatusBadge'

export function OverviewView() {
  const { publicKey, signature, message } = useAdminAuth()

  // Fetch system status
  const { data: systemStatus, isLoading: isStatusLoading } = useQuery({
    queryKey: adminQueryKeys.systemStatus(),
    queryFn: () => fetchSystemStatus(),
    staleTime: 10000,
  })

  // Fetch recent logs
  const { data: logs, isLoading: isLogsLoading } = useQuery({
    queryKey: adminQueryKeys.logs(),
    queryFn: () => fetchSystemLogs(20),
    staleTime: 5000,
  })

  return (
    <div className="p-6 space-y-6">
      {/* Overview Stats */}
      <OverviewStats />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - System Health & Logs */}
        <div className="lg:col-span-2 space-y-6">
          {/* System Health */}
          <div className="bg-bg-card border border-border-subtle rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text-primary">System Health</h3>
              {systemStatus && (
                <StatusBadge
                  variant={systemStatus.rpcConnection && systemStatus.databaseConnection ? 'success' : 'error'}
                  dot
                  pulse
                >
                  {systemStatus.rpcConnection && systemStatus.databaseConnection ? 'Healthy' : 'Issues'}
                </StatusBadge>
              )}
            </div>

            <div className="p-4">
              {isStatusLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 bg-border-subtle/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : systemStatus ? (
                <div className="space-y-3">
                  {/* Connection Status */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">RPC Connection</span>
                    <StatusBadge variant={systemStatus.rpcConnection ? 'success' : 'error'} size="xs">
                      {systemStatus.rpcConnection ? 'Connected' : 'Disconnected'}
                    </StatusBadge>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-muted">Database</span>
                    <StatusBadge variant={systemStatus.databaseConnection ? 'success' : 'error'} size="xs">
                      {systemStatus.databaseConnection ? 'Connected' : 'Disconnected'}
                    </StatusBadge>
                  </div>

                  {/* Memory Usage */}
                  {systemStatus.memoryUsage && (
                  <div className="pt-2 border-t border-border-subtle/30">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-text-muted">Memory Usage</span>
                      <span className="font-mono text-text-primary">
                        {systemStatus.memoryUsage.percentage?.toFixed(1) ?? 0}%
                      </span>
                    </div>
                    <div className="h-2 bg-bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (systemStatus.memoryUsage.percentage ?? 0) > 80
                            ? 'bg-error'
                            : (systemStatus.memoryUsage.percentage ?? 0) > 60
                            ? 'bg-warning'
                            : 'bg-success'
                        }`}
                        style={{ width: `${systemStatus.memoryUsage.percentage ?? 0}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-text-muted mt-1">
                      <span>{((systemStatus.memoryUsage.heapUsed ?? 0) / 1024 / 1024).toFixed(0)} MB used</span>
                      <span>{((systemStatus.memoryUsage.heapTotal ?? 0) / 1024 / 1024).toFixed(0)} MB total</span>
                    </div>
                  </div>
                  )}

                  {/* Uptime & Environment */}
                  <div className="pt-2 border-t border-border-subtle/30 flex justify-between text-xs text-text-muted">
                    <span>
                      Uptime: {Math.floor((systemStatus.uptime ?? 0) / 3600)}h {Math.floor(((systemStatus.uptime ?? 0) % 3600) / 60)}m
                    </span>
                    <span className="font-mono">
                      {typeof systemStatus.environment === 'string'
                        ? systemStatus.environment
                        : systemStatus.environment?.nodeEnv ?? 'unknown'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center text-text-muted py-4">
                  Failed to load system status
                </div>
              )}
            </div>
          </div>

          {/* Recent Logs */}
          <div className="bg-bg-card border border-border-subtle rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border-subtle">
              <h3 className="text-sm font-semibold text-text-primary">Recent Activity</h3>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              {isLogsLoading ? (
                <div className="p-4 space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-4 bg-border-subtle/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : logs && logs.length > 0 ? (
                <div className="divide-y divide-border-subtle/20">
                  {logs.map((log, i) => (
                    <div key={i} className="px-4 py-2 font-mono text-xs flex items-start gap-2">
                      <span className="text-text-muted shrink-0 w-16">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={`shrink-0 w-12 ${
                          log.level === 'error'
                            ? 'text-error'
                            : log.level === 'warn'
                            ? 'text-warning'
                            : 'text-text-muted'
                        }`}
                      >
                        [{log.level.toUpperCase()}]
                      </span>
                      <span className="text-text-primary break-all">{log.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-text-muted">No recent logs</div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Jobs & Quick Actions */}
        <div className="space-y-6">
          <JobStatusPanel />
          <QuickActions />
        </div>
      </div>
    </div>
  )
}
