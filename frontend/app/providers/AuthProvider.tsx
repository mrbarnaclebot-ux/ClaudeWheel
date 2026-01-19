'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useWallets } from '@privy-io/react-auth/solana'
import { api, UserToken } from '@/lib/api'

// ═══════════════════════════════════════════════════════════════════════════
// AUTH CONTEXT
// Manages user authentication state with Privy
// ═══════════════════════════════════════════════════════════════════════════

interface WalletInfo {
  id: string
  wallet_address: string
  wallet_type: 'dev' | 'ops'
  is_delegated: boolean
}

interface PrivyUserData {
  id: string
  privy_user_id: string
  telegram_id?: number
  telegram_username?: string
  onboarding_completed: boolean
  wallets: WalletInfo[]
}

interface AuthContextType {
  user: PrivyUserData | null
  wallets: {
    dev: WalletInfo | null
    ops: WalletInfo | null
  }
  tokens: UserToken[]
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: () => void
  logout: () => Promise<void>
  refreshTokens: () => Promise<void>
  getAuthToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

// Helper to check if current route is admin
function isAdminPath(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.startsWith('/admin')
}

export function AuthProvider({ children }: AuthProviderProps) {
  const {
    ready,
    authenticated,
    user: privyUser,
    login,
    logout: privyLogout,
    getAccessToken,
  } = usePrivy()

  // Solana wallets from Privy - can be used for wallet-related operations
  const { wallets: _solanaWallets } = useWallets()

  const [user, setUser] = useState<PrivyUserData | null>(null)
  const [tokens, setTokens] = useState<UserToken[]>([])
  const [walletInfo, setWalletInfo] = useState<{ dev: WalletInfo | null; ops: WalletInfo | null }>({
    dev: null,
    ops: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sync with backend on auth change
  useEffect(() => {
    if (!ready) return

    // Skip for admin routes - they use their own auth system
    if (isAdminPath()) {
      setIsLoading(false)
      return
    }

    if (authenticated && privyUser) {
      syncWithBackend()
    } else {
      setUser(null)
      setTokens([])
      setWalletInfo({ dev: null, ops: null })
      setIsLoading(false)
    }
  }, [ready, authenticated, privyUser])

  async function syncWithBackend() {
    setIsLoading(true)
    setError(null)

    try {
      const authToken = await getAccessToken()
      if (!authToken) {
        throw new Error('Failed to get access token')
      }

      // Verify with our backend and get user data
      const response = await api.post('/api/privy/verify', {}, {
        headers: { Authorization: `Bearer ${authToken}` },
      })

      const userData = response.data.user
      setUser(userData)

      // Get wallets from user data
      const wallets = userData.wallets || []
      setWalletInfo({
        dev: wallets.find((w: WalletInfo) => w.wallet_type === 'dev') || null,
        ops: wallets.find((w: WalletInfo) => w.wallet_type === 'ops') || null,
      })

      // Get tokens
      await refreshTokens()
    } catch (err: any) {
      console.error('Failed to sync with backend:', err)
      setError(err.message || 'Failed to authenticate')
    } finally {
      setIsLoading(false)
    }
  }

  const refreshTokens = useCallback(async () => {
    if (!authenticated) return

    try {
      const authToken = await getAccessToken()
      if (!authToken) return

      const response = await api.get('/api/privy/tokens', {
        headers: { Authorization: `Bearer ${authToken}` },
      })
      setTokens(response.data.tokens || [])
    } catch (err) {
      console.error('Failed to refresh tokens:', err)
    }
  }, [authenticated, getAccessToken])

  const handleLogout = useCallback(async () => {
    await privyLogout()
    setUser(null)
    setTokens([])
    setWalletInfo({ dev: null, ops: null })
    setError(null)
  }, [privyLogout])

  const getAuthToken = useCallback(async (): Promise<string | null> => {
    if (!authenticated) return null
    return getAccessToken()
  }, [authenticated, getAccessToken])

  const value: AuthContextType = {
    user,
    wallets: walletInfo,
    tokens,
    isAuthenticated: authenticated && !!user,
    isLoading: !ready || isLoading,
    error,
    login,
    logout: handleLogout,
    refreshTokens,
    getAuthToken,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH GUARD
// Protects routes that require authentication
// ═══════════════════════════════════════════════════════════════════════════

interface AuthGuardProps {
  children: ReactNode
  fallback?: ReactNode
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { isAuthenticated, isLoading, login, user } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return fallback || (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <h2 className="text-2xl font-bold text-white mb-4">Sign In Required</h2>
          <p className="text-gray-400 mb-6">
            Connect your wallet or sign in with Telegram to access the dashboard.
          </p>
          <button
            onClick={login}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  // Check if user has completed onboarding (has wallets)
  if (user && !user.onboarding_completed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <h2 className="text-2xl font-bold text-white mb-4">Complete Setup</h2>
          <p className="text-gray-400 mb-6">
            Please complete your wallet setup to continue.
          </p>
          <a
            href="/onboarding"
            className="inline-block px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all"
          >
            Continue Setup
          </a>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
