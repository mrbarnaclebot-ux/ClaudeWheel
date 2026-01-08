import { getTokenMint } from '../config/solana'
import { env } from '../config/env'

// ═══════════════════════════════════════════════════════════════════════════
// PRICE ANALYZER SERVICE
// Advanced price analysis with volatility, Bollinger Bands, and dynamic sizing
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
  volume?: number
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

export interface VolatilityMetrics {
  volatility: number // Standard deviation as percentage
  atr: number // Average True Range
  bollingerUpper: number
  bollingerLower: number
  bollingerMiddle: number
  isHighVolatility: boolean
}

export interface TradingSignals {
  trend: TrendAnalysis | null
  volatility: VolatilityMetrics | null
  suggestedSlippageBps: number
  suggestedPositionSizePct: number // % of available balance
  priceVsMA: 'above' | 'below' | 'at'
  momentumStrength: number // -100 to 100
}

export class PriceAnalyzer {
  private priceHistory: PriceHistory[] = []
  private readonly MAX_HISTORY = 1000
  private lastPrice: PriceData | null = null
  private tokenMintAddress: string | null = null

  /**
   * Create a PriceAnalyzer instance
   * @param tokenMint Optional token mint address. If not provided, uses the default from config.
   */
  constructor(tokenMint?: string) {
    this.tokenMintAddress = tokenMint || null
  }

  /**
   * Get the token mint address for this analyzer
   */
  private getTokenMintAddress(): string | null {
    if (this.tokenMintAddress) {
      return this.tokenMintAddress
    }
    const defaultMint = getTokenMint()
    return defaultMint ? defaultMint.toString() : null
  }

  /**
   * Fetch current price from DexScreener
   */
  async fetchCurrentPrice(): Promise<PriceData | null> {
    const tokenMint = this.getTokenMintAddress()
    if (!tokenMint) {
      console.warn('⚠️ Token mint not configured')
      return null
    }

    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`
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
      volatility: this.calculateVolatility(),
      signals: this.getTradingSignals(),
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADVANCED ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate standard deviation of prices (volatility)
   */
  private calculateStdDev(periods: number): number | null {
    if (this.priceHistory.length < periods) return null

    const prices = this.priceHistory.slice(-periods).map(p => p.price)
    const mean = prices.reduce((a, b) => a + b, 0) / prices.length
    const squaredDiffs = prices.map(p => Math.pow(p - mean, 2))
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / prices.length
    return Math.sqrt(variance)
  }

  /**
   * Calculate Bollinger Bands
   */
  calculateBollingerBands(periods: number = 20, stdDevMultiplier: number = 2): {
    upper: number
    middle: number
    lower: number
  } | null {
    const sma = this.calculateSMA(periods)
    const stdDev = this.calculateStdDev(periods)

    if (!sma || !stdDev) return null

    return {
      upper: sma + (stdDev * stdDevMultiplier),
      middle: sma,
      lower: sma - (stdDev * stdDevMultiplier),
    }
  }

  /**
   * Calculate volatility metrics
   */
  calculateVolatility(periods: number = 20): VolatilityMetrics | null {
    if (this.priceHistory.length < periods) return null

    const prices = this.priceHistory.slice(-periods).map(p => p.price)
    const currentPrice = prices[prices.length - 1]

    // Calculate percentage returns
    const returns: number[] = []
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1] * 100)
    }

    // Calculate standard deviation of returns (volatility)
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    const squaredDiffs = returns.map(r => Math.pow(r - meanReturn, 2))
    const volatility = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / returns.length)

    // Calculate ATR (simplified - using price range)
    let atrSum = 0
    for (let i = 1; i < prices.length; i++) {
      atrSum += Math.abs(prices[i] - prices[i - 1])
    }
    const atr = atrSum / (prices.length - 1)

    // Bollinger Bands
    const bands = this.calculateBollingerBands(periods)

    return {
      volatility,
      atr,
      bollingerUpper: bands?.upper || currentPrice * 1.1,
      bollingerLower: bands?.lower || currentPrice * 0.9,
      bollingerMiddle: bands?.middle || currentPrice,
      isHighVolatility: volatility > 5, // >5% daily volatility is high
    }
  }

  /**
   * Calculate suggested slippage based on liquidity and volatility
   */
  calculateDynamicSlippage(tradeAmountUsd: number): number {
    const volatility = this.calculateVolatility()
    const liquidity = this.lastPrice?.liquidity || 10000

    // Base slippage: 50 bps (0.5%)
    let slippageBps = 50

    // Adjust for volatility
    if (volatility) {
      if (volatility.isHighVolatility) {
        slippageBps += 50 // Add 0.5% for high volatility
      }
      slippageBps += Math.floor(volatility.volatility * 10) // Add based on actual volatility
    }

    // Adjust for trade size relative to liquidity (price impact)
    const priceImpactPct = (tradeAmountUsd / liquidity) * 100
    if (priceImpactPct > 1) {
      slippageBps += Math.floor(priceImpactPct * 50) // Add 50 bps per 1% of liquidity
    }

    // Cap at 500 bps (5%)
    return Math.min(slippageBps, 500)
  }

  /**
   * Calculate suggested position size based on volatility and confidence
   */
  calculatePositionSize(
    availableBalance: number,
    maxPositionPct: number = 20
  ): number {
    const analysis = this.analyzeTrend()
    const volatility = this.calculateVolatility()

    // Base position: 10% of available
    let positionPct = 10

    // Adjust based on confidence
    if (analysis) {
      positionPct = Math.min(maxPositionPct, positionPct * (analysis.confidence / 50))
    }

    // Reduce position in high volatility
    if (volatility?.isHighVolatility) {
      positionPct *= 0.5
    }

    // Ensure minimum 2%, maximum as specified
    positionPct = Math.max(2, Math.min(positionPct, maxPositionPct))

    return (availableBalance * positionPct) / 100
  }

  /**
   * Get comprehensive trading signals
   */
  getTradingSignals(): TradingSignals {
    const trend = this.analyzeTrend()
    const volatility = this.calculateVolatility()
    const currentPrice = this.lastPrice?.price || 0
    const liquidity = this.lastPrice?.liquidity || 10000

    // Calculate momentum (-100 to 100)
    let momentumStrength = 0
    if (trend) {
      momentumStrength = trend.trend === 'bullish'
        ? trend.strength * (trend.confidence / 100)
        : trend.trend === 'bearish'
          ? -trend.strength * (trend.confidence / 100)
          : 0
    }

    // Price vs MA position
    let priceVsMA: 'above' | 'below' | 'at' = 'at'
    if (trend && currentPrice > 0) {
      if (currentPrice > trend.shortTermMA * 1.01) priceVsMA = 'above'
      else if (currentPrice < trend.shortTermMA * 0.99) priceVsMA = 'below'
    }

    // Dynamic slippage (assume $100 trade for estimation)
    const suggestedSlippageBps = this.calculateDynamicSlippage(100)

    // Position size as percentage
    let suggestedPositionSizePct = 10
    if (trend) {
      suggestedPositionSizePct = Math.min(20, 5 + (trend.confidence / 10))
    }
    if (volatility?.isHighVolatility) {
      suggestedPositionSizePct *= 0.5
    }

    return {
      trend,
      volatility,
      suggestedSlippageBps,
      suggestedPositionSizePct,
      priceVsMA,
      momentumStrength,
    }
  }

  /**
   * Check if price is near Bollinger Band (potential reversal)
   */
  isNearBollingerBand(): 'upper' | 'lower' | 'middle' | null {
    const bands = this.calculateBollingerBands()
    const currentPrice = this.lastPrice?.price

    if (!bands || !currentPrice) return null

    const range = bands.upper - bands.lower
    const upperThreshold = bands.upper - (range * 0.1)
    const lowerThreshold = bands.lower + (range * 0.1)

    if (currentPrice >= upperThreshold) return 'upper' // Potential overbought
    if (currentPrice <= lowerThreshold) return 'lower' // Potential oversold
    return 'middle'
  }

  /**
   * Get optimal entry/exit signals combining all indicators
   */
  getOptimalSignal(): {
    action: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell'
    confidence: number
    reasons: string[]
  } {
    const signals = this.getTradingSignals()
    const bollingerPosition = this.isNearBollingerBand()
    const reasons: string[] = []
    let score = 0 // -100 to +100

    // RSI contribution
    if (signals.trend) {
      if (signals.trend.rsi < 30) {
        score += 30
        reasons.push('RSI oversold (<30)')
      } else if (signals.trend.rsi > 70) {
        score -= 30
        reasons.push('RSI overbought (>70)')
      }
    }

    // Trend contribution
    if (signals.trend) {
      if (signals.trend.trend === 'bullish') {
        score += signals.trend.strength * 0.3
        reasons.push(`Bullish trend (strength: ${signals.trend.strength.toFixed(0)})`)
      } else if (signals.trend.trend === 'bearish') {
        score -= signals.trend.strength * 0.3
        reasons.push(`Bearish trend (strength: ${signals.trend.strength.toFixed(0)})`)
      }
    }

    // Bollinger Band contribution
    if (bollingerPosition === 'lower') {
      score += 20
      reasons.push('Price near lower Bollinger Band')
    } else if (bollingerPosition === 'upper') {
      score -= 20
      reasons.push('Price near upper Bollinger Band')
    }

    // Volatility adjustment
    if (signals.volatility?.isHighVolatility) {
      score *= 0.7 // Reduce conviction in high volatility
      reasons.push('High volatility - reduced position size recommended')
    }

    // Determine action
    let action: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell'
    if (score >= 50) action = 'strong_buy'
    else if (score >= 20) action = 'buy'
    else if (score <= -50) action = 'strong_sell'
    else if (score <= -20) action = 'sell'
    else action = 'hold'

    return {
      action,
      confidence: Math.min(100, Math.abs(score)),
      reasons,
    }
  }
}

// Singleton instance
export const priceAnalyzer = new PriceAnalyzer()
