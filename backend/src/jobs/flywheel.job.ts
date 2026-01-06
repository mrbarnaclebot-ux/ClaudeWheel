import cron from 'node-cron'
import { feeCollector } from '../services/fee-collector'
import { marketMaker } from '../services/market-maker'
import { walletMonitor } from '../services/wallet-monitor'
import { priceAnalyzer } from '../services/price-analyzer'
import { twapExecutor } from '../services/twap-executor'
import { inventoryManager } from '../services/inventory-manager'
import { fetchConfig, updateWalletBalance, calculateAndUpdateFeeStats, type FlywheelConfig } from '../config/database'
import { getSolPrice } from '../config/solana'
import { env } from '../config/env'
import type { Transaction } from '../types'

// ═══════════════════════════════════════════════════════════════════════════
// TRADE COOLDOWN TRACKING
// Prevents overtrading by enforcing minimum time between trades
// ═══════════════════════════════════════════════════════════════════════════

let lastBuyTime: Date | null = null
let lastSellTime: Date | null = null
const MIN_TRADE_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes between same-direction trades
const MIN_ANY_TRADE_COOLDOWN_MS = 2 * 60 * 1000 // 2 minutes between any trades

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLE ALGORITHM CYCLE TRACKING
// After 5 buys, sell 20% of tokens 5 times, then repeat
// ═══════════════════════════════════════════════════════════════════════════

let simpleCyclePhase: 'buy' | 'sell' = 'buy'
let simpleBuyCount = 0
let simpleSellCount = 0
const SIMPLE_BUYS_PER_CYCLE = 5
const SIMPLE_SELLS_PER_CYCLE = 5
const SIMPLE_SELL_PERCENT = 20 // Sell 20% of tokens each sell

function canExecuteTrade(type: 'buy' | 'sell'): boolean {
  const now = Date.now()

  // Check any-trade cooldown
  const lastAnyTrade = Math.max(
    lastBuyTime?.getTime() || 0,
    lastSellTime?.getTime() || 0
  )
  if (lastAnyTrade && now - lastAnyTrade < MIN_ANY_TRADE_COOLDOWN_MS) {
    return false
  }

  // Check same-direction cooldown
  if (type === 'buy' && lastBuyTime) {
    if (now - lastBuyTime.getTime() < MIN_TRADE_COOLDOWN_MS) {
      return false
    }
  }
  if (type === 'sell' && lastSellTime) {
    if (now - lastSellTime.getTime() < MIN_TRADE_COOLDOWN_MS) {
      return false
    }
  }

  return true
}

function recordTrade(type: 'buy' | 'sell') {
  if (type === 'buy') lastBuyTime = new Date()
  else lastSellTime = new Date()
}

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

// Simple market making - 5 buys then 5 sells (20% each) cycle
async function runSimpleMarketMaking(config: FlywheelConfig) {
  console.log('\n📈 Market Making: SIMPLE Mode')
  console.log(`   Cycle: ${simpleCyclePhase.toUpperCase()} phase | Buys: ${simpleBuyCount}/${SIMPLE_BUYS_PER_CYCLE} | Sells: ${simpleSellCount}/${SIMPLE_SELLS_PER_CYCLE}`)

  const opsBalance = await walletMonitor.getOpsWalletBalance()
  if (!opsBalance) {
    console.log('   ⚠️ Could not get ops wallet balance')
    return
  }

  // BUY PHASE: Execute buys until we reach 5
  if (simpleCyclePhase === 'buy') {
    // Check if we have enough SOL for a buy
    if (opsBalance.sol_balance < config.min_buy_amount_sol + 0.01) {
      console.log(`   ℹ️ Insufficient SOL for buy (${opsBalance.sol_balance.toFixed(4)} SOL)`)
      return
    }

    // Execute buy
    console.log(`   Executing buy ${simpleBuyCount + 1}/${SIMPLE_BUYS_PER_CYCLE}...`)
    const buyAmount = Math.min(
      opsBalance.sol_balance * 0.15, // Use 15% of SOL balance per buy
      config.max_buy_amount_sol
    )

    const buyResult = await marketMaker.executeBuy(buyAmount)
    if (buyResult) {
      addTransaction(buyResult)
      simpleBuyCount++
      console.log(`   ✅ Buy ${simpleBuyCount}/${SIMPLE_BUYS_PER_CYCLE} complete - ${buyAmount.toFixed(6)} SOL`)

      // Check if we should switch to sell phase
      if (simpleBuyCount >= SIMPLE_BUYS_PER_CYCLE) {
        simpleCyclePhase = 'sell'
        simpleBuyCount = 0
        console.log(`   🔄 Switching to SELL phase (${SIMPLE_SELLS_PER_CYCLE} sells of ${SIMPLE_SELL_PERCENT}% each)`)
      }
    }
  }
  // SELL PHASE: Execute 5 sells of 20% each
  else if (simpleCyclePhase === 'sell') {
    // Check if we have tokens to sell
    if (opsBalance.token_balance <= 0) {
      console.log('   ℹ️ No tokens to sell - switching back to buy phase')
      simpleCyclePhase = 'buy'
      simpleSellCount = 0
      return
    }

    // Execute sell of 20% of current token balance
    console.log(`   Executing sell ${simpleSellCount + 1}/${SIMPLE_SELLS_PER_CYCLE} (${SIMPLE_SELL_PERCENT}% of tokens)...`)
    const sellAmount = opsBalance.token_balance * (SIMPLE_SELL_PERCENT / 100)

    if (sellAmount < 1) {
      console.log('   ℹ️ Token amount too small to sell - switching back to buy phase')
      simpleCyclePhase = 'buy'
      simpleSellCount = 0
      return
    }

    const sellResult = await marketMaker.executeSell(sellAmount, { bypassCap: true })
    if (sellResult) {
      addTransaction(sellResult)
      simpleSellCount++
      console.log(`   ✅ Sell ${simpleSellCount}/${SIMPLE_SELLS_PER_CYCLE} complete - ${sellAmount.toFixed(0)} tokens`)

      // Check if we should switch back to buy phase
      if (simpleSellCount >= SIMPLE_SELLS_PER_CYCLE) {
        simpleCyclePhase = 'buy'
        simpleSellCount = 0
        console.log(`   🔄 Cycle complete! Switching back to BUY phase (${SIMPLE_BUYS_PER_CYCLE} buys)`)
      }
    }
  }
}

// Smart market making - uses advanced price analysis with Bollinger Bands, volatility, and RSI
async function runSmartMarketMaking(config: FlywheelConfig) {
  console.log('\n📈 Market Making: SMART Mode (Enhanced)')

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

  // Get comprehensive trading signals
  const signals = priceAnalyzer.getTradingSignals()
  const optimalSignal = priceAnalyzer.getOptimalSignal()
  const bollingerPosition = priceAnalyzer.isNearBollingerBand()

  if (!signals.trend) {
    console.log('   ℹ️ Not enough data for trend analysis, falling back to simple mode')
    await runSimpleMarketMaking(config)
    return
  }

  // Display enhanced analytics
  console.log(`   Trend: ${signals.trend.trend.toUpperCase()} (strength: ${signals.trend.strength.toFixed(0)})`)
  console.log(`   RSI: ${signals.trend.rsi.toFixed(1)}`)
  if (signals.volatility) {
    console.log(`   Volatility: ${signals.volatility.volatility.toFixed(2)}% ${signals.volatility.isHighVolatility ? '⚠️ HIGH' : '✓ Normal'}`)
    console.log(`   Bollinger: $${signals.volatility.bollingerLower.toFixed(8)} - $${signals.volatility.bollingerUpper.toFixed(8)}`)
  }
  console.log(`   Price vs MA: ${signals.priceVsMA.toUpperCase()}`)
  console.log(`   Momentum: ${signals.momentumStrength.toFixed(0)}`)
  console.log(`   Optimal Signal: ${optimalSignal.action.toUpperCase()} (confidence: ${optimalSignal.confidence.toFixed(0)}%)`)
  if (optimalSignal.reasons.length > 0) {
    console.log(`   Reasons: ${optimalSignal.reasons.join(', ')}`)
  }
  console.log(`   Suggested Slippage: ${signals.suggestedSlippageBps} bps`)
  console.log(`   Suggested Position: ${signals.suggestedPositionSizePct.toFixed(1)}%`)

  const opsBalance = await walletMonitor.getOpsWalletBalance()
  if (!opsBalance) {
    console.log('   ⚠️ Could not get ops wallet balance')
    return
  }

  const solPrice = await getSolPrice()

  // Determine action based on optimal signal
  const shouldBuy = optimalSignal.action === 'strong_buy' || optimalSignal.action === 'buy'
  const shouldSell = optimalSignal.action === 'strong_sell' || optimalSignal.action === 'sell'
  const minConfidence = optimalSignal.action.includes('strong') ? 40 : 50

  // Execute based on optimal signal with enhanced logic
  if (shouldBuy && optimalSignal.confidence >= minConfidence) {
    // Check cooldown
    if (!canExecuteTrade('buy')) {
      console.log('   ⏳ Buy cooldown active - skipping')
      return
    }

    if (opsBalance.sol_balance > config.min_buy_amount_sol + 0.01) {
      // Use volatility-adjusted position sizing
      const buyAmount = Math.min(
        priceAnalyzer.calculatePositionSize(opsBalance.sol_balance, config.max_buy_amount_sol / opsBalance.sol_balance * 100),
        config.max_buy_amount_sol
      )

      // Skip if volatility is too high and signal isn't strong
      if (signals.volatility?.isHighVolatility && optimalSignal.action !== 'strong_buy') {
        console.log('   ⚠️ High volatility detected - reducing position or waiting')
        return
      }

      console.log(`   Executing smart buy (${optimalSignal.action}, confidence: ${optimalSignal.confidence.toFixed(0)}%)...`)

      // Use TWAP for larger orders
      const estimatedUsd = buyAmount * solPrice
      if (config.use_twap && estimatedUsd > config.twap_threshold_usd) {
        await twapExecutor.createBuyOrder(buyAmount, {
          numSlices: signals.volatility?.isHighVolatility ? 5 : 3,
          durationMinutes: signals.volatility?.isHighVolatility ? 20 : 10,
        })
        console.log(`   ✅ TWAP buy order created for ${buyAmount.toFixed(4)} SOL`)
        recordTrade('buy')
      } else {
        const buyResult = await marketMaker.executeBuy(buyAmount)
        if (buyResult) {
          addTransaction(buyResult)
          recordTrade('buy')
          console.log(`   ✅ Bought tokens with ${buyAmount.toFixed(6)} SOL`)
        }
      }
    } else {
      console.log('   ℹ️ Insufficient SOL for buy')
    }
  } else if (shouldSell && optimalSignal.confidence >= minConfidence) {
    // Check cooldown
    if (!canExecuteTrade('sell')) {
      console.log('   ⏳ Sell cooldown active - skipping')
      return
    }

    if (opsBalance.token_balance > env.maxSellAmountTokens * 0.5) {
      // Use volatility-adjusted position sizing for sells
      const baseAmount = opsBalance.token_balance * (signals.suggestedPositionSizePct / 100)
      const sellAmount = Math.min(baseAmount, env.maxSellAmountTokens)

      // Skip if volatility is too high and signal isn't strong
      if (signals.volatility?.isHighVolatility && optimalSignal.action !== 'strong_sell') {
        console.log('   ⚠️ High volatility detected - waiting for better conditions')
        return
      }

      console.log(`   Executing smart sell (${optimalSignal.action}, confidence: ${optimalSignal.confidence.toFixed(0)}%)...`)

      // Use TWAP for larger orders
      const estimatedUsd = sellAmount * priceData.price
      if (config.use_twap && estimatedUsd > config.twap_threshold_usd) {
        await twapExecutor.createSellOrder(sellAmount, {
          numSlices: signals.volatility?.isHighVolatility ? 5 : 3,
          durationMinutes: signals.volatility?.isHighVolatility ? 20 : 10,
        })
        console.log(`   ✅ TWAP sell order created for ${sellAmount.toFixed(0)} tokens`)
        recordTrade('sell')
      } else {
        const sellResult = await marketMaker.executeSell(sellAmount)
        if (sellResult) {
          addTransaction(sellResult)
          recordTrade('sell')
          console.log(`   ✅ Sold ${sellResult.amount.toFixed(0)} tokens`)
        }
      }
    } else {
      console.log('   ℹ️ Insufficient tokens for sell')
    }
  } else {
    console.log(`   ℹ️ Holding position (${optimalSignal.action}, confidence: ${optimalSignal.confidence.toFixed(0)}%)`)
    if (bollingerPosition === 'middle') {
      console.log('   💡 Price in middle of Bollinger Bands - waiting for better entry')
    }
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
    simpleCycleStatus: {
      phase: simpleCyclePhase,
      buyCount: simpleBuyCount,
      sellCount: simpleSellCount,
      buysPerCycle: SIMPLE_BUYS_PER_CYCLE,
      sellsPerCycle: SIMPLE_SELLS_PER_CYCLE,
      sellPercentage: SIMPLE_SELL_PERCENT,
    },
  }
}
