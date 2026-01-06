import { marketMaker } from './market-maker'
import { priceAnalyzer } from './price-analyzer'
import type { Transaction } from '../types'

// ═══════════════════════════════════════════════════════════════════════════
// TWAP (Time-Weighted Average Price) EXECUTOR
// Splits large orders into smaller chunks over time to minimize price impact
// ═══════════════════════════════════════════════════════════════════════════

export interface TWAPOrder {
  id: string
  type: 'buy' | 'sell'
  totalAmount: number
  executedAmount: number
  remainingAmount: number
  numSlices: number
  sliceSize: number
  intervalMs: number
  startTime: Date
  endTime: Date | null
  status: 'active' | 'completed' | 'cancelled' | 'paused'
  slicesExecuted: number
  transactions: Transaction[]
  priceAtStart: number | null
  averagePrice: number | null
}

interface TWAPConfig {
  numSlices?: number // Number of order slices (default: 5)
  durationMinutes?: number // Total duration to execute (default: 30)
  minSliceSize?: number // Minimum slice size in SOL (default: 0.005)
  maxSlippage?: number // Max slippage per slice in bps (default: 100)
  pauseOnBadPrice?: boolean // Pause if price moves against us (default: true)
  priceThresholdPct?: number // Price threshold to pause (default: 2%)
}

const DEFAULT_CONFIG: Required<TWAPConfig> = {
  numSlices: 5,
  durationMinutes: 30,
  minSliceSize: 0.005,
  maxSlippage: 100,
  pauseOnBadPrice: true,
  priceThresholdPct: 2,
}

export class TWAPExecutor {
  private activeOrders: Map<string, TWAPOrder> = new Map()
  private orderTimers: Map<string, NodeJS.Timeout> = new Map()

  /**
   * Create a new TWAP buy order
   */
  async createBuyOrder(
    totalSolAmount: number,
    config: TWAPConfig = {}
  ): Promise<TWAPOrder> {
    const cfg = { ...DEFAULT_CONFIG, ...config }

    // Calculate slice size
    const sliceSize = Math.max(
      cfg.minSliceSize,
      totalSolAmount / cfg.numSlices
    )
    const actualSlices = Math.ceil(totalSolAmount / sliceSize)
    const intervalMs = (cfg.durationMinutes * 60 * 1000) / actualSlices

    // Get starting price
    const priceData = await priceAnalyzer.fetchCurrentPrice()

    const order: TWAPOrder = {
      id: `twap_buy_${Date.now()}`,
      type: 'buy',
      totalAmount: totalSolAmount,
      executedAmount: 0,
      remainingAmount: totalSolAmount,
      numSlices: actualSlices,
      sliceSize,
      intervalMs,
      startTime: new Date(),
      endTime: null,
      status: 'active',
      slicesExecuted: 0,
      transactions: [],
      priceAtStart: priceData?.price || null,
      averagePrice: null,
    }

    this.activeOrders.set(order.id, order)
    this.scheduleNextSlice(order.id, cfg)

    console.log(`\n📊 TWAP Buy Order Created:`)
    console.log(`   Total: ${totalSolAmount} SOL`)
    console.log(`   Slices: ${actualSlices} x ${sliceSize.toFixed(4)} SOL`)
    console.log(`   Duration: ${cfg.durationMinutes} minutes`)
    console.log(`   Interval: ${(intervalMs / 1000).toFixed(0)} seconds`)

    return order
  }

  /**
   * Create a new TWAP sell order
   */
  async createSellOrder(
    totalTokenAmount: number,
    config: TWAPConfig = {}
  ): Promise<TWAPOrder> {
    const cfg = { ...DEFAULT_CONFIG, ...config }

    const sliceSize = totalTokenAmount / cfg.numSlices
    const intervalMs = (cfg.durationMinutes * 60 * 1000) / cfg.numSlices

    const priceData = await priceAnalyzer.fetchCurrentPrice()

    const order: TWAPOrder = {
      id: `twap_sell_${Date.now()}`,
      type: 'sell',
      totalAmount: totalTokenAmount,
      executedAmount: 0,
      remainingAmount: totalTokenAmount,
      numSlices: cfg.numSlices,
      sliceSize,
      intervalMs,
      startTime: new Date(),
      endTime: null,
      status: 'active',
      slicesExecuted: 0,
      transactions: [],
      priceAtStart: priceData?.price || null,
      averagePrice: null,
    }

    this.activeOrders.set(order.id, order)
    this.scheduleNextSlice(order.id, cfg)

    console.log(`\n📊 TWAP Sell Order Created:`)
    console.log(`   Total: ${totalTokenAmount} tokens`)
    console.log(`   Slices: ${cfg.numSlices} x ${sliceSize.toFixed(0)} tokens`)
    console.log(`   Duration: ${cfg.durationMinutes} minutes`)

    return order
  }

  /**
   * Schedule the next slice execution
   */
  private scheduleNextSlice(orderId: string, config: Required<TWAPConfig>) {
    const order = this.activeOrders.get(orderId)
    if (!order || order.status !== 'active') return

    const timer = setTimeout(async () => {
      await this.executeSlice(orderId, config)
    }, order.slicesExecuted === 0 ? 0 : order.intervalMs) // Execute first slice immediately

    this.orderTimers.set(orderId, timer)
  }

  /**
   * Execute a single slice of the TWAP order
   */
  private async executeSlice(orderId: string, config: Required<TWAPConfig>) {
    const order = this.activeOrders.get(orderId)
    if (!order || order.status !== 'active') return

    console.log(`\n⏱️ TWAP Slice ${order.slicesExecuted + 1}/${order.numSlices}`)

    // Check price if configured
    if (config.pauseOnBadPrice && order.priceAtStart) {
      const currentPrice = await priceAnalyzer.fetchCurrentPrice()
      if (currentPrice) {
        const priceChange = ((currentPrice.price - order.priceAtStart) / order.priceAtStart) * 100

        // For buys, pause if price went up too much
        // For sells, pause if price went down too much
        const badPriceMove = order.type === 'buy'
          ? priceChange > config.priceThresholdPct
          : priceChange < -config.priceThresholdPct

        if (badPriceMove) {
          console.log(`   ⚠️ Price moved ${priceChange.toFixed(2)}% - pausing order`)
          order.status = 'paused'
          return
        }
      }
    }

    // Calculate this slice's amount
    const sliceAmount = Math.min(order.sliceSize, order.remainingAmount)

    try {
      let tx: Transaction | null = null

      if (order.type === 'buy') {
        tx = await marketMaker.executeBuy(sliceAmount)
      } else {
        tx = await marketMaker.executeSell(sliceAmount)
      }

      if (tx) {
        order.transactions.push(tx)
        order.executedAmount += sliceAmount
        order.remainingAmount -= sliceAmount
        order.slicesExecuted++

        // Calculate average price
        const totalValue = order.transactions.reduce((sum, t) => sum + t.amount, 0)
        order.averagePrice = totalValue / order.transactions.length

        console.log(`   ✅ Executed ${sliceAmount.toFixed(4)} ${order.type === 'buy' ? 'SOL' : 'tokens'}`)
        console.log(`   Progress: ${((order.executedAmount / order.totalAmount) * 100).toFixed(1)}%`)
      } else {
        console.log(`   ⚠️ Slice execution failed, will retry`)
      }
    } catch (error) {
      console.error(`   ❌ Slice execution error:`, error)
    }

    // Check if order is complete
    if (order.remainingAmount <= 0 || order.slicesExecuted >= order.numSlices) {
      order.status = 'completed'
      order.endTime = new Date()
      this.orderTimers.delete(orderId)

      console.log(`\n✅ TWAP Order Complete!`)
      console.log(`   Total Executed: ${order.executedAmount.toFixed(4)}`)
      console.log(`   Transactions: ${order.transactions.length}`)
      console.log(`   Duration: ${((order.endTime.getTime() - order.startTime.getTime()) / 1000 / 60).toFixed(1)} minutes`)
    } else {
      // Schedule next slice
      this.scheduleNextSlice(orderId, config)
    }
  }

  /**
   * Cancel an active TWAP order
   */
  cancelOrder(orderId: string): boolean {
    const order = this.activeOrders.get(orderId)
    if (!order) return false

    order.status = 'cancelled'
    order.endTime = new Date()

    const timer = this.orderTimers.get(orderId)
    if (timer) {
      clearTimeout(timer)
      this.orderTimers.delete(orderId)
    }

    console.log(`🛑 TWAP Order ${orderId} cancelled`)
    console.log(`   Executed: ${order.executedAmount.toFixed(4)} of ${order.totalAmount}`)

    return true
  }

  /**
   * Resume a paused TWAP order
   */
  resumeOrder(orderId: string, config: TWAPConfig = {}): boolean {
    const order = this.activeOrders.get(orderId)
    if (!order || order.status !== 'paused') return false

    order.status = 'active'
    const cfg = { ...DEFAULT_CONFIG, ...config }
    this.scheduleNextSlice(orderId, cfg)

    console.log(`▶️ TWAP Order ${orderId} resumed`)
    return true
  }

  /**
   * Get order status
   */
  getOrder(orderId: string): TWAPOrder | undefined {
    return this.activeOrders.get(orderId)
  }

  /**
   * Get all active orders
   */
  getActiveOrders(): TWAPOrder[] {
    return Array.from(this.activeOrders.values()).filter(o => o.status === 'active')
  }

  /**
   * Get all orders
   */
  getAllOrders(): TWAPOrder[] {
    return Array.from(this.activeOrders.values())
  }
}

// Singleton instance
export const twapExecutor = new TWAPExecutor()
