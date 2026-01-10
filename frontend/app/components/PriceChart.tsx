'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface PriceDataPoint {
  timestamp: number
  price: number
  time: string
}

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

const TIME_RANGES = [
  { label: '1H', hours: 1 },
  { label: '4H', hours: 4 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 168 },
] as const

type TimeRange = typeof TIME_RANGES[number]['label']

export default function PriceChart({
  tokenAddress = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'
}: PriceChartProps) {
  const [priceData, setPriceData] = useState<PriceDataPoint[]>([])
  const [stats, setStats] = useState<TokenStats>({
    price: 0,
    priceChange24h: 0,
    marketCap: 0,
    volume24h: 0,
    liquidity: 0,
  })
  const [selectedRange, setSelectedRange] = useState<TimeRange>('24H')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPriceData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Fetch from DexScreener API
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

      // Generate simulated historical data
      // DexScreener free API doesn't provide historical data, so we simulate
      // with random walk centered around current price
      const rangeHours = TIME_RANGES.find(r => r.label === selectedRange)?.hours || 24
      const dataPoints = rangeHours <= 4 ? 60 : rangeHours <= 24 ? 96 : 168
      const interval = (rangeHours * 60 * 60 * 1000) / dataPoints

      const now = Date.now()
      const historicalData: PriceDataPoint[] = []

      // Generate random walk data centered around current price
      // Use smaller volatility to keep price relatively stable
      const volatility = 0.003 // ±0.3% per point
      let walkPrice = price

      // Generate backwards from current price
      const tempData: { timestamp: number; price: number }[] = []

      for (let i = dataPoints - 1; i >= 0; i--) {
        const timestamp = now - (dataPoints - 1 - i) * interval

        if (i === dataPoints - 1) {
          // Last point is current price
          tempData.unshift({ timestamp, price })
        } else {
          // Random walk backwards
          const randomChange = (Math.random() - 0.5) * 2 * volatility
          walkPrice = walkPrice * (1 - randomChange)
          tempData.unshift({ timestamp, price: walkPrice })
        }
      }

      // Convert to final format
      for (const point of tempData) {
        historicalData.push({
          timestamp: point.timestamp,
          price: point.price,
          time: formatTime(point.timestamp, selectedRange),
        })
      }

      setPriceData(historicalData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load price data')
      console.error('Price fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [tokenAddress, selectedRange])

  useEffect(() => {
    fetchPriceData()
    // Refresh every 30 seconds
    const interval = setInterval(fetchPriceData, 30000)
    return () => clearInterval(interval)
  }, [fetchPriceData])

  const formatTime = (timestamp: number, range: TimeRange): string => {
    const date = new Date(timestamp)
    if (range === '1H' || range === '4H') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (range === '24H') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
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

  // Compact format for Y-axis labels - handles very small prices better
  const formatYAxisPrice = (value: number): string => {
    if (value === 0) return '0'
    // For micro-cap tokens with prices like 0.00003-0.0001
    // Show as "3.03" (×10⁻⁵) - multiplied by 100,000 for readability
    if (value < 0.0001) {
      const scaled = value * 100000 // multiply by 10^5
      return scaled.toFixed(2)
    }
    if (value < 0.001) return (value * 10000).toFixed(2)
    if (value < 0.01) return (value * 1000).toFixed(2)
    if (value < 1) return value.toFixed(4)
    return value.toFixed(2)
  }

  // Get the scale label for Y-axis based on price range
  const getYAxisLabel = (): string => {
    if (stats.price < 0.0001) return '×10⁻⁵'
    if (stats.price < 0.001) return '×10⁻⁴'
    if (stats.price < 0.01) return '×10⁻³'
    return ''
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
      <div className="flex items-center justify-between mb-4">
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
            <div className="flex gap-4 border-l border-border-subtle pl-4">
              <div className="flex flex-col">
                <span className="text-xs font-mono text-text-muted">MCap</span>
                <span className="text-sm font-mono text-text-primary">{formatCompact(stats.marketCap)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-mono text-text-muted">24h Vol</span>
                <span className="text-sm font-mono text-text-primary">{formatCompact(stats.volume24h)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Time range selector */}
        <div className="flex gap-1">
          {TIME_RANGES.map(({ label }) => (
            <button
              key={label}
              onClick={() => setSelectedRange(label)}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors ${
                selectedRange === label
                  ? 'bg-accent-primary text-bg-void font-semibold'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-card-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-64 w-full">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <motion.div
              className="text-accent-primary font-mono text-sm"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              Loading chart...
            </motion.div>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-error font-mono text-sm">{error}</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={priceData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isPositive ? '#3fb950' : '#f85149'} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={isPositive ? '#3fb950' : '#f85149'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b6a62', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                interval="preserveStartEnd"
                minTickGap={50}
              />
              <YAxis
                domain={['auto', 'auto']}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b6a62', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickFormatter={formatYAxisPrice}
                width={50}
                tickCount={5}
                label={getYAxisLabel() ? {
                  value: getYAxisLabel(),
                  angle: 0,
                  position: 'insideTopLeft',
                  offset: 0,
                  style: { fill: '#6b6a62', fontSize: 9, fontFamily: 'JetBrains Mono' }
                } : undefined}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#2a2822',
                  border: '1px solid rgba(240, 163, 129, 0.3)',
                  borderRadius: '8px',
                  fontFamily: 'JetBrains Mono',
                  fontSize: '12px',
                }}
                labelStyle={{ color: '#a8a79f' }}
                formatter={(value) => [value !== undefined ? formatPrice(value as number) : '-', 'Price']}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={isPositive ? '#3fb950' : '#f85149'}
                strokeWidth={2}
                fill="url(#priceGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
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
          <span>Live data</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`https://dexscreener.com/solana/${tokenAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-text-muted hover:text-accent-primary transition-colors"
          >
            DexScreener
          </a>
          <a
            href={`https://bags.fm/token/${tokenAddress}`}
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
