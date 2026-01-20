import { Router, Request, Response } from 'express'
import { env } from '../config/env'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { connection } from '../config/solana'
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { getAssociatedTokenAddress, getAccount } from '@solana/spl-token'
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

  // Check Prisma/Postgres connection
  try {
    if (isPrismaConfigured()) {
      const start = Date.now()
      await prisma.$queryRaw`SELECT 1`
      const latency = Date.now() - start
      checks.push({ name: 'Postgres (Prisma)', status: 'connected', message: 'Database connected', latency })
    } else {
      checks.push({ name: 'Postgres (Prisma)', status: 'not_configured', message: 'PRIVY_DATABASE_URL not set' })
    }
  } catch (error: any) {
    checks.push({ name: 'Postgres (Prisma)', status: 'disconnected', message: error.message || 'Connection failed' })
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

  // Check wallet configurations (legacy - now uses Privy delegated signing)
  if (process.env.DEV_WALLET_PRIVATE_KEY) {
    checks.push({ name: 'Dev Wallet', status: 'connected', message: 'WHEEL dev wallet configured' })
  } else {
    checks.push({ name: 'Dev Wallet', status: 'not_configured', message: 'Using Privy delegated signing' })
  }

  if (process.env.OPS_WALLET_PRIVATE_KEY) {
    checks.push({ name: 'Ops Wallet', status: 'connected', message: 'WHEEL ops wallet configured' })
  } else {
    checks.push({ name: 'Ops Wallet', status: 'not_configured', message: 'Using Privy delegated signing' })
  }

  // Environment info (non-sensitive)
  const envInfo = {
    nodeEnv: env.nodeEnv,
    port: env.port,
    solanaRpcUrl: env.solanaRpcUrl.replace(/api-key=[\w-]+/gi, 'api-key=***'),
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

// GET /api/status/platform-stats - Get platform-wide token statistics
router.get('/platform-stats', async (_req: Request, res: Response) => {
  try {
    // Initialize counters
    let launchedCount = 0
    let registeredCount = 0
    let mmOnlyCount = 0
    let totalActiveFlywheels = 0
    let totalUsers = 0
    let totalSolVolume = 0
    let totalFeesCollected = 0

    // Fetch from Prisma (Privy system)
    try {
      // Count launched tokens from Privy
      const privyLaunched = await prisma.privyPendingLaunch.count({
        where: { status: 'launched' }
      })
      launchedCount += privyLaunched

      // Also count tokens with source = 'launched'
      const privyLaunchedTokens = await prisma.privyUserToken.count({
        where: { tokenSource: 'launched', isActive: true }
      })
      // Avoid double counting - only add if not already in pending launches
      if (privyLaunchedTokens > privyLaunched) {
        launchedCount += (privyLaunchedTokens - privyLaunched)
      }

      // Count registered tokens
      const privyRegistered = await prisma.privyUserToken.count({
        where: { tokenSource: 'registered', isActive: true }
      })
      registeredCount += privyRegistered

      // Count MM-only tokens
      const privyMmOnly = await prisma.privyUserToken.count({
        where: { tokenSource: 'mm_only', isActive: true }
      })
      // Also count from PrivyMmPending
      const privyMmPending = await prisma.privyMmPending.count({
        where: { status: 'active' }
      })
      mmOnlyCount += privyMmOnly + privyMmPending

      // Count Privy users
      const privyUsers = await prisma.privyUser.count()
      totalUsers += privyUsers

      // Count active flywheels in Privy
      const privyActiveFlywheels = await prisma.privyTokenConfig.count({
        where: { flywheelActive: true }
      })
      totalActiveFlywheels += privyActiveFlywheels

      // Get Privy claim history for volume
      const privyClaims = await prisma.privyClaimHistory.aggregate({
        _sum: { totalAmountSol: true }
      })
      totalFeesCollected += Number(privyClaims._sum.totalAmountSol || 0)

      // Get transaction volume (only sum SOL from 'buy' and 'transfer' types)
      // 'buy' amount is in SOL, 'sell' amount is in tokens (can't sum together)
      const privyTxVolume = await prisma.privyTransaction.aggregate({
        where: { type: { in: ['buy', 'transfer'] } },
        _sum: { amount: true }
      })
      totalSolVolume += Number(privyTxVolume._sum.amount || 0)
    } catch (e) {
      loggers.server.warn('Failed to fetch Privy platform stats')
    }

    res.json({
      success: true,
      data: {
        tokens: {
          launched: launchedCount,
          registered: registeredCount,
          mmOnly: mmOnlyCount,
          total: launchedCount + registeredCount + mmOnlyCount,
          activeFlywheels: totalActiveFlywheels,
        },
        users: {
          total: totalUsers,
        },
        volume: {
          totalSol: totalSolVolume,
          totalFeesCollected: totalFeesCollected,
        },
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    loggers.server.error({ error: error.message }, 'Failed to fetch platform stats')
    res.status(500).json({
      success: false,
      error: 'Failed to fetch platform statistics',
      timestamp: new Date().toISOString(),
    })
  }
})

// GET /api/status/wheel - Get LIVE WHEEL token data from Solana
// WHEEL is now a regular Privy token with tokenSource='platform'
router.get('/wheel', async (_req: Request, res: Response) => {
  try {
    // Get WHEEL token from Prisma (platform token)
    const wheelToken = await prisma.privyUserToken.findFirst({
      where: { tokenSource: 'platform' },
      include: {
        devWallet: true,
        opsWallet: true,
        config: true,
      },
    })

    if (!wheelToken) {
      return res.json({
        success: false,
        error: 'WHEEL platform token not found in database',
        timestamp: new Date().toISOString(),
      })
    }

    const tokenMint = new PublicKey(wheelToken.tokenMintAddress)
    const devWalletAddress = wheelToken.devWallet.walletAddress
    const opsWalletAddress = wheelToken.opsWallet.walletAddress
    const tokenDecimals = wheelToken.tokenDecimals

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
      devTokenBalance = Number(devTokenInfo.amount) / Math.pow(10, tokenDecimals)
    } catch {
      // Token account doesn't exist or is empty
    }

    try {
      const opsTokenAccount = await getAssociatedTokenAddress(tokenMint, opsPubkey)
      const opsTokenInfo = await getAccount(connection, opsTokenAccount)
      opsTokenBalance = Number(opsTokenInfo.amount) / Math.pow(10, tokenDecimals)
    } catch {
      // Token account doesn't exist or is empty
    }

    // Get flywheel status (WHEEL is now processed by multi-user flywheel)
    const multiFlywheelStatus = getMultiUserFlywheelJobStatus()

    // Get fee stats from Prisma
    let totalFeesCollected = 0
    let todayFeesCollected = 0
    let recentTransactionsCount = 0

    try {
      // Total fees collected for WHEEL token
      const claimStats = await prisma.privyClaimHistory.aggregate({
        where: { privyTokenId: wheelToken.id },
        _sum: { totalAmountSol: true }
      })
      totalFeesCollected = Number(claimStats._sum.totalAmountSol || 0)

      // Today's fees collected
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayClaimStats = await prisma.privyClaimHistory.aggregate({
        where: { privyTokenId: wheelToken.id, claimedAt: { gte: todayStart } },
        _sum: { totalAmountSol: true }
      })
      todayFeesCollected = Number(todayClaimStats._sum.totalAmountSol || 0)

      // Transaction count for WHEEL
      recentTransactionsCount = await prisma.privyTransaction.count({
        where: { privyTokenId: wheelToken.id }
      })
    } catch {
      // Prisma stats might not be available
    }

    res.json({
      success: true,
      data: {
        token: {
          id: wheelToken.id,
          mintAddress: wheelToken.tokenMintAddress,
          symbol: wheelToken.tokenSymbol,
          decimals: tokenDecimals,
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
        },
        flywheel: {
          isActive: wheelToken.config?.flywheelActive || false,
          multiUserJobRunning: multiFlywheelStatus.running,
          lastRunAt: multiFlywheelStatus.lastRunAt || null,
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

// GET /api/status/public-tokens - Get public list of platform tokens for showcase
router.get('/public-tokens', async (_req: Request, res: Response) => {
  try {
    // Fetch active tokens from Privy system (exclude platform token like WHEEL)
    const tokens = await prisma.privyUserToken.findMany({
      where: {
        isActive: true,
        tokenSource: { in: ['launched', 'registered', 'mm_only'] },
      },
      include: {
        config: {
          select: {
            flywheelActive: true,
            algorithmMode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Limit to 50 most recent tokens
    })

    // Map to public-safe data (no wallet addresses, no sensitive info)
    // Deduplicate by mint address (keep the most recent entry)
    const seenMints = new Set<string>()
    const publicTokens = tokens
      .filter((token) => {
        if (seenMints.has(token.tokenMintAddress)) {
          return false
        }
        seenMints.add(token.tokenMintAddress)
        return true
      })
      .map((token) => ({
        id: token.id,
        name: token.tokenName,
        symbol: token.tokenSymbol,
        image: token.tokenImage,
        mint: token.tokenMintAddress,
        source: token.tokenSource,
        isActive: token.config?.flywheelActive || false,
        algorithm: token.config?.algorithmMode || 'simple',
        createdAt: token.createdAt,
      }))

    res.json({
      success: true,
      data: {
        tokens: publicTokens,
        total: publicTokens.length,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    loggers.server.error({ error: error.message }, 'Failed to fetch public tokens')
    res.status(500).json({
      success: false,
      error: 'Failed to fetch public tokens',
      timestamp: new Date().toISOString(),
    })
  }
})

export default router
