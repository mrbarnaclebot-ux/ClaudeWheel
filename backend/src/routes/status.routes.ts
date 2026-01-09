import { Router, Request, Response } from 'express'
import { env } from '../config/env'
import { supabase } from '../config/database'
import { connection } from '../config/solana'
import type { ApiResponse, FlywheelStatus } from '../types'
import { loggers } from '../utils/logger'
import { getMultiUserFlywheelJobStatus } from '../jobs/multi-flywheel.job'

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// STATUS ROUTES (Multi-user mode)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/status - Get platform status
router.get('/', async (req: Request, res: Response) => {
  try {
    const flywheelStatus = getMultiUserFlywheelJobStatus()

    const status: FlywheelStatus = {
      is_active: flywheelStatus.running,
      last_fee_collection: null,
      last_market_making: flywheelStatus.lastRunAt || null,
      dev_wallet_balance: 0,
      ops_wallet_balance: 0,
      total_fees_collected: 0,
    }

    const response: ApiResponse<FlywheelStatus> = {
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    }

    res.json(response)
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Status fetch error')
    res.status(500).json({
      success: false,
      error: 'Failed to fetch status',
      timestamp: new Date().toISOString(),
    })
  }
})

// GET /api/status/wallets - Get wallet balances (deprecated - use user-specific endpoints)
router.get('/wallets', async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      message: 'This endpoint is deprecated. Use /api/user/tokens/:tokenId for token-specific wallet data.',
    },
    timestamp: new Date().toISOString(),
  })
})

// GET /api/status/transactions - Get recent transactions (deprecated)
router.get('/transactions', async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: [],
    message: 'Use /api/user/tokens/:tokenId/claims for token-specific transaction history.',
    timestamp: new Date().toISOString(),
  })
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

// GET /api/status/logs - Get recent backend logs (deprecated - use structured logging)
router.get('/logs', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: [],
    message: 'In-memory logs are deprecated. Use structured logging with pino and external log aggregation.',
    timestamp: new Date().toISOString(),
  })
})

export default router
