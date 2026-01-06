import { Router, Request, Response } from 'express'
import { walletMonitor } from '../services/wallet-monitor'
import { feeCollector } from '../services/fee-collector'
import { marketMaker } from '../services/market-maker'
import { getRecentTransactions, getRecentLogs } from '../jobs/flywheel.job'
import { env } from '../config/env'
import { supabase } from '../config/database'
import { connection } from '../config/solana'
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

// GET /api/status/system - Comprehensive system status
router.get('/system', async (req: Request, res: Response) => {
  const checks: {
    name: string
    status: 'connected' | 'disconnected' | 'not_configured'
    message: string
    latency?: number
  }[] = []

  // Check Supabase connection
  try {
    if (supabase && env.supabaseUrl && env.supabaseServiceKey) {
      const start = Date.now()
      const { error } = await supabase.from('config').select('id').limit(1)
      const latency = Date.now() - start
      if (error) {
        checks.push({ name: 'Supabase', status: 'disconnected', message: error.message, latency })
      } else {
        checks.push({ name: 'Supabase', status: 'connected', message: 'Database connected', latency })
      }
    } else {
      checks.push({ name: 'Supabase', status: 'not_configured', message: 'SUPABASE_URL or SUPABASE_SERVICE_KEY not set' })
    }
  } catch (error: any) {
    checks.push({ name: 'Supabase', status: 'disconnected', message: error.message || 'Connection failed' })
  }

  // Check Solana RPC connection
  try {
    const start = Date.now()
    const slot = await connection.getSlot()
    const latency = Date.now() - start
    checks.push({ name: 'Solana RPC', status: 'connected', message: `Slot: ${slot}`, latency })
  } catch (error: any) {
    checks.push({ name: 'Solana RPC', status: 'disconnected', message: error.message || 'RPC connection failed' })
  }

  // Check wallet configurations
  if (env.devWalletPrivateKey) {
    checks.push({ name: 'Dev Wallet', status: 'connected', message: 'Private key configured' })
  } else {
    checks.push({ name: 'Dev Wallet', status: 'not_configured', message: 'DEV_WALLET_PRIVATE_KEY not set' })
  }

  if (env.opsWalletPrivateKey) {
    checks.push({ name: 'Ops Wallet', status: 'connected', message: 'Private key configured' })
  } else {
    checks.push({ name: 'Ops Wallet', status: 'not_configured', message: 'OPS_WALLET_PRIVATE_KEY not set' })
  }

  // Environment info (non-sensitive)
  const envInfo = {
    nodeEnv: env.nodeEnv,
    port: env.port,
    solanaRpcUrl: env.solanaRpcUrl.replace(/api-key=[\w-]+/gi, 'api-key=***'),
    jupiterApiUrl: env.jupiterApiUrl,
    marketMakingEnabled: env.marketMakingEnabled,
    minFeeThresholdSol: env.minFeeThresholdSol,
    maxBuyAmountSol: env.maxBuyAmountSol,
  }

  res.json({
    success: true,
    data: {
      checks,
      environment: envInfo,
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
    },
    timestamp: new Date().toISOString(),
  })
})

// GET /api/status/logs - Get recent backend logs
router.get('/logs', (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const logs = getRecentLogs(limit)

    res.json({
      success: true,
      data: logs,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Logs fetch error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch logs',
      timestamp: new Date().toISOString(),
    })
  }
})

export default router
