'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'

interface TokenStats {
  price: number
  priceChange24h: number
  marketCap: number
  volume24h: number
  liquidity: number
}

interface PriceChartProps {
  tokenAddress?: string
}

export default function PriceChart({
  tokenAddress = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'
}: PriceChartProps) {
  const [stats, setStats] = useState<TokenStats>({
    price: 0,
    priceChange24h: 0,
    marketCap: 0,
    volume24h: 0,
    liquidity: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const MAX_RETRIES = 3

  // DexScreener embed URL for real chart data
  const dexScreenerUrl = `https://dexscreener.com/solana/${tokenAddress}?embed=1&theme=dark&trades=0&info=0`

  const fetchPriceData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Fetch stats from DexScreener API
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
      )

      if (!response.ok) {
        throw new Error('Failed to fetch price data')
      }

      const data = await response.json()

      if (!data.pairs || data.pairs.length === 0) {
        throw new Error('No trading pairs found')
      }

      // Get the pair with highest liquidity (most reliable price)
      const pair = data.pairs.reduce((best: any, current: any) => {
        const bestLiq = best.liquidity?.usd || 0
        const currentLiq = current.liquidity?.usd || 0
        return currentLiq > bestLiq ? current : best
      }, data.pairs[0])

      const price = parseFloat(pair.priceUsd || '0')
      const change24h = parseFloat(pair.priceChange?.h24 || '0')
      const marketCap = pair.marketCap || pair.fdv || 0
      const volume24h = pair.volume?.h24 || 0
      const liquidity = pair.liquidity?.usd || 0

      setStats({
        price,
        priceChange24h: change24h,
        marketCap,
        volume24h,
        liquidity,
      })

      setRetryCount(0) // Reset retry count on success
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load price data'
      console.error('Price fetch error:', err)

      // Auto-retry with exponential backoff (max 3 retries)
      if (retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000 // 1s, 2s, 4s
        console.log(`Retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`)
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
        }, delay)
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }, [tokenAddress, retryCount])

  useEffect(() => {
    fetchPriceData()
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchPriceData, 30000)
    return () => clearInterval(interval)
  }, [fetchPriceData])

  const handleManualRetry = () => {
    setError(null)
    setRetryCount(0)
    setIframeLoaded(false)
    fetchPriceData()
  }

  const formatPrice = (value: number): string => {
    if (value === 0) return '$0'
    if (value < 0.00001) return `$${value.toFixed(8)}`
    if (value < 0.0001) return `$${value.toFixed(7)}`
    if (value < 0.001) return `$${value.toFixed(6)}`
    if (value < 0.01) return `$${value.toFixed(5)}`
    if (value < 1) return `$${value.toFixed(4)}`
    return `$${value.toFixed(2)}`
  }

  const formatCompact = (value: number): string => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
    return `$${value.toFixed(0)}`
  }

  const isPositive = stats.priceChange24h >= 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="card-glow bg-bg-card p-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-sm font-mono text-text-muted uppercase">WHEEL Price</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-mono font-bold text-text-primary">
                {isLoading ? '...' : formatPrice(stats.price)}
              </span>
              {!isLoading && (
                <span className={`text-sm font-mono ${isPositive ? 'text-success' : 'text-error'}`}>
                  {isPositive ? '+' : ''}{stats.priceChange24h.toFixed(2)}%
                </span>
              )}
            </div>
          </div>

          {/* Market cap and volume */}
          {!isLoading && stats.marketCap > 0 && (
            <div className="hidden sm:flex gap-4 border-l border-border-subtle pl-4">
              <div className="flex flex-col">
                <span className="text-xs font-mono text-text-muted">MCap</span>
                <span className="text-sm font-mono text-text-primary">{formatCompact(stats.marketCap)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-mono text-text-muted">24h Vol</span>
                <span className="text-sm font-mono text-text-primary">{formatCompact(stats.volume24h)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-mono text-text-muted">Liquidity</span>
                <span className="text-sm font-mono text-text-primary">{formatCompact(stats.liquidity)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Mobile stats row */}
        {!isLoading && stats.marketCap > 0 && (
          <div className="flex sm:hidden gap-4 text-center">
            <div className="flex flex-col flex-1">
              <span className="text-xs font-mono text-text-muted">MCap</span>
              <span className="text-sm font-mono text-text-primary">{formatCompact(stats.marketCap)}</span>
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-xs font-mono text-text-muted">24h Vol</span>
              <span className="text-sm font-mono text-text-primary">{formatCompact(stats.volume24h)}</span>
            </div>
            <div className="flex flex-col flex-1">
              <span className="text-xs font-mono text-text-muted">Liq</span>
              <span className="text-sm font-mono text-text-primary">{formatCompact(stats.liquidity)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Chart - DexScreener Embed */}
      <div className="relative h-[350px] md:h-[400px] w-full rounded-lg overflow-hidden bg-bg-secondary">
        {error ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <svg
                className="w-8 h-8 text-error/60"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4m0 4h.01" />
              </svg>
              <span className="text-error font-mono text-sm">{error}</span>
              <span className="text-text-muted font-mono text-xs">
                Unable to load chart from DexScreener
              </span>
            </div>
            <button
              onClick={handleManualRetry}
              className="px-4 py-2 text-sm font-mono bg-accent-primary/10 text-accent-primary
                         border border-accent-primary/30 rounded-lg hover:bg-accent-primary/20
                         transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Loading overlay */}
            {!iframeLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-bg-secondary z-10">
                <motion.div
                  className="text-accent-primary font-mono text-sm"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  Loading chart...
                </motion.div>
              </div>
            )}
            <iframe
              src={dexScreenerUrl}
              title="WHEEL Price Chart"
              className="w-full h-full border-0"
              onLoad={() => setIframeLoaded(true)}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            />
          </>
        )}
      </div>

      {/* Footer links */}
      <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs font-mono text-text-muted">
          <motion.span
            className="w-2 h-2 rounded-full bg-success"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span>Live chart</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`https://dexscreener.com/solana/${tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-text-muted hover:text-accent-primary transition-colors"
          >
            Full Chart
          </a>
          <a
            href={`https://bags.fm/${tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-text-muted hover:text-accent-primary transition-colors"
          >
            Bags.fm
          </a>
        </div>
      </div>
    </motion.div>
  )
}
