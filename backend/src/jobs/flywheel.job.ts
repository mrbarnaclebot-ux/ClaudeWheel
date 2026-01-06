import cron from 'node-cron'
import { feeCollector } from '../services/fee-collector'
import { marketMaker } from '../services/market-maker'
import { walletMonitor } from '../services/wallet-monitor'
import { env } from '../config/env'
import type { Transaction } from '../types'

// ═══════════════════════════════════════════════════════════════════════════
// FLYWHEEL JOB
// Main automation loop that runs the flywheel:
// 1. Collect fees from dev wallet
// 2. Transfer to ops wallet
// 3. Execute market making orders
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

// Main flywheel cycle
async function runFlywheelCycle() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('🔄 Running flywheel cycle...')
  console.log('═══════════════════════════════════════════════════════════\n')

  try {
    // Step 1: Get current balances
    const balances = await walletMonitor.getAllBalances()
    console.log('📊 Current balances:')
    if (balances.devWallet) {
      console.log(`   Dev: ${balances.devWallet.sol_balance.toFixed(6)} SOL`)
    }
    if (balances.opsWallet) {
      console.log(`   Ops: ${balances.opsWallet.sol_balance.toFixed(6)} SOL, ${balances.opsWallet.token_balance.toFixed(0)} tokens`)
    }

    // Step 2: Collect fees from dev wallet
    console.log('\n📥 Step 1: Fee Collection')
    const feeCollectionResult = await feeCollector.collectFees()
    if (feeCollectionResult) {
      addTransaction(feeCollectionResult)
      console.log(`   ✅ Collected ${feeCollectionResult.amount.toFixed(6)} SOL`)
    } else {
      console.log('   ℹ️ No fees to collect')
    }

    // Step 3: Market making (if enabled)
    if (env.marketMakingEnabled) {
      console.log('\n📈 Step 2: Market Making')

      // Get ops wallet balance after fee collection
      const opsBalance = await walletMonitor.getOpsWalletBalance()

      if (opsBalance && opsBalance.sol_balance > env.maxBuyAmountSol + 0.01) {
        // We have SOL - execute a buy
        console.log('   Executing buy order...')
        const buyAmount = Math.min(
          opsBalance.sol_balance * 0.1, // Use 10% of balance
          env.maxBuyAmountSol
        )
        const buyResult = await marketMaker.executeBuy(buyAmount)
        if (buyResult) {
          addTransaction(buyResult)
          console.log(`   ✅ Bought ${buyResult.amount.toFixed(0)} CLAUDE tokens`)
        }
      } else if (opsBalance && opsBalance.token_balance > env.maxSellAmountTokens * 2) {
        // We have excess tokens - execute a sell
        console.log('   Executing sell order...')
        const sellAmount = Math.min(
          opsBalance.token_balance * 0.05, // Sell 5% of holdings
          env.maxSellAmountTokens
        )
        const sellResult = await marketMaker.executeSell(sellAmount)
        if (sellResult) {
          addTransaction(sellResult)
          console.log(`   ✅ Sold ${sellResult.amount.toFixed(0)} CLAUDE tokens`)
        }
      } else {
        console.log('   ℹ️ No market making action needed')
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
