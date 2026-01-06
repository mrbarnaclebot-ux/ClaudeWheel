import { getTokenMint } from '../config/solana'
import { env } from '../config/env'

// ═══════════════════════════════════════════════════════════════════════════
// PRICE ANALYZER SERVICE
// Fetches price data and analyzes trends for smarter trading decisions
// ═══════════════════════════════════════════════════════════════════════════

export interface PriceData {
  price: number
  priceChange24h: number
  volume24h: number
  liquidity: number
  timestamp: Date
}

interface PriceHistory {
  timestamp: number
  price: number
}

export interface TrendAnalysis {
  trend: 'bullish' | 'bearish' | 'neutral'
  strength: number // 0-100
  shortTermMA: number
  longTermMA: number
  rsi: number
  recommendation: 'buy' | 'sell' | 'hold'
  confidence: number // 0-100
}

export class PriceAnalyzer {
  private priceHistory: PriceHistory[] = []
  private readonly MAX_HISTORY = 1000
  private lastPrice: PriceData | null = null

  /**
   * Fetch current price from DexScreener
   */
  async fetchCurrentPrice(): Promise<PriceData | null> {
    const tokenMint = getTokenMint()
    if (!tokenMint) {
      console.warn('⚠️ Token mint not configured')
      return null
    }

    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenMint.toString()}`
      )
      const data = await response.json() as { pairs?: any[] }

      if (!data.pairs || data.pairs.length === 0) {
        console.log('ℹ️ No trading pairs found (token may not be live yet)')
        return null
      }

      // Get the pair with highest liquidity
      const bestPair = data.pairs.reduce((best: any, pair: any) => {
        return (pair.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? pair : best
      }, data.pairs[0])

      const priceData: PriceData = {
        price: parseFloat(bestPair.priceUsd) || 0,
        priceChange24h: parseFloat(bestPair.priceChange?.h24) || 0,
        volume24h: parseFloat(bestPair.volume?.h24) || 0,
        liquidity: parseFloat(bestPair.liquidity?.usd) || 0,
        timestamp: new Date(),
      }

      // Store in history
      this.addToHistory(priceData.price)
      this.lastPrice = priceData

      return priceData
    } catch (error) {
      console.error('Failed to fetch price:', error)
      return null
    }
  }

  /**
   * Fetch price from Jupiter for more accurate swap quotes
   */
  async fetchJupiterPrice(inputMint: string, outputMint: string, amount: number): Promise<number | null> {
    try {
      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amount.toString(),
        slippageBps: '50',
      })

      const response = await fetch(`${env.jupiterApiUrl}/quote?${params}`)
      const data = await response.json() as { outAmount?: string }

      if (data.outAmount) {
        return parseInt(data.outAmount) / Math.pow(10, env.tokenDecimals)
      }
      return null
    } catch (error) {
      console.error('Failed to fetch Jupiter price:', error)
      return null
    }
  }

  /**
   * Add price to history for trend analysis
   */
  private addToHistory(price: number) {
    this.priceHistory.push({
      timestamp: Date.now(),
      price,
    })

    // Keep history bounded
    if (this.priceHistory.length > this.MAX_HISTORY) {
      this.priceHistory = this.priceHistory.slice(-this.MAX_HISTORY)
    }
  }

  /**
   * Calculate Simple Moving Average
   */
  private calculateSMA(periods: number): number | null {
    if (this.priceHistory.length < periods) return null

    const recentPrices = this.priceHistory.slice(-periods)
    const sum = recentPrices.reduce((acc, p) => acc + p.price, 0)
    return sum / periods
  }

  /**
   * Calculate Exponential Moving Average
   */
  private calculateEMA(periods: number): number | null {
    if (this.priceHistory.length < periods) return null

    const k = 2 / (periods + 1)
    const recentPrices = this.priceHistory.slice(-periods)

    let ema = recentPrices[0].price
    for (let i = 1; i < recentPrices.length; i++) {
      ema = recentPrices[i].price * k + ema * (1 - k)
    }
    return ema
  }

  /**
   * Calculate Relative Strength Index (RSI)
   */
  private calculateRSI(periods: number = 14): number | null {
    if (this.priceHistory.length < periods + 1) return null

    const recentPrices = this.priceHistory.slice(-(periods + 1))
    let gains = 0
    let losses = 0

    for (let i = 1; i < recentPrices.length; i++) {
      const change = recentPrices[i].price - recentPrices[i - 1].price
      if (change > 0) {
        gains += change
      } else {
        losses -= change
      }
    }

    const avgGain = gains / periods
    const avgLoss = losses / periods

    if (avgLoss === 0) return 100
    const rs = avgGain / avgLoss
    return 100 - (100 / (1 + rs))
  }

  /**
   * Analyze price trend and generate trading recommendation
   */
  analyzeTrend(): TrendAnalysis | null {
    if (this.priceHistory.length < 20) {
      return null // Need more data
    }

    const shortTermMA = this.calculateEMA(10) || 0
    const longTermMA = this.calculateEMA(20) || 0
    const rsi = this.calculateRSI() || 50

    // Determine trend
    let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral'
    let strength = 50

    if (shortTermMA > longTermMA * 1.02) {
      trend = 'bullish'
      strength = Math.min(100, 50 + ((shortTermMA / longTermMA - 1) * 500))
    } else if (shortTermMA < longTermMA * 0.98) {
      trend = 'bearish'
      strength = Math.min(100, 50 + ((1 - shortTermMA / longTermMA) * 500))
    }

    // Generate recommendation based on trend and RSI
    let recommendation: 'buy' | 'sell' | 'hold' = 'hold'
    let confidence = 50

    if (trend === 'bullish' && rsi < 70) {
      recommendation = 'buy'
      confidence = Math.min(100, strength * (1 - rsi / 100))
    } else if (trend === 'bearish' && rsi > 30) {
      recommendation = 'sell'
      confidence = Math.min(100, strength * (rsi / 100))
    } else if (rsi < 30) {
      recommendation = 'buy' // Oversold
      confidence = 70
    } else if (rsi > 70) {
      recommendation = 'sell' // Overbought
      confidence = 70
    }

    return {
      trend,
      strength,
      shortTermMA,
      longTermMA,
      rsi,
      recommendation,
      confidence,
    }
  }

  /**
   * Check if it's a good time to buy
   */
  shouldBuy(minConfidence: number = 60): boolean {
    const analysis = this.analyzeTrend()
    if (!analysis) return true // No data, allow buying

    return (
      analysis.recommendation === 'buy' &&
      analysis.confidence >= minConfidence
    )
  }

  /**
   * Check if it's a good time to sell
   */
  shouldSell(minConfidence: number = 60): boolean {
    const analysis = this.analyzeTrend()
    if (!analysis) return false // No data, don't sell

    return (
      analysis.recommendation === 'sell' &&
      analysis.confidence >= minConfidence
    )
  }

  /**
   * Get current price data
   */
  getLastPrice(): PriceData | null {
    return this.lastPrice
  }

  /**
   * Get price history
   */
  getPriceHistory(): PriceHistory[] {
    return [...this.priceHistory]
  }

  /**
   * Get analysis summary
   */
  getSummary() {
    return {
      lastPrice: this.lastPrice,
      historyLength: this.priceHistory.length,
      analysis: this.analyzeTrend(),
    }
  }
}

// Singleton instance
export const priceAnalyzer = new PriceAnalyzer()
