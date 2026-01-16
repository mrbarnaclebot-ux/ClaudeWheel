import { Router, Request, Response, NextFunction } from 'express'
import { Transaction, PublicKey, SystemProgram, Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { privyService } from '../services/privy.service'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { bagsFmService } from '../services/bags-fm'
import { loggers } from '../utils/logger'
import { z } from 'zod'
import { getConnection } from '../config/solana'
import { sendTransactionWithPrivySigning, sendSerializedTransactionWithPrivySigning } from '../utils/transaction'
import { env } from '../config/env'

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// PRIVY TOKEN ROUTES
// Manage tokens for Privy-authenticated users
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
// TOKEN ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/privy/tokens
 * List user's tokens
 */
router.get('/', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const tokens = await prisma.privyUserToken.findMany({
      where: {
        privyUserId: req.privyUserId,
        isActive: true,
      },
      include: {
        devWallet: true,
        opsWallet: true,
        config: true,
        flywheelState: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Transform to snake_case for frontend compatibility
    const transformedTokens = (tokens || []).map(token => ({
      id: token.id,
      token_mint: token.tokenMintAddress,
      token_name: token.tokenName,
      token_symbol: token.tokenSymbol,
      token_image: token.tokenImage,
      token_decimals: token.tokenDecimals,
      token_source: token.tokenSource,
      is_active: token.isActive,
      created_at: token.createdAt,
      dev_wallet: token.devWallet ? {
        address: token.devWallet.walletAddress,
      } : null,
      ops_wallet: token.opsWallet ? {
        address: token.opsWallet.walletAddress,
      } : null,
      config: token.config ? {
        flywheel_active: token.config.flywheelActive,
        market_making_enabled: token.config.marketMakingEnabled,
        auto_claim_enabled: token.config.autoClaimEnabled,
        fee_threshold_sol: token.config.feeThresholdSol,
        min_buy_amount_sol: token.config.minBuyAmountSol,
        max_buy_amount_sol: token.config.maxBuyAmountSol,
      } : null,
      flywheel_state: token.flywheelState ? {
        cycle_phase: token.flywheelState.cyclePhase,
        buy_count: token.flywheelState.buyCount,
        sell_count: token.flywheelState.sellCount,
        last_trade_at: token.flywheelState.lastTradeAt,
        consecutive_failures: token.flywheelState.consecutiveFailures,
        paused_until: token.flywheelState.pausedUntil,
      } : null,
    }))

    res.json({
      success: true,
      tokens: transformedTokens,
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error getting tokens')
    res.status(500).json({
      success: false,
      error: 'Failed to get tokens',
    })
  }
})

// Validation schema for token registration
const registerTokenSchema = z.object({
  tokenMintAddress: z.string().min(32, 'Invalid token mint address'),
  tokenSymbol: z.string().min(1, 'Token symbol required').max(20),
  tokenName: z.string().max(100).optional(),
  tokenImage: z.string().url().optional().or(z.literal('')),
  tokenDecimals: z.number().int().min(0).max(18).optional().default(6),
})

/**
 * POST /api/privy/tokens
 * Register an existing token
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
    const validation = registerTokenSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      })
    }

    const { tokenMintAddress, tokenSymbol, tokenName, tokenImage, tokenDecimals } = validation.data

    // Get user's wallets
    const wallets = await privyService.getUserWallets(req.privyUserId!)
    if (!wallets || wallets.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'User wallets not found. Complete onboarding first.',
      })
    }

    const devWallet = wallets.find((w: any) => w.wallet_type === 'dev' || w.walletType === 'dev')
    const opsWallet = wallets.find((w: any) => w.wallet_type === 'ops' || w.walletType === 'ops')

    if (!devWallet || !opsWallet) {
      return res.status(400).json({
        success: false,
        error: 'Both dev and ops wallets required',
      })
    }

    // Check if token already registered
    const existing = await prisma.privyUserToken.findFirst({
      where: {
        privyUserId: req.privyUserId,
        tokenMintAddress: tokenMintAddress,
      },
    })

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Token already registered for this user',
      })
    }

    // Verify token exists on Bags.fm and get additional info
    let tokenInfo = null
    try {
      tokenInfo = await bagsFmService.getTokenCreatorInfo(tokenMintAddress)
    } catch (e) {
      loggers.privy.warn({ tokenMintAddress }, 'Could not fetch token info from Bags.fm')
    }

    // Create token record with config and flywheel state in a transaction
    const token = await prisma.$transaction(async (tx) => {
      // Create token record
      const newToken = await tx.privyUserToken.create({
        data: {
          privyUserId: req.privyUserId!,
          tokenMintAddress: tokenMintAddress,
          tokenSymbol: tokenSymbol,
          tokenName: tokenName || tokenInfo?.tokenName || null,
          tokenImage: tokenImage || tokenInfo?.tokenImage || null,
          tokenDecimals: tokenDecimals,
          devWalletId: devWallet.id,
          opsWalletId: opsWallet.id,
          launchedViaTelegram: false,
        },
      })

      // Create default config
      await tx.privyTokenConfig.create({
        data: {
          privyTokenId: newToken.id,
        },
      })

      // Create flywheel state
      await tx.privyFlywheelState.create({
        data: {
          privyTokenId: newToken.id,
        },
      })

      return newToken
    })

    loggers.privy.info({ tokenId: token.id, tokenSymbol, privyUserId: req.privyUserId }, 'Token registered')

    res.status(201).json({
      success: true,
      data: token,
      message: 'Token registered successfully',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error registering token')
    res.status(500).json({
      success: false,
      error: 'Failed to register token',
    })
  }
})

// Validation schema for token registration with imported dev wallet
const registerWithImportSchema = z.object({
  tokenMintAddress: z.string().min(32, 'Invalid token mint address'),
  tokenSymbol: z.string().min(1, 'Token symbol required').max(20),
  tokenName: z.string().max(100).optional(),
  tokenImage: z.string().url().optional().or(z.literal('')),
  tokenDecimals: z.number().int().min(0).max(18).optional().default(6),
  devWalletPrivateKey: z.string().min(32, 'Invalid private key'), // Base58 encoded
  tokenSource: z.enum(['registered', 'platform']).optional().default('registered'),
})

/**
 * POST /api/privy/tokens/register-with-import
 * Register a token by importing an existing dev wallet and generating an ops wallet
 *
 * This is used for:
 * 1. WHEEL token (platform token) - imports existing dev wallet, generates ops via Privy
 * 2. Users with existing tokens - same flow
 */
router.post('/register-with-import', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    // Validate request body
    const validation = registerWithImportSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      })
    }

    const {
      tokenMintAddress,
      tokenSymbol,
      tokenName,
      tokenImage,
      tokenDecimals,
      devWalletPrivateKey,
      tokenSource,
    } = validation.data

    // Validate the private key and derive the wallet address
    let devWalletAddress: string
    try {
      const secretKey = bs58.decode(devWalletPrivateKey)
      const keypair = Keypair.fromSecretKey(secretKey)
      devWalletAddress = keypair.publicKey.toString()
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid private key format',
      })
    }

    // Check if token already registered
    const existing = await prisma.privyUserToken.findFirst({
      where: {
        privyUserId: req.privyUserId,
        tokenMintAddress: tokenMintAddress,
      },
    })

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Token already registered for this user',
      })
    }

    // Check if dev wallet already exists for another user
    const existingDevWallet = await prisma.privyWallet.findUnique({
      where: { walletAddress: devWalletAddress },
    })

    if (existingDevWallet && existingDevWallet.privyUserId !== req.privyUserId) {
      return res.status(400).json({
        success: false,
        error: 'Dev wallet already registered to another user',
      })
    }

    // Get user's existing ops wallet (required - must complete onboarding first)
    const opsWallet = await prisma.privyWallet.findFirst({
      where: {
        privyUserId: req.privyUserId,
        walletType: 'ops',
      },
    })

    if (!opsWallet) {
      return res.status(400).json({
        success: false,
        error: 'No ops wallet found. Please complete onboarding in the TMA first to create your wallets.',
      })
    }

    // Check if user has an existing dev wallet that will be replaced
    const existingUserDevWallet = await prisma.privyWallet.findFirst({
      where: {
        privyUserId: req.privyUserId,
        walletType: 'dev',
      },
    })

    if (existingUserDevWallet && existingUserDevWallet.walletAddress !== devWalletAddress) {
      loggers.privy.warn({
        privyUserId: req.privyUserId,
        oldDevWallet: existingUserDevWallet.walletAddress,
        newDevWallet: devWalletAddress,
      }, 'Replacing existing dev wallet with imported wallet')
    }

    // Import the dev wallet into Privy and store it in our database
    // This imports the key INTO Privy so it uses delegated signing like all other wallets
    const importResult = await privyService.importAndStoreWallet({
      privyUserId: req.privyUserId!,
      walletType: 'dev',
      privateKey: devWalletPrivateKey,
    })

    if (!importResult) {
      return res.status(500).json({
        success: false,
        error: 'Failed to import dev wallet into Privy',
      })
    }

    // Get the dev wallet record
    const devWallet = await prisma.privyWallet.findFirst({
      where: {
        privyUserId: req.privyUserId,
        walletType: 'dev',
      },
    })

    if (!devWallet) {
      return res.status(500).json({
        success: false,
        error: 'Dev wallet not found after import',
      })
    }

    // Verify token exists on Bags.fm and get additional info
    let tokenInfo = null
    try {
      tokenInfo = await bagsFmService.getTokenCreatorInfo(tokenMintAddress)
    } catch (e) {
      loggers.privy.warn({ tokenMintAddress }, 'Could not fetch token info from Bags.fm')
    }

    // Create token record with config and flywheel state in a transaction
    const token = await prisma.$transaction(async (tx) => {
      // Create token record
      const newToken = await tx.privyUserToken.create({
        data: {
          privyUserId: req.privyUserId!,
          tokenMintAddress: tokenMintAddress,
          tokenSymbol: tokenSymbol,
          tokenName: tokenName || tokenInfo?.tokenName || null,
          tokenImage: tokenImage || tokenInfo?.tokenImage || null,
          tokenDecimals: tokenDecimals,
          devWalletId: devWallet.id,
          opsWalletId: opsWallet!.id,
          tokenSource: tokenSource,
          launchedViaTelegram: false,
        },
      })

      // Create default config
      await tx.privyTokenConfig.create({
        data: {
          privyTokenId: newToken.id,
          flywheelActive: true,
          marketMakingEnabled: true,
        },
      })

      // Create flywheel state
      await tx.privyFlywheelState.create({
        data: {
          privyTokenId: newToken.id,
        },
      })

      return newToken
    })

    loggers.privy.info({
      tokenId: token.id,
      tokenSymbol,
      tokenSource,
      devWalletAddress,
      opsWalletAddress: opsWallet.walletAddress,
      privyUserId: req.privyUserId
    }, 'Token registered with imported dev wallet')

    res.status(201).json({
      success: true,
      data: {
        token,
        devWallet: {
          address: devWalletAddress,
          isImported: true,
        },
        opsWallet: {
          address: opsWallet.walletAddress,
          isImported: false,
        },
      },
      message: 'Token registered successfully with imported dev wallet',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error registering token with import')
    res.status(500).json({
      success: false,
      error: 'Failed to register token',
    })
  }
})

/**
 * GET /api/privy/tokens/:id
 * Get token details
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

    const token = await prisma.privyUserToken.findFirst({
      where: {
        id,
        privyUserId: req.privyUserId,
      },
      include: {
        devWallet: true,
        opsWallet: true,
        config: true,
        flywheelState: true,
      },
    })

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    // Transform to snake_case for frontend compatibility
    const transformed = {
      id: token.id,
      token_mint_address: token.tokenMintAddress,
      token_name: token.tokenName,
      token_symbol: token.tokenSymbol,
      token_image: token.tokenImage,
      token_decimals: token.tokenDecimals,
      token_source: token.tokenSource,
      is_active: token.isActive,
      is_graduated: token.isGraduated,
      created_at: token.createdAt,
      dev_wallet: token.devWallet ? {
        wallet_address: token.devWallet.walletAddress,
      } : null,
      ops_wallet: token.opsWallet ? {
        wallet_address: token.opsWallet.walletAddress,
      } : null,
      config: token.config ? {
        flywheel_active: token.config.flywheelActive,
        market_making_enabled: token.config.marketMakingEnabled,
        auto_claim_enabled: token.config.autoClaimEnabled,
        algorithm_mode: token.config.algorithmMode,
        min_buy_amount_sol: Number(token.config.minBuyAmountSol),
        max_buy_amount_sol: Number(token.config.maxBuyAmountSol),
        slippage_bps: token.config.slippageBps,
        trading_route: token.config.tradingRoute,
      } : null,
      state: token.flywheelState ? {
        cycle_phase: token.flywheelState.cyclePhase,
        buy_count: token.flywheelState.buyCount,
        sell_count: token.flywheelState.sellCount,
        last_trade_at: token.flywheelState.lastTradeAt,
        consecutive_failures: token.flywheelState.consecutiveFailures,
        paused_until: token.flywheelState.pausedUntil,
      } : null,
    }

    res.json(transformed)
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error getting token')
    res.status(500).json({
      success: false,
      error: 'Failed to get token',
    })
  }
})

// Validation schema for config update
const updateConfigSchema = z.object({
  flywheel_active: z.boolean().optional(),
  market_making_enabled: z.boolean().optional(),
  auto_claim_enabled: z.boolean().optional(),
  fee_threshold_sol: z.number().min(0).optional(),
  min_buy_amount_sol: z.number().min(0).optional(),
  max_buy_amount_sol: z.number().min(0).optional(),
  max_sell_amount_tokens: z.number().min(0).optional(),
  buy_interval_minutes: z.number().int().min(1).optional(),
  slippage_bps: z.number().int().min(0).max(5000).optional(),
  algorithm_mode: z.enum(['simple', 'turbo_lite', 'rebalance', 'twap_vwap', 'dynamic']).optional(),
  target_sol_allocation: z.number().int().min(0).max(100).optional(),
  target_token_allocation: z.number().int().min(0).max(100).optional(),
  rebalance_threshold: z.number().int().min(1).max(50).optional(),
  trading_route: z.enum(['bags', 'jupiter', 'auto']).optional(),
  // Turbo Lite configuration
  turbo_job_interval_seconds: z.number().int().min(5).max(60).optional(),
  turbo_cycle_size_buys: z.number().int().min(1).max(20).optional(),
  turbo_cycle_size_sells: z.number().int().min(1).max(20).optional(),
  turbo_inter_token_delay_ms: z.number().int().min(0).max(1000).optional(),
  turbo_global_rate_limit: z.number().int().min(30).max(200).optional(),
  turbo_confirmation_timeout: z.number().int().min(20).max(120).optional(),
  turbo_batch_state_updates: z.boolean().optional(),
  // TWAP/VWAP Configuration
  twap_enabled: z.boolean().optional(),
  twap_slices: z.number().int().min(2).max(20).optional(),
  twap_window_minutes: z.number().int().min(5).max(120).optional(),
  twap_threshold_usd: z.number().min(0).optional(),
  vwap_enabled: z.boolean().optional(),
  vwap_participation_rate: z.number().int().min(1).max(50).optional(),
  vwap_min_volume_usd: z.number().min(0).optional(),
  // Dynamic Mode Configuration
  dynamic_fee_enabled: z.boolean().optional(),
  reserve_percent_normal: z.number().int().min(0).max(50).optional(),
  reserve_percent_adverse: z.number().int().min(0).max(50).optional(),
  min_sell_percent: z.number().int().min(1).max(50).optional(),
  max_sell_percent: z.number().int().min(1).max(100).optional(),
  buyback_boost_on_dump: z.boolean().optional(),
  pause_on_extreme_volatility: z.boolean().optional(),
  volatility_pause_threshold: z.number().int().min(5).max(50).optional(),
})

/**
 * PUT /api/privy/tokens/:id/config
 * Update token configuration
 */
router.put('/:id/config', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const { id } = req.params

    // Validate request body
    const validation = updateConfigSchema.safeParse(req.body)
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      })
    }

    // Verify ownership
    const token = await prisma.privyUserToken.findFirst({
      where: {
        id,
        privyUserId: req.privyUserId,
      },
    })

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    // Validate min/max buy amounts
    const config = validation.data
    if (config.min_buy_amount_sol !== undefined && config.max_buy_amount_sol !== undefined) {
      if (config.min_buy_amount_sol > config.max_buy_amount_sol) {
        return res.status(400).json({
          success: false,
          error: 'min_buy_amount_sol cannot be greater than max_buy_amount_sol',
        })
      }
    }

    // Map snake_case to camelCase for Prisma
    const prismaConfig: Record<string, any> = {}
    if (config.flywheel_active !== undefined) prismaConfig.flywheelActive = config.flywheel_active
    if (config.market_making_enabled !== undefined) prismaConfig.marketMakingEnabled = config.market_making_enabled
    if (config.auto_claim_enabled !== undefined) prismaConfig.autoClaimEnabled = config.auto_claim_enabled
    if (config.fee_threshold_sol !== undefined) prismaConfig.feeThresholdSol = config.fee_threshold_sol
    if (config.min_buy_amount_sol !== undefined) prismaConfig.minBuyAmountSol = config.min_buy_amount_sol
    if (config.max_buy_amount_sol !== undefined) prismaConfig.maxBuyAmountSol = config.max_buy_amount_sol
    if (config.max_sell_amount_tokens !== undefined) prismaConfig.maxSellAmountTokens = config.max_sell_amount_tokens
    if (config.buy_interval_minutes !== undefined) prismaConfig.buyIntervalMinutes = config.buy_interval_minutes
    if (config.slippage_bps !== undefined) prismaConfig.slippageBps = config.slippage_bps
    if (config.algorithm_mode !== undefined) prismaConfig.algorithmMode = config.algorithm_mode
    if (config.target_sol_allocation !== undefined) prismaConfig.targetSolAllocation = config.target_sol_allocation
    if (config.target_token_allocation !== undefined) prismaConfig.targetTokenAllocation = config.target_token_allocation
    if (config.rebalance_threshold !== undefined) prismaConfig.rebalanceThreshold = config.rebalance_threshold
    if (config.trading_route !== undefined) prismaConfig.tradingRoute = config.trading_route
    // TWAP/VWAP config
    if (config.twap_enabled !== undefined) prismaConfig.twapEnabled = config.twap_enabled
    if (config.twap_slices !== undefined) prismaConfig.twapSlices = config.twap_slices
    if (config.twap_window_minutes !== undefined) prismaConfig.twapWindowMinutes = config.twap_window_minutes
    if (config.twap_threshold_usd !== undefined) prismaConfig.twapThresholdUsd = config.twap_threshold_usd
    if (config.vwap_enabled !== undefined) prismaConfig.vwapEnabled = config.vwap_enabled
    if (config.vwap_participation_rate !== undefined) prismaConfig.vwapParticipationRate = config.vwap_participation_rate
    if (config.vwap_min_volume_usd !== undefined) prismaConfig.vwapMinVolumeUsd = config.vwap_min_volume_usd
    // Dynamic mode config
    if (config.dynamic_fee_enabled !== undefined) prismaConfig.dynamicFeeEnabled = config.dynamic_fee_enabled
    if (config.reserve_percent_normal !== undefined) prismaConfig.reservePercentNormal = config.reserve_percent_normal
    if (config.reserve_percent_adverse !== undefined) prismaConfig.reservePercentAdverse = config.reserve_percent_adverse
    if (config.min_sell_percent !== undefined) prismaConfig.minSellPercent = config.min_sell_percent
    if (config.max_sell_percent !== undefined) prismaConfig.maxSellPercent = config.max_sell_percent
    if (config.buyback_boost_on_dump !== undefined) prismaConfig.buybackBoostOnDump = config.buyback_boost_on_dump
    if (config.pause_on_extreme_volatility !== undefined) prismaConfig.pauseOnExtremeVolatility = config.pause_on_extreme_volatility
    if (config.volatility_pause_threshold !== undefined) prismaConfig.volatilityPauseThreshold = config.volatility_pause_threshold

    // Update config
    const updatedConfig = await prisma.privyTokenConfig.update({
      where: { privyTokenId: id },
      data: prismaConfig,
    })

    loggers.privy.info({ tokenId: id, privyUserId: req.privyUserId }, 'Token config updated')

    res.json({
      success: true,
      data: updatedConfig,
      message: 'Configuration updated successfully',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error updating config')
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration',
    })
  }
})

/**
 * DELETE /api/privy/tokens/:id
 * Deactivate a token (soft delete)
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

    // Verify ownership
    const token = await prisma.privyUserToken.findFirst({
      where: {
        id,
        privyUserId: req.privyUserId,
      },
      select: { id: true, tokenSymbol: true },
    })

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    // Soft delete and disable flywheel in a transaction
    await prisma.$transaction([
      prisma.privyUserToken.update({
        where: { id },
        data: { isActive: false },
      }),
      prisma.privyTokenConfig.update({
        where: { privyTokenId: id },
        data: { flywheelActive: false },
      }),
    ])

    loggers.privy.info({ tokenId: id, tokenSymbol: token.tokenSymbol, privyUserId: req.privyUserId }, 'Token deactivated')

    res.json({
      success: true,
      message: 'Token deactivated successfully',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error deactivating token')
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate token',
    })
  }
})

/**
 * POST /api/privy/tokens/:id/claim
 * Manually trigger fee claim for a token
 */
router.post('/:id/claim', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const { id } = req.params

    // Get token with wallet info
    const token = await prisma.privyUserToken.findFirst({
      where: {
        id,
        privyUserId: req.privyUserId,
      },
      include: {
        devWallet: true,
        opsWallet: true,
      },
    })

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    const devWalletAddress = token.devWallet?.walletAddress
    const opsWalletAddress = token.opsWallet?.walletAddress

    if (!devWalletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Dev wallet not found',
      })
    }

    // Check claimable positions
    const positions = await bagsFmService.getClaimablePositions(devWalletAddress)
    const position = positions?.find(p => p.tokenMint === token.tokenMintAddress)

    if (!position || position.claimableAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'No fees available to claim',
        claimableAmount: 0,
      })
    }

    loggers.privy.info({
      tokenId: id,
      tokenSymbol: token.tokenSymbol,
      claimableAmount: position.claimableAmount
    }, 'Manual claim initiated')

    // Generate claim transactions
    const claimTxs = await bagsFmService.generateClaimTransactions(
      devWalletAddress,
      [token.tokenMintAddress]
    )

    if (!claimTxs || claimTxs.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate claim transaction',
      })
    }

    // Execute claim transactions with Privy signing
    const connection = getConnection()
    let lastSignature: string | undefined

    for (const txBase64 of claimTxs) {
      const result = await sendSerializedTransactionWithPrivySigning(
        connection,
        txBase64,
        devWalletAddress,
        { logContext: { service: 'privy-manual-claim', tokenId: id } }
      )
      if (result.success && result.signature) {
        lastSignature = result.signature
      } else if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error || 'Claim transaction failed',
        })
      }
    }

    if (!lastSignature) {
      return res.status(500).json({
        success: false,
        error: 'Claim transaction failed - no signature returned',
      })
    }

    // Transfer to ops wallet with platform fee split
    let platformFeeSol = 0
    let userReceivedSol = position.claimableAmount

    if (opsWalletAddress) {
      const reserveSol = 0.1
      const transferAmount = Math.max(0, position.claimableAmount - reserveSol)

      if (transferAmount > 0) {
        const platformFeePercent = env.platformFeePercentage || 10
        platformFeeSol = transferAmount * (platformFeePercent / 100)
        userReceivedSol = transferAmount - platformFeeSol

        const devPubkey = new PublicKey(devWalletAddress)

        // Get platform ops wallet address from Prisma
        let platformOpsWalletAddress: string | null = null
        try {
          const platformToken = await prisma.privyUserToken.findFirst({
            where: { tokenSource: 'platform' },
            include: { opsWallet: true },
          })
          platformOpsWalletAddress = platformToken?.opsWallet?.walletAddress || null
        } catch {
          // Platform token not found - skip platform fee
        }

        // Transfer platform fee (10%)
        if (platformOpsWalletAddress && platformFeeSol >= 0.001) {
          const platformTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: devPubkey,
              toPubkey: new PublicKey(platformOpsWalletAddress),
              lamports: Math.floor(platformFeeSol * 1e9),
            })
          )
          platformTx.feePayer = devPubkey

          await sendTransactionWithPrivySigning(
            connection,
            platformTx,
            devWalletAddress,
            { commitment: 'confirmed', logContext: { service: 'privy-manual-claim', type: 'platform-fee' } }
          )
        }

        // Transfer user portion (90%)
        if (userReceivedSol >= 0.001) {
          const userTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: devPubkey,
              toPubkey: new PublicKey(opsWalletAddress),
              lamports: Math.floor(userReceivedSol * 1e9),
            })
          )
          userTx.feePayer = devPubkey

          await sendTransactionWithPrivySigning(
            connection,
            userTx,
            devWalletAddress,
            { commitment: 'confirmed', logContext: { service: 'privy-manual-claim', type: 'user-portion' } }
          )
        }
      }
    }

    // Record the claim and transaction
    await prisma.$transaction([
      prisma.privyClaimHistory.create({
        data: {
          privyTokenId: id,
          totalAmountSol: position.claimableAmount,
          amountSol: position.claimableAmount,
          platformFeeSol: platformFeeSol,
          userReceivedSol: userReceivedSol,
          claimSignature: lastSignature,
          status: 'completed',
          claimedAt: new Date(),
          completedAt: new Date(),
        },
      }),
      prisma.privyTransaction.create({
        data: {
          privyTokenId: id,
          type: 'claim',
          amount: position.claimableAmount,
          signature: lastSignature,
          status: 'confirmed',
        },
      }),
    ])

    loggers.privy.info({
      tokenId: id,
      tokenSymbol: token.tokenSymbol,
      claimedAmount: position.claimableAmount,
      platformFee: platformFeeSol,
      userReceived: userReceivedSol,
      signature: lastSignature,
    }, 'Manual claim successful')

    res.json({
      success: true,
      data: {
        claimedAmount: position.claimableAmount,
        platformFee: platformFeeSol,
        userReceived: userReceivedSol,
        signature: lastSignature,
      },
      message: 'Fees claimed successfully',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error claiming fees')
    res.status(500).json({
      success: false,
      error: 'Failed to claim fees',
    })
  }
})

/**
 * GET /api/privy/tokens/:id/transactions
 * Get transaction history for a token
 */
router.get('/:id/transactions', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const { id } = req.params
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const offset = parseInt(req.query.offset as string) || 0

    // Verify ownership
    const token = await prisma.privyUserToken.findFirst({
      where: {
        id,
        privyUserId: req.privyUserId,
      },
      select: { id: true },
    })

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    // Fetch transactions with count
    const [transactions, total] = await prisma.$transaction([
      prisma.privyTransaction.findMany({
        where: { privyTokenId: id },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.privyTransaction.count({
        where: { privyTokenId: id },
      }),
    ])

    res.json({
      success: true,
      data: {
        transactions: transactions || [],
        total,
        limit,
        offset,
      },
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error getting transactions')
    res.status(500).json({
      success: false,
      error: 'Failed to get transactions',
    })
  }
})

/**
 * GET /api/privy/tokens/:id/claims
 * Get claim history for a token
 */
router.get('/:id/claims', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const { id } = req.params
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const offset = parseInt(req.query.offset as string) || 0

    // Verify ownership
    const token = await prisma.privyUserToken.findFirst({
      where: {
        id,
        privyUserId: req.privyUserId,
      },
      select: { id: true },
    })

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    // Fetch claims with count
    const [claims, total] = await prisma.$transaction([
      prisma.privyClaimHistory.findMany({
        where: { privyTokenId: id },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.privyClaimHistory.count({
        where: { privyTokenId: id },
      }),
    ])

    res.json({
      success: true,
      data: {
        claims: claims || [],
        total,
        limit,
        offset,
      },
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error getting claims')
    res.status(500).json({
      success: false,
      error: 'Failed to get claims',
    })
  }
})

/**
 * GET /api/privy/tokens/:id/claimable
 * Get claimable amount for a token
 */
router.get('/:id/claimable', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const { id } = req.params

    // Get token with wallet info
    const token = await prisma.privyUserToken.findFirst({
      where: {
        id,
        privyUserId: req.privyUserId,
      },
      include: {
        devWallet: true,
      },
    })

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    const devWalletAddress = token.devWallet?.walletAddress
    if (!devWalletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Dev wallet not found',
      })
    }

    // Check claimable positions
    const positions = await bagsFmService.getClaimablePositions(devWalletAddress)
    const position = positions?.find(p => p.tokenMint === token.tokenMintAddress)

    res.json({
      success: true,
      data: {
        claimableAmount: position?.claimableAmount || 0,
        tokenMint: token.tokenMintAddress,
        tokenSymbol: token.tokenSymbol,
      },
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error getting claimable amount')
    res.status(500).json({
      success: false,
      error: 'Failed to get claimable amount',
    })
  }
})

export default router
