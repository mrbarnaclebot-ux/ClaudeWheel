import { Router, Request, Response } from 'express'
import { privyService } from '../services/privy.service'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { loggers } from '../utils/logger'
import { z } from 'zod'

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// PRIVY USER ROUTES
// Handle user onboarding and profile management
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Extract and verify auth token
// ═══════════════════════════════════════════════════════════════════════════

async function extractAuthToken(req: Request): Promise<{ valid: boolean; userId: string | null; error?: string }> {
  if (!privyService.isConfigured()) {
    return { valid: false, userId: null, error: 'Privy is not configured' }
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return { valid: false, userId: null, error: 'Missing auth token' }
  }

  const authToken = authHeader.substring(7)
  return await privyService.verifyAuthToken(authToken)
}

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Validation schema for completing onboarding
const completeOnboardingSchema = z.object({
  devWalletAddress: z.string().min(32, 'Invalid dev wallet address'),
  devWalletId: z.string().optional(),
  opsWalletAddress: z.string().min(32, 'Invalid ops wallet address'),
  opsWalletId: z.string().optional(),
  telegramId: z.number().int().positive().optional(),
  telegramUsername: z.string().max(100).optional(),
})

/**
 * POST /api/users/complete-onboarding
 * Complete TMA onboarding after user creates wallets and delegates
 * Called from: tma/src/app/onboarding/page.tsx
 */
router.post('/complete-onboarding', async (req: Request, res: Response) => {
  try {
    const auth = await extractAuthToken(req)
    if (!auth.valid || !auth.userId) {
      return res.status(401).json({
        success: false,
        error: auth.error || 'Invalid auth token',
      })
    }

    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    // Validate request body
    const validation = completeOnboardingSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      })
    }

    const {
      devWalletAddress,
      devWalletId,
      opsWalletAddress,
      opsWalletId,
      telegramId,
      telegramUsername,
    } = validation.data

    const privyUserId = auth.userId

    // Check if user already exists
    const existingUser = await prisma.privyUser.findUnique({
      where: { privyUserId },
      select: { id: true, walletsDelegated: true },
    })

    if (existingUser) {
      // User already onboarded, update delegation status if needed
      if (!existingUser.walletsDelegated) {
        await prisma.privyUser.update({
          where: { privyUserId },
          data: { walletsDelegated: true },
        })
      }

      loggers.privy.info({ privyUserId }, 'User already onboarded, updated delegation status')

      return res.json({
        success: true,
        data: {
          alreadyOnboarded: true,
        },
        message: 'Already onboarded',
      })
    }

    // Get user info from Privy API to extract additional data
    let privyUser = null
    try {
      privyUser = await privyService.getPrivyUser(privyUserId)
    } catch (e) {
      loggers.privy.warn({ privyUserId }, 'Could not fetch Privy user info')
    }

    // Extract linked accounts info - filter for Solana wallets
    const linkedAccounts = privyUser?.linkedAccounts || []
    const solanaWallets = linkedAccounts
      .filter((a: any) => a.type === 'wallet' && a.chainType === 'solana')
      .map((a: any) => ({ address: a.address })) as { address: string }[]

    // Create new user record with wallets in a transaction
    try {
      await prisma.$transaction(async (tx) => {
        // Create user
        await tx.privyUser.create({
          data: {
            privyUserId,
            telegramId: telegramId ? BigInt(telegramId) : null,
            telegramUsername: telegramUsername || null,
            walletsDelegated: true,
          },
        })

        // Create wallets
        await tx.privyWallet.createMany({
          data: [
            {
              privyUserId,
              walletType: 'dev',
              walletAddress: devWalletAddress,
              privyWalletId: devWalletId || solanaWallets[0]?.address || devWalletAddress,
            },
            {
              privyUserId,
              walletType: 'ops',
              walletAddress: opsWalletAddress,
              privyWalletId: opsWalletId || solanaWallets[1]?.address || opsWalletAddress,
            },
          ],
        })
      })
    } catch (error) {
      loggers.privy.error({ error: String(error), privyUserId }, 'Failed to create user and wallets')
      return res.status(500).json({
        success: false,
        error: 'Failed to create user record',
      })
    }

    loggers.privy.info({
      privyUserId,
      telegramId,
      devWalletAddress,
      opsWalletAddress,
    }, 'TMA onboarding complete')

    res.json({
      success: true,
      data: {
        alreadyOnboarded: false,
        devWalletAddress,
        opsWalletAddress,
      },
      message: 'Onboarding completed successfully',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error completing onboarding')
    res.status(500).json({
      success: false,
      error: 'Onboarding failed',
    })
  }
})

/**
 * GET /api/users/profile
 * Get user profile and wallets
 */
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const auth = await extractAuthToken(req)
    if (!auth.valid || !auth.userId) {
      return res.status(401).json({
        success: false,
        error: auth.error || 'Invalid auth token',
      })
    }

    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const privyUserId = auth.userId

    const user = await prisma.privyUser.findUnique({
      where: { privyUserId },
      include: { wallets: true },
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        data: {
          needsOnboarding: true,
        },
      })
    }

    const devWallet = user.wallets?.find((w) => w.walletType === 'dev')
    const opsWallet = user.wallets?.find((w) => w.walletType === 'ops')

    res.json({
      success: true,
      data: {
        id: user.id,
        privyUserId: user.privyUserId,
        telegramId: user.telegramId ? Number(user.telegramId) : null,
        telegramUsername: user.telegramUsername,
        email: user.email,
        displayName: user.displayName,
        walletsDelegated: user.walletsDelegated,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        wallets: {
          dev: devWallet ? {
            id: devWallet.id,
            address: devWallet.walletAddress,
            type: devWallet.walletType,
          } : null,
          ops: opsWallet ? {
            id: opsWallet.id,
            address: opsWallet.walletAddress,
            type: opsWallet.walletType,
          } : null,
        },
      },
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error getting user profile')
    res.status(500).json({
      success: false,
      error: 'Failed to get profile',
    })
  }
})

/**
 * GET /api/users/onboarding-status
 * Check if user has completed onboarding
 */
router.get('/onboarding-status', async (req: Request, res: Response) => {
  try {
    const auth = await extractAuthToken(req)
    if (!auth.valid || !auth.userId) {
      return res.status(401).json({
        success: false,
        error: auth.error || 'Invalid auth token',
      })
    }

    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const privyUserId = auth.userId

    const user = await prisma.privyUser.findUnique({
      where: { privyUserId },
      select: {
        walletsDelegated: true,
        wallets: { select: { id: true } },
      },
    })

    const isOnboarded = !!user && user.walletsDelegated && (user.wallets?.length ?? 0) >= 2

    res.json({
      success: true,
      data: {
        isOnboarded,
        hasUser: !!user,
        walletsDelegated: user?.walletsDelegated ?? false,
        walletCount: user?.wallets?.length ?? 0,
      },
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error checking onboarding status')
    res.status(500).json({
      success: false,
      error: 'Failed to check onboarding status',
    })
  }
})

/**
 * PUT /api/users/profile
 * Update user profile
 */
router.put('/profile', async (req: Request, res: Response) => {
  try {
    const auth = await extractAuthToken(req)
    if (!auth.valid || !auth.userId) {
      return res.status(401).json({
        success: false,
        error: auth.error || 'Invalid auth token',
      })
    }

    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const privyUserId = auth.userId
    const { displayName } = req.body

    // Validate
    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 100)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid display name',
      })
    }

    const updates: { displayName?: string | null } = {}

    if (displayName !== undefined) {
      updates.displayName = displayName || null
    }

    const user = await prisma.privyUser.update({
      where: { privyUserId },
      data: updates,
    })

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      })
    }

    loggers.privy.info({ privyUserId }, 'User profile updated')

    res.json({
      success: true,
      data: {
        id: user.id,
        privyUserId: user.privyUserId,
        displayName: user.displayName,
        updatedAt: user.updatedAt.toISOString(),
      },
      message: 'Profile updated successfully',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error updating profile')
    res.status(500).json({
      success: false,
      error: 'Failed to update profile',
    })
  }
})

/**
 * POST /api/users/update-delegation
 * Update wallet delegation status (called after user completes delegation in TMA)
 */
router.post('/update-delegation', async (req: Request, res: Response) => {
  try {
    const auth = await extractAuthToken(req)
    if (!auth.valid || !auth.userId) {
      return res.status(401).json({
        success: false,
        error: auth.error || 'Invalid auth token',
      })
    }

    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const privyUserId = auth.userId
    const { delegated } = req.body

    if (typeof delegated !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'delegated must be a boolean',
      })
    }

    await prisma.privyUser.update({
      where: { privyUserId },
      data: { walletsDelegated: delegated },
    })

    loggers.privy.info({ privyUserId, delegated }, 'Wallet delegation status updated')

    res.json({
      success: true,
      data: {
        walletsDelegated: delegated,
      },
      message: 'Delegation status updated',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error updating delegation status')
    res.status(500).json({
      success: false,
      error: 'Failed to update delegation status',
    })
  }
})

export default router
