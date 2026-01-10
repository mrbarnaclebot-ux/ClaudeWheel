import { Router, Request, Response, NextFunction } from 'express'
import { privyService } from '../services/privy.service'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { supabase } from '../config/database'
import { loggers } from '../utils/logger'
import { z } from 'zod'
import multer from 'multer'

const router = Router()

// Configure multer for memory storage (files in memory as Buffer)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (req, file, cb) => {
    // Only allow images
    if (file.mimetype.startsWith('image/')) {
      cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'))
    }
  },
})

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
// IMAGE UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Error handler for multer file upload errors
 */
function handleMulterError(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'Image file too large. Maximum size is 5MB.',
      })
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    })
  }
  if (err) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Upload failed',
    })
  }
  next()
}

/**
 * POST /api/privy/launches/upload-image
 * Upload token image to Supabase Storage
 */
router.post('/upload-image', upload.single('image'), handleMulterError, async (req: PrivyRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(503).json({
        success: false,
        error: 'Storage not configured',
      })
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No image file provided',
      })
    }

    const file = req.file
    // Whitelist allowed extensions for safety
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']
    const rawExtension = (file.originalname.split('.').pop() || 'jpg').toLowerCase()
    const extension = allowedExtensions.includes(rawExtension) ? rawExtension : 'jpg'
    const filename = `token-${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`
    const storagePath = `token-images/${filename}`

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('public-assets')
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      })

    if (uploadError) {
      loggers.privy.error({ error: uploadError.message }, 'Image upload failed')
      return res.status(500).json({
        success: false,
        error: 'Failed to upload image',
      })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('public-assets')
      .getPublicUrl(storagePath)

    loggers.privy.info({ path: storagePath }, 'Image uploaded successfully')

    return res.json({
      success: true,
      imageUrl: urlData.publicUrl,
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Image upload error')
    return res.status(500).json({
      success: false,
      error: 'Image upload failed',
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// LAUNCH ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Validation schema for creating a launch
const createLaunchSchema = z.object({
  name: z.string().min(1, 'Token name required').max(100),
  symbol: z.string().min(1, 'Token symbol required').max(20),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().url('Token image URL is required'),
  twitter: z.string().url().optional().or(z.literal('')),
  telegram: z.string().url().optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  discord: z.string().url().optional().or(z.literal('')),
  devBuy: z.number().min(0).max(10).optional(), // Optional dev buy in SOL (0-10)
})

// Base minimum deposit in SOL (launch cost)
const BASE_MIN_DEPOSIT_SOL = 0.1
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

    const { name, symbol, description, imageUrl, twitter, telegram, website, discord, devBuy } = validation.data

    // Calculate minimum deposit: base (0.1) + dev buy amount
    const devBuySol = devBuy || 0
    const minDepositSol = BASE_MIN_DEPOSIT_SOL + devBuySol

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
        minDepositSol: minDepositSol,
        devBuySol: devBuySol,
        expiresAt,
      },
    })

    loggers.privy.info({
      launchId: launch.id,
      symbol: launch.tokenSymbol,
      privyUserId: req.privyUserId,
      depositAddress: devWallet.walletAddress,
      minDeposit: minDepositSol,
      devBuy: devBuySol,
    }, 'Pending launch created')

    return res.status(201).json({
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
        minDeposit: minDepositSol,
        devBuy: devBuySol,
        expiresAt: expiresAt.toISOString(),
      },
      message: `Pending launch created for ${launch.tokenSymbol}. Send at least ${minDepositSol} SOL to ${devWallet.walletAddress} to launch.`,
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error creating launch')
    return res.status(500).json({
      success: false,
      error: 'Failed to create launch',
    })
  }
})

/**
 * GET /api/privy/launches/pending
 * Get user's pending launch
 * NOTE: This must be defined before /:id to avoid route collision
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

    return res.json({
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
    return res.status(500).json({
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

    return res.json({
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
    return res.status(500).json({
      success: false,
      error: 'Failed to get launch history',
    })
  }
})

/**
 * GET /api/privy/launches/:id
 * Get launch status by ID
 * NOTE: This must be defined after /pending and /history to avoid route collision
 */
router.get('/:id', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const { id } = req.params

    const launch = await prisma.privyPendingLaunch.findFirst({
      where: {
        id,
        privyUserId: req.privyUserId, // Ensure user owns this launch
      },
      include: {
        devWallet: {
          select: { walletAddress: true },
        },
      },
    })

    if (!launch) {
      return res.status(404).json({
        success: false,
        error: 'Launch not found',
      })
    }

    // Get current balance of dev wallet if launch is still pending
    let balance = Number(launch.minDepositSol) || 0
    if (launch.status === 'awaiting_deposit' || launch.status === 'launching') {
      try {
        const { PublicKey } = await import('@solana/web3.js')
        const { getBalance } = await import('../config/solana')
        const devWalletAddress = launch.devWallet?.walletAddress
        if (devWalletAddress) {
          const pubkey = new PublicKey(devWalletAddress)
          balance = await getBalance(pubkey)
        }
      } catch (e) {
        // Use stored balance if we can't fetch current
      }
    }

    return res.json({
      success: true,
      data: {
        id: launch.id,
        status: launch.status,
        tokenName: launch.tokenName,
        tokenSymbol: launch.tokenSymbol,
        tokenMintAddress: launch.tokenMintAddress,
        balance,
        minDepositSol: Number(launch.minDepositSol),
        lastError: launch.lastError,
        createdAt: launch.createdAt,
        updatedAt: launch.updatedAt,
        devWalletAddress: launch.devWallet?.walletAddress,
      },
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error fetching launch')
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch launch',
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

    return res.json({
      success: true,
      message: 'Launch cancelled successfully',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error cancelling launch')
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel launch',
    })
  }
})

export default router
