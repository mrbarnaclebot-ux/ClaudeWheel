'use client'

import { ReactNode, useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { usePrivy } from '@privy-io/react-auth'

import { queryClient } from '../../_lib/queryClient'
import { useAdminStore, useAdminAuth, useHydrateStore } from '../../_stores/adminStore'
import { AdminSidebar } from './AdminSidebar'
import { AdminHeader } from './AdminHeader'
import { PageSkeleton } from '../shared/LoadingSkeleton'
import { Icon, RotateCw } from '../shared/Icons'

interface AdminLayoutProps {
  children: ReactNode
}

function AdminLayoutContent({ children }: AdminLayoutProps) {
  // ALL HOOKS MUST BE CALLED FIRST - before any early returns
  const hydrated = useHydrateStore()
  const { ready, authenticated, login, user } = usePrivy()
  const { isAuthenticated, logout } = useAdminAuth()
  const setWsConnected = useAdminStore((s) => s.setWsConnected)

  // Simulate WebSocket connection status (will be replaced with real WS later)
  // Note: setWsConnected is a stable store action, so we don't include it in deps
  useEffect(() => {
    // For now, we'll just mark as "connected" if authenticated
    // This will be replaced with actual WebSocket connection status
    setWsConnected(isAuthenticated)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  // NOW we can have early returns - after all hooks are called

  // Wait for hydration and Privy to be ready before rendering
  if (!hydrated || !ready) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center p-4">
        <PageSkeleton />
      </div>
    )
  }

  // Not authenticated with Privy
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="bg-bg-card border border-border-subtle rounded-xl p-8 max-w-md text-center">
          <div className="flex justify-center mb-4">
            <Icon icon={RotateCw} size="xl" color="accent" className="animate-[spin_3s_linear_infinite]" />
          </div>
          <h1 className="text-xl font-bold text-text-primary mb-2">Admin Dashboard</h1>
          <p className="text-text-muted mb-6">
            Sign in to access the admin panel
          </p>
          <button
            onClick={login}
            className="w-full px-6 py-3 font-mono bg-accent-primary text-white rounded-lg hover:bg-accent-primary/80 transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  // Authenticated - show full layout
  return (
    <div className="min-h-screen bg-void flex">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </QueryClientProvider>
  )
}
