import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { verifySignature, isMessageRecent, hashConfig, extractConfigHash, generateSecureNonceMessage } from '../utils/signature-verify'
import { supabase } from '../config/database'
import { env } from '../config/env'
import { marketMaker } from '../services/market-maker'
import { walletMonitor } from '../services/wallet-monitor'
import { getClaimJobStatus, restartClaimJob } from '../jobs/claim.job'
import { getMultiUserFlywheelJobStatus, restartFlywheelJob } from '../jobs/multi-flywheel.job'

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
    if (!isMessageRecent(message, 5 * 60 * 1000)) { // 5 minute window
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

    console.log(`✅ Config updated by authorized wallet: ${publicKey.slice(0, 8)}...`)

    return res.json({
      success: true,
      message: 'Configuration updated successfully',
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
    if (!isMessageRecent(message, 5 * 60 * 1000)) { // 5 minute window
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

    // Step 8: Execute the sell
    const result = await marketMaker.executeSell(tokenAmount)

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
    if (!isMessageRecent(message, 10 * 60 * 1000)) { // 10 minute window for browsing
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

    const updates: any = {}

    if (typeof dailyTradeLimitSol === 'number' && dailyTradeLimitSol >= 0) {
      updates.daily_trade_limit_sol = dailyTradeLimitSol
    }

    if (typeof maxPositionSizeSol === 'number' && maxPositionSizeSol >= 0) {
      updates.max_position_size_sol = maxPositionSizeSol
    }

    if (riskLevel && ['low', 'medium', 'high'].includes(riskLevel)) {
      updates.risk_level = riskLevel
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
          claim: claimJobStatus,
          flywheel: flywheelJobStatus,
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
        claim: getClaimJobStatus(),
        flywheel: getMultiUserFlywheelJobStatus(),
        platformToken: PLATFORM_TOKEN_MINT,
      },
    })
  } catch (error) {
    console.error('Error fetching platform settings:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
