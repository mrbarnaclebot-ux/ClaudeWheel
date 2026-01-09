import { Router, Request, Response, NextFunction } from 'express'
import { privyService } from '../services/privy.service'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { loggers } from '../utils/logger'
import { z } from 'zod'

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// PRIVY TOKEN LAUNCH ROUTES
// Handle pending token launches for TMA users
// ═══════════════════════════════════════════════════════════════════════════

// Extend Request type with privyUserId
interface PrivyRequest extends Request {
  privyUserId?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Middleware to verify Privy auth token
 */
async function authMiddleware(req: PrivyRequest, res: Response, next: NextFunction) {
  try {
    if (!privyService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Privy is not configured',
      })
    }

    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing auth token',
      })
    }

    const authToken = authHeader.substring(7)
    const { valid, userId } = await privyService.verifyAuthToken(authToken)

    if (!valid || !userId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid auth token',
      })
    }

    req.privyUserId = userId
    next()
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Auth middleware error')
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
    })
  }
}

// Apply auth middleware to all routes
router.use(authMiddleware)

// ═══════════════════════════════════════════════════════════════════════════
// LAUNCH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Validation schema for creating a launch
const createLaunchSchema = z.object({
  name: z.string().min(1, 'Token name required').max(100),
  symbol: z.string().min(1, 'Token symbol required').max(20),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  twitter: z.string().url().optional().or(z.literal('')),
  telegram: z.string().url().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  discord: z.string().url().optional().or(z.literal('')),
})

// Default minimum deposit in SOL
const MIN_DEPOSIT_SOL = 0.5
// Launch expiry in hours
const LAUNCH_EXPIRY_HOURS = 24

/**
 * POST /api/privy/launches
 * Create a pending token launch
 */
router.post('/', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    // Validate request body
    const validation = createLaunchSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      })
    }

    const { name, symbol, description, imageUrl, twitter, telegram, website, discord } = validation.data

    // Get user's wallets
    const wallets = await privyService.getUserWallets(req.privyUserId!)
    if (!wallets || wallets.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'User wallets not found. Complete onboarding first.',
      })
    }

    const devWallet = wallets.find((w: any) => w.walletType === 'dev' || w.wallet_type === 'dev')
    const opsWallet = wallets.find((w: any) => w.walletType === 'ops' || w.wallet_type === 'ops')

    if (!devWallet || !opsWallet) {
      return res.status(400).json({
        success: false,
        error: 'Both dev and ops wallets required. Complete onboarding first.',
      })
    }

    // Check for existing pending launch
    const existing = await prisma.privyPendingLaunch.findFirst({
      where: {
        privyUserId: req.privyUserId,
        status: 'awaiting_deposit',
      },
      select: {
        id: true,
        tokenSymbol: true,
        depositAddress: true,
      },
    })

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'You already have a pending launch. Complete or cancel it first.',
        data: {
          pendingLaunchId: existing.id,
          tokenSymbol: existing.tokenSymbol,
          depositAddress: existing.depositAddress,
        },
      })
    }

    // Create pending launch
    const expiresAt = new Date(Date.now() + LAUNCH_EXPIRY_HOURS * 60 * 60 * 1000)

    const launch = await prisma.privyPendingLaunch.create({
      data: {
        privyUserId: req.privyUserId!,
        tokenName: name,
        tokenSymbol: symbol.toUpperCase(),
        tokenDescription: description || null,
        tokenImageUrl: imageUrl || null,
        twitterUrl: twitter || null,
        telegramUrl: telegram || null,
        websiteUrl: website || null,
        discordUrl: discord || null,
        devWalletId: devWallet.id,
        opsWalletId: opsWallet.id,
        depositAddress: devWallet.walletAddress,
        minDepositSol: MIN_DEPOSIT_SOL,
        expiresAt,
      },
    })

    loggers.privy.info({
      launchId: launch.id,
      symbol: launch.tokenSymbol,
      privyUserId: req.privyUserId,
      depositAddress: devWallet.walletAddress,
    }, 'Pending launch created')

    res.status(201).json({
      success: true,
      data: {
        launch: {
          id: launch.id,
          name: launch.tokenName,
          symbol: launch.tokenSymbol,
          description: launch.tokenDescription,
          status: launch.status,
          createdAt: launch.createdAt,
          expiresAt: launch.expiresAt,
        },
        depositAddress: devWallet.walletAddress,
        minDeposit: MIN_DEPOSIT_SOL,
        expiresAt: expiresAt.toISOString(),
      },
      message: `Pending launch created for ${launch.tokenSymbol}. Send at least ${MIN_DEPOSIT_SOL} SOL to ${devWallet.walletAddress} to launch.`,
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error creating launch')
    res.status(500).json({
      success: false,
      error: 'Failed to create launch',
    })
  }
})

/**
 * GET /api/privy/launches/pending
 * Get user's pending launch
 */
router.get('/pending', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const launch = await prisma.privyPendingLaunch.findFirst({
      where: {
        privyUserId: req.privyUserId,
        status: 'awaiting_deposit',
      },
      include: {
        devWallet: {
          select: { walletAddress: true },
        },
        opsWallet: {
          select: { walletAddress: true },
        },
      },
    })

    if (!launch) {
      return res.json({
        success: true,
        data: null,
        message: 'No pending launch',
      })
    }

    // Check if expired
    if (new Date(launch.expiresAt) < new Date()) {
      // Mark as expired
      await prisma.privyPendingLaunch.update({
        where: { id: launch.id },
        data: { status: 'expired' },
      })

      return res.json({
        success: true,
        data: null,
        message: 'Pending launch has expired',
      })
    }

    res.json({
      success: true,
      data: {
        id: launch.id,
        name: launch.tokenName,
        symbol: launch.tokenSymbol,
        description: launch.tokenDescription,
        imageUrl: launch.tokenImageUrl,
        twitter: launch.twitterUrl,
        telegram: launch.telegramUrl,
        website: launch.websiteUrl,
        discord: launch.discordUrl,
        status: launch.status,
        depositAddress: launch.depositAddress,
        minDeposit: Number(launch.minDepositSol),
        expiresAt: launch.expiresAt,
        createdAt: launch.createdAt,
        retryCount: launch.retryCount,
        lastError: launch.lastError,
      },
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error getting pending launch')
    res.status(500).json({
      success: false,
      error: 'Failed to get pending launch',
    })
  }
})

/**
 * GET /api/privy/launches/history
 * Get user's launch history
 */
router.get('/history', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100)

    const launches = await prisma.privyPendingLaunch.findMany({
      where: {
        privyUserId: req.privyUserId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    })

    res.json({
      success: true,
      data: launches.map(launch => ({
        id: launch.id,
        name: launch.tokenName,
        symbol: launch.tokenSymbol,
        status: launch.status,
        tokenMintAddress: launch.tokenMintAddress,
        launchedAt: launch.launchedAt,
        createdAt: launch.createdAt,
      })),
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error getting launch history')
    res.status(500).json({
      success: false,
      error: 'Failed to get launch history',
    })
  }
})

/**
 * DELETE /api/privy/launches/:id
 * Cancel a pending launch
 */
router.delete('/:id', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const { id } = req.params

    // Verify ownership and status
    const launch = await prisma.privyPendingLaunch.findFirst({
      where: {
        id,
        privyUserId: req.privyUserId,
      },
      select: {
        id: true,
        tokenSymbol: true,
        status: true,
      },
    })

    if (!launch) {
      return res.status(404).json({
        success: false,
        error: 'Launch not found',
      })
    }

    if (launch.status !== 'awaiting_deposit') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel launch with status: ${launch.status}`,
      })
    }

    // Mark as expired/cancelled
    await prisma.privyPendingLaunch.update({
      where: { id },
      data: { status: 'expired' },
    })

    loggers.privy.info({
      launchId: id,
      symbol: launch.tokenSymbol,
      privyUserId: req.privyUserId,
    }, 'Pending launch cancelled')

    res.json({
      success: true,
      message: 'Launch cancelled successfully',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error cancelling launch')
    res.status(500).json({
      success: false,
      error: 'Failed to cancel launch',
    })
  }
})

export default router
