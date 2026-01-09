import { Router, Request, Response } from 'express'
import { privyService } from '../services/privy.service'
import { supabase } from '../config/database'
import { loggers } from '../utils/logger'

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// PRIVY AUTHENTICATION ROUTES
// Verify Privy auth tokens and return user data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/privy/verify
 * Verify Privy auth token for web/TMA requests
 * Frontend sends: Authorization: Bearer <privy-auth-token>
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    // Check if Privy is configured
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
        error: 'Missing auth token. Expected: Authorization: Bearer <token>',
      })
    }

    const token = authHeader.substring(7)
    const result = await privyService.verifyAuthToken(token)

    if (!result.valid || !result.userId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired auth token',
      })
    }

    // Get user details from our database
    const user = await privyService.getDbUser(result.userId)

    if (!user) {
      // User authenticated with Privy but not in our database yet
      // This means they need to complete onboarding
      loggers.privy.info({ privyUserId: result.userId }, 'Authenticated Privy user not found in database')
      return res.json({
        success: true,
        data: {
          privyUserId: result.userId,
          user: null,
          needsOnboarding: true,
        },
      })
    }

    // Check if user has wallets
    const hasWallets = user.wallets && user.wallets.length >= 2
    const devWallet = user.wallets?.find((w: { walletType: string }) => w.walletType === 'dev')
    const opsWallet = user.wallets?.find((w: { walletType: string }) => w.walletType === 'ops')

    loggers.privy.debug({ privyUserId: result.userId, hasWallets }, 'User authenticated')

    res.json({
      success: true,
      data: {
        privyUserId: result.userId,
        user: {
          id: user.id,
          privyUserId: user.privyUserId,
          telegramId: user.telegramId ? Number(user.telegramId) : null,
          telegramUsername: user.telegramUsername,
          email: user.email,
          displayName: user.displayName,
          walletsDelegated: user.walletsDelegated,
          isActive: user.isActive,
          createdAt: user.createdAt,
        },
        wallets: hasWallets ? {
          dev: devWallet ? {
            address: devWallet.walletAddress,
            type: devWallet.walletType,
          } : null,
          ops: opsWallet ? {
            address: opsWallet.walletAddress,
            type: opsWallet.walletType,
          } : null,
        } : null,
        needsOnboarding: !hasWallets || !user.walletsDelegated,
      },
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error verifying Privy auth token')
    res.status(500).json({
      success: false,
      error: 'Failed to verify authentication',
    })
  }
})

/**
 * GET /api/privy/status
 * Check if Privy is configured and available
 */
router.get('/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      configured: privyService.isConfigured(),
    },
  })
})

export default router
