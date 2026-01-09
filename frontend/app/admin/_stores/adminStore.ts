/**
 * Admin Dashboard Zustand Store
 * Manages UI state and authentication
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import { useEffect, useState } from 'react'
import type { AdminTab, TokenFilters, LogFilters } from '../_types/admin.types'

interface AdminState {
  // Authentication
  isAuthenticated: boolean
  publicKey: string | null
  signature: string | null
  message: string | null

  // UI State
  activeTab: AdminTab
  sidebarCollapsed: boolean

  // Polling/Refresh Settings
  autoRefresh: boolean
  refreshInterval: number // seconds

  // WebSocket State
  wsConnected: boolean

  // Filters
  tokenFilters: TokenFilters
  logFilters: LogFilters

  // Actions
  setAuth: (publicKey: string, signature: string, message: string) => void
  clearAuth: () => void
  setActiveTab: (tab: AdminTab) => void
  toggleSidebar: () => void
  setAutoRefresh: (enabled: boolean) => void
  setRefreshInterval: (seconds: number) => void
  setWsConnected: (connected: boolean) => void
  setTokenFilters: (filters: Partial<TokenFilters>) => void
  setLogFilters: (filters: Partial<LogFilters>) => void
  resetFilters: () => void
}

const defaultTokenFilters: TokenFilters = {
  status: 'all',
  source: 'all',
  riskLevel: 'all',
  flywheel: 'all',
  search: '',
}

const defaultLogFilters: LogFilters = {
  source: 'all',
  level: 'all',
  search: '',
}

export const useAdminStore = create<AdminState>()(
  persist(
    (set) => ({
      // Initial State
      isAuthenticated: false,
      publicKey: null,
      signature: null,
      message: null,

      activeTab: 'overview',
      sidebarCollapsed: false,

      autoRefresh: true,
      refreshInterval: 30,

      wsConnected: false,

      tokenFilters: defaultTokenFilters,
      logFilters: defaultLogFilters,

      // Actions
      setAuth: (publicKey, signature, message) =>
        set({
          isAuthenticated: true,
          publicKey,
          signature,
          message,
        }),

      clearAuth: () =>
        set({
          isAuthenticated: false,
          publicKey: null,
          signature: null,
          message: null,
        }),

      setActiveTab: (tab) => set({ activeTab: tab }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setAutoRefresh: (enabled) => set({ autoRefresh: enabled }),

      setRefreshInterval: (seconds) => set({ refreshInterval: seconds }),

      setWsConnected: (connected) => set({ wsConnected: connected }),

      setTokenFilters: (filters) =>
        set((state) => ({
          tokenFilters: { ...state.tokenFilters, ...filters },
        })),

      setLogFilters: (filters) =>
        set((state) => ({
          logFilters: { ...state.logFilters, ...filters },
        })),

      resetFilters: () =>
        set({
          tokenFilters: defaultTokenFilters,
          logFilters: defaultLogFilters,
        }),
    }),
    {
      name: 'admin-storage',
      // Only persist UI preferences, not auth (security)
      partialize: (state) => ({
        activeTab: state.activeTab,
        sidebarCollapsed: state.sidebarCollapsed,
        autoRefresh: state.autoRefresh,
        refreshInterval: state.refreshInterval,
      }),
      // Use custom storage that handles SSR gracefully
      storage: createJSONStorage(() => {
        // Return a no-op storage during SSR
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
        return localStorage
      }),
      // Skip hydration to prevent mismatch, we'll manually trigger it
      skipHydration: true,
    }
  )
)

// Hook to handle hydration on the client
export function useHydrateStore() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // Rehydrate the store on the client
    useAdminStore.persist.rehydrate()
    setHydrated(true)
  }, [])

  return hydrated
}

// Selector hooks for common patterns
// Using useShallow to prevent infinite re-renders when returning objects
export const useAdminAuth = () =>
  useAdminStore(
    useShallow((state) => ({
      isAuthenticated: state.isAuthenticated,
      publicKey: state.publicKey,
      signature: state.signature,
      message: state.message,
      setAuth: state.setAuth,
      clearAuth: state.clearAuth,
    }))
  )

export const useAdminUI = () =>
  useAdminStore(
    useShallow((state) => ({
      activeTab: state.activeTab,
      sidebarCollapsed: state.sidebarCollapsed,
      setActiveTab: state.setActiveTab,
      toggleSidebar: state.toggleSidebar,
    }))
  )

export const useAdminRefresh = () =>
  useAdminStore(
    useShallow((state) => ({
      autoRefresh: state.autoRefresh,
      refreshInterval: state.refreshInterval,
      wsConnected: state.wsConnected,
      setAutoRefresh: state.setAutoRefresh,
      setRefreshInterval: state.setRefreshInterval,
      setWsConnected: state.setWsConnected,
    }))
  )

export const useAdminFilters = () =>
  useAdminStore(
    useShallow((state) => ({
      tokenFilters: state.tokenFilters,
      logFilters: state.logFilters,
      setTokenFilters: state.setTokenFilters,
      setLogFilters: state.setLogFilters,
      resetFilters: state.resetFilters,
    }))
  )
