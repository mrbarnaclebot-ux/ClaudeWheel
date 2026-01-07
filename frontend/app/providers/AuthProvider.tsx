'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import bs58 from 'bs58'
import {
  AuthUser,
  requestAuthNonce,
  verifyAuth,
  getCurrentUser,
  getUserTokens,
  UserToken,
} from '@/lib/api'

// ═══════════════════════════════════════════════════════════════════════════
// AUTH CONTEXT
// Manages user authentication state with wallet signature
// ═══════════════════════════════════════════════════════════════════════════

interface AuthContextType {
  user: AuthUser | null
  tokens: UserToken[]
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: () => Promise<boolean>
  logout: () => void
  refreshTokens: () => Promise<void>
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

export function AuthProvider({ children }: AuthProviderProps) {
  const { publicKey, signMessage, connected, disconnect } = useWallet()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [tokens, setTokens] = useState<UserToken[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const walletAddress = publicKey?.toString()

  // Check if user is already authenticated when wallet connects
  useEffect(() => {
    if (walletAddress && !user) {
      checkExistingUser()
    }
  }, [walletAddress])

  // Clear user state when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setUser(null)
      setTokens([])
      setError(null)
    }
  }, [connected])

  // Check if user already exists
  const checkExistingUser = async () => {
    if (!walletAddress) return

    setIsLoading(true)
    try {
      const existingUser = await getCurrentUser(walletAddress)
      if (existingUser) {
        setUser(existingUser)
        await refreshTokens()
      }
    } catch (err) {
      console.error('Failed to check existing user:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Login with wallet signature
  const login = useCallback(async (): Promise<boolean> => {
    if (!walletAddress || !signMessage) {
      setError('Wallet not connected')
      return false
    }

    setIsLoading(true)
    setError(null)

    try {
      // Request nonce from backend
      const nonce = await requestAuthNonce(walletAddress)
      if (!nonce) {
        throw new Error('Failed to get authentication nonce')
      }

      // Sign the message with wallet
      const messageBytes = new TextEncoder().encode(nonce.message)
      const signatureBytes = await signMessage(messageBytes)
      const signature = bs58.encode(signatureBytes)

      // Verify signature with backend
      const authUser = await verifyAuth(walletAddress, signature, nonce.message)
      if (!authUser) {
        throw new Error('Authentication failed')
      }

      setUser(authUser)
      await refreshTokens()
      return true
    } catch (err: any) {
      console.error('Login failed:', err)
      setError(err.message || 'Login failed')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [walletAddress, signMessage])

  // Logout
  const logout = useCallback(() => {
    setUser(null)
    setTokens([])
    setError(null)
    disconnect()
  }, [disconnect])

  // Refresh user tokens
  const refreshTokens = useCallback(async () => {
    if (!walletAddress) return

    try {
      const userTokens = await getUserTokens(walletAddress)
      setTokens(userTokens)
    } catch (err) {
      console.error('Failed to refresh tokens:', err)
    }
  }, [walletAddress])

  const value: AuthContextType = {
    user,
    tokens,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    logout,
    refreshTokens,
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
  const { isAuthenticated, isLoading, login } = useAuth()
  const { connected } = useWallet()

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

  if (!connected) {
    return fallback || (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <h2 className="text-2xl font-bold text-white mb-4">Connect Your Wallet</h2>
          <p className="text-gray-400 mb-6">
            Please connect your Solana wallet to access the dashboard.
          </p>
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
            Please sign a message with your wallet to verify ownership.
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

  return <>{children}</>
}
