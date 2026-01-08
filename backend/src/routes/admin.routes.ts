import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { verifySignature, isMessageRecent, hashConfig, extractConfigHash, generateSecureNonceMessage } from '../utils/signature-verify'
import { supabase } from '../config/database'
import { env } from '../config/env'
import { marketMaker } from '../services/market-maker'
import { walletMonitor } from '../services/wallet-monitor'
import { getClaimJobStatus, restartClaimJob } from '../jobs/claim.job'
import { getMultiUserFlywheelJobStatus, restartFlywheelJob } from '../jobs/multi-flywheel.job'
import { getFastClaimJobStatus, triggerFastClaimCycle, restartFastClaimJob } from '../jobs/fast-claim.job'
import { getBalanceUpdateJobStatus, triggerBalanceUpdate, restartBalanceUpdateJob } from '../jobs/balance-update.job'
import { requestConfigReload, getCurrentAlgorithmMode, getCachedConfig } from '../jobs/flywheel.job'
import {
  getPendingRefunds,
  executeRefund,
  getTelegramAuditLogs,
  getLaunchStats,
} from '../services/refund.service'
import { getDepositMonitorStatus } from '../jobs/deposit-monitor.job'

// Platform token CA - this token cannot be suspended
const PLATFORM_TOKEN_MINT = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// Protected endpoints requiring wallet signature verification
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

// Schema for config update request
const ConfigUpdateSchema = z.object({
  // The message that was signed (must include timestamp for replay protection)
  message: z.string().min(1),
  // Base58-encoded signature
  signature: z.string().min(1),
  // Public key of the signer (must match DEV_WALLET)
  publicKey: z.string().min(32).max(44),
  // The config data to update
  config: z.object({
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
    algorithm_mode: z.enum(['simple', 'smart', 'rebalance']).optional(),
    target_sol_allocation: z.number().min(0).max(100).optional(),
    target_token_allocation: z.number().min(0).max(100).optional(),
    rebalance_threshold: z.number().min(1).max(50).optional(),
    use_twap: z.boolean().optional(),
    twap_threshold_usd: z.number().min(1).optional(),
  }),
})

/**
 * POST /api/admin/config
 * Update flywheel configuration (requires wallet signature)
 */
router.post('/config', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parseResult = ConfigUpdateSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.errors,
      })
    }

    const { message, signature, publicKey, config } = parseResult.data

    // Step 1: Verify the public key matches the authorized dev wallet
    const authorizedWallet = env.devWalletAddress
    if (!authorizedWallet) {
      console.error('DEV_WALLET_ADDRESS not configured')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    if (publicKey !== authorizedWallet) {
      console.warn(`Unauthorized config update attempt from: ${publicKey}`)
      return res.status(403).json({ error: 'Unauthorized: wallet not authorized for admin actions' })
    }

    // Step 2: Verify the message is recent (prevent replay attacks)
    if (!isMessageRecent(message, 2 * 60 * 1000)) { // 2 minute window (reduced for security)
      return res.status(400).json({ error: 'Message expired. Please sign a new message.' })
    }

    // Step 3: Verify the signature
    const verificationResult = verifySignature(message, signature, publicKey)
    if (!verificationResult.valid) {
      console.warn(`Invalid signature from ${publicKey}: ${verificationResult.error}`)
      return res.status(401).json({ error: `Signature verification failed: ${verificationResult.error}` })
    }

    // Step 4: Verify the config hash matches the signed message
    // This prevents replay attacks with different config values
    const signedConfigHash = extractConfigHash(message)
    if (!signedConfigHash) {
      return res.status(400).json({ error: 'Message must include config hash. Please use the updated signing flow.' })
    }

    const submittedConfigHash = hashConfig(config)
    if (signedConfigHash !== submittedConfigHash) {
      console.warn(`Config hash mismatch: signed=${signedConfigHash.slice(0, 16)}... vs submitted=${submittedConfigHash.slice(0, 16)}...`)
      return res.status(400).json({ error: 'Config data does not match signed message. Please sign the current config.' })
    }

    // Step 5: Update config in database (using service key)
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    const { error: dbError } = await supabase
      .from('config')
      .upsert({
        id: 'main',
        ...config,
        updated_at: new Date().toISOString(),
      })

    if (dbError) {
      console.error('Database error updating config:', dbError)
      return res.status(500).json({ error: 'Failed to update configuration' })
    }

    // Trigger immediate config reload in flywheel job
    requestConfigReload()

    // Log algorithm mode change if applicable
    if (config.algorithm_mode) {
      const previousMode = getCurrentAlgorithmMode()
      if (previousMode !== config.algorithm_mode) {
        console.log(`🔀 Algorithm mode will change: ${previousMode.toUpperCase()} → ${config.algorithm_mode.toUpperCase()}`)
      }
    }

    console.log(`✅ Config updated by authorized wallet: ${publicKey.slice(0, 8)}...`)

    return res.json({
      success: true,
      message: 'Configuration updated successfully',
      configReloadTriggered: true,
    })
  } catch (error) {
    console.error('Error in config update:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// Schema for nonce request (includes config to hash)
const NonceRequestSchema = z.object({
  config: z.object({
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
    algorithm_mode: z.enum(['simple', 'smart', 'rebalance']).optional(),
    target_sol_allocation: z.number().min(0).max(100).optional(),
    target_token_allocation: z.number().min(0).max(100).optional(),
    rebalance_threshold: z.number().min(1).max(50).optional(),
    use_twap: z.boolean().optional(),
    twap_threshold_usd: z.number().min(1).optional(),
  }),
})

/**
 * POST /api/admin/nonce
 * Generate a nonce message for the client to sign
 * The message includes a hash of the config to prevent replay attacks with different config values
 */
router.post('/nonce', (req: Request, res: Response) => {
  // Validate request body
  const parseResult = NonceRequestSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request body - config object required',
      details: parseResult.error.errors,
    })
  }

  const { config } = parseResult.data

  // Generate config hash and create secure message
  const configHash = hashConfig(config)
  const { message, timestamp, nonce } = generateSecureNonceMessage('update_config', configHash)

  res.json({ message, timestamp, nonce, configHash })
})

// Schema for manual sell request
const ManualSellSchema = z.object({
  // The message that was signed (must include timestamp for replay protection)
  message: z.string().min(1),
  // Base58-encoded signature
  signature: z.string().min(1),
  // Public key of the signer (must match DEV_WALLET)
  publicKey: z.string().min(32).max(44),
  // Sell percentage (25, 50, or 100)
  percentage: z.number().min(1).max(100),
})

/**
 * POST /api/admin/manual-sell
 * Execute a manual sell of tokens (requires wallet signature)
 */
router.post('/manual-sell', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const parseResult = ManualSellSchema.safeParse(req.body)
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.errors,
      })
    }

    const { message, signature, publicKey, percentage } = parseResult.data

    // Step 1: Verify the public key matches the authorized dev wallet
    const authorizedWallet = env.devWalletAddress
    if (!authorizedWallet) {
      console.error('DEV_WALLET_ADDRESS not configured')
      return res.status(500).json({ error: 'Server configuration error' })
    }

    if (publicKey !== authorizedWallet) {
      console.warn(`Unauthorized manual sell attempt from: ${publicKey}`)
      return res.status(403).json({ error: 'Unauthorized: wallet not authorized for admin actions' })
    }

    // Step 2: Verify the message is recent (prevent replay attacks)
    if (!isMessageRecent(message, 2 * 60 * 1000)) { // 2 minute window (reduced for security)
      return res.status(400).json({ error: 'Message expired. Please sign a new message.' })
    }

    // Step 3: Verify the signature
    const verificationResult = verifySignature(message, signature, publicKey)
    if (!verificationResult.valid) {
      console.warn(`Invalid signature from ${publicKey}: ${verificationResult.error}`)
      return res.status(401).json({ error: `Signature verification failed: ${verificationResult.error}` })
    }

    // Step 4: Verify the message contains the correct action and percentage
    if (!message.includes('manual_sell') || !message.includes(`${percentage}%`)) {
      return res.status(400).json({ error: 'Message does not match requested action' })
    }

    // Step 5: Get current token balance
    const balances = await walletMonitor.getOpsWalletBalance()
    if (!balances || balances.token_balance <= 0) {
      return res.status(400).json({ error: 'No tokens available to sell' })
    }

    // Step 6: Calculate amount to sell
    const tokenAmount = balances.token_balance * (percentage / 100)

    console.log(`🔴 Manual sell initiated: ${percentage}% (${tokenAmount.toFixed(0)} tokens)`)

    // Step 7: Temporarily enable market making for this operation
    const wasEnabled = marketMaker.getStats().isEnabled
    if (!wasEnabled) {
      marketMaker.enable()
    }

    // Step 8: Execute the sell (bypass cap for manual sells - user explicitly requested this amount)
    const result = await marketMaker.executeSell(tokenAmount, { bypassCap: true })

    // Restore previous state
    if (!wasEnabled) {
      marketMaker.disable()
    }

    if (!result) {
      return res.status(500).json({ error: 'Sell execution failed' })
    }

    console.log(`✅ Manual sell completed: ${result.signature}`)

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
    console.error('Error in manual sell:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/manual-sell/nonce
 * Generate a nonce message for manual sell signature
 */
router.post('/manual-sell/nonce', (req: Request, res: Response) => {
  const { percentage } = req.body

  if (!percentage || ![25, 50, 100].includes(percentage)) {
    return res.status(400).json({
      error: 'Invalid percentage. Must be 25, 50, or 100.',
    })
  }

  const { message, timestamp, nonce } = generateSecureNonceMessage('manual_sell', `${percentage}%`)

  res.json({ message, timestamp, nonce, percentage })
})

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN TOKEN MANAGEMENT
// View and manage all registered tokens across all users
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Middleware to verify admin authorization via wallet signature
 */
async function verifyAdminAuth(req: Request, res: Response, next: Function) {
  try {
    const signature = req.headers['x-wallet-signature'] as string
    let message = req.headers['x-wallet-message'] as string
    const publicKey = req.headers['x-wallet-pubkey'] as string
    const messageEncoding = req.headers['x-message-encoding'] as string

    if (!signature || !message || !publicKey) {
      return res.status(401).json({ error: 'Missing authentication headers' })
    }

    // Decode base64 message if encoding header is present
    if (message && messageEncoding === 'base64') {
      try {
        message = decodeURIComponent(escape(Buffer.from(message, 'base64').toString('utf8')))
      } catch (e) {
        return res.status(400).json({ error: 'Invalid base64 message encoding' })
      }
    }

    // Verify the public key matches the authorized dev wallet
    const authorizedWallet = env.devWalletAddress
    if (!authorizedWallet || publicKey !== authorizedWallet) {
      return res.status(403).json({ error: 'Unauthorized: wallet not authorized for admin actions' })
    }

    // Verify the message is recent
    if (!isMessageRecent(message, 5 * 60 * 1000)) { // 5 minute window for browsing (reduced from 10 min)
      return res.status(400).json({ error: 'Session expired. Please re-authenticate.' })
    }

    // Verify the signature
    const verificationResult = verifySignature(message, signature, publicKey)
    if (!verificationResult.valid) {
      return res.status(401).json({ error: 'Invalid signature' })
    }

    next()
  } catch (error) {
    console.error('Admin auth error:', error)
    return res.status(500).json({ error: 'Authentication failed' })
  }
}

/**
 * GET /api/admin/tokens
 * List all registered tokens with their status (admin only)
 */
router.get('/tokens', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error fetching tokens:', error)
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
    console.error('Error in admin tokens list:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/tokens/:id
 * Get detailed info for a specific token (admin only)
 */
router.get('/tokens/:id', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error fetching token details:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/tokens/:id/verify
 * Mark a token as verified (admin only)
 */
router.post('/tokens/:id/verify', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error verifying token:', error)
      return res.status(500).json({ error: 'Failed to verify token' })
    }

    console.log(`✅ Admin verified token: ${id}`)

    return res.json({
      success: true,
      message: 'Token verified successfully',
    })
  } catch (error) {
    console.error('Error verifying token:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/tokens/:id/suspend
 * Suspend a token (admin only)
 */
router.post('/tokens/:id/suspend', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error suspending token:', tokenError)
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

    console.log(`⚠️ Admin suspended token: ${id} - Reason: ${reason}`)

    return res.json({
      success: true,
      message: 'Token suspended successfully',
    })
  } catch (error) {
    console.error('Error suspending token:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/tokens/:id/unsuspend
 * Remove suspension from a token (admin only)
 */
router.post('/tokens/:id/unsuspend', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error unsuspending token:', error)
      return res.status(500).json({ error: 'Failed to unsuspend token' })
    }

    console.log(`✅ Admin unsuspended token: ${id}`)

    return res.json({
      success: true,
      message: 'Token unsuspended successfully',
    })
  } catch (error) {
    console.error('Error unsuspending token:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/admin/tokens/:id/limits
 * Update trading limits for a token (admin only)
 */
router.put('/tokens/:id/limits', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error updating limits:', error)
      return res.status(500).json({ error: 'Failed to update limits' })
    }

    console.log(`✅ Admin updated limits for token: ${id}`, updates)

    return res.json({
      success: true,
      message: 'Limits updated successfully',
      updates,
    })
  } catch (error) {
    console.error('Error updating limits:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/platform-stats
 * Get platform-wide statistics (admin only)
 */
router.get('/platform-stats', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error fetching platform stats:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/auth/nonce
 * Generate a nonce for admin authentication
 */
router.post('/auth/nonce', (req: Request, res: Response) => {
  const { message, timestamp, nonce } = generateSecureNonceMessage('admin_auth', 'access')
  res.json({ message, timestamp, nonce })
})

/**
 * POST /api/admin/tokens/suspend-all
 * Suspend all user tokens except the platform's own token (admin only)
 */
router.post('/tokens/suspend-all', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error fetching tokens for bulk suspend:', fetchError)
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
    const tokenIds = tokens.map(t => t.id)

    const { error: suspendError } = await supabase
      .from('user_tokens')
      .update({
        is_suspended: true,
        suspend_reason: reason,
      })
      .in('id', tokenIds)

    if (suspendError) {
      console.error('Error bulk suspending tokens:', suspendError)
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

    console.log(`⚠️ Admin BULK SUSPENDED ${tokens.length} tokens - Reason: ${reason}`)
    console.log(`   Excluded platform token: ${PLATFORM_TOKEN_MINT}`)

    return res.json({
      success: true,
      message: `Suspended ${tokens.length} tokens`,
      suspended: tokens.length,
      excluded: PLATFORM_TOKEN_MINT,
    })
  } catch (error) {
    console.error('Error bulk suspending tokens:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/tokens/unsuspend-all
 * Unsuspend all user tokens (admin only)
 */
router.post('/tokens/unsuspend-all', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error fetching suspended tokens:', fetchError)
      return res.status(500).json({ error: 'Failed to fetch tokens' })
    }

    if (!tokens || tokens.length === 0) {
      return res.json({
        success: true,
        message: 'No tokens to unsuspend',
        unsuspended: 0,
      })
    }

    const tokenIds = tokens.map(t => t.id)

    const { error: unsuspendError } = await supabase
      .from('user_tokens')
      .update({
        is_suspended: false,
        suspend_reason: null,
      })
      .in('id', tokenIds)

    if (unsuspendError) {
      console.error('Error bulk unsuspending tokens:', unsuspendError)
      return res.status(500).json({ error: 'Failed to unsuspend tokens' })
    }

    console.log(`✅ Admin BULK UNSUSPENDED ${tokens.length} tokens`)

    return res.json({
      success: true,
      message: `Unsuspended ${tokens.length} tokens`,
      unsuspended: tokens.length,
    })
  } catch (error) {
    console.error('Error bulk unsuspending tokens:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * PUT /api/admin/platform-settings
 * Update platform job settings (claim interval, max trades) (admin only)
 */
router.put('/platform-settings', verifyAdminAuth, async (req: Request, res: Response) => {
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

    console.log(`✅ Admin updated platform settings:`, updates)

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
    console.error('Error updating platform settings:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/platform-settings
 * Get current platform job settings (admin only)
 */
router.get('/platform-settings', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error fetching platform settings:', error)
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
router.get('/fast-claim/status', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error fetching fast claim status:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/fast-claim/trigger
 * Manually trigger a fast claim cycle (admin only)
 */
router.post('/fast-claim/trigger', verifyAdminAuth, async (req: Request, res: Response) => {
  try {
    console.log('⚡ Admin triggered manual fast claim cycle')

    // Run async - don't wait for completion
    triggerFastClaimCycle().catch(err => {
      console.error('Fast claim cycle error:', err)
    })

    return res.json({
      success: true,
      message: 'Fast claim cycle triggered. Check logs for results.',
    })
  } catch (error) {
    console.error('Error triggering fast claim:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/fast-claim/restart
 * Restart fast claim job with optional new interval (admin only)
 */
router.post('/fast-claim/restart', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error restarting fast claim job:', error)
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
router.get('/balance-update/status', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error fetching balance update status:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/balance-update/trigger
 * Manually trigger a balance update cycle (admin only)
 */
router.post('/balance-update/trigger', verifyAdminAuth, async (req: Request, res: Response) => {
  try {
    console.log('💰 Admin triggered manual balance update cycle')

    // Run async - don't wait for completion
    triggerBalanceUpdate().catch(err => {
      console.error('Balance update cycle error:', err)
    })

    return res.json({
      success: true,
      message: 'Balance update cycle triggered. Check logs for results.',
    })
  } catch (error) {
    console.error('Error triggering balance update:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/balance-update/restart
 * Restart balance update job with optional new interval (admin only)
 */
router.post('/balance-update/restart', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error restarting balance update job:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/flywheel-status
 * Get current flywheel status including algorithm mode (admin only)
 */
router.get('/flywheel-status', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error fetching flywheel status:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/config/reload
 * Manually trigger a config reload (admin only)
 */
router.post('/config/reload', verifyAdminAuth, async (req: Request, res: Response) => {
  try {
    requestConfigReload()

    return res.json({
      success: true,
      message: 'Config reload triggered. Changes will apply on next flywheel cycle.',
      currentMode: getCurrentAlgorithmMode(),
    })
  } catch (error) {
    console.error('Error triggering config reload:', error)
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
router.get('/telegram/stats', verifyAdminAuth, async (req: Request, res: Response) => {
  try {
    const stats = await getLaunchStats()

    return res.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error('Error fetching launch stats:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/launches
 * List all pending launches with refund info (admin only)
 */
router.get('/telegram/launches', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error fetching launches:', error)
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
    console.error('Error fetching launches:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/refunds
 * Get launches that need refunds (failed/expired with balance) (admin only)
 */
router.get('/telegram/refunds', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error fetching pending refunds:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/telegram/refund/:id
 * Execute a refund for a failed/expired launch (admin only)
 */
router.post('/telegram/refund/:id', verifyAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { refundAddress } = req.body

    if (!refundAddress || typeof refundAddress !== 'string') {
      return res.status(400).json({ error: 'Refund address is required' })
    }

    console.log(`💸 Admin initiating refund for launch ${id} to ${refundAddress}`)

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
    console.error('Error executing refund:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/logs
 * Get Telegram audit logs (admin only)
 */
router.get('/telegram/logs', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error fetching audit logs:', error)
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
    console.error('Error fetching audit logs:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/launch/:id
 * Get detailed info for a specific launch (admin only)
 */
router.get('/telegram/launch/:id', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error fetching launch details:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/telegram/launch/:id/cancel
 * Cancel a pending launch (admin only)
 */
router.post('/telegram/launch/:id/cancel', verifyAdminAuth, async (req: Request, res: Response) => {
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
        console.error('Error notifying user:', e)
      }
    }

    return res.json({
      success: true,
      message: 'Launch cancelled',
    })
  } catch (error) {
    console.error('Error cancelling launch:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/bot-health
 * Get bot and deposit monitor health status (admin only)
 */
router.get('/telegram/bot-health', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error fetching bot health:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/financial-metrics
 * Get financial metrics for Telegram launches (admin only)
 */
router.get('/telegram/financial-metrics', verifyAdminAuth, async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' })
    }

    // Get all launches for calculations
    const { data: launches, error } = await supabase
      .from('pending_token_launches')
      .select('status, deposit_received_sol, created_at')

    if (error) {
      console.error('Error fetching launches for metrics:', error)
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
    console.error('Error fetching financial metrics:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/users
 * Get list of Telegram users with their launch counts (admin only)
 */
router.get('/telegram/users', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error fetching telegram users:', error)
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
    console.error('Error fetching telegram users:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * POST /api/admin/telegram/bulk-refund
 * Execute refunds for multiple launches (admin only)
 */
router.post('/telegram/bulk-refund', verifyAdminAuth, async (req: Request, res: Response) => {
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
    console.error('Error executing bulk refunds:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/launches/search
 * Search launches with advanced filters (admin only)
 */
router.get('/telegram/launches/search', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error searching launches:', error)
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
    console.error('Error searching launches:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

/**
 * GET /api/admin/telegram/export
 * Export launches data as JSON (admin only)
 */
router.get('/telegram/export', verifyAdminAuth, async (req: Request, res: Response) => {
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
      console.error('Error exporting launches:', error)
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
    console.error('Error exporting launches:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
