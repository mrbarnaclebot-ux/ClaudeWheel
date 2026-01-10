import { Router, Request, Response } from 'express'
import { env } from '../config/env'
import { supabase } from '../config/database'
import { connection, getDevWallet, getOpsWallet } from '../config/solana'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
import type { ApiResponse, FlywheelStatus } from '../types'
import { loggers } from '../utils/logger'
import { getMultiUserFlywheelJobStatus } from '../jobs/multi-flywheel.job'
import { getWheelFlywheelJobStatus } from '../jobs/wheel-flywheel.job'

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

// ═══════════════════════════════════════════════════════════════════════════
// WHEEL TOKEN STATUS (Public - Live Solana Data)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/status/wheel - Get LIVE WHEEL token data from Solana
router.get('/wheel', async (_req: Request, res: Response) => {
  try {
    const tokenMint = new PublicKey(env.tokenMintAddress)

    // Get wallet keypairs
    const devWalletKeypair = getDevWallet()
    const opsWalletKeypair = getOpsWallet()

    // Get wallet addresses
    const devWalletAddress = devWalletKeypair?.publicKey?.toBase58() || env.devWalletAddress || ''
    const opsWalletAddress = opsWalletKeypair?.publicKey?.toBase58() || ''

    if (!devWalletAddress || !opsWalletAddress) {
      return res.json({
        success: false,
        error: 'Wallet configuration missing',
        timestamp: new Date().toISOString(),
      })
    }

    const devPubkey = new PublicKey(devWalletAddress)
    const opsPubkey = new PublicKey(opsWalletAddress)

    // Fetch SOL balances in parallel
    const [devSolBalance, opsSolBalance] = await Promise.all([
      connection.getBalance(devPubkey),
      connection.getBalance(opsPubkey),
    ])

    // Fetch token balances
    let devTokenBalance = 0
    let opsTokenBalance = 0

    try {
      const devTokenAccount = await getAssociatedTokenAddress(tokenMint, devPubkey)
      const devTokenInfo = await getAccount(connection, devTokenAccount)
      devTokenBalance = Number(devTokenInfo.amount) / Math.pow(10, env.tokenDecimals)
    } catch {
      // Token account doesn't exist or is empty
    }

    try {
      const opsTokenAccount = await getAssociatedTokenAddress(tokenMint, opsPubkey)
      const opsTokenInfo = await getAccount(connection, opsTokenAccount)
      opsTokenBalance = Number(opsTokenInfo.amount) / Math.pow(10, env.tokenDecimals)
    } catch {
      // Token account doesn't exist or is empty
    }

    // Get flywheel status
    const wheelFlywheelStatus = getWheelFlywheelJobStatus()
    const multiFlywheelStatus = getMultiUserFlywheelJobStatus()

    // Get fee stats from Supabase (if available)
    let totalFeesCollected = 0
    let todayFeesCollected = 0
    let hourFeesCollected = 0

    if (supabase) {
      try {
        const { data: feeStats } = await supabase
          .from('fee_stats')
          .select('*')
          .eq('id', 'main')
          .single()

        if (feeStats) {
          totalFeesCollected = feeStats.total_collected || 0
          todayFeesCollected = feeStats.today_collected || 0
          hourFeesCollected = feeStats.hour_collected || 0
        }
      } catch {
        // Fee stats table might not exist or be empty
      }
    }

    // Get recent transactions count from Supabase
    let recentTransactionsCount = 0
    if (supabase) {
      try {
        const { count } = await supabase
          .from('transactions')
          .select('*', { count: 'exact', head: true })
        recentTransactionsCount = count || 0
      } catch {
        // Transactions table might not exist
      }
    }

    res.json({
      success: true,
      data: {
        token: {
          mintAddress: env.tokenMintAddress,
          symbol: env.tokenSymbol,
          decimals: env.tokenDecimals,
        },
        wallets: {
          dev: {
            address: devWalletAddress,
            solBalance: devSolBalance / LAMPORTS_PER_SOL,
            tokenBalance: devTokenBalance,
          },
          ops: {
            address: opsWalletAddress,
            solBalance: opsSolBalance / LAMPORTS_PER_SOL,
            tokenBalance: opsTokenBalance,
          },
        },
        feeStats: {
          totalCollected: totalFeesCollected,
          todayCollected: todayFeesCollected,
          hourCollected: hourFeesCollected,
        },
        flywheel: {
          isActive: wheelFlywheelStatus.flywheelRunning || multiFlywheelStatus.running,
          wheelJobRunning: wheelFlywheelStatus.flywheelRunning,
          multiUserJobRunning: multiFlywheelStatus.running,
          lastRunAt: wheelFlywheelStatus.mmStatus.lastRunAt || multiFlywheelStatus.lastRunAt || null,
        },
        transactionsCount: recentTransactionsCount,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    loggers.server.error({ error: error.message }, 'Failed to fetch WHEEL status')
    res.status(500).json({
      success: false,
      error: 'Failed to fetch WHEEL token status',
      timestamp: new Date().toISOString(),
    })
  }
})

export default router
