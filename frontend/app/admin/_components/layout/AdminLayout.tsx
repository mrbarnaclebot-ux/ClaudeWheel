'use client'

import { ReactNode, useCallback, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { QueryClientProvider } from '@tanstack/react-query'
import bs58 from 'bs58'

import { queryClient } from '../../_lib/queryClient'
import { useAdminStore, useAdminAuth } from '../../_stores/adminStore'
import { fetchAdminAuthNonce } from '../../_lib/adminApi'
import { AdminSidebar } from './AdminSidebar'
import { AdminHeader } from './AdminHeader'
import { PageSkeleton } from '../shared/LoadingSkeleton'

const DEV_WALLET_ADDRESS = process.env.NEXT_PUBLIC_DEV_WALLET_ADDRESS || ''

interface AdminLayoutProps {
  children: ReactNode
}

function AdminLayoutContent({ children }: AdminLayoutProps) {
  const { publicKey, connected, signMessage } = useWallet()
  const { isAuthenticated, setAuth, clearAuth } = useAdminAuth()
  const setWsConnected = useAdminStore((s) => s.setWsConnected)

  // Check if wallet is authorized
  const isAuthorized = connected && publicKey?.toString() === DEV_WALLET_ADDRESS

  // Handle authentication
  const handleAuthenticate = useCallback(async () => {
    if (!publicKey || !signMessage) return

    try {
      const nonceData = await fetchAdminAuthNonce()
      if (!nonceData) {
        console.error('Failed to fetch nonce')
        return
      }

      const encodedMessage = new TextEncoder().encode(nonceData.message)
      const signedMessage = await signMessage(encodedMessage)
      const signature = bs58.encode(signedMessage)

      setAuth(publicKey.toString(), signature, nonceData.message)
    } catch (error) {
      console.error('Authentication failed:', error)
    }
  }, [publicKey, signMessage, setAuth])

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (!connected) {
      clearAuth()
    }
  }, [connected, clearAuth])

  // Simulate WebSocket connection status (will be replaced with real WS later)
  useEffect(() => {
    // For now, we'll just mark as "connected" if authenticated
    // This will be replaced with actual WebSocket connection status
    setWsConnected(isAuthenticated)
  }, [isAuthenticated, setWsConnected])

  // Not connected to wallet
  if (!connected || !publicKey) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="bg-bg-card border border-border-subtle rounded-xl p-8 max-w-md text-center">
          <div className="text-4xl mb-4">🎡</div>
          <h1 className="text-xl font-bold text-text-primary mb-2">Admin Dashboard</h1>
          <p className="text-text-muted mb-6">
            Connect your wallet to access the admin panel
          </p>
          <WalletMultiButton className="!bg-accent-primary hover:!bg-accent-primary/80" />
        </div>
      </div>
    )
  }

  // Not authorized
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="bg-bg-card border border-error/30 rounded-xl p-8 max-w-md text-center">
          <div className="text-4xl mb-4">🚫</div>
          <h1 className="text-xl font-bold text-error mb-2">Access Denied</h1>
          <p className="text-text-muted mb-4">
            This wallet is not authorized to access the admin panel.
          </p>
          <p className="text-xs text-text-muted font-mono mb-6">
            Connected: {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
          </p>
          <WalletMultiButton className="!bg-bg-secondary hover:!bg-bg-card-hover" />
        </div>
      </div>
    )
  }

  // Not authenticated (need to sign)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center">
        <div className="bg-bg-card border border-border-subtle rounded-xl p-8 max-w-md text-center">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-xl font-bold text-text-primary mb-2">Authentication Required</h1>
          <p className="text-text-muted mb-6">
            Sign a message to verify your identity and access the admin panel.
          </p>
          <button
            onClick={handleAuthenticate}
            className="w-full px-6 py-3 font-mono bg-accent-primary text-white rounded-lg hover:bg-accent-primary/80 transition-colors"
          >
            Sign Message to Authenticate
          </button>
          <p className="text-xs text-text-muted mt-4">
            This signature proves you own this wallet without making any transactions.
          </p>
        </div>
      </div>
    )
  }

  // Authenticated - show full layout
  return (
    <div className="min-h-screen bg-void flex">
      <AdminSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <AdminHeader onAuthenticate={handleAuthenticate} />
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
