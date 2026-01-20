'use client'

import { useState, useEffect, useCallback } from 'react'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface WheelData {
  token: {
    mintAddress: string
    symbol: string
    decimals: number
  }
  wallets: {
    dev: {
      address: string
      solBalance: number
      tokenBalance: number
    }
    ops: {
      address: string
      solBalance: number
      tokenBalance: number
    }
  }
  feeStats: {
    totalCollected: number
    todayCollected: number
    hourCollected: number
  }
  flywheel: {
    isActive: boolean
    multiUserJobRunning: boolean
    lastRunAt: string | null
  }
  transactionsCount: number
}

export interface PlatformStats {
  tokens: {
    launched: number
    registered: number
    mmOnly: number
    total: number
    activeFlywheels: number
  }
  users: {
    total: number
  }
  volume: {
    totalSol: number
    totalFeesCollected: number
  }
}

export interface LiveStats {
  wheel: WheelData | null
  platform: PlatformStats | null
  isLoading: boolean
  error: string | null
  lastUpdated: Date | null
}

export function useLiveStats(refreshInterval = 30000) {
  const [stats, setStats] = useState<LiveStats>({
    wheel: null,
    platform: null,
    isLoading: true,
    error: null,
    lastUpdated: null,
  })

  const fetchStats = useCallback(async () => {
    try {
      const [wheelRes, platformRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/status/wheel`),
        fetch(`${API_BASE_URL}/api/status/platform-stats`),
      ])

      const wheelJson = await wheelRes.json()
      const platformJson = await platformRes.json()

      setStats({
        wheel: wheelJson.success ? wheelJson.data : null,
        platform: platformJson.success ? platformJson.data : null,
        isLoading: false,
        error: null,
        lastUpdated: new Date(),
      })
    } catch (err) {
      setStats((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch stats',
      }))
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchStats, refreshInterval])

  return { ...stats, refetch: fetchStats }
}

// Hook for SOL price from external API
export function useSolPrice(refreshInterval = 60000) {
  const [price, setPrice] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd')
        const data = await res.json()
        setPrice(data.solana?.usd || null)
      } catch {
        // Fallback - don't update price on error
      } finally {
        setIsLoading(false)
      }
    }

    fetchPrice()
    const interval = setInterval(fetchPrice, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval])

  return { price, isLoading }
}

// Public token data for showcase
export interface PublicToken {
  id: string
  name: string
  symbol: string
  image?: string
  mint: string
  source: 'launched' | 'registered' | 'mm_only'
  isFlywheelActive: boolean
  isTokenActive: boolean
  algorithm: string
  createdAt: string
}

// Hook for fetching public platform tokens
export function usePlatformTokens(refreshInterval = 60000) {
  const [tokens, setTokens] = useState<PublicToken[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/status/public-tokens`)
      const data = await res.json()

      if (data.success && data.data?.tokens) {
        setTokens(data.data.tokens)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTokens()
    const interval = setInterval(fetchTokens, refreshInterval)
    return () => clearInterval(interval)
  }, [fetchTokens, refreshInterval])

  return { tokens, isLoading, error, refetch: fetchTokens }
}
