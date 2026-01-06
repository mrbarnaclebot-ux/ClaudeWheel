import cron from 'node-cron'
import { feeCollector } from '../services/fee-collector'
import { marketMaker } from '../services/market-maker'
import { walletMonitor } from '../services/wallet-monitor'
import { priceAnalyzer } from '../services/price-analyzer'
import { twapExecutor } from '../services/twap-executor'
import { inventoryManager } from '../services/inventory-manager'
import { fetchConfig, updateWalletBalance, calculateAndUpdateFeeStats, type FlywheelConfig } from '../config/database'
import { env } from '../config/env'
import type { Transaction } from '../types'

// ═══════════════════════════════════════════════════════════════════════════
// FLYWHEEL JOB
// Main automation loop that runs the flywheel:
// 1. Collect fees from dev wallet
// 2. Transfer to ops wallet
// 3. Execute market making orders (simple, smart, or rebalance mode)
// ═══════════════════════════════════════════════════════════════════════════

// Store recent transactions in memory (would use database in production)
const recentTransactions: Transaction[] = []
const MAX_TRANSACTIONS = 100

export function addTransaction(tx: Transaction) {
  recentTransactions.unshift(tx)
  if (recentTransactions.length > MAX_TRANSACTIONS) {
    recentTransactions.pop()
  }
}

export function getRecentTransactions(): Transaction[] {
  return recentTransactions
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING SYSTEM
// Capture backend logs for admin panel display
// ═══════════════════════════════════════════════════════════════════════════

interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

const recentLogs: LogEntry[] = []
const MAX_LOGS = 500

function addLog(level: LogEntry['level'], message: string) {
  recentLogs.unshift({
    timestamp: new Date().toISOString(),
    level,
    message: message.replace(/\x1b\[[0-9;]*m/g, ''), // Strip ANSI colors
  })
  if (recentLogs.length > MAX_LOGS) {
    recentLogs.pop()
  }
}

export function getRecentLogs(limit: number = 50): LogEntry[] {
  return recentLogs.slice(0, limit)
}

// Override console methods to capture logs
const originalConsoleLog = console.log
const originalConsoleWarn = console.warn
const originalConsoleError = console.error

console.log = (...args: any[]) => {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ')
  addLog('info', message)
  originalConsoleLog.apply(console, args)
}

console.warn = (...args: any[]) => {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ')
  addLog('warn', message)
  originalConsoleWarn.apply(console, args)
}

console.error = (...args: any[]) => {
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ')
  addLog('error', message)
  originalConsoleError.apply(console, args)
}

// Simple market making - basic threshold-based
async function runSimpleMarketMaking(config: FlywheelConfig) {
  console.log('\n📈 Market Making: SIMPLE Mode')

  const opsBalance = await walletMonitor.getOpsWalletBalance()
  if (!opsBalance) {
    console.log('   ⚠️ Could not get ops wallet balance')
    return
  }

  if (opsBalance.sol_balance > config.max_buy_amount_sol + 0.01) {
    // We have SOL - execute a buy
    console.log('   Executing buy order...')
    const buyAmount = Math.min(
      opsBalance.sol_balance * 0.1, // Use 10% of balance
      config.max_buy_amount_sol
    )
    const buyResult = await marketMaker.executeBuy(buyAmount)
    if (buyResult) {
      addTransaction(buyResult)
      console.log(`   ✅ Bought tokens with ${buyResult.amount.toFixed(6)} SOL`)
    }
  } else if (opsBalance.token_balance > env.maxSellAmountTokens * 2) {
    // We have excess tokens - execute a sell
    console.log('   Executing sell order...')
    const sellAmount = Math.min(
      opsBalance.token_balance * 0.05, // Sell 5% of holdings
      env.maxSellAmountTokens
    )
    const sellResult = await marketMaker.executeSell(sellAmount)
    if (sellResult) {
      addTransaction(sellResult)
      console.log(`   ✅ Sold ${sellResult.amount.toFixed(0)} tokens`)
    }
  } else {
    console.log('   ℹ️ No market making action needed')
  }
}

// Smart market making - uses price analysis and RSI
async function runSmartMarketMaking(config: FlywheelConfig) {
  console.log('\n📈 Market Making: SMART Mode')

  // Fetch current price and update analysis
  const priceData = await priceAnalyzer.fetchCurrentPrice()
  if (!priceData) {
    console.log('   ⚠️ Could not fetch price data, falling back to simple mode')
    await runSimpleMarketMaking(config)
    return
  }

  console.log(`   Current Price: $${priceData.price.toFixed(8)}`)
  console.log(`   24h Change: ${priceData.priceChange24h.toFixed(2)}%`)
  console.log(`   Liquidity: $${priceData.liquidity.toFixed(2)}`)

  // Analyze trend
  const analysis = priceAnalyzer.analyzeTrend()
  if (!analysis) {
    console.log('   ℹ️ Not enough data for trend analysis, falling back to simple mode')
    await runSimpleMarketMaking(config)
    return
  }

  console.log(`   Trend: ${analysis.trend.toUpperCase()} (strength: ${analysis.strength.toFixed(0)})`)
  console.log(`   RSI: ${analysis.rsi.toFixed(1)}`)
  console.log(`   Recommendation: ${analysis.recommendation.toUpperCase()} (confidence: ${analysis.confidence.toFixed(0)}%)`)

  const opsBalance = await walletMonitor.getOpsWalletBalance()
  if (!opsBalance) {
    console.log('   ⚠️ Could not get ops wallet balance')
    return
  }

  // Execute based on analysis
  if (analysis.recommendation === 'buy' && analysis.confidence >= 60) {
    if (opsBalance.sol_balance > config.min_buy_amount_sol + 0.01) {
      // Scale buy amount by confidence
      const confidenceFactor = analysis.confidence / 100
      const buyAmount = Math.min(
        opsBalance.sol_balance * 0.1 * confidenceFactor,
        config.max_buy_amount_sol
      )

      console.log(`   Executing smart buy (confidence: ${analysis.confidence.toFixed(0)}%)...`)

      // Use TWAP for larger orders
      const estimatedUsd = buyAmount * 200 // Approximate SOL price
      if (config.use_twap && estimatedUsd > config.twap_threshold_usd) {
        await twapExecutor.createBuyOrder(buyAmount, {
          numSlices: 3,
          durationMinutes: 10,
        })
        console.log(`   ✅ TWAP buy order created for ${buyAmount.toFixed(4)} SOL`)
      } else {
        const buyResult = await marketMaker.executeBuy(buyAmount)
        if (buyResult) {
          addTransaction(buyResult)
          console.log(`   ✅ Bought tokens with ${buyResult.amount.toFixed(6)} SOL`)
        }
      }
    } else {
      console.log('   ℹ️ Insufficient SOL for buy')
    }
  } else if (analysis.recommendation === 'sell' && analysis.confidence >= 60) {
    if (opsBalance.token_balance > env.maxSellAmountTokens) {
      // Scale sell amount by confidence
      const confidenceFactor = analysis.confidence / 100
      const sellAmount = Math.min(
        opsBalance.token_balance * 0.05 * confidenceFactor,
        env.maxSellAmountTokens
      )

      console.log(`   Executing smart sell (confidence: ${analysis.confidence.toFixed(0)}%)...`)

      // Use TWAP for larger orders
      const estimatedUsd = sellAmount * priceData.price
      if (config.use_twap && estimatedUsd > config.twap_threshold_usd) {
        await twapExecutor.createSellOrder(sellAmount, {
          numSlices: 3,
          durationMinutes: 10,
        })
        console.log(`   ✅ TWAP sell order created for ${sellAmount.toFixed(0)} tokens`)
      } else {
        const sellResult = await marketMaker.executeSell(sellAmount)
        if (sellResult) {
          addTransaction(sellResult)
          console.log(`   ✅ Sold ${sellResult.amount.toFixed(0)} tokens`)
        }
      }
    } else {
      console.log('   ℹ️ Insufficient tokens for sell')
    }
  } else {
    console.log(`   ℹ️ Holding position (${analysis.recommendation}, confidence: ${analysis.confidence.toFixed(0)}%)`)
  }
}

// Rebalance mode - maintains target allocation
async function runRebalanceMode(config: FlywheelConfig) {
  console.log('\n📈 Market Making: REBALANCE Mode')

  // Update inventory manager config
  inventoryManager.setConfig({
    targetSolPct: config.target_sol_allocation,
    targetTokenPct: config.target_token_allocation,
    rebalanceThreshold: config.rebalance_threshold,
    useTwap: config.use_twap,
    twapThresholdUsd: config.twap_threshold_usd,
  })

  // Get portfolio summary
  const summary = await inventoryManager.getSummary()
  if (summary.portfolio) {
    console.log(`   Portfolio Value: $${summary.portfolio.totalValueUsd.toFixed(2)}`)
    console.log(`   SOL Allocation: ${summary.portfolio.solAllocationPct.toFixed(1)}% (target: ${config.target_sol_allocation}%)`)
    console.log(`   Token Allocation: ${summary.portfolio.tokenAllocationPct.toFixed(1)}% (target: ${config.target_token_allocation}%)`)
  }

  // Execute rebalance if needed
  const rebalanced = await inventoryManager.executeRebalance()
  if (rebalanced) {
    console.log('   ✅ Rebalance executed')
  }
}

// Main flywheel cycle
async function runFlywheelCycle() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('🔄 Running flywheel cycle...')
  console.log('═══════════════════════════════════════════════════════════\n')

  try {
    // Fetch config from database
    const config = await fetchConfig()

    // Step 1: ALWAYS get current balances and persist to Supabase (even when paused)
    const balances = await walletMonitor.getAllBalances()
    console.log('📊 Current balances:')
    if (balances.devWallet) {
      console.log(`   Dev: ${balances.devWallet.sol_balance.toFixed(6)} SOL, ${balances.devWallet.token_balance.toFixed(0)} tokens`)
      // Persist to Supabase for frontend display
      await updateWalletBalance({
        wallet_type: 'dev',
        address: balances.devWallet.address,
        sol_balance: balances.devWallet.sol_balance,
        token_balance: balances.devWallet.token_balance,
        usd_value: balances.devWallet.usd_value,
      })
    }
    if (balances.opsWallet) {
      console.log(`   Ops: ${balances.opsWallet.sol_balance.toFixed(6)} SOL, ${balances.opsWallet.token_balance.toFixed(0)} tokens`)
      // Persist to Supabase for frontend display
      await updateWalletBalance({
        wallet_type: 'ops',
        address: balances.opsWallet.address,
        sol_balance: balances.opsWallet.sol_balance,
        token_balance: balances.opsWallet.token_balance,
        usd_value: balances.opsWallet.usd_value,
      })
    }

    // Step 2: ALWAYS update fee stats from transaction history (even when paused)
    await calculateAndUpdateFeeStats()

    // Check if flywheel is active for trading operations
    if (!config.flywheel_active) {
      console.log('⏸️ Flywheel is paused - skipping trading operations')
      console.log('═══════════════════════════════════════════════════════════\n')
      return
    }

    // Step 2: Collect fees from dev wallet (if enabled)
    if (config.fee_collection_enabled) {
      console.log('\n📥 Step 1: Fee Collection')
      const feeCollectionResult = await feeCollector.collectFees()
      if (feeCollectionResult) {
        addTransaction(feeCollectionResult)
        console.log(`   ✅ Collected ${feeCollectionResult.amount.toFixed(6)} SOL`)
      } else {
        console.log('   ℹ️ No fees to collect')
      }
    } else {
      console.log('\n📥 Step 1: Fee Collection (disabled)')
    }

    // Step 3: Market making (if enabled)
    if (config.market_making_enabled) {
      // Process any active TWAP orders first
      const activeTwapOrders = twapExecutor.getActiveOrders()
      if (activeTwapOrders.length > 0) {
        console.log(`\n⏱️ Active TWAP Orders: ${activeTwapOrders.length}`)
        for (const order of activeTwapOrders) {
          console.log(`   ${order.id}: ${order.type} ${order.executedAmount.toFixed(4)}/${order.totalAmount.toFixed(4)} (${order.slicesExecuted}/${order.numSlices} slices)`)
        }
      }

      // Run market making based on algorithm mode
      const algorithmMode = config.algorithm_mode || 'simple'

      switch (algorithmMode) {
        case 'smart':
          await runSmartMarketMaking(config)
          break
        case 'rebalance':
          await runRebalanceMode(config)
          break
        case 'simple':
        default:
          await runSimpleMarketMaking(config)
          break
      }
    } else {
      console.log('\n📈 Step 2: Market Making (disabled)')
    }

    console.log('\n✅ Flywheel cycle complete!')
    console.log('═══════════════════════════════════════════════════════════\n')
  } catch (error) {
    console.error('❌ Flywheel cycle failed:', error)
  }
}

// Schedule the flywheel job
export function startFlywheelJob() {
  // Convert interval to cron expression
  // For 1 minute interval: '* * * * *'
  const intervalMinutes = Math.max(1, Math.floor(env.feeCollectionIntervalMs / 60000))

  console.log(`\n🚀 Starting flywheel automation (every ${intervalMinutes} minute(s))`)
  console.log('   Algorithm modes available: simple, smart, rebalance')

  // Run immediately on start
  runFlywheelCycle()

  // Schedule recurring job
  const cronExpression = intervalMinutes === 1
    ? '* * * * *' // Every minute
    : `*/${intervalMinutes} * * * *` // Every N minutes

  cron.schedule(cronExpression, () => {
    runFlywheelCycle()
  })

  console.log('📅 Flywheel job scheduled successfully\n')
}

// Manual trigger for testing
export async function triggerFlywheelCycle() {
  await runFlywheelCycle()
}

// Get status of all services
export function getServiceStatus() {
  return {
    priceAnalyzer: priceAnalyzer.getSummary(),
    twapOrders: twapExecutor.getAllOrders(),
    inventoryManager: {
      history: inventoryManager.getHistory(),
    },
    recentTransactions: recentTransactions.slice(0, 10),
  }
}
