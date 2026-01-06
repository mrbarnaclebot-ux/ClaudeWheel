import { Router, Request, Response } from 'express'
import { walletMonitor } from '../services/wallet-monitor'
import { feeCollector } from '../services/fee-collector'
import { marketMaker } from '../services/market-maker'
import { getRecentTransactions } from '../jobs/flywheel.job'
import type { ApiResponse, FlywheelStatus } from '../types'

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// STATUS ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/status - Get flywheel status
router.get('/', async (req: Request, res: Response) => {
  try {
    const balances = await walletMonitor.getAllBalances()
    const feeStats = feeCollector.getStats()
    const mmStats = marketMaker.getStats()

    const status: FlywheelStatus = {
      is_active: mmStats.isEnabled,
      last_fee_collection: feeStats.lastCollectionTime,
      last_market_making: mmStats.lastOrderTime,
      dev_wallet_balance: balances.devWallet?.sol_balance || 0,
      ops_wallet_balance: balances.opsWallet?.sol_balance || 0,
      total_fees_collected: feeStats.totalCollected,
    }

    const response: ApiResponse<FlywheelStatus> = {
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    }

    res.json(response)
  } catch (error) {
    console.error('Status fetch error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch status',
      timestamp: new Date().toISOString(),
    })
  }
})

// GET /api/status/wallets - Get wallet balances
router.get('/wallets', async (req: Request, res: Response) => {
  try {
    const balances = await walletMonitor.getAllBalances()

    res.json({
      success: true,
      data: balances,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Wallet balance fetch error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch wallet balances',
      timestamp: new Date().toISOString(),
    })
  }
})

// GET /api/status/transactions - Get recent transactions
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)
    const transactions = getRecentTransactions().slice(0, limit)

    res.json({
      success: true,
      data: transactions,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Transactions fetch error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transactions',
      timestamp: new Date().toISOString(),
    })
  }
})

// GET /api/status/health - Health check
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
    timestamp: new Date().toISOString(),
  })
})

export default router
