import { Router, Request, Response } from 'express'
import { bagsFmService } from '../services/bags-fm'
import { env } from '../config/env'
import { loggers } from '../utils/logger'

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// BAGS.FM ROUTES
// Proxy routes for Bags.fm API integration
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/bags/token/:mint - Get token info from Bags.fm
router.get('/token/:mint', async (req: Request, res: Response) => {
  try {
    const { mint } = req.params
    const tokenInfo = await bagsFmService.getTokenCreatorInfo(mint)

    if (!tokenInfo) {
      return res.status(404).json({
        success: false,
        error: 'Token not found on Bags.fm',
        timestamp: new Date().toISOString(),
      })
    }

    res.json({
      success: true,
      data: tokenInfo,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    loggers.bags.error({ error: String(error) }, 'Error fetching Bags.fm token info')
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token info',
      timestamp: new Date().toISOString(),
    })
  }
})

// GET /api/bags/fees/:mint - Get lifetime fees for a token
router.get('/fees/:mint', async (req: Request, res: Response) => {
  try {
    const { mint } = req.params
    const fees = await bagsFmService.getLifetimeFees(mint)

    if (!fees) {
      return res.status(404).json({
        success: false,
        error: 'Fee data not found',
        timestamp: new Date().toISOString(),
      })
    }

    res.json({
      success: true,
      data: fees,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    loggers.bags.error({ error: String(error) }, 'Error fetching Bags.fm fees')
    res.status(500).json({
      success: false,
      error: 'Failed to fetch fees',
      timestamp: new Date().toISOString(),
    })
  }
})

// GET /api/bags/claimable/:wallet - Get claimable positions for a wallet
router.get('/claimable/:wallet', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params
    const positions = await bagsFmService.getClaimablePositions(wallet)

    res.json({
      success: true,
      data: positions,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    loggers.bags.error({ error: String(error) }, 'Error fetching claimable positions')
    res.status(500).json({
      success: false,
      error: 'Failed to fetch claimable positions',
      timestamp: new Date().toISOString(),
    })
  }
})

// GET /api/bags/claim-stats/:wallet - Get claim statistics for a wallet
router.get('/claim-stats/:wallet', async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params
    const stats = await bagsFmService.getClaimStats(wallet)

    if (!stats) {
      return res.json({
        success: true,
        data: {
          totalClaimed: 0,
          totalClaimedUsd: 0,
          pendingClaims: 0,
          pendingClaimsUsd: 0,
          lastClaimTime: null,
        },
        timestamp: new Date().toISOString(),
      })
    }

    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    loggers.bags.error({ error: String(error) }, 'Error fetching claim stats')
    res.status(500).json({
      success: false,
      error: 'Failed to fetch claim stats',
      timestamp: new Date().toISOString(),
    })
  }
})

// GET /api/bags/quote - Get trade quote
router.get('/quote', async (req: Request, res: Response) => {
  try {
    const { inputMint, outputMint, amount, side } = req.query

    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: inputMint, outputMint, amount',
        timestamp: new Date().toISOString(),
      })
    }

    const quote = await bagsFmService.getTradeQuote(
      inputMint as string,
      outputMint as string,
      parseFloat(amount as string),
      (side as 'buy' | 'sell') || 'buy'
    )

    if (!quote) {
      return res.status(404).json({
        success: false,
        error: 'Could not get quote',
        timestamp: new Date().toISOString(),
      })
    }

    res.json({
      success: true,
      data: quote,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    loggers.bags.error({ error: String(error) }, 'Error fetching quote')
    res.status(500).json({
      success: false,
      error: 'Failed to fetch quote',
      timestamp: new Date().toISOString(),
    })
  }
})

// GET /api/bags/dashboard - Get comprehensive dashboard data
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    // Get token mint from query - don't fall back to env in multi-user mode
    // as the default is just a placeholder
    const queryTokenMint = req.query.tokenMint as string
    const isEnvTokenConfigured = env.tokenMintAddress &&
      !env.tokenMintAddress.includes('PLACEHOLDER') &&
      env.tokenMintAddress.length === 44 // Valid Solana address length
    const tokenMint = queryTokenMint || (isEnvTokenConfigured ? env.tokenMintAddress : null)
    const wallet = req.query.wallet as string

    if (!tokenMint) {
      return res.status(400).json({
        success: false,
        error: 'Token mint is required. Pass tokenMint as query parameter.',
        timestamp: new Date().toISOString(),
      })
    }

    // Fetch all data in parallel
    const [tokenInfo, lifetimeFees] = await Promise.all([
      bagsFmService.getTokenCreatorInfo(tokenMint),
      bagsFmService.getLifetimeFees(tokenMint),
    ])

    // If wallet provided, also fetch claim data
    let claimablePositions: any[] = []
    let claimStats = null

    if (wallet) {
      [claimablePositions, claimStats] = await Promise.all([
        bagsFmService.getClaimablePositions(wallet),
        bagsFmService.getClaimStats(wallet),
      ])
    }

    res.json({
      success: true,
      data: {
        tokenInfo,
        lifetimeFees,
        claimablePositions,
        claimStats,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    loggers.bags.error({ error: String(error) }, 'Error fetching Bags.fm dashboard')
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
      timestamp: new Date().toISOString(),
    })
  }
})

// POST /api/bags/api-key - Set Bags.fm API key (admin only)
router.post('/api-key', async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.body

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key required',
        timestamp: new Date().toISOString(),
      })
    }

    bagsFmService.setApiKey(apiKey)

    res.json({
      success: true,
      message: 'API key set successfully',
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    loggers.bags.error({ error: String(error) }, 'Error setting API key')
    res.status(500).json({
      success: false,
      error: 'Failed to set API key',
      timestamp: new Date().toISOString(),
    })
  }
})

export default router
