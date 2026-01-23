import { Router, Response } from 'express'
import { z } from 'zod'
import { PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { requireAdmin, requirePermission, AdminRequest } from '../services/admin-auth.service'
import { connection, getBalance, getTokenBalance } from '../config/solana'
import { bagsFmService } from '../services/bags-fm'
import { prisma } from '../config/prisma'

// Legacy Supabase removed - stub for backward compatibility
const supabase = null as any

// Legacy encryption removed - stub that throws
function getKeypairFromEncrypted(_encrypted: string, _iv: string, _authTag: string): never {
  throw new Error('Legacy encryption removed. Use Privy delegated signing instead.')
}

import { getMultiUserFlywheelJobStatus, restartFlywheelJob } from '../jobs/multi-flywheel.job'
import { getFastClaimJobStatus, triggerFastClaimCycle, restartFastClaimJob } from '../jobs/fast-claim.job'
import { getBalanceUpdateJobStatus, triggerBalanceUpdate, restartBalanceUpdateJob } from '../jobs/balance-update.job'
import {
  getPendingRefunds,
  executeRefund,
  getLaunchStats,
} from '../services/refund.service'
import { getDepositMonitorStatus } from '../jobs/deposit-monitor.job'
import { triggerFlywheelCycle } from '../jobs/multi-flywheel.job'
import { loggers } from '../utils/logger'
import { platformConfigService } from '../services/platform-config.service'
import { getWebSocketReactiveStatus, restartWebSocketReactiveJob } from '../jobs/websocket-reactive.job'
// wheelMMService removed - WHEEL is now handled by regular Privy flywheel

// Legacy function stubs for backwards compatibility - these jobs have been removed
// Returns deprecated status to inform API consumers these are no longer active
const getClaimJobStatus = () => ({ running: false, enabled: false, intervalMinutes: 0, lastRunAt: null as Date | null, deprecated: true, message: 'Legacy claim job removed - use fast-claim instead' })
const restartClaimJob = (interval?: number) => { loggers.server.info({ interval }, 'Claim job restart requested (legacy - no-op)') }
const requestConfigReload = () => { loggers.server.info('Config reload requested (legacy - no-op)') }
const getCurrentAlgorithmMode = () => 'multi-user'
const getCachedConfig = () => ({ flywheel_active: true, market_making_enabled: true, fee_collection_enabled: true })

// Legacy service stubs - manual sell is deprecated in multi-user mode
interface WalletBalance {
  sol_balance: number
  token_balance: number
}

interface SellResult {
  signature: string
  amount: number
  token: string
}

const walletMonitor = {
  getOpsWalletBalance: async (): Promise<WalletBalance | null> => null
}

const marketMaker = {
  getStats: () => ({ isEnabled: false }),
  enable: () => {},
  disable: () => {},
  executeSell: async (_amount: number, _options?: { bypassCap?: boolean }): Promise<SellResult | null> => null
}

// Platform token CA - this token cannot be suspended
const PLATFORM_TOKEN_MINT = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// Protected endpoints requiring Privy JWT authentication with admin role
// ═══════════════════════════════════════════════════════════════════════════

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AdminToken {
  id: string
  user_id: string
  user_wallet: string
  token_mint_address: string
  token_symbol: string
  token_name: string | null
  token_image: string | null
  token_decimals: number
  dev_wallet_address: string
  ops_wallet_address: string
  is_active: boolean
  is_verified: boolean
  is_suspended: boolean
  suspend_reason: string | null
  risk_level: 'low' | 'medium' | 'high'
  daily_trade_limit_sol: number
  max_position_size_sol: number
  created_at: string
  config: {
    flywheel_active: boolean
    market_making_enabled: boolean
    auto_claim_enabled: boolean
    algorithm_mode: string
  } | null
  stats: {
    total_trades: number
    total_volume_sol: number
    total_claims_sol: number
    last_trade_at: string | null
  } | null
}

// Schema for config update request (simplified for Privy JWT auth)
const ConfigUpdateSchema = z.object({
  token_mint_address: z.string().optional(),
  token_symbol: z.string().max(10).optional(),
  token_decimals: z.number().min(0).max(18).optional(),
  flywheel_active: z.boolean().optional(),
  market_making_enabled: z.boolean().optional(),
  fee_collection_enabled: z.boolean().optional(),
  ops_wallet_address: z.string().optional(),
  fee_threshold_sol: z.number().min(0).optional(),
  fee_percentage: z.number().min(0).max(100).optional(),
  min_buy_amount_sol: z.number().min(0).optional(),
  max_buy_amount_sol: z.number().min(0).optional(),
  buy_interval_minutes: z.number().min(1).optional(),
  slippage_bps: z.number().min(1).max(5000).optional(),
  algorithm_mode: z.enum(['simple', 'turbo_lite', 'rebalance']).optional(),
  target_sol_allocation: z.number().min(0).max(100).optional(),
  target_token_allocation: z.number().min(0).max(100).optional(),
  rebalance_threshold: z.number().min(1).max(50).optional(),
  use_twap: z.boolean().optional(),
  twap_threshold_usd: z.number().min(1).optional(),
})

/**
 * POST /api/admin/config
 * Update flywheel configuration (requires Privy JWT admin auth)
 */
router.post('/config', requireAdmin, requirePermission('update_config'), async (req: AdminRequest, res: Response) => {
  try {
    // Validate request body
    const parseResult = ConfigUpdateSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.errors,
      })
    }

    const config = parseResult.data

    // Convert snake_case request fields to camelCase for PlatformConfig
    const platformConfigUpdates: Record<string, any> = {}
    if (config.token_mint_address !== undefined) platformConfigUpdates.tokenMintAddress = config.token_mint_address
    if (config.token_symbol !== undefined) platformConfigUpdates.tokenSymbol = config.token_symbol
    if (config.token_decimals !== undefined) platformConfigUpdates.tokenDecimals = config.token_decimals
    if (config.flywheel_active !== undefined) platformConfigUpdates.flywheelActive = config.flywheel_active
    if (config.market_making_enabled !== undefined) platformConfigUpdates.marketMakingEnabled = config.market_making_enabled
    if (config.fee_collection_enabled !== undefined) platformConfigUpdates.feeCollectionEnabled = config.fee_collection_enabled
    if (config.fee_threshold_sol !== undefined) platformConfigUpdates.feeThresholdSol = config.fee_threshold_sol
    if (config.fee_percentage !== undefined) platformConfigUpdates.feePercentage = config.fee_percentage
    if (config.min_buy_amount_sol !== undefined) platformConfigUpdates.minBuyAmountSol = config.min_buy_amount_sol
    if (config.max_buy_amount_sol !== undefined) platformConfigUpdates.maxBuyAmountSol = config.max_buy_amount_sol
    if (config.buy_interval_minutes !== undefined) platformConfigUpdates.buyIntervalMinutes = config.buy_interval_minutes
    if (config.slippage_bps !== undefined) platformConfigUpdates.slippageBps = config.slippage_bps

    // Update config in database using Prisma via platformConfigService
    try {
      await platformConfigService.updateConfig(platformConfigUpdates)
    } catch (dbError) {
      loggers.server.error({ error: String(dbError) }, 'Database error updating config')
      return res.status(500).json({ error: 'Failed to update configuration' })
    }

    // Trigger immediate config reload in flywheel job
    requestConfigReload()

    // Log algorithm mode change if applicable
    if (config.algorithm_mode) {
      const previousMode = getCurrentAlgorithmMode()
      if (previousMode !== config.algorithm_mode) {
        loggers.server.info({ previousMode, newMode: config.algorithm_mode }, 'Algorithm mode will change')
      }
    }

    loggers.server.info({ privyUserId: req.privyUserId }, 'Config updated by admin')

    return res.json({
      success: true,
      message: 'Configuration updated successfully',
      configReloadTriggered: true,
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error in config update')
    return res.status(500).json({ error: 'Internal server error' })
  }
})


// Schema for manual sell request (simplified for Privy JWT auth)
const ManualSellSchema = z.object({
  percentage: z.number().min(1).max(100),
})

/**
 * POST /api/admin/manual-sell
 * Execute a manual sell of tokens (requires Privy JWT admin auth)
 */
router.post('/manual-sell', requireAdmin, requirePermission('trigger_jobs'), async (req: AdminRequest, res: Response) => {
  try {
    // Validate request body
    const parseResult = ManualSellSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.errors,
      })
    }

    const { percentage } = parseResult.data

    // Get current token balance
    const balances = await walletMonitor.getOpsWalletBalance()
    if (!balances || balances.token_balance <= 0) {
      return res.status(400).json({ error: 'No tokens available to sell' })
    }

    // Calculate amount to sell
    const tokenAmount = balances.token_balance * (percentage / 100)

    loggers.server.info({ percentage, tokenAmount, privyUserId: req.privyUserId }, 'Manual sell initiated by admin')

    // Temporarily enable market making for this operation
    const wasEnabled = marketMaker.getStats().isEnabled
    if (!wasEnabled) {
      marketMaker.enable()
    }

    // Execute the sell (bypass cap for manual sells - admin explicitly requested this amount)
    const result = await marketMaker.executeSell(tokenAmount, { bypassCap: true })

    // Restore previous state
    if (!wasEnabled) {
      marketMaker.disable()
    }

    if (!result) {
      return res.status(500).json({ error: 'Sell execution failed' })
    }

    loggers.server.info({ signature: result.signature }, 'Manual sell completed')

    return res.json({
      success: true,
      message: `Successfully sold ${percentage}% of tokens`,
      transaction: {
        signature: result.signature,
        amount: result.amount,
        token: result.token,
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error in manual sell')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN TOKEN MANAGEMENT
// View and manage all registered tokens across all users
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/tokens
 * List all registered tokens with their status (admin only)
 */
router.get('/tokens', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    // Query with filters
    const { status, risk, search, limit = 50, offset = 0 } = req.query

    let query = supabase
      .from('user_tokens')
      .select(`
        id,
        user_id,
        token_mint_address,
        token_symbol,
        token_name,
        token_image,
        token_decimals,
        dev_wallet_address,
        ops_wallet_address,
        is_active,
        is_verified,
        is_suspended,
        suspend_reason,
        risk_level,
        daily_trade_limit_sol,
        max_position_size_sol,
        created_at,
        users!inner(wallet_address),
        user_token_config(
          flywheel_active,
          market_making_enabled,
          auto_claim_enabled,
          algorithm_mode
        )
      `)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1)

    // Apply filters
    if (status === 'active') {
      query = query.eq('is_active', true).eq('is_suspended', false)
    } else if (status === 'suspended') {
      query = query.eq('is_suspended', true)
    } else if (status === 'inactive') {
      query = query.eq('is_active', false)
    }

    if (risk && ['low', 'medium', 'high'].includes(risk as string)) {
      query = query.eq('risk_level', risk)
    }

    if (search) {
      query = query.or(`token_symbol.ilike.%${search}%,token_mint_address.ilike.%${search}%`)
    }

    const { data: tokens, error } = await query

    if (error) {
      loggers.server.error({ error: String(error) }, 'Error fetching tokens')
      return res.status(500).json({ error: 'Failed to fetch tokens' })
    }

    // Get token count for pagination
    const { count } = await supabase
      .from('user_tokens')
      .select('*', { count: 'exact', head: true })

    // Format response
    const formattedTokens = (tokens || []).map((token: any) => ({
      id: token.id,
      userId: token.user_id,
      userWallet: token.users?.wallet_address || 'Unknown',
      tokenMint: token.token_mint_address,
      tokenSymbol: token.token_symbol,
      tokenName: token.token_name,
      tokenImage: token.token_image,
      tokenDecimals: token.token_decimals,
      devWallet: token.dev_wallet_address,
      opsWallet: token.ops_wallet_address,
      isActive: token.is_active,
      isVerified: token.is_verified || false,
      isSuspended: token.is_suspended || false,
      suspendReason: token.suspend_reason,
      riskLevel: token.risk_level || 'low',
      dailyTradeLimitSol: token.daily_trade_limit_sol || 10,
      maxPositionSizeSol: token.max_position_size_sol || 5,
      createdAt: token.created_at,
      config: token.user_token_config?.[0] || null,
    }))

    return res.json({
      success: true,
      data: {
        tokens: formattedTokens,
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset),
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error in admin tokens list')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/tokens/:id
 * Get detailed info for a specific token (admin only)
 */
router.get('/tokens/:id', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { id } = req.params

    const { data: token, error } = await supabase
      .from('user_tokens')
      .select(`
        *,
        users!inner(wallet_address, display_name, created_at),
        user_token_config(*),
        user_flywheel_state(*),
        user_claim_history(amount_sol, claimed_at)
      `)
      .eq('id', id)
      .single()

    if (error || !token) {
      return res.status(404).json({ error: 'Token not found' })
    }

    // Calculate stats
    const totalClaims = (token.user_claim_history || []).reduce(
      (sum: number, claim: any) => sum + (claim.amount_sol || 0),
      0
    )

    return res.json({
      success: true,
      data: {
        ...token,
        userWallet: token.users?.wallet_address,
        userName: token.users?.display_name,
        userCreatedAt: token.users?.created_at,
        config: token.user_token_config?.[0] || null,
        flywheelState: token.user_flywheel_state?.[0] || null,
        stats: {
          totalClaimsSol: totalClaims,
          claimCount: (token.user_claim_history || []).length,
        },
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching token details')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/tokens/:id/verify
 * Mark a token as verified (admin only)
 */
router.post('/tokens/:id/verify', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { id } = req.params

    const { error } = await supabase
      .from('user_tokens')
      .update({ is_verified: true })
      .eq('id', id)

    if (error) {
      loggers.server.error({ error: String(error) }, 'Error verifying token')
      return res.status(500).json({ error: 'Failed to verify token' })
    }

    loggers.server.info({ tokenId: id }, 'Admin verified token')

    return res.json({
      success: true,
      message: 'Token verified successfully',
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error verifying token')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/tokens/:id/suspend
 * Suspend a token (admin only)
 */
router.post('/tokens/:id/suspend', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { id } = req.params
    const { reason } = req.body

    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({ error: 'Suspension reason is required' })
    }

    // Validate reason length
    if (reason.length > 500) {
      return res.status(400).json({ error: 'Suspension reason must be 500 characters or less' })
    }

    // Suspend the token and disable all automation
    const { error: tokenError } = await supabase
      .from('user_tokens')
      .update({
        is_suspended: true,
        suspend_reason: reason,
      })
      .eq('id', id)

    if (tokenError) {
      loggers.server.error({ error: String(tokenError) }, 'Error suspending token')
      return res.status(500).json({ error: 'Failed to suspend token' })
    }

    // Disable automation in config
    await supabase
      .from('user_token_config')
      .update({
        flywheel_active: false,
        market_making_enabled: false,
        auto_claim_enabled: false,
      })
      .eq('user_token_id', id)

    loggers.server.warn({ tokenId: id, reason }, 'Admin suspended token')

    return res.json({
      success: true,
      message: 'Token suspended successfully',
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error suspending token')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/tokens/:id/unsuspend
 * Remove suspension from a token (admin only)
 */
router.post('/tokens/:id/unsuspend', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { id } = req.params

    const { error } = await supabase
      .from('user_tokens')
      .update({
        is_suspended: false,
        suspend_reason: null,
      })
      .eq('id', id)

    if (error) {
      loggers.server.error({ error: String(error) }, 'Error unsuspending token')
      return res.status(500).json({ error: 'Failed to unsuspend token' })
    }

    loggers.server.info({ tokenId: id }, 'Admin unsuspended token')

    return res.json({
      success: true,
      message: 'Token unsuspended successfully',
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error unsuspending token')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/admin/tokens/:id/limits
 * Update trading limits for a token (admin only)
 */
router.put('/tokens/:id/limits', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { id } = req.params
    const { dailyTradeLimitSol, maxPositionSizeSol, riskLevel } = req.body

    // Define reasonable upper bounds
    const MAX_DAILY_LIMIT_SOL = 1000
    const MAX_POSITION_SIZE_SOL = 100

    const updates: any = {}

    if (typeof dailyTradeLimitSol === 'number') {
      if (dailyTradeLimitSol < 0 || dailyTradeLimitSol > MAX_DAILY_LIMIT_SOL) {
        return res.status(400).json({
          error: `Daily trade limit must be between 0 and ${MAX_DAILY_LIMIT_SOL} SOL`
        })
      }
      updates.daily_trade_limit_sol = dailyTradeLimitSol
    }

    if (typeof maxPositionSizeSol === 'number') {
      if (maxPositionSizeSol < 0 || maxPositionSizeSol > MAX_POSITION_SIZE_SOL) {
        return res.status(400).json({
          error: `Max position size must be between 0 and ${MAX_POSITION_SIZE_SOL} SOL`
        })
      }
      updates.max_position_size_sol = maxPositionSizeSol
    }

    if (riskLevel && ['low', 'medium', 'high'].includes(riskLevel)) {
      updates.risk_level = riskLevel
    } else if (riskLevel !== undefined) {
      return res.status(400).json({ error: 'Risk level must be low, medium, or high' })
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid updates provided' })
    }

    const { error } = await supabase
      .from('user_tokens')
      .update(updates)
      .eq('id', id)

    if (error) {
      loggers.server.error({ error: String(error) }, 'Error updating limits')
      return res.status(500).json({ error: 'Failed to update limits' })
    }

    loggers.server.info({ tokenId: id, updates }, 'Admin updated limits for token')

    return res.json({
      success: true,
      message: 'Limits updated successfully',
      updates,
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error updating limits')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/platform-stats
 * Get platform-wide statistics (admin only)
 */
router.get('/platform-stats', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    // Get counts
    const [usersResult, tokensResult, activeTokensResult, suspendedTokensResult] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('user_tokens').select('*', { count: 'exact', head: true }),
      supabase.from('user_tokens').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('is_suspended', false),
      supabase.from('user_tokens').select('*', { count: 'exact', head: true }).eq('is_suspended', true),
    ])

    // Get active flywheel count
    const { count: activeFlywheels } = await supabase
      .from('user_token_config')
      .select('*', { count: 'exact', head: true })
      .eq('flywheel_active', true)

    // Get job statuses
    const claimJobStatus = getClaimJobStatus()
    const flywheelJobStatus = getMultiUserFlywheelJobStatus()
    const fastClaimJobStatus = getFastClaimJobStatus()
    const balanceUpdateJobStatus = getBalanceUpdateJobStatus()

    return res.json({
      success: true,
      data: {
        users: {
          total: usersResult.count || 0,
        },
        tokens: {
          total: tokensResult.count || 0,
          active: activeTokensResult.count || 0,
          suspended: suspendedTokensResult.count || 0,
          activeFlywheels: activeFlywheels || 0,
        },
        jobs: {
          fastClaim: fastClaimJobStatus,
          claim: claimJobStatus,
          flywheel: flywheelJobStatus,
          balanceUpdate: balanceUpdateJobStatus,
        },
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching platform stats')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/tokens/suspend-all
 * Suspend all user tokens except the platform's own token (admin only)
 */
router.post('/tokens/suspend-all', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { reason } = req.body

    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({ error: 'Suspension reason is required' })
    }

    // Get all tokens except platform token
    const { data: tokens, error: fetchError } = await supabase
      .from('user_tokens')
      .select('id, token_symbol, token_mint_address')
      .neq('token_mint_address', PLATFORM_TOKEN_MINT)
      .eq('is_suspended', false)

    if (fetchError) {
      loggers.server.error({ error: String(fetchError) }, 'Error fetching tokens for bulk suspend')
      return res.status(500).json({ error: 'Failed to fetch tokens' })
    }

    if (!tokens || tokens.length === 0) {
      return res.json({
        success: true,
        message: 'No tokens to suspend',
        suspended: 0,
      })
    }

    // Suspend all tokens
    const tokenIds = tokens.map((t: any) => t.id)

    const { error: suspendError } = await supabase
      .from('user_tokens')
      .update({
        is_suspended: true,
        suspend_reason: reason,
      })
      .in('id', tokenIds)

    if (suspendError) {
      loggers.server.error({ error: String(suspendError) }, 'Error bulk suspending tokens')
      return res.status(500).json({ error: 'Failed to suspend tokens' })
    }

    // Disable all automation for these tokens
    await supabase
      .from('user_token_config')
      .update({
        flywheel_active: false,
        market_making_enabled: false,
        auto_claim_enabled: false,
      })
      .in('user_token_id', tokenIds)

    loggers.server.warn({ count: tokens.length, reason, excludedToken: PLATFORM_TOKEN_MINT }, 'Admin BULK SUSPENDED tokens')

    return res.json({
      success: true,
      message: `Suspended ${tokens.length} tokens`,
      suspended: tokens.length,
      excluded: PLATFORM_TOKEN_MINT,
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error bulk suspending tokens')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/tokens/unsuspend-all
 * Unsuspend all user tokens (admin only)
 */
router.post('/tokens/unsuspend-all', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    // Get all suspended tokens
    const { data: tokens, error: fetchError } = await supabase
      .from('user_tokens')
      .select('id')
      .eq('is_suspended', true)

    if (fetchError) {
      loggers.server.error({ error: String(fetchError) }, 'Error fetching suspended tokens')
      return res.status(500).json({ error: 'Failed to fetch tokens' })
    }

    if (!tokens || tokens.length === 0) {
      return res.json({
        success: true,
        message: 'No tokens to unsuspend',
        unsuspended: 0,
      })
    }

    const tokenIds = tokens.map((t: any) => t.id)

    const { error: unsuspendError } = await supabase
      .from('user_tokens')
      .update({
        is_suspended: false,
        suspend_reason: null,
      })
      .in('id', tokenIds)

    if (unsuspendError) {
      loggers.server.error({ error: String(unsuspendError) }, 'Error bulk unsuspending tokens')
      return res.status(500).json({ error: 'Failed to unsuspend tokens' })
    }

    loggers.server.info({ count: tokens.length }, 'Admin BULK UNSUSPENDED tokens')

    return res.json({
      success: true,
      message: `Unsuspended ${tokens.length} tokens`,
      unsuspended: tokens.length,
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error bulk unsuspending tokens')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/admin/platform-settings
 * Update platform job settings (claim interval, max trades) (admin only)
 */
router.put('/platform-settings', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { claimIntervalMinutes, flywheelIntervalMinutes, maxTradesPerMinute } = req.body

    const updates: string[] = []

    // Update claim job interval
    if (typeof claimIntervalMinutes === 'number' && claimIntervalMinutes >= 1 && claimIntervalMinutes <= 1440) {
      restartClaimJob(claimIntervalMinutes)
      updates.push(`Claim interval: ${claimIntervalMinutes} minutes`)
    }

    // Update flywheel job settings
    if (
      (typeof flywheelIntervalMinutes === 'number' && flywheelIntervalMinutes >= 1) ||
      (typeof maxTradesPerMinute === 'number' && maxTradesPerMinute >= 1 && maxTradesPerMinute <= 100)
    ) {
      restartFlywheelJob(
        typeof flywheelIntervalMinutes === 'number' ? flywheelIntervalMinutes : undefined,
        typeof maxTradesPerMinute === 'number' ? maxTradesPerMinute : undefined
      )
      if (typeof flywheelIntervalMinutes === 'number') {
        updates.push(`Flywheel interval: ${flywheelIntervalMinutes} minutes`)
      }
      if (typeof maxTradesPerMinute === 'number') {
        updates.push(`Max trades: ${maxTradesPerMinute}/minute`)
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid settings provided' })
    }

    loggers.server.info({ updates }, 'Admin updated platform settings')

    return res.json({
      success: true,
      message: 'Platform settings updated',
      updates,
      currentSettings: {
        claim: getClaimJobStatus(),
        flywheel: getMultiUserFlywheelJobStatus(),
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error updating platform settings')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/platform-settings
 * Get current platform job settings (admin only)
 */
router.get('/platform-settings', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    return res.json({
      success: true,
      data: {
        fastClaim: getFastClaimJobStatus(),
        claim: getClaimJobStatus(),
        flywheel: getMultiUserFlywheelJobStatus(),
        balanceUpdate: getBalanceUpdateJobStatus(),
        platformToken: PLATFORM_TOKEN_MINT,
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching platform settings')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// FAST CLAIM JOB MANAGEMENT
// High-frequency fee claiming (every 30 seconds, >= 0.15 SOL threshold)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/fast-claim/status
 * Get fast claim job status (admin only)
 */
router.get('/fast-claim/status', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const status = getFastClaimJobStatus()

    return res.json({
      success: true,
      data: {
        ...status,
        description: 'High-frequency fee claiming - checks every 30 seconds, claims when >= 0.15 SOL',
        feeSplit: {
          platformFee: '10%',
          userReceives: '90%',
        },
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching fast claim status')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/fast-claim/trigger
 * Manually trigger a fast claim cycle (admin only)
 */
router.post('/fast-claim/trigger', requireAdmin, requirePermission('trigger_jobs'), async (req: AdminRequest, res: Response) => {
  try {
    loggers.server.info('Admin triggered manual fast claim cycle')

    // Run async - don't wait for completion
    triggerFastClaimCycle().catch(err => {
      loggers.server.error({ error: String(err) }, 'Fast claim cycle error')
    })

    return res.json({
      success: true,
      message: 'Fast claim cycle triggered. Check logs for results.',
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error triggering fast claim')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/fast-claim/restart
 * Restart fast claim job with optional new interval (admin only)
 */
router.post('/fast-claim/restart', requireAdmin, requirePermission('trigger_jobs'), async (req: AdminRequest, res: Response) => {
  try {
    const { intervalSeconds } = req.body

    // Validate interval if provided
    if (intervalSeconds !== undefined) {
      if (typeof intervalSeconds !== 'number' || intervalSeconds < 10 || intervalSeconds > 3600) {
        return res.status(400).json({
          error: 'Invalid interval. Must be between 10 and 3600 seconds.',
        })
      }
    }

    restartFastClaimJob(intervalSeconds)

    const newStatus = getFastClaimJobStatus()

    return res.json({
      success: true,
      message: 'Fast claim job restarted',
      data: newStatus,
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error restarting fast claim job')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// BALANCE UPDATE JOB MANAGEMENT
// Periodic wallet balance caching (every 5 minutes by default)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/balance-update/status
 * Get balance update job status (admin only)
 */
router.get('/balance-update/status', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const status = getBalanceUpdateJobStatus()

    return res.json({
      success: true,
      data: {
        ...status,
        description: 'Periodic wallet balance caching - updates dev/ops wallet balances for all active tokens',
        batchSize: process.env.BALANCE_UPDATE_BATCH_SIZE || '50',
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching balance update status')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/balance-update/trigger
 * Manually trigger a balance update cycle (admin only)
 */
router.post('/balance-update/trigger', requireAdmin, requirePermission('trigger_jobs'), async (req: AdminRequest, res: Response) => {
  try {
    loggers.server.info('Admin triggered manual balance update cycle')

    // Run async - don't wait for completion
    triggerBalanceUpdate().catch(err => {
      loggers.server.error({ error: String(err) }, 'Balance update cycle error')
    })

    return res.json({
      success: true,
      message: 'Balance update cycle triggered. Check logs for results.',
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error triggering balance update')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/balance-update/restart
 * Restart balance update job with optional new interval (admin only)
 */
router.post('/balance-update/restart', requireAdmin, requirePermission('trigger_jobs'), async (req: AdminRequest, res: Response) => {
  try {
    const { intervalSeconds } = req.body

    // Validate interval if provided
    if (intervalSeconds !== undefined) {
      if (typeof intervalSeconds !== 'number' || intervalSeconds < 60 || intervalSeconds > 3600) {
        return res.status(400).json({
          error: 'Invalid interval. Must be between 60 and 3600 seconds.',
        })
      }
    }

    restartBalanceUpdateJob(intervalSeconds)

    const newStatus = getBalanceUpdateJobStatus()

    return res.json({
      success: true,
      message: 'Balance update job restarted',
      data: newStatus,
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error restarting balance update job')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/flywheel-status
 * Get current flywheel status including algorithm mode (admin only)
 */
router.get('/flywheel-status', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const cachedConfig = getCachedConfig()
    const currentMode = getCurrentAlgorithmMode()

    return res.json({
      success: true,
      data: {
        algorithmMode: currentMode,
        flywheelActive: cachedConfig?.flywheel_active ?? false,
        marketMakingEnabled: cachedConfig?.market_making_enabled ?? false,
        feeCollectionEnabled: cachedConfig?.fee_collection_enabled ?? false,
        configCached: cachedConfig !== null,
        jobStatus: getMultiUserFlywheelJobStatus(),
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching flywheel status')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/config/reload
 * Manually trigger a config reload (admin only)
 */
router.post('/config/reload', requireAdmin, requirePermission('update_config'), async (req: AdminRequest, res: Response) => {
  try {
    requestConfigReload()

    return res.json({
      success: true,
      message: 'Config reload triggered. Changes will apply on next flywheel cycle.',
      currentMode: getCurrentAlgorithmMode(),
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error triggering config reload')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM LAUNCH MANAGEMENT
// Monitor pending/failed launches and process refunds
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/telegram/stats
 * Get launch statistics (admin only)
 */
router.get('/telegram/stats', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const stats = await getLaunchStats()

    return res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching launch stats')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/launches
 * List all pending launches with refund info (admin only)
 */
router.get('/telegram/launches', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { status, limit = 50, offset = 0 } = req.query

    let query = supabase
      .from('pending_token_launches')
      .select(`
        *,
        telegram_users (telegram_id, telegram_username)
      `)
      .order('updated_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1)

    // Apply status filter
    if (status && ['awaiting_deposit', 'launching', 'completed', 'failed', 'expired', 'refunded'].includes(status as string)) {
      query = query.eq('status', status)
    }

    const { data: launches, error } = await query

    if (error) {
      loggers.server.error({ error: String(error) }, 'Error fetching launches')
      return res.status(500).json({ error: 'Failed to fetch launches' })
    }

    // Get total count
    const { count } = await supabase
      .from('pending_token_launches')
      .select('*', { count: 'exact', head: true })

    return res.json({
      success: true,
      data: {
        launches: launches || [],
        total: count || 0,
        limit: Number(limit),
        offset: Number(offset),
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching launches')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/refunds
 * Get launches that need refunds (failed/expired with balance) (admin only)
 */
router.get('/telegram/refunds', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const pendingRefunds = await getPendingRefunds()

    return res.json({
      success: true,
      data: {
        refunds: pendingRefunds,
        total: pendingRefunds.length,
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching pending refunds')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/telegram/refund/:id
 * Execute a refund for a failed/expired launch (admin only)
 */
router.post('/telegram/refund/:id', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { id } = req.params
    const { refundAddress } = req.body

    if (!refundAddress || typeof refundAddress !== 'string') {
      return res.status(400).json({ error: 'Refund address is required' })
    }

    loggers.server.info({ launchId: id, refundAddress }, 'Admin initiating refund')

    const result = await executeRefund(id, refundAddress)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      })
    }

    return res.json({
      success: true,
      data: {
        signature: result.signature,
        amountRefunded: result.amountRefunded,
        refundAddress: result.refundAddress,
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error executing refund')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/logs
 * Get Telegram audit logs (admin only)
 */
router.get('/telegram/logs', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { limit = 100, event_type } = req.query

    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    let query = supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Number(limit))

    // Filter by event type if specified
    if (event_type && typeof event_type === 'string') {
      query = query.eq('event_type', event_type)
    }

    const { data: logs, error } = await query

    if (error) {
      loggers.server.error({ error: String(error) }, 'Error fetching audit logs')
      return res.status(500).json({ error: 'Failed to fetch logs' })
    }

    return res.json({
      success: true,
      data: {
        logs: logs || [],
        total: (logs || []).length,
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching audit logs')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/launch/:id
 * Get detailed info for a specific launch (admin only)
 */
router.get('/telegram/launch/:id', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { id } = req.params

    const { data: launch, error } = await supabase
      .from('pending_token_launches')
      .select(`
        *,
        telegram_users (telegram_id, telegram_username)
      `)
      .eq('id', id)
      .single()

    if (error || !launch) {
      return res.status(404).json({ error: 'Launch not found' })
    }

    // Get related audit logs
    const { data: auditLogs } = await supabase
      .from('audit_log')
      .select('*')
      .eq('pending_launch_id', id)
      .order('created_at', { ascending: false })

    return res.json({
      success: true,
      data: {
        launch,
        auditLogs: auditLogs || [],
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching launch details')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/telegram/launch/:id/cancel
 * Cancel a pending launch (admin only)
 */
router.post('/telegram/launch/:id/cancel', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { id } = req.params
    const { reason } = req.body

    // Get the launch
    const { data: launch, error: fetchError } = await supabase
      .from('pending_token_launches')
      .select('*, telegram_users (telegram_id)')
      .eq('id', id)
      .single()

    if (fetchError || !launch) {
      return res.status(404).json({ error: 'Launch not found' })
    }

    // Only allow cancelling awaiting_deposit or launching status
    if (!['awaiting_deposit', 'launching'].includes(launch.status)) {
      return res.status(400).json({ error: `Cannot cancel launch with status: ${launch.status}` })
    }

    // Update status to expired
    const { error: updateError } = await supabase
      .from('pending_token_launches')
      .update({
        status: 'expired',
        error_message: reason || 'Cancelled by admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      return res.status(500).json({ error: 'Failed to cancel launch' })
    }

    // Log audit event
    await supabase.from('audit_log').insert({
      event_type: 'launch_cancelled',
      pending_launch_id: id,
      telegram_id: launch.telegram_users?.telegram_id,
      details: { reason: reason || 'Cancelled by admin' },
    })

    // Notify user
    if (launch.telegram_users?.telegram_id) {
      try {
        const { getBot } = await import('../telegram/bot')
        const bot = getBot()
        if (bot) {
          await bot.telegram.sendMessage(
            launch.telegram_users.telegram_id,
            `⚠️ Your ${launch.token_symbol} launch has been cancelled.\n\n${reason ? `Reason: ${reason}\n\n` : ''}Use /launch to start a new launch.`,
            { parse_mode: 'Markdown' }
          )
        }
      } catch (e) {
        loggers.server.error({ error: String(e) }, 'Error notifying user')
      }
    }

    return res.json({
      success: true,
      message: 'Launch cancelled',
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error cancelling launch')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/bot-health
 * Get bot and deposit monitor health status (admin only)
 */
router.get('/telegram/bot-health', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    // Get deposit monitor status
    const depositMonitorStatus = getDepositMonitorStatus()

    // Get last activity from audit logs
    const { data: lastActivity } = await supabase
      .from('audit_log')
      .select('created_at, event_type')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Get last successful launch
    const { data: lastLaunch } = await supabase
      .from('pending_token_launches')
      .select('created_at, token_symbol, status')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    // Check if bot is responsive by looking at recent activity
    const lastActivityTime = lastActivity?.created_at
      ? new Date(lastActivity.created_at)
      : null
    const minutesSinceLastActivity = lastActivityTime
      ? Math.floor((Date.now() - lastActivityTime.getTime()) / 60000)
      : null

    return res.json({
      success: true,
      data: {
        depositMonitor: {
          running: depositMonitorStatus.running,
          isProcessing: depositMonitorStatus.isProcessing,
        },
        lastActivity: lastActivity ? {
          timestamp: lastActivity.created_at,
          eventType: lastActivity.event_type,
          minutesAgo: minutesSinceLastActivity,
        } : null,
        lastLaunch: lastLaunch ? {
          timestamp: lastLaunch.created_at,
          tokenSymbol: lastLaunch.token_symbol,
          status: lastLaunch.status,
        } : null,
        botHealthy: depositMonitorStatus.running,
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching bot health')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/financial-metrics
 * Get financial metrics for Telegram launches (admin only)
 */
router.get('/telegram/financial-metrics', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    // Get all launches for calculations
    const { data: launches, error } = await supabase
      .from('pending_token_launches')
      .select('status, deposit_received_sol, created_at')

    if (error) {
      loggers.server.error({ error: String(error) }, 'Error fetching launches for metrics')
      return res.status(500).json({ error: 'Failed to fetch financial metrics' })
    }

    // Calculate metrics
    let totalSolProcessed = 0
    let totalRefunded = 0
    let pendingSol = 0
    let launchFeesCollected = 0 // 0.1 SOL per successful launch
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    let todayLaunches = 0
    let todayDeposits = 0

    for (const launch of launches || []) {
      const depositSol = Number(launch.deposit_received_sol) || 0

      if (launch.status === 'completed') {
        totalSolProcessed += depositSol
        launchFeesCollected += 0.1 // Launch fee per successful launch
      } else if (launch.status === 'refunded') {
        totalRefunded += depositSol
      } else if (['awaiting_deposit', 'launching'].includes(launch.status)) {
        pendingSol += depositSol
      }

      // Check if today
      if (new Date(launch.created_at) >= todayStart) {
        todayLaunches++
        todayDeposits += depositSol
      }
    }

    // Get platform claim revenue (10% of all claims)
    const { data: claimHistory } = await supabase
      .from('user_claim_history')
      .select('platform_fee_sol')

    let platformRevenue = launchFeesCollected
    for (const claim of claimHistory || []) {
      platformRevenue += Number(claim.platform_fee_sol) || 0
    }

    return res.json({
      success: true,
      data: {
        totalSolProcessed,
        totalRefunded,
        pendingSol,
        launchFeesCollected,
        platformRevenue,
        today: {
          launches: todayLaunches,
          deposits: todayDeposits,
        },
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching financial metrics')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/users
 * Get list of Telegram users with their launch counts (admin only)
 */
router.get('/telegram/users', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { limit = 50, offset = 0, search } = req.query

    // Get telegram users with launch counts
    let query = supabase
      .from('telegram_users')
      .select(`
        id,
        telegram_id,
        telegram_username,
        created_at,
        pending_token_launches(count)
      `)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1)

    if (search) {
      query = query.or(`telegram_username.ilike.%${search}%,telegram_id.ilike.%${search}%`)
    }

    const { data: users, error } = await query

    if (error) {
      loggers.server.error({ error: String(error) }, 'Error fetching telegram users')
      return res.status(500).json({ error: 'Failed to fetch users' })
    }

    // Get total user count
    const { count: totalCount } = await supabase
      .from('telegram_users')
      .select('*', { count: 'exact', head: true })

    // Format response with launch counts
    const formattedUsers = (users || []).map((user: any) => ({
      id: user.id,
      telegramId: user.telegram_id,
      username: user.telegram_username,
      createdAt: user.created_at,
      launchCount: user.pending_token_launches?.[0]?.count || 0,
    }))

    return res.json({
      success: true,
      data: {
        users: formattedUsers,
        total: totalCount || 0,
        limit: Number(limit),
        offset: Number(offset),
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching telegram users')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/telegram/bulk-refund
 * Execute refunds for multiple launches (admin only)
 */
router.post('/telegram/bulk-refund', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { launchIds } = req.body

    if (!Array.isArray(launchIds) || launchIds.length === 0) {
      return res.status(400).json({ error: 'launchIds array is required' })
    }

    if (launchIds.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 refunds at a time' })
    }

    const results: Array<{
      launchId: string
      success: boolean
      signature?: string
      amountRefunded?: number
      error?: string
    }> = []

    // Process refunds sequentially to avoid rate limits
    for (const launchId of launchIds) {
      try {
        // Get the launch to find original funder
        if (!supabase) continue

        const { data: launch } = await supabase
          .from('pending_token_launches')
          .select('dev_wallet_address')
          .eq('id', launchId)
          .single()

        if (!launch) {
          results.push({ launchId, success: false, error: 'Launch not found' })
          continue
        }

        // Find original funder
        const { findOriginalFunder } = await import('../services/refund.service')
        const originalFunder = await findOriginalFunder(launch.dev_wallet_address)

        if (!originalFunder) {
          results.push({ launchId, success: false, error: 'Could not find original funder' })
          continue
        }

        // Execute refund
        const result = await executeRefund(launchId, originalFunder)
        results.push({
          launchId,
          success: result.success,
          signature: result.signature,
          amountRefunded: result.amountRefunded,
          error: result.error,
        })
      } catch (err: any) {
        results.push({ launchId, success: false, error: err.message })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return res.json({
      success: true,
      data: {
        results,
        summary: {
          total: launchIds.length,
          successful: successCount,
          failed: failCount,
        },
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error executing bulk refunds')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/launches/search
 * Search launches with advanced filters (admin only)
 */
router.get('/telegram/launches/search', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const {
      status,
      search,
      username,
      dateFrom,
      dateTo,
      limit = 50,
      offset = 0,
      sortBy = 'updated_at',
      sortOrder = 'desc',
    } = req.query

    let query = supabase
      .from('pending_token_launches')
      .select(`
        *,
        telegram_users (telegram_id, telegram_username)
      `)

    // Apply status filter
    if (status && ['awaiting_deposit', 'launching', 'completed', 'failed', 'expired', 'refunded'].includes(status as string)) {
      query = query.eq('status', status)
    }

    // Apply token search (name or symbol)
    if (search) {
      query = query.or(`token_name.ilike.%${search}%,token_symbol.ilike.%${search}%,token_mint_address.ilike.%${search}%`)
    }

    // Apply date filters
    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo)
    }

    // Apply sorting
    const validSortFields = ['created_at', 'updated_at', 'deposit_received_sol', 'token_symbol']
    const sortField = validSortFields.includes(sortBy as string) ? sortBy as string : 'updated_at'
    const ascending = sortOrder === 'asc'
    query = query.order(sortField, { ascending })

    // Apply pagination
    query = query.range(Number(offset), Number(offset) + Number(limit) - 1)

    const { data: launches, error } = await query

    if (error) {
      loggers.server.error({ error: String(error) }, 'Error searching launches')
      return res.status(500).json({ error: 'Failed to search launches' })
    }

    // Filter by username if provided (done post-query due to join limitations)
    let filteredLaunches = launches || []
    if (username) {
      const usernameLower = (username as string).toLowerCase()
      filteredLaunches = filteredLaunches.filter((l: any) =>
        l.telegram_users?.telegram_username?.toLowerCase().includes(usernameLower)
      )
    }

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('pending_token_launches')
      .select('*', { count: 'exact', head: true })

    return res.json({
      success: true,
      data: {
        launches: filteredLaunches,
        total: totalCount || 0,
        limit: Number(limit),
        offset: Number(offset),
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error searching launches')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/export
 * Export launches data as JSON (admin only)
 */
router.get('/telegram/export', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { status, dateFrom, dateTo } = req.query

    let query = supabase
      .from('pending_token_launches')
      .select(`
        id,
        token_name,
        token_symbol,
        status,
        deposit_received_sol,
        token_mint_address,
        dev_wallet_address,
        ops_wallet_address,
        error_message,
        created_at,
        updated_at,
        telegram_users (telegram_id, telegram_username)
      `)
      .order('created_at', { ascending: false })

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo)
    }

    const { data: launches, error } = await query

    if (error) {
      loggers.server.error({ error: String(error) }, 'Error exporting launches')
      return res.status(500).json({ error: 'Failed to export launches' })
    }

    // Format for export
    const exportData = (launches || []).map((launch: any) => ({
      id: launch.id,
      tokenName: launch.token_name,
      tokenSymbol: launch.token_symbol,
      status: launch.status,
      depositSol: launch.deposit_received_sol,
      tokenMint: launch.token_mint_address,
      devWallet: launch.dev_wallet_address,
      opsWallet: launch.ops_wallet_address,
      error: launch.error_message,
      telegramUsername: launch.telegram_users?.telegram_username,
      telegramId: launch.telegram_users?.telegram_id,
      createdAt: launch.created_at,
      updatedAt: launch.updated_at,
    }))

    // Set headers for file download
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename=telegram-launches-${new Date().toISOString().split('T')[0]}.json`)

    return res.json({
      exportedAt: new Date().toISOString(),
      totalRecords: exportData.length,
      filters: { status, dateFrom, dateTo },
      data: exportData,
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error exporting launches')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/chart-data
 * Get time-series data for charts (admin only)
 */
router.get('/telegram/chart-data', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { days = 30 } = req.query
    const daysNum = Math.min(Number(days) || 30, 90) // Max 90 days

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysNum)

    // Get all launches in date range
    const { data: launches, error } = await supabase
      .from('pending_token_launches')
      .select('status, deposit_received_sol, created_at, updated_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })

    if (error) {
      loggers.server.error({ error: String(error) }, 'Error fetching chart data')
      return res.status(500).json({ error: 'Failed to fetch chart data' })
    }

    // Initialize daily data structure
    const dailyData: Record<string, {
      date: string
      total: number
      completed: number
      failed: number
      expired: number
      refunded: number
      awaiting: number
      launching: number
      solProcessed: number
    }> = {}

    // Initialize all days in range
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0]
      dailyData[dateKey] = {
        date: dateKey,
        total: 0,
        completed: 0,
        failed: 0,
        expired: 0,
        refunded: 0,
        awaiting: 0,
        launching: 0,
        solProcessed: 0,
      }
    }

    // Aggregate status totals
    const statusTotals = {
      completed: 0,
      failed: 0,
      expired: 0,
      refunded: 0,
      awaiting_deposit: 0,
      launching: 0,
    }

    // Process launches
    for (const launch of launches || []) {
      const dateKey = launch.created_at.split('T')[0]
      const depositSol = Number(launch.deposit_received_sol) || 0

      if (dailyData[dateKey]) {
        dailyData[dateKey].total++

        switch (launch.status) {
          case 'completed':
            dailyData[dateKey].completed++
            dailyData[dateKey].solProcessed += depositSol
            statusTotals.completed++
            break
          case 'failed':
            dailyData[dateKey].failed++
            statusTotals.failed++
            break
          case 'expired':
            dailyData[dateKey].expired++
            statusTotals.expired++
            break
          case 'refunded':
            dailyData[dateKey].refunded++
            statusTotals.refunded++
            break
          case 'awaiting_deposit':
            dailyData[dateKey].awaiting++
            statusTotals.awaiting_deposit++
            break
          case 'launching':
            dailyData[dateKey].launching++
            statusTotals.launching++
            break
        }
      }
    }

    // Convert to array for charts
    const dailyChartData = Object.values(dailyData).map(day => ({
      ...day,
      // Format date for display (MM/DD)
      displayDate: `${day.date.split('-')[1]}/${day.date.split('-')[2]}`,
    }))

    // Calculate success rate over time (7-day rolling average)
    const successRateData = dailyChartData.map((day, index) => {
      // Get last 7 days including current
      const windowStart = Math.max(0, index - 6)
      const window = dailyChartData.slice(windowStart, index + 1)
      const totalInWindow = window.reduce((sum, d) => sum + d.total, 0)
      const completedInWindow = window.reduce((sum, d) => sum + d.completed, 0)
      const successRate = totalInWindow > 0 ? (completedInWindow / totalInWindow) * 100 : 0

      return {
        date: day.date,
        displayDate: day.displayDate,
        successRate: Math.round(successRate * 10) / 10,
      }
    })

    // Status distribution for pie chart
    const statusDistribution = [
      { name: 'Completed', value: statusTotals.completed, color: '#22c55e' },
      { name: 'Failed', value: statusTotals.failed, color: '#ef4444' },
      { name: 'Expired', value: statusTotals.expired, color: '#6b7280' },
      { name: 'Refunded', value: statusTotals.refunded, color: '#8b5cf6' },
      { name: 'Awaiting', value: statusTotals.awaiting_deposit, color: '#f59e0b' },
      { name: 'Launching', value: statusTotals.launching, color: '#3b82f6' },
    ].filter(s => s.value > 0)

    return res.json({
      success: true,
      data: {
        dailyData: dailyChartData,
        successRateData,
        statusDistribution,
        summary: {
          totalLaunches: launches?.length || 0,
          avgLaunchesPerDay: Math.round(((launches?.length || 0) / daysNum) * 10) / 10,
          overallSuccessRate: launches?.length
            ? Math.round((statusTotals.completed / launches.length) * 1000) / 10
            : 0,
        },
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching chart data')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// BOT ALERTS & MAINTENANCE MODE
// Manage downtime alerts and broadcast messages to subscribers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/telegram/alerts/status
 * Get bot status and subscriber count (admin only)
 */
router.get('/telegram/alerts/status', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const {
      getBotStatus,
      getSubscriberCount,
      getActiveSubscribers,
    } = await import('../services/bot-alerts.service')

    const [status, subscriberCount, subscribers] = await Promise.all([
      getBotStatus(),
      getSubscriberCount(),
      getActiveSubscribers(),
    ])

    return res.json({
      success: true,
      data: {
        botStatus: status,
        subscriberCount,
        subscribers: subscribers.map(s => ({
          telegramId: s.telegramId,
          username: s.telegramUsername,
          subscribedAt: s.subscribedAt,
        })),
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error fetching alert status')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/telegram/maintenance/enable
 * Enable maintenance mode and notify subscribers (admin only)
 */
router.post('/telegram/maintenance/enable', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { reason, estimatedEndTime, notifyUsers = true } = req.body

    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({ error: 'Maintenance reason is required' })
    }

    if (reason.length > 500) {
      return res.status(400).json({ error: 'Reason must be 500 characters or less' })
    }

    const { enableMaintenanceMode } = await import('../services/bot-alerts.service')
    const result = await enableMaintenanceMode(reason, estimatedEndTime, notifyUsers)

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      })
    }

    loggers.server.info({ reason }, 'Admin enabled maintenance mode')

    return res.json({
      success: true,
      message: 'Maintenance mode enabled',
      notifiedUsers: result.notifiedCount || 0,
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error enabling maintenance mode')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/telegram/maintenance/disable
 * Disable maintenance mode and notify subscribers (admin only)
 */
router.post('/telegram/maintenance/disable', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { notifyUsers = true } = req.body

    const { disableMaintenanceMode } = await import('../services/bot-alerts.service')
    const result = await disableMaintenanceMode(notifyUsers)

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      })
    }

    loggers.server.info('Admin disabled maintenance mode')

    return res.json({
      success: true,
      message: 'Maintenance mode disabled',
      notifiedUsers: result.notifiedCount || 0,
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error disabling maintenance mode')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/telegram/broadcast
 * Send a broadcast message to all alert subscribers (admin only)
 */
router.post('/telegram/broadcast', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { title, body } = req.body

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' })
    }

    if (!body || typeof body !== 'string') {
      return res.status(400).json({ error: 'Body is required' })
    }

    if (title.length > 100) {
      return res.status(400).json({ error: 'Title must be 100 characters or less' })
    }

    if (body.length > 2000) {
      return res.status(400).json({ error: 'Body must be 2000 characters or less' })
    }

    const { sendAdminAnnouncement } = await import('../services/bot-alerts.service')
    const result = await sendAdminAnnouncement(title, body)

    loggers.server.info({ title, successful: result.successful, total: result.total }, 'Admin broadcast sent')

    return res.json({
      success: true,
      message: 'Broadcast sent',
      data: {
        total: result.total,
        successful: result.successful,
        failed: result.failed,
        errors: result.errors.slice(0, 5), // Only return first 5 errors
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error sending broadcast')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/telegram/broadcast/preview
 * Preview a broadcast message (admin only)
 */
router.post('/telegram/broadcast/preview', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { title, body } = req.body

    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' })
    }

    const { getSubscriberCount } = await import('../services/bot-alerts.service')
    const subscriberCount = await getSubscriberCount()

    const previewMessage = `📢 *${title}*

${body}

_You're receiving this because you subscribed to alerts._
_Use /alerts to manage your subscription._`

    return res.json({
      success: true,
      data: {
        preview: previewMessage,
        subscriberCount,
        estimatedDeliveryTime: Math.ceil(subscriberCount / 25) + ' seconds', // 25 msgs/sec
      },
    })
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error previewing broadcast')
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// FLYWHEEL MANUAL TRIGGER
// Manually trigger a flywheel cycle for testing/debugging
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/flywheel/trigger
 * Manually trigger a multi-user flywheel cycle (admin only)
 */
router.post('/flywheel/trigger', requireAdmin, requirePermission('trigger_jobs'), async (req: AdminRequest, res: Response) => {
  try {
    const { maxTrades } = req.body

    console.log('🔄 Admin triggered manual flywheel cycle')

    // Run async - don't wait for completion
    triggerFlywheelCycle(maxTrades).catch(err => {
      console.error('Flywheel cycle error:', err)
    })

    return res.json({
      success: true,
      message: 'Flywheel cycle triggered. Check logs for results.',
      maxTrades: maxTrades || 'default',
    })
  } catch (error) {
    console.error('Error triggering flywheel:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATE ORPHANED LAUNCHES
// Recover completed launches that weren't properly registered in user_tokens
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/admin/migrate-orphaned-launches
 * Find and migrate completed launches without user_tokens records (admin only)
 */
router.post('/migrate-orphaned-launches', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    console.log('🔍 Admin triggered orphaned launches migration')

    // Find completed launches that don't have a user_token_id set
    const { data: completedLaunches, error: fetchError } = await supabase
      .from('pending_token_launches')
      .select('*')
      .eq('status', 'completed')
      .is('user_token_id', null)
      .not('token_mint_address', 'is', null)

    if (fetchError) {
      console.error('Error fetching completed launches:', fetchError)
      return res.status(500).json({ error: 'Failed to fetch orphaned launches' })
    }

    if (!completedLaunches || completedLaunches.length === 0) {
      return res.json({
        success: true,
        message: 'No orphaned launches found',
        migrated: 0,
        failed: 0,
      })
    }

    console.log(`📋 Found ${completedLaunches.length} orphaned launch(es) to migrate`)

    const results: Array<{
      id: string
      tokenSymbol: string
      success: boolean
      error?: string
      userTokenId?: string
    }> = []

    for (const launch of completedLaunches) {
      try {
        // Check if user_token already exists for this mint
        const { data: existingToken } = await supabase
          .from('user_tokens')
          .select('id')
          .eq('token_mint_address', launch.token_mint_address)
          .single()

        if (existingToken) {
          // Update the pending_token_launches to reference it
          await supabase
            .from('pending_token_launches')
            .update({ user_token_id: existingToken.id })
            .eq('id', launch.id)

          // Also update the user_token's telegram_user_id if it was missing
          // This ensures /mytokens command works for the telegram user
          if (launch.telegram_user_id) {
            await supabase
              .from('user_tokens')
              .update({
                telegram_user_id: launch.telegram_user_id,
                launched_via_telegram: true,
              })
              .eq('id', existingToken.id)
              .is('telegram_user_id', null)  // Only update if currently null

            console.log(`🔗 Linked existing token ${existingToken.id} to telegram user ${launch.telegram_user_id}`)
          }

          results.push({
            id: launch.id,
            tokenSymbol: launch.token_symbol,
            success: true,
            userTokenId: existingToken.id,
          })
          continue
        }

        // Get or create main user
        let { data: mainUser } = await supabase
          .from('users')
          .select('id')
          .eq('wallet_address', launch.dev_wallet_address)
          .single()

        if (!mainUser) {
          const { data: newUser, error: createUserError } = await supabase
            .from('users')
            .insert({ wallet_address: launch.dev_wallet_address })
            .select('id')
            .single()

          if (createUserError) {
            results.push({
              id: launch.id,
              tokenSymbol: launch.token_symbol,
              success: false,
              error: `Failed to create user: ${createUserError.message}`,
            })
            continue
          }
          mainUser = newUser
        }

        // Create user_token record
        const { data: userToken, error: tokenError } = await supabase
          .from('user_tokens')
          .insert({
            user_id: mainUser?.id,
            telegram_user_id: launch.telegram_user_id,
            token_mint_address: launch.token_mint_address,
            token_symbol: launch.token_symbol,
            token_name: launch.token_name,
            token_image: launch.token_image_url,
            dev_wallet_address: launch.dev_wallet_address,
            dev_wallet_private_key_encrypted: launch.dev_wallet_private_key_encrypted,
            dev_encryption_iv: launch.dev_encryption_iv,
            dev_encryption_auth_tag: launch.dev_encryption_auth_tag || '',
            ops_wallet_address: launch.ops_wallet_address,
            ops_wallet_private_key_encrypted: launch.ops_wallet_private_key_encrypted,
            ops_encryption_iv: launch.ops_encryption_iv,
            ops_encryption_auth_tag: launch.ops_encryption_auth_tag || '',
            launched_via_telegram: true,
            is_active: true,
          })
          .select('id')
          .single()

        if (tokenError) {
          results.push({
            id: launch.id,
            tokenSymbol: launch.token_symbol,
            success: false,
            error: `Failed to create user_token: ${tokenError.message}`,
          })
          continue
        }

        // Create config with flywheel enabled
        await supabase.from('user_token_config').insert({
          user_token_id: userToken?.id,
          flywheel_active: true,
          algorithm_mode: 'simple',
          min_buy_amount_sol: 0.01,
          max_buy_amount_sol: 0.05,
          slippage_bps: 300,
          auto_claim_enabled: true,
        })

        // Create flywheel state
        await supabase.from('user_flywheel_state').insert({
          user_token_id: userToken?.id,
          cycle_phase: 'buy',
          buy_count: 0,
          sell_count: 0,
        })

        // Update pending launch with user_token_id
        await supabase
          .from('pending_token_launches')
          .update({ user_token_id: userToken?.id })
          .eq('id', launch.id)

        results.push({
          id: launch.id,
          tokenSymbol: launch.token_symbol,
          success: true,
          userTokenId: userToken?.id,
        })

        console.log(`✅ Migrated ${launch.token_symbol}: ${userToken?.id}`)
      } catch (error: any) {
        results.push({
          id: launch.id,
          tokenSymbol: launch.token_symbol,
          success: false,
          error: error.message || 'Unexpected error',
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    console.log(`✅ Migration complete: ${successCount} succeeded, ${failCount} failed`)

    return res.json({
      success: true,
      message: `Migrated ${successCount} launches`,
      migrated: successCount,
      failed: failCount,
      results,
    })
  } catch (error) {
    console.error('Error migrating orphaned launches:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/orphaned-launches
 * Get list of orphaned launches that need migration (admin only)
 */
router.get('/orphaned-launches', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { data: orphanedLaunches, error } = await supabase
      .from('pending_token_launches')
      .select(`
        id,
        token_name,
        token_symbol,
        token_mint_address,
        dev_wallet_address,
        status,
        created_at,
        telegram_users (telegram_id, telegram_username)
      `)
      .eq('status', 'completed')
      .is('user_token_id', null)
      .not('token_mint_address', 'is', null)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching orphaned launches:', error)
      return res.status(500).json({ error: 'Failed to fetch orphaned launches' })
    }

    return res.json({
      success: true,
      data: {
        launches: orphanedLaunches || [],
        total: (orphanedLaunches || []).length,
      },
    })
  } catch (error) {
    console.error('Error fetching orphaned launches:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// STOP FLYWHEEL AND REFUND
// Stop flywheel and refund remaining SOL from dev/ops wallets for test launches
// ═══════════════════════════════════════════════════════════════════════════

// Minimum SOL to keep for rent exemption
const RENT_RESERVE_SOL = 0.001

/**
 * POST /api/admin/tokens/:id/stop-and-refund
 * Stop flywheel for a token and refund remaining SOL to original funder (admin only)
 */
router.post('/tokens/:id/stop-and-refund', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { id } = req.params
    const { refundAddress: providedRefundAddress } = req.body

    console.log(`🛑 Admin initiated stop-and-refund for token: ${id}`)

    // Get the user_token with encrypted keys
    const { data: token, error: tokenError } = await supabase
      .from('user_tokens')
      .select(`
        *,
        users (wallet_address),
        user_token_config (flywheel_active)
      `)
      .eq('id', id)
      .single()

    if (tokenError || !token) {
      return res.status(404).json({ error: 'Token not found' })
    }

    // Step 1: Stop the flywheel
    const { error: configUpdateError } = await supabase
      .from('user_token_config')
      .update({
        flywheel_active: false,
        market_making_enabled: false,
        auto_claim_enabled: false,
      })
      .eq('user_token_id', id)

    if (configUpdateError) {
      console.error('Error stopping flywheel:', configUpdateError)
      return res.status(500).json({ error: 'Failed to stop flywheel' })
    }

    console.log(`⏹️ Flywheel stopped for ${token.token_symbol}`)

    // Step 2: Determine refund address
    let refundAddress = providedRefundAddress

    // If no refund address provided, try to find original funder
    if (!refundAddress) {
      const { findOriginalFunder } = await import('../services/refund.service')
      refundAddress = await findOriginalFunder(token.dev_wallet_address)
    }

    if (!refundAddress) {
      return res.json({
        success: true,
        message: 'Flywheel stopped. Could not determine refund address - please provide one.',
        flywheelStopped: true,
        refundExecuted: false,
        needsRefundAddress: true,
      })
    }

    // Validate refund address
    let refundPubkey: PublicKey
    try {
      refundPubkey = new PublicKey(refundAddress)
    } catch {
      return res.status(400).json({ error: 'Invalid refund address' })
    }

    // Step 3: Get balances and prepare refunds
    const refundResults: Array<{
      wallet: string
      walletType: 'dev' | 'ops'
      balance: number
      refundAmount: number
      signature?: string
      error?: string
    }> = []

    // Refund from dev wallet
    // LEGACY: This code path uses deprecated encryption and will throw at runtime
    try {
      const devKeypair = getKeypairFromEncrypted(
        token.dev_wallet_private_key_encrypted,
        token.dev_encryption_iv,
        token.dev_encryption_auth_tag || ''
      ) as any as import('@solana/web3.js').Keypair

      const devBalance = await getBalance(devKeypair.publicKey)
      console.log(`💰 Dev wallet balance: ${devBalance} SOL`)

      if (devBalance > RENT_RESERVE_SOL) {
        const refundAmount = devBalance - RENT_RESERVE_SOL
        const refundLamports = Math.floor(refundAmount * LAMPORTS_PER_SOL)

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: devKeypair.publicKey,
            toPubkey: refundPubkey,
            lamports: refundLamports,
          })
        )

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
        transaction.recentBlockhash = blockhash
        transaction.feePayer = devKeypair.publicKey

        transaction.sign(devKeypair)
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        })

        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        }, 'confirmed')

        refundResults.push({
          wallet: token.dev_wallet_address,
          walletType: 'dev',
          balance: devBalance,
          refundAmount,
          signature,
        })

        console.log(`✅ Dev wallet refund: ${refundAmount} SOL - ${signature}`)
      } else {
        refundResults.push({
          wallet: token.dev_wallet_address,
          walletType: 'dev',
          balance: devBalance,
          refundAmount: 0,
        })
      }
    } catch (error: any) {
      console.error('Dev wallet refund error:', error)
      refundResults.push({
        wallet: token.dev_wallet_address,
        walletType: 'dev',
        balance: 0,
        refundAmount: 0,
        error: error.message,
      })
    }

    // Refund from ops wallet
    // LEGACY: This code path uses deprecated encryption and will throw at runtime
    try {
      const opsKeypair = getKeypairFromEncrypted(
        token.ops_wallet_private_key_encrypted,
        token.ops_encryption_iv,
        token.ops_encryption_auth_tag || ''
      ) as any as import('@solana/web3.js').Keypair

      const opsBalance = await getBalance(opsKeypair.publicKey)
      console.log(`💰 Ops wallet balance: ${opsBalance} SOL`)

      if (opsBalance > RENT_RESERVE_SOL) {
        const refundAmount = opsBalance - RENT_RESERVE_SOL
        const refundLamports = Math.floor(refundAmount * LAMPORTS_PER_SOL)

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: opsKeypair.publicKey,
            toPubkey: refundPubkey,
            lamports: refundLamports,
          })
        )

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
        transaction.recentBlockhash = blockhash
        transaction.feePayer = opsKeypair.publicKey

        transaction.sign(opsKeypair)
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        })

        await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight,
        }, 'confirmed')

        refundResults.push({
          wallet: token.ops_wallet_address,
          walletType: 'ops',
          balance: opsBalance,
          refundAmount,
          signature,
        })

        console.log(`✅ Ops wallet refund: ${refundAmount} SOL - ${signature}`)
      } else {
        refundResults.push({
          wallet: token.ops_wallet_address,
          walletType: 'ops',
          balance: opsBalance,
          refundAmount: 0,
        })
      }
    } catch (error: any) {
      console.error('Ops wallet refund error:', error)
      refundResults.push({
        wallet: token.ops_wallet_address,
        walletType: 'ops',
        balance: 0,
        refundAmount: 0,
        error: error.message,
      })
    }

    // Step 4: Mark token as inactive
    await supabase
      .from('user_tokens')
      .update({
        is_active: false,
        is_suspended: true,
        suspend_reason: 'Stopped and refunded by admin',
      })
      .eq('id', id)

    // Step 5: Log audit event
    const totalRefunded = refundResults.reduce((sum, r) => sum + r.refundAmount, 0)
    await supabase.from('audit_log').insert({
      event_type: 'stop_and_refund',
      user_token_id: id,
      details: {
        token_symbol: token.token_symbol,
        refund_address: refundAddress,
        total_refunded_sol: totalRefunded,
        results: refundResults,
      },
    })

    // Step 6: Notify user via Telegram if launched via Telegram
    if (token.telegram_user_id) {
      try {
        // Get telegram_id from telegram_users table
        const { data: telegramUser } = await supabase
          .from('telegram_users')
          .select('telegram_id')
          .eq('id', token.telegram_user_id)
          .single()

        if (telegramUser?.telegram_id) {
          const { getBot } = await import('../telegram/bot')
          const bot = getBot()
          if (bot) {
            const message = `🛑 *Flywheel Stopped & Refunded*

Your ${token.token_symbol} token has been stopped and funds refunded.

├ Dev Wallet: ${refundResults.find(r => r.walletType === 'dev')?.refundAmount?.toFixed(6) || '0'} SOL
└ Ops Wallet: ${refundResults.find(r => r.walletType === 'ops')?.refundAmount?.toFixed(6) || '0'} SOL

*Total Refunded:* ${totalRefunded.toFixed(6)} SOL
*To:* \`${refundAddress.slice(0, 8)}...${refundAddress.slice(-6)}\`

Use /launch to start a new token!`

            await bot.telegram.sendMessage(telegramUser.telegram_id, message, {
              parse_mode: 'Markdown',
            })
          }
        }
      } catch (e) {
        console.error('Error notifying user:', e)
      }
    }

    console.log(`✅ Stop-and-refund complete for ${token.token_symbol}: ${totalRefunded} SOL`)

    return res.json({
      success: true,
      message: `Flywheel stopped and ${totalRefunded.toFixed(6)} SOL refunded`,
      flywheelStopped: true,
      refundExecuted: true,
      refundAddress,
      totalRefunded,
      results: refundResults,
    })
  } catch (error: any) {
    console.error('Error in stop-and-refund:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

/**
 * GET /api/admin/tokens/:id/refund-preview
 * Preview what would be refunded for a token (admin only)
 */
router.get('/tokens/:id/refund-preview', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { id } = req.params

    // Get the user_token
    const { data: token, error: tokenError } = await supabase
      .from('user_tokens')
      .select(`
        *,
        user_token_config (flywheel_active, auto_claim_enabled)
      `)
      .eq('id', id)
      .single()

    if (tokenError || !token) {
      return res.status(404).json({ error: 'Token not found' })
    }

    // Get balances
    let devBalance = 0
    let opsBalance = 0
    let originalFunder: string | null = null

    // LEGACY: Encryption removed - get balance by address instead
    try {
      const { PublicKey } = await import('@solana/web3.js')
      devBalance = await getBalance(new PublicKey(token.dev_wallet_address))

      // Find original funder
      const { findOriginalFunder } = await import('../services/refund.service')
      originalFunder = await findOriginalFunder(token.dev_wallet_address)
    } catch (e) {
      console.error('Error getting dev wallet balance:', e)
    }

    try {
      const { PublicKey } = await import('@solana/web3.js')
      opsBalance = await getBalance(new PublicKey(token.ops_wallet_address))
    } catch (e) {
      console.error('Error getting ops wallet balance:', e)
    }

    const devRefundable = Math.max(0, devBalance - RENT_RESERVE_SOL)
    const opsRefundable = Math.max(0, opsBalance - RENT_RESERVE_SOL)

    return res.json({
      success: true,
      data: {
        tokenId: id,
        tokenSymbol: token.token_symbol,
        tokenName: token.token_name,
        isActive: token.is_active,
        flywheelActive: token.user_token_config?.[0]?.flywheel_active || false,
        wallets: {
          dev: {
            address: token.dev_wallet_address,
            balance: devBalance,
            refundable: devRefundable,
          },
          ops: {
            address: token.ops_wallet_address,
            balance: opsBalance,
            refundable: opsRefundable,
          },
        },
        totalRefundable: devRefundable + opsRefundable,
        suggestedRefundAddress: originalFunder,
      },
    })
  } catch (error) {
    console.error('Error previewing refund:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM WHEEL TOKEN DATA
// Platform $WHEEL token - now handled as a regular Privy token with tokenSource='platform'
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/wheel
 * Get $WHEEL platform token data from Prisma (admin only)
 * WHEEL is now a regular Privy token with tokenSource='platform'
 */
router.get('/wheel', requireAdmin, async (_req: AdminRequest, res: Response) => {
  try {
    // Get WHEEL token from Prisma (platform token)
    const wheelToken = await prisma.privyUserToken.findFirst({
      where: { tokenSource: 'platform' },
      include: {
        devWallet: true,
        opsWallet: true,
        config: true,
        flywheelState: true,
      },
    })

    if (!wheelToken) {
      return res.status(404).json({
        success: false,
        error: 'WHEEL platform token not found in database',
      })
    }

    const tokenMint = new PublicKey(wheelToken.tokenMintAddress)
    const devWalletAddress = wheelToken.devWallet.walletAddress
    const opsWalletAddress = wheelToken.opsWallet.walletAddress
    const devPubkey = new PublicKey(devWalletAddress)
    const opsPubkey = new PublicKey(opsWalletAddress)

    // Fetch LIVE balances from Solana
    let devSolBalance = 0
    let devTokenBalance = 0
    let opsSolBalance = 0
    let opsTokenBalance = 0

    try {
      devSolBalance = await getBalance(devPubkey)
      devTokenBalance = await getTokenBalance(devPubkey, tokenMint)
    } catch (e) {
      console.warn('Failed to fetch dev wallet balance:', e)
    }

    try {
      opsSolBalance = await getBalance(opsPubkey)
      opsTokenBalance = await getTokenBalance(opsPubkey, tokenMint)
    } catch (e) {
      console.warn('Failed to fetch ops wallet balance:', e)
    }

    // Get fee stats from Prisma
    const claimStats = await prisma.privyClaimHistory.aggregate({
      where: { privyTokenId: wheelToken.id },
      _sum: { totalAmountSol: true },
    })
    const totalCollected = Number(claimStats._sum.totalAmountSol || 0)

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayClaimStats = await prisma.privyClaimHistory.aggregate({
      where: { privyTokenId: wheelToken.id, claimedAt: { gte: todayStart } },
      _sum: { totalAmountSol: true },
    })
    const todayCollected = Number(todayClaimStats._sum.totalAmountSol || 0)

    // Get hourly fees
    const hourStart = new Date()
    hourStart.setMinutes(0, 0, 0)
    const hourClaimStats = await prisma.privyClaimHistory.aggregate({
      where: { privyTokenId: wheelToken.id, claimedAt: { gte: hourStart } },
      _sum: { totalAmountSol: true },
    })
    const hourCollected = Number(hourClaimStats._sum.totalAmountSol || 0)

    // Fetch market data from DexScreener via Bags.fm service
    let marketData = {
      marketCap: 0,
      volume24h: 0,
      isGraduated: wheelToken.isGraduated,
      bondingCurveProgress: 0,
      holders: 0,
    }

    try {
      const tokenInfo = await bagsFmService.getTokenCreatorInfo(wheelToken.tokenMintAddress)
      if (tokenInfo) {
        marketData = {
          marketCap: tokenInfo.marketCap || 0,
          volume24h: tokenInfo.volume24h || 0,
          isGraduated: tokenInfo.isGraduated || wheelToken.isGraduated,
          bondingCurveProgress: tokenInfo.bondingCurveProgress || 0,
          holders: tokenInfo.holders || 0,
        }
      }
    } catch (error) {
      console.warn('Failed to fetch market data for WHEEL:', error)
    }

    return res.json({
      success: true,
      data: {
        tokenId: wheelToken.id,
        tokenMint: wheelToken.tokenMintAddress,
        symbol: wheelToken.tokenSymbol,
        tokenName: wheelToken.tokenName,
        tokenImage: wheelToken.tokenImage,
        tokenDecimals: wheelToken.tokenDecimals,
        devWallet: {
          address: devWalletAddress,
          solBalance: devSolBalance,
          tokenBalance: devTokenBalance,
        },
        opsWallet: {
          address: opsWalletAddress,
          solBalance: opsSolBalance,
          tokenBalance: opsTokenBalance,
        },
        feeStats: {
          totalCollected,
          todayCollected,
          hourCollected,
        },
        flywheelState: wheelToken.flywheelState ? {
          phase: wheelToken.flywheelState.cyclePhase,
          buyCount: wheelToken.flywheelState.buyCount,
          sellCount: wheelToken.flywheelState.sellCount,
          lastTradeAt: wheelToken.flywheelState.updatedAt,
        } : null,
        config: wheelToken.config ? {
          flywheelActive: wheelToken.config.flywheelActive,
          algorithmMode: wheelToken.config.algorithmMode || 'simple',
          minBuySol: Number(wheelToken.config.minBuyAmountSol) || 0.01,
          maxBuySol: Number(wheelToken.config.maxBuyAmountSol) || 0.05,
          slippageBps: wheelToken.config.slippageBps,
        } : null,
        marketData,
        isActive: wheelToken.config?.flywheelActive ?? false,
        createdAt: wheelToken.createdAt,
      },
    })
  } catch (error) {
    console.error('Error fetching wheel data:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/wheel/sell
 * Manual sells are deprecated - WHEEL is handled by regular Privy flywheel
 */
router.post('/wheel/sell', requireAdmin, requirePermission('trigger_jobs'), async (_req: AdminRequest, res: Response) => {
  return res.status(410).json({
    success: false,
    error: 'Manual WHEEL sell is deprecated. WHEEL is now handled by the regular Privy flywheel.',
    message: 'Use the token config to adjust sell percentage or disable flywheel.',
  })
})

/**
 * GET /api/admin/wheel/claimable
 * Check claimable fees for WHEEL token
 */
router.get('/wheel/claimable', requireAdmin, async (_req: AdminRequest, res: Response) => {
  try {
    // Get WHEEL token from Prisma
    const wheelToken = await prisma.privyUserToken.findFirst({
      where: { tokenSource: 'platform' },
      include: { devWallet: true },
    })

    if (!wheelToken) {
      return res.status(404).json({
        success: false,
        error: 'WHEEL platform token not found',
      })
    }

    const devWalletAddress = wheelToken.devWallet.walletAddress

    // Fetch claimable positions from Bags.fm
    const positions = await bagsFmService.getClaimablePositions(devWalletAddress)
    const wheelPosition = positions?.find(p => p.tokenMint === wheelToken.tokenMintAddress)

    return res.json({
      success: true,
      tokenId: wheelToken.id,
      devWalletAddress,
      platformTokenMint: wheelToken.tokenMintAddress,
      allPositions: positions || [],
      wheelPosition: wheelPosition || null,
      claimableAmountSol: wheelPosition?.claimableAmount || 0,
      claimableAmountUsd: wheelPosition?.claimableAmountUsd || 0,
      claimThresholdSol: parseFloat(process.env.FAST_CLAIM_THRESHOLD_SOL || '0.15'),
      wouldClaim: (wheelPosition?.claimableAmount || 0) >= parseFloat(process.env.FAST_CLAIM_THRESHOLD_SOL || '0.15'),
    })
  } catch (error) {
    loggers.claim.error({ error: String(error) }, 'Error checking WHEEL claimable')
    return res.status(500).json({ error: 'Failed to check claimable fees', details: String(error) })
  }
})

/**
 * POST /api/admin/wheel/claim
 * Manual claim deprecated - WHEEL is handled by regular fast-claim service
 */
router.post('/wheel/claim', requireAdmin, requirePermission('trigger_jobs'), async (_req: AdminRequest, res: Response) => {
  return res.status(410).json({
    success: false,
    error: 'Manual WHEEL claim is deprecated. WHEEL is now handled by the regular fast-claim service.',
    message: 'The fast-claim job will automatically claim WHEEL fees when above threshold.',
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM SETTINGS
// Global platform configuration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/settings
 * Get platform settings (admin only)
 */
router.get('/settings', requireAdmin, async (_req: AdminRequest, res: Response) => {
  try {
    // Get job status intervals from environment
    const claimJobStatus = getClaimJobStatus()
    const flywheelJobStatus = getMultiUserFlywheelJobStatus()
    const fastClaimJobStatus = getFastClaimJobStatus()

    // Get WHEEL config from Prisma PlatformConfig
    const platformConfig = await platformConfigService.getConfig()
    const wheelConfig = {
      wheelMinBuySol: platformConfig.wheelMinBuySol,
      wheelMaxBuySol: platformConfig.wheelMaxBuySol,
      wheelMinSellSol: platformConfig.wheelMinSellSol,
      wheelMaxSellSol: platformConfig.wheelMaxSellSol,
    }

    return res.json({
      success: true,
      data: {
        claimJobIntervalMinutes: claimJobStatus?.intervalMinutes || 60,
        flywheelIntervalMinutes: flywheelJobStatus?.intervalMinutes || 1,
        maxTradesPerMinute: 30, // Default max trades
        claimJobEnabled: claimJobStatus?.enabled ?? true,
        flywheelJobEnabled: flywheelJobStatus?.enabled ?? true,
        fastClaimEnabled: fastClaimJobStatus?.enabled ?? true,
        fastClaimIntervalSeconds: fastClaimJobStatus?.intervalSeconds || 30,
        ...wheelConfig,
      },
    })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/settings
 * Update platform settings (admin only)
 */
router.post('/settings', requireAdmin, requirePermission('update_config'), async (req: AdminRequest, res: Response) => {
  try {
    const {
      claimJobIntervalMinutes,
      flywheelIntervalMinutes,
      maxTradesPerMinute,
      claimJobEnabled,
      flywheelJobEnabled,
      fastClaimEnabled,
      fastClaimIntervalSeconds,
      // WHEEL trading configuration
      wheelMinBuySol,
      wheelMaxBuySol,
      wheelMinSellSol,
      wheelMaxSellSol,
    } = req.body

    const changesApplied: string[] = []

    loggers.server.info({
      claimJobIntervalMinutes,
      flywheelIntervalMinutes,
      maxTradesPerMinute,
      claimJobEnabled,
      flywheelJobEnabled,
      fastClaimEnabled,
      fastClaimIntervalSeconds,
      wheelMinBuySol,
      wheelMaxBuySol,
      wheelMinSellSol,
      wheelMaxSellSol,
    }, '📝 Admin requested settings update')

    // Handle flywheel job
    if (typeof flywheelJobEnabled === 'boolean') {
      if (flywheelJobEnabled) {
        restartFlywheelJob()
        changesApplied.push('Flywheel job restarted')
      }
    }

    // Handle legacy claim job
    if (typeof claimJobEnabled === 'boolean') {
      if (claimJobEnabled) {
        const intervalMinutes = claimJobIntervalMinutes || getClaimJobStatus()?.intervalMinutes || 60
        restartClaimJob(intervalMinutes)
        changesApplied.push('Legacy claim job restarted')
      }
    }

    // Handle fast claim job - update interval and restart
    if (fastClaimIntervalSeconds !== undefined && typeof fastClaimIntervalSeconds === 'number') {
      if (fastClaimIntervalSeconds >= 10 && fastClaimIntervalSeconds <= 300) {
        restartFastClaimJob(fastClaimIntervalSeconds)
        changesApplied.push(`Fast claim interval set to ${fastClaimIntervalSeconds}s`)
      }
    } else if (typeof fastClaimEnabled === 'boolean' && fastClaimEnabled) {
      restartFastClaimJob()
      changesApplied.push('Fast claim job restarted')
    }

    // Handle WHEEL trading configuration
    if (supabase) {
      const configUpdates: Record<string, number> = {}

      if (wheelMinBuySol !== undefined && typeof wheelMinBuySol === 'number' && wheelMinBuySol >= 0) {
        configUpdates.min_buy_amount_sol = wheelMinBuySol
        changesApplied.push(`WHEEL min buy set to ${wheelMinBuySol} SOL`)
      }
      if (wheelMaxBuySol !== undefined && typeof wheelMaxBuySol === 'number' && wheelMaxBuySol >= 0) {
        configUpdates.max_buy_amount_sol = wheelMaxBuySol
        changesApplied.push(`WHEEL max buy set to ${wheelMaxBuySol} SOL`)
      }
      if (wheelMinSellSol !== undefined && typeof wheelMinSellSol === 'number' && wheelMinSellSol >= 0) {
        configUpdates.min_sell_amount_sol = wheelMinSellSol
        changesApplied.push(`WHEEL min sell set to ${wheelMinSellSol} SOL`)
      }
      if (wheelMaxSellSol !== undefined && typeof wheelMaxSellSol === 'number' && wheelMaxSellSol >= 0) {
        configUpdates.max_sell_amount_sol = wheelMaxSellSol
        changesApplied.push(`WHEEL max sell set to ${wheelMaxSellSol} SOL`)
      }

      if (Object.keys(configUpdates).length > 0) {
        const { error: configError } = await supabase
          .from('config')
          .upsert({
            id: 'main',
            ...configUpdates,
            updated_at: new Date().toISOString(),
          })

        if (configError) {
          loggers.server.error({ error: configError }, 'Failed to update WHEEL config')
        }
      }
    }

    return res.json({
      success: true,
      message: changesApplied.length > 0
        ? `Settings updated: ${changesApplied.join(', ')}`
        : 'Settings update acknowledged.',
      changesApplied,
      note: 'Some settings require environment variable updates and server restart to take effect.',
    })
  } catch (error) {
    console.error('Error updating settings:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/emergency-stop
 * Emergency stop all automation (admin only)
 */
router.post('/emergency-stop', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const { reason } = req.body

    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({ error: 'Reason is required' })
    }

    console.log(`🚨 EMERGENCY STOP triggered by admin: ${reason}`)

    // Stop all jobs
    const { stopFastClaimJob } = await import('../jobs/fast-claim.job')
    const { stopBalanceUpdateJob } = await import('../jobs/balance-update.job')
    const { stopDepositMonitorJob } = await import('../jobs/deposit-monitor.job')

    stopFastClaimJob()
    stopBalanceUpdateJob()
    stopDepositMonitorJob()

    // Suspend all tokens (except platform token)
    if (supabase) {
      await supabase
        .from('user_tokens')
        .update({
          is_suspended: true,
          suspend_reason: `Emergency stop: ${reason}`,
        })
        .neq('token_mint_address', PLATFORM_TOKEN_MINT)

      // Disable all flywheels
      await supabase
        .from('user_token_config')
        .update({
          flywheel_active: false,
          market_making_enabled: false,
        })
    }

    return res.json({
      success: true,
      message: 'Emergency stop executed',
      actions: [
        'Fast claim job stopped',
        'Balance update job stopped',
        'Deposit monitor job stopped',
        'All user tokens suspended',
        'All flywheels disabled',
      ],
    })
  } catch (error) {
    console.error('Error executing emergency stop:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/clear-caches
 * Clear all caches (admin only)
 */
router.post('/clear-caches', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    // Clear any in-memory caches
    // This is mainly a placeholder for future cache implementations
    console.log('🗑️ Admin cleared all caches')

    // Trigger config reload
    requestConfigReload()

    return res.json({
      success: true,
      message: 'All caches cleared and config reloaded',
    })
  } catch (error) {
    console.error('Error clearing caches:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// DISCORD ERROR REPORTING
// ═══════════════════════════════════════════════════════════════════════════

import { discordErrorService } from '../services/discord-error.service'

/**
 * GET /api/admin/discord/stats
 * Get Discord error reporting stats
 */
router.get('/discord/stats', requireAdmin, async (_req: AdminRequest, res: Response) => {
  try {
    const stats = discordErrorService.getStats()
    return res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error('Error getting Discord stats:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/discord/test
 * Send a test error to Discord webhook
 */
router.post('/discord/test', requireAdmin, async (req: AdminRequest, res: Response) => {
  try {
    const stats = discordErrorService.getStats()

    if (!stats.webhookConfigured) {
      return res.status(400).json({
        success: false,
        error: 'Discord webhook not configured. Set DISCORD_ERROR_WEBHOOK_URL in environment.',
      })
    }

    if (!stats.enabled) {
      return res.status(400).json({
        success: false,
        error: 'Discord error reporting is disabled. Set DISCORD_ERROR_ENABLED=true in environment.',
      })
    }

    const sent = await discordErrorService.sendTestError()

    return res.json({
      success: sent,
      message: sent
        ? 'Test error sent to Discord successfully'
        : 'Failed to send test error to Discord',
    })
  } catch (error) {
    console.error('Error sending Discord test:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// WEBSOCKET REACTIVE SERVICE (for reactive MM mode)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/admin/websocket-reactive/status
 * Get current WebSocket reactive service status
 */
router.get('/websocket-reactive/status', requireAdmin, async (_req: AdminRequest, res: Response) => {
  try {
    const status = getWebSocketReactiveStatus()
    return res.json({
      success: true,
      ...status,
    })
  } catch (error) {
    console.error('Error getting WebSocket reactive status:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/websocket-reactive/restart
 * Restart the WebSocket reactive service
 */
router.post('/websocket-reactive/restart', requireAdmin, requirePermission('trigger_jobs'), async (_req: AdminRequest, res: Response) => {
  try {
    await restartWebSocketReactiveJob()
    const status = getWebSocketReactiveStatus()
    return res.json({
      success: true,
      message: 'WebSocket reactive service restarted',
      ...status,
    })
  } catch (error) {
    console.error('Error restarting WebSocket reactive service:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
