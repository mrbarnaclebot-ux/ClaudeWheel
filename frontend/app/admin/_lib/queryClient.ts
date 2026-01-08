/**
 * React Query Configuration
 */

import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 30 seconds by default
      staleTime: 30 * 1000,
      // Keep unused data in cache for 5 minutes
      gcTime: 5 * 60 * 1000,
      // Retry failed requests once
      retry: 1,
      // Don't refetch on window focus for admin (manual refresh preferred)
      refetchOnWindowFocus: false,
      // Don't refetch on reconnect automatically
      refetchOnReconnect: false,
    },
    mutations: {
      retry: 0,
    },
  },
})

// Query key factory for consistent cache keys
export const adminQueryKeys = {
  all: ['admin'] as const,

  // Platform
  platformStats: () => [...adminQueryKeys.all, 'platformStats'] as const,
  systemStatus: () => [...adminQueryKeys.all, 'systemStatus'] as const,

  // Tokens
  tokens: () => [...adminQueryKeys.all, 'tokens'] as const,
  tokenList: (filters: Record<string, unknown>) => [...adminQueryKeys.tokens(), 'list', filters] as const,
  tokenDetail: (id: string) => [...adminQueryKeys.tokens(), 'detail', id] as const,

  // Telegram
  telegram: () => [...adminQueryKeys.all, 'telegram'] as const,
  telegramStats: () => [...adminQueryKeys.telegram(), 'stats'] as const,
  telegramLaunches: (filters: Record<string, unknown>) => [...adminQueryKeys.telegram(), 'launches', filters] as const,
  telegramUsers: () => [...adminQueryKeys.telegram(), 'users'] as const,
  telegramHealth: () => [...adminQueryKeys.telegram(), 'health'] as const,

  // Logs
  logs: () => [...adminQueryKeys.all, 'logs'] as const,
  logList: (filters: Record<string, unknown>) => [...adminQueryKeys.logs(), 'list', filters] as const,

  // Jobs
  jobs: () => [...adminQueryKeys.all, 'jobs'] as const,
  jobStatus: (jobName: string) => [...adminQueryKeys.jobs(), jobName] as const,

  // Wallets
  wallets: () => [...adminQueryKeys.all, 'wallets'] as const,
  walletBalances: () => [...adminQueryKeys.wallets(), 'balances'] as const,
  feeStats: () => [...adminQueryKeys.wallets(), 'feeStats'] as const,

  // Wheel (Platform Token)
  wheel: () => [...adminQueryKeys.all, 'wheel'] as const,
  wheelData: () => [...adminQueryKeys.wheel(), 'data'] as const,

  // Settings
  settings: () => [...adminQueryKeys.all, 'settings'] as const,
}
