import { walletMonitor } from './wallet-monitor'
import { priceAnalyzer } from './price-analyzer'
import { marketMaker } from './market-maker'
import { twapExecutor } from './twap-executor'
import { getSolPrice } from '../config/solana'
import { env } from '../config/env'

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY MANAGER
// Maintains target portfolio allocation between SOL and tokens
// ═══════════════════════════════════════════════════════════════════════════

export interface PortfolioState {
  solBalance: number
  solValueUsd: number
  tokenBalance: number
  tokenValueUsd: number
  totalValueUsd: number
  solAllocationPct: number
  tokenAllocationPct: number
}

interface RebalanceConfig {
  targetSolPct: number // Target % of portfolio in SOL (default: 30%)
  targetTokenPct: number // Target % of portfolio in tokens (default: 70%)
  rebalanceThreshold: number // Deviation % to trigger rebalance (default: 10%)
  minRebalanceUsd: number // Minimum USD value to rebalance (default: 10)
  maxRebalancePct: number // Max % of portfolio to move per rebalance (default: 20%)
  useTwap: boolean // Use TWAP for large rebalances (default: true)
  twapThresholdUsd: number // USD threshold for TWAP (default: 50)
}

export interface RebalanceAction {
  type: 'buy' | 'sell' | 'none'
  amount: number // In SOL for buys, tokens for sells
  reason: string
  urgency: 'low' | 'medium' | 'high'
}

const DEFAULT_CONFIG: RebalanceConfig = {
  targetSolPct: 30,
  targetTokenPct: 70,
  rebalanceThreshold: 10,
  minRebalanceUsd: 10,
  maxRebalancePct: 20,
  useTwap: true,
  twapThresholdUsd: 50,
}

export class InventoryManager {
  private config: RebalanceConfig
  private lastRebalanceTime: Date | null = null
  private rebalanceHistory: Array<{
    timestamp: Date
    action: RebalanceAction
    portfolio: PortfolioState
  }> = []

  constructor(config: Partial<RebalanceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<RebalanceConfig>) {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get current portfolio state
   */
  async getPortfolioState(): Promise<PortfolioState | null> {
    try {
      const balances = await walletMonitor.getOpsWalletBalance()
      if (!balances) return null

      const [priceData, solPrice] = await Promise.all([
        priceAnalyzer.fetchCurrentPrice(),
        getSolPrice(),
      ])
      const tokenPriceUsd = priceData?.price || 0

      const solValueUsd = balances.sol_balance * solPrice
      const tokenValueUsd = balances.token_balance * tokenPriceUsd
      const totalValueUsd = solValueUsd + tokenValueUsd

      return {
        solBalance: balances.sol_balance,
        solValueUsd,
        tokenBalance: balances.token_balance,
        tokenValueUsd,
        totalValueUsd,
        solAllocationPct: totalValueUsd > 0 ? (solValueUsd / totalValueUsd) * 100 : 100,
        tokenAllocationPct: totalValueUsd > 0 ? (tokenValueUsd / totalValueUsd) * 100 : 0,
      }
    } catch (error) {
      console.error('Failed to get portfolio state:', error)
      return null
    }
  }

  /**
   * Calculate required rebalance action
   */
  async calculateRebalanceAction(): Promise<RebalanceAction> {
    const portfolio = await this.getPortfolioState()

    if (!portfolio || portfolio.totalValueUsd < this.config.minRebalanceUsd) {
      return {
        type: 'none',
        amount: 0,
        reason: 'Portfolio too small to rebalance',
        urgency: 'low',
      }
    }

    const solDeviation = portfolio.solAllocationPct - this.config.targetSolPct
    const tokenDeviation = portfolio.tokenAllocationPct - this.config.targetTokenPct

    // Check if deviation exceeds threshold
    if (Math.abs(solDeviation) < this.config.rebalanceThreshold) {
      return {
        type: 'none',
        amount: 0,
        reason: `Within threshold (SOL: ${portfolio.solAllocationPct.toFixed(1)}% vs target ${this.config.targetSolPct}%)`,
        urgency: 'low',
      }
    }

    // Calculate rebalance amount
    const targetSolValue = portfolio.totalValueUsd * (this.config.targetSolPct / 100)
    const solDifferenceUsd = portfolio.solValueUsd - targetSolValue

    // Cap the rebalance amount
    const maxRebalanceUsd = portfolio.totalValueUsd * (this.config.maxRebalancePct / 100)
    const cappedDifferenceUsd = Math.min(Math.abs(solDifferenceUsd), maxRebalanceUsd)

    // Determine urgency based on deviation
    let urgency: 'low' | 'medium' | 'high' = 'low'
    if (Math.abs(solDeviation) > this.config.rebalanceThreshold * 2) {
      urgency = 'high'
    } else if (Math.abs(solDeviation) > this.config.rebalanceThreshold * 1.5) {
      urgency = 'medium'
    }

    if (solDifferenceUsd > 0) {
      // Too much SOL - need to buy tokens
      const solPrice = await getSolPrice()
      const solAmount = cappedDifferenceUsd / solPrice
      return {
        type: 'buy',
        amount: solAmount,
        reason: `Over-allocated in SOL (${portfolio.solAllocationPct.toFixed(1)}% vs target ${this.config.targetSolPct}%)`,
        urgency,
      }
    } else {
      // Too many tokens - need to sell
      const priceData = await priceAnalyzer.fetchCurrentPrice()
      const tokenPriceUsd = priceData?.price || 0.0001
      const tokenAmount = cappedDifferenceUsd / tokenPriceUsd
      return {
        type: 'sell',
        amount: tokenAmount,
        reason: `Over-allocated in tokens (${portfolio.tokenAllocationPct.toFixed(1)}% vs target ${this.config.targetTokenPct}%)`,
        urgency,
      }
    }
  }

  /**
   * Execute rebalance based on current portfolio state
   */
  async executeRebalance(): Promise<boolean> {
    const action = await this.calculateRebalanceAction()

    if (action.type === 'none') {
      console.log(`ℹ️ No rebalance needed: ${action.reason}`)
      return false
    }

    console.log(`\n📊 Rebalance Required:`)
    console.log(`   Action: ${action.type.toUpperCase()}`)
    console.log(`   Amount: ${action.amount.toFixed(4)} ${action.type === 'buy' ? 'SOL' : 'tokens'}`)
    console.log(`   Reason: ${action.reason}`)
    console.log(`   Urgency: ${action.urgency}`)

    // Check price analysis for timing
    const analysis = priceAnalyzer.analyzeTrend()
    if (analysis) {
      console.log(`   Market: ${analysis.trend} (RSI: ${analysis.rsi.toFixed(0)})`)

      // Don't buy in overbought conditions unless urgent
      if (action.type === 'buy' && analysis.rsi > 75 && action.urgency !== 'high') {
        console.log(`   ⚠️ Skipping buy - market overbought`)
        return false
      }

      // Don't sell in oversold conditions unless urgent
      if (action.type === 'sell' && analysis.rsi < 25 && action.urgency !== 'high') {
        console.log(`   ⚠️ Skipping sell - market oversold`)
        return false
      }
    }

    // Execute the rebalance
    try {
      const portfolio = await this.getPortfolioState()
      const solPrice = await getSolPrice()
      const estimatedUsd = action.type === 'buy'
        ? action.amount * solPrice
        : action.amount * (priceAnalyzer.getLastPrice()?.price || 0)

      // Use TWAP for large orders
      if (this.config.useTwap && estimatedUsd > this.config.twapThresholdUsd) {
        console.log(`   Using TWAP for large order ($${estimatedUsd.toFixed(2)})`)

        if (action.type === 'buy') {
          await twapExecutor.createBuyOrder(action.amount, {
            numSlices: 3,
            durationMinutes: 15,
          })
        } else {
          await twapExecutor.createSellOrder(action.amount, {
            numSlices: 3,
            durationMinutes: 15,
          })
        }
      } else {
        // Direct execution for small orders
        if (action.type === 'buy') {
          await marketMaker.executeBuy(action.amount)
        } else {
          await marketMaker.executeSell(action.amount)
        }
      }

      this.lastRebalanceTime = new Date()
      if (portfolio) {
        this.rebalanceHistory.push({
          timestamp: this.lastRebalanceTime,
          action,
          portfolio,
        })
      }

      console.log(`   ✅ Rebalance executed successfully`)
      return true
    } catch (error) {
      console.error(`   ❌ Rebalance failed:`, error)
      return false
    }
  }

  /**
   * Get portfolio summary
   */
  async getSummary() {
    const portfolio = await this.getPortfolioState()
    const action = await this.calculateRebalanceAction()

    return {
      portfolio,
      targetAllocation: {
        sol: this.config.targetSolPct,
        token: this.config.targetTokenPct,
      },
      suggestedAction: action,
      lastRebalance: this.lastRebalanceTime,
      rebalanceCount: this.rebalanceHistory.length,
    }
  }

  /**
   * Get rebalance history
   */
  getHistory() {
    return [...this.rebalanceHistory]
  }
}

// Singleton instance
export const inventoryManager = new InventoryManager()
