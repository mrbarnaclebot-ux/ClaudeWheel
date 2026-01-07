import { Router, Request, Response } from 'express'
import { verifySignature, hashConfig, isMessageRecent } from '../utils/signature-verify'
import { supabase } from '../config/database'
import { getUserByWallet } from '../services/user.service'
import {
  registerToken,
  getUserTokens,
  getUserToken,
  getTokenConfig,
  updateTokenConfig,
  deactivateToken,
  getFlywheelState,
} from '../services/user-token.service'
import { isEncryptionConfigured } from '../services/encryption.service'
import { multiUserClaimService } from '../services/multi-user-claim.service'
import { bagsFmService } from '../services/bags-fm'
import crypto from 'crypto'

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// USER TOKEN ROUTES
// Manage user tokens and their configurations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Middleware to verify wallet ownership
 */
async function verifyWalletOwnership(req: Request, res: Response, next: Function) {
  const walletAddress = req.headers['x-wallet-address'] as string
  const signature = req.headers['x-wallet-signature'] as string
  let message = req.headers['x-wallet-message'] as string
  const messageEncoding = req.headers['x-message-encoding'] as string

  // Decode base64 message if encoding header is present
  if (message && messageEncoding === 'base64') {
    try {
      message = decodeURIComponent(escape(Buffer.from(message, 'base64').toString('utf8')))
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid base64 message encoding',
      })
    }
  }

  if (!walletAddress) {
    return res.status(401).json({
      success: false,
      error: 'Wallet address required in x-wallet-address header',
    })
  }

  // For read operations, just check if user exists
  if (req.method === 'GET') {
    const user = await getUserByWallet(walletAddress)
    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        error: 'User not found or inactive',
      })
    }
    req.body.userId = user.id
    req.body.walletAddress = walletAddress
    return next()
  }

  // For write operations, require signature
  if (!signature || !message) {
    return res.status(401).json({
      success: false,
      error: 'Signature and message required for this operation',
    })
  }

  // Verify signature
  const verificationResult = verifySignature(message, signature, walletAddress)
  if (!verificationResult.valid) {
    return res.status(401).json({
      success: false,
      error: verificationResult.error || 'Signature verification failed',
    })
  }

  // Check message freshness
  if (!isMessageRecent(message)) {
    return res.status(401).json({
      success: false,
      error: 'Message has expired. Please sign a fresh message.',
    })
  }

  // Get user
  const user = await getUserByWallet(walletAddress)
  if (!user || !user.is_active) {
    return res.status(401).json({
      success: false,
      error: 'User not found or inactive',
    })
  }

  req.body.userId = user.id
  req.body.walletAddress = walletAddress
  req.body.decodedMessage = message  // Store decoded message for route handlers
  next()
}

/**
 * GET /api/user/tokens
 * List all tokens registered by the user
 */
router.get('/tokens', verifyWalletOwnership, async (req: Request, res: Response) => {
  try {
    const { userId } = req.body

    const tokens = await getUserTokens(userId)

    // Get config for each token
    const tokensWithConfig = await Promise.all(
      tokens.map(async (token) => {
        const config = await getTokenConfig(token.id)
        const state = await getFlywheelState(token.id)
        return {
          ...token,
          config,
          flywheelState: state,
        }
      })
    )

    res.json({
      success: true,
      data: tokensWithConfig,
    })
  } catch (error) {
    console.error('Error getting user tokens:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get tokens',
    })
  }
})

/**
 * POST /api/user/tokens
 * Register a new token
 */
router.post('/tokens', verifyWalletOwnership, async (req: Request, res: Response) => {
  try {
    // Check if encryption is configured
    if (!isEncryptionConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Encryption is not configured. Contact administrator.',
      })
    }

    const {
      userId,
      tokenMintAddress,
      tokenSymbol,
      tokenName,
      tokenImage,
      tokenDecimals,
      devWalletPrivateKey,
      opsWalletPrivateKey,
    } = req.body

    // Validate required fields
    if (!tokenMintAddress || !tokenSymbol || !devWalletPrivateKey || !opsWalletPrivateKey) {
      return res.status(400).json({
        success: false,
        error: 'tokenMintAddress, tokenSymbol, devWalletPrivateKey, and opsWalletPrivateKey are required',
      })
    }

    // Validate token decimals
    const decimals = typeof tokenDecimals === 'number' ? tokenDecimals : 6
    if (decimals < 0 || decimals > 18) {
      return res.status(400).json({
        success: false,
        error: 'Token decimals must be between 0 and 18',
      })
    }

    const token = await registerToken({
      userId,
      tokenMintAddress,
      tokenSymbol,
      tokenName,
      tokenImage,
      tokenDecimals: decimals,
      devWalletPrivateKey,
      opsWalletPrivateKey,
    })

    if (!token) {
      return res.status(500).json({
        success: false,
        error: 'Failed to register token',
      })
    }

    res.status(201).json({
      success: true,
      data: token,
      message: 'Token registered successfully',
    })
  } catch (error: any) {
    console.error('Error registering token:', error)
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to register token',
    })
  }
})

/**
 * GET /api/user/tokens/:tokenId
 * Get a specific token
 */
router.get('/tokens/:tokenId', verifyWalletOwnership, async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params
    const { userId } = req.body

    const token = await getUserToken(tokenId)

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    // Verify ownership
    if (token.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this token',
      })
    }

    const config = await getTokenConfig(tokenId)
    const state = await getFlywheelState(tokenId)

    res.json({
      success: true,
      data: {
        ...token,
        config,
        flywheelState: state,
      },
    })
  } catch (error) {
    console.error('Error getting token:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get token',
    })
  }
})

/**
 * DELETE /api/user/tokens/:tokenId
 * Deactivate a token (soft delete)
 */
router.delete('/tokens/:tokenId', verifyWalletOwnership, async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params
    const { userId } = req.body

    const token = await getUserToken(tokenId)

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    // Verify ownership
    if (token.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this token',
      })
    }

    const success = await deactivateToken(tokenId)

    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to deactivate token',
      })
    }

    res.json({
      success: true,
      message: 'Token deactivated successfully',
    })
  } catch (error) {
    console.error('Error deactivating token:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to deactivate token',
    })
  }
})

/**
 * GET /api/user/tokens/:tokenId/config
 * Get token configuration
 */
router.get('/tokens/:tokenId/config', verifyWalletOwnership, async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params
    const { userId } = req.body

    const token = await getUserToken(tokenId)

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    if (token.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this token',
      })
    }

    const config = await getTokenConfig(tokenId)

    res.json({
      success: true,
      data: config,
    })
  } catch (error) {
    console.error('Error getting config:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get configuration',
    })
  }
})

/**
 * POST /api/user/tokens/:tokenId/config/nonce
 * Generate a nonce for config update (includes config hash for binding)
 */
router.post('/tokens/:tokenId/config/nonce', async (req: Request, res: Response) => {
  try {
    const { config } = req.body

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Config object is required',
      })
    }

    const configHash = hashConfig(config)
    const timestamp = Date.now()
    const nonce = crypto.randomBytes(16).toString('hex')

    const message = `ClaudeWheel Config Update

Action: update_config
Timestamp: ${timestamp}
Nonce: ${nonce}
ConfigHash: ${configHash}

This signature authorizes the configuration update.`

    res.json({
      success: true,
      data: {
        message,
        timestamp,
        nonce,
        configHash,
      },
    })
  } catch (error) {
    console.error('Error generating config nonce:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate nonce',
    })
  }
})

/**
 * PUT /api/user/tokens/:tokenId/config
 * Update token configuration (requires signature)
 */
router.put('/tokens/:tokenId/config', verifyWalletOwnership, async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params
    const { userId, config, decodedMessage } = req.body
    const message = decodedMessage  // Use decoded message from middleware

    const token = await getUserToken(tokenId)

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    if (token.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this token',
      })
    }

    if (!config || typeof config !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Config object is required',
      })
    }

    // Verify config hash matches signed message
    const configHash = hashConfig(config)
    const hashMatch = message.match(/ConfigHash: ([a-f0-9]{64})/)
    if (!hashMatch || hashMatch[1] !== configHash) {
      return res.status(401).json({
        success: false,
        error: 'Config hash mismatch. Sign the exact config being submitted.',
      })
    }

    // Validate config values
    const validatedConfig: any = {}

    if (typeof config.flywheel_active === 'boolean') {
      validatedConfig.flywheel_active = config.flywheel_active
    }
    if (typeof config.market_making_enabled === 'boolean') {
      validatedConfig.market_making_enabled = config.market_making_enabled
    }
    if (typeof config.auto_claim_enabled === 'boolean') {
      validatedConfig.auto_claim_enabled = config.auto_claim_enabled
    }
    if (typeof config.fee_threshold_sol === 'number' && config.fee_threshold_sol >= 0) {
      validatedConfig.fee_threshold_sol = config.fee_threshold_sol
    }
    if (typeof config.min_buy_amount_sol === 'number' && config.min_buy_amount_sol >= 0) {
      validatedConfig.min_buy_amount_sol = config.min_buy_amount_sol
    }
    if (typeof config.max_buy_amount_sol === 'number' && config.max_buy_amount_sol >= 0) {
      validatedConfig.max_buy_amount_sol = config.max_buy_amount_sol
    }
    if (typeof config.max_sell_amount_tokens === 'number' && config.max_sell_amount_tokens >= 0) {
      validatedConfig.max_sell_amount_tokens = config.max_sell_amount_tokens
    }
    if (typeof config.buy_interval_minutes === 'number' && config.buy_interval_minutes >= 1) {
      validatedConfig.buy_interval_minutes = Math.floor(config.buy_interval_minutes)
    }
    if (typeof config.slippage_bps === 'number' && config.slippage_bps >= 0 && config.slippage_bps <= 5000) {
      validatedConfig.slippage_bps = Math.floor(config.slippage_bps)
    }
    if (['simple', 'smart', 'rebalance'].includes(config.algorithm_mode)) {
      validatedConfig.algorithm_mode = config.algorithm_mode
    }
    if (typeof config.target_sol_allocation === 'number' && config.target_sol_allocation >= 0 && config.target_sol_allocation <= 100) {
      validatedConfig.target_sol_allocation = Math.floor(config.target_sol_allocation)
    }
    if (typeof config.target_token_allocation === 'number' && config.target_token_allocation >= 0 && config.target_token_allocation <= 100) {
      validatedConfig.target_token_allocation = Math.floor(config.target_token_allocation)
    }
    if (typeof config.rebalance_threshold === 'number' && config.rebalance_threshold >= 1 && config.rebalance_threshold <= 50) {
      validatedConfig.rebalance_threshold = Math.floor(config.rebalance_threshold)
    }
    if (typeof config.use_twap === 'boolean') {
      validatedConfig.use_twap = config.use_twap
    }
    if (typeof config.twap_threshold_usd === 'number' && config.twap_threshold_usd >= 0) {
      validatedConfig.twap_threshold_usd = config.twap_threshold_usd
    }

    const updatedConfig = await updateTokenConfig(tokenId, validatedConfig)

    if (!updatedConfig) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update configuration',
      })
    }

    res.json({
      success: true,
      data: updatedConfig,
      message: 'Configuration updated successfully',
    })
  } catch (error) {
    console.error('Error updating config:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update configuration',
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// CLAIM ROUTES
// Manual and auto-claim fee management
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/user/tokens/:tokenId/claimable
 * Get claimable fees for a token
 */
router.get('/tokens/:tokenId/claimable', verifyWalletOwnership, async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params
    const { userId } = req.body

    const token = await getUserToken(tokenId)

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    if (token.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this token',
      })
    }

    // Get claimable positions from Bags.fm
    const positions = await bagsFmService.getClaimablePositions(token.dev_wallet_address)
    const position = positions.find(p => p.tokenMint === token.token_mint_address)

    res.json({
      success: true,
      data: {
        tokenMint: token.token_mint_address,
        devWallet: token.dev_wallet_address,
        claimableAmount: position?.claimableAmount || 0,
        claimableAmountUsd: position?.claimableAmountUsd || 0,
        lastClaimTime: position?.lastClaimTime || null,
      },
    })
  } catch (error) {
    console.error('Error getting claimable:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get claimable fees',
    })
  }
})

/**
 * POST /api/user/tokens/:tokenId/claim/nonce
 * Generate a nonce for manual claim
 */
router.post('/tokens/:tokenId/claim/nonce', async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params
    const timestamp = Date.now()
    const nonce = crypto.randomBytes(16).toString('hex')

    const message = `ClaudeWheel Manual Claim

Action: manual_claim
TokenId: ${tokenId}
Timestamp: ${timestamp}
Nonce: ${nonce}

This signature authorizes a manual fee claim.`

    res.json({
      success: true,
      data: {
        message,
        timestamp,
        nonce,
      },
    })
  } catch (error) {
    console.error('Error generating claim nonce:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate nonce',
    })
  }
})

/**
 * POST /api/user/tokens/:tokenId/claim
 * Manually trigger a claim (requires signature)
 */
router.post('/tokens/:tokenId/claim', verifyWalletOwnership, async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params
    const { userId } = req.body

    // Check if encryption is configured
    if (!isEncryptionConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Encryption is not configured. Contact administrator.',
      })
    }

    const token = await getUserToken(tokenId)

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    if (token.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this token',
      })
    }

    // Execute manual claim
    const result = await multiUserClaimService.manualClaim(tokenId)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || 'Claim failed',
      })
    }

    res.json({
      success: true,
      data: {
        amountClaimedSol: result.amountClaimedSol,
        signature: result.signature,
      },
      message: `Successfully claimed ${result.amountClaimedSol.toFixed(4)} SOL`,
    })
  } catch (error) {
    console.error('Error executing claim:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to execute claim',
    })
  }
})

/**
 * GET /api/user/tokens/:tokenId/claims
 * Get claim history for a token
 */
router.get('/tokens/:tokenId/claims', verifyWalletOwnership, async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params
    const { userId } = req.body

    const token = await getUserToken(tokenId)

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    if (token.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this token',
      })
    }

    // Get claim stats from Bags.fm
    const claimStats = await bagsFmService.getClaimStats(token.dev_wallet_address)

    res.json({
      success: true,
      data: {
        totalClaimed: claimStats?.totalClaimed || 0,
        totalClaimedUsd: claimStats?.totalClaimedUsd || 0,
        pendingClaims: claimStats?.pendingClaims || 0,
        lastClaimTime: claimStats?.lastClaimTime || null,
      },
    })
  } catch (error) {
    console.error('Error getting claims:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get claim history',
    })
  }
})

/**
 * GET /api/user/tokens/:tokenId/activity
 * Get combined activity logs (claims + transactions) for terminal display
 */
router.get('/tokens/:tokenId/activity', verifyWalletOwnership, async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params
    const { userId } = req.body
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)

    const token = await getUserToken(tokenId)

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    if (token.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this token',
      })
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured',
      })
    }

    // Fetch claims
    const { data: claims } = await supabase
      .from('user_claim_history')
      .select('id, amount_sol, transaction_signature, claimed_at')
      .eq('user_token_id', tokenId)
      .order('claimed_at', { ascending: false })
      .limit(limit)

    // Fetch transactions (including info messages)
    const { data: transactions } = await supabase
      .from('user_transactions')
      .select('id, type, amount, signature, message, status, created_at')
      .eq('user_token_id', tokenId)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Combine and format as activity logs
    const activities: Array<{
      id: string
      type: 'claim' | 'buy' | 'sell' | 'transfer' | 'info'
      message: string
      amount: number
      signature: string | null
      timestamp: string
    }> = []

    // Log for debugging
    console.log(`📋 Fetching activity for token ${tokenId}: ${claims?.length || 0} claims, ${transactions?.length || 0} transactions`)

    // Add claims
    if (claims) {
      for (const claim of claims) {
        activities.push({
          id: claim.id,
          type: 'claim',
          message: `Claimed ${claim.amount_sol.toFixed(4)} SOL from fees`,
          amount: claim.amount_sol,
          signature: claim.transaction_signature,
          timestamp: claim.claimed_at,
        })
      }
    }

    // Add transactions
    if (transactions) {
      for (const tx of transactions) {
        let message: string
        if (tx.type === 'buy') {
          message = `BUY: Spent ${tx.amount.toFixed(4)} SOL on ${token.token_symbol}`
        } else if (tx.type === 'sell') {
          message = `SELL: Sold ${tx.amount.toFixed(0)} ${token.token_symbol} tokens`
        } else if (tx.type === 'transfer') {
          message = `TRANSFER: Moved ${tx.amount.toFixed(4)} SOL from dev → ops wallet`
        } else if (tx.type === 'info') {
          // Info messages use the stored message field
          message = tx.message || 'Flywheel status update'
        } else {
          message = `${tx.type.toUpperCase()}: ${tx.amount.toFixed(4)}`
        }

        activities.push({
          id: tx.id,
          type: tx.type as 'buy' | 'sell' | 'transfer' | 'info',
          message,
          amount: tx.amount,
          signature: tx.signature,
          timestamp: tx.created_at,
        })
      }
    }

    // Sort by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Limit to requested count
    const limitedActivities = activities.slice(0, limit)

    res.json({
      success: true,
      data: {
        activities: limitedActivities,
        tokenSymbol: token.token_symbol,
        devWallet: token.dev_wallet_address,
        opsWallet: token.ops_wallet_address,
      },
    })
  } catch (error) {
    console.error('Error getting activity:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get activity logs',
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// MANUAL SELL ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/user/tokens/:tokenId/sell/nonce
 * Generate a nonce for manual sell
 */
router.post('/tokens/:tokenId/sell/nonce', async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params
    const { percentage } = req.body // 25, 50, or 100

    if (!percentage || ![25, 50, 100].includes(percentage)) {
      return res.status(400).json({
        success: false,
        error: 'percentage must be 25, 50, or 100',
      })
    }

    const timestamp = Date.now()
    const nonce = crypto.randomBytes(16).toString('hex')

    const message = `ClaudeWheel Manual Sell

Action: manual_sell
TokenId: ${tokenId}
Percentage: ${percentage}
Timestamp: ${timestamp}
Nonce: ${nonce}

This signature authorizes a manual token sell.`

    res.json({
      success: true,
      data: {
        message,
        timestamp,
        nonce,
        percentage,
      },
    })
  } catch (error) {
    console.error('Error generating sell nonce:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate nonce',
    })
  }
})

/**
 * POST /api/user/tokens/:tokenId/sell
 * Manually sell a percentage of tokens (requires signature)
 */
router.post('/tokens/:tokenId/sell', verifyWalletOwnership, async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params
    const { userId, percentage, decodedMessage } = req.body
    const message = decodedMessage  // Use decoded message from middleware

    // Check if encryption is configured
    if (!isEncryptionConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Encryption is not configured. Contact administrator.',
      })
    }

    // Validate percentage
    if (!percentage || ![25, 50, 100].includes(percentage)) {
      return res.status(400).json({
        success: false,
        error: 'percentage must be 25, 50, or 100',
      })
    }

    // Verify percentage in signed message
    const pctMatch = message.match(/Percentage: (\d+)/)
    if (!pctMatch || parseInt(pctMatch[1]) !== percentage) {
      return res.status(401).json({
        success: false,
        error: 'Percentage mismatch. Sign the exact percentage being submitted.',
      })
    }

    const token = await getUserToken(tokenId)

    if (!token) {
      return res.status(404).json({
        success: false,
        error: 'Token not found',
      })
    }

    if (token.user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'You do not own this token',
      })
    }

    // Get decrypted ops wallet for trading
    const { getDecryptedOpsWallet, getTokenConfig } = await import('../services/user-token.service')
    const { getConnection, getTokenBalance } = await import('../config/solana')
    const { PublicKey, VersionedTransaction } = await import('@solana/web3.js')
    const bs58 = await import('bs58')

    const wallet = await getDecryptedOpsWallet(tokenId)
    if (!wallet) {
      return res.status(500).json({
        success: false,
        error: 'Failed to decrypt ops wallet',
      })
    }

    const connection = getConnection()
    const tokenMint = new PublicKey(token.token_mint_address)
    const config = await getTokenConfig(tokenId)

    // Get token balance
    const tokenBalance = await getTokenBalance(wallet.publicKey, tokenMint)
    const sellAmount = tokenBalance * (percentage / 100)

    if (sellAmount < 1) {
      return res.status(400).json({
        success: false,
        error: 'Insufficient token balance',
      })
    }

    const tokenUnits = Math.floor(sellAmount * Math.pow(10, token.token_decimals))
    const SOL_MINT = 'So11111111111111111111111111111111111111112'

    // Get quote
    const quote = await bagsFmService.getTradeQuote(
      token.token_mint_address,
      SOL_MINT,
      tokenUnits,
      'sell',
      config?.slippage_bps || 300
    )

    if (!quote?.rawQuoteResponse) {
      return res.status(400).json({
        success: false,
        error: 'Failed to get sell quote',
      })
    }

    // Execute swap
    const swapData = await bagsFmService.generateSwapTransaction(
      wallet.publicKey.toString(),
      quote.rawQuoteResponse
    )

    if (!swapData) {
      return res.status(400).json({
        success: false,
        error: 'Failed to generate swap transaction',
      })
    }

    const txBuffer = bs58.default.decode(swapData.transaction)
    const transaction = VersionedTransaction.deserialize(txBuffer)
    transaction.sign([wallet])

    const signature = await connection.sendTransaction(transaction, {
      maxRetries: 5,
      skipPreflight: true,
    })

    // Wait for confirmation
    await connection.confirmTransaction(signature, 'confirmed')

    res.json({
      success: true,
      data: {
        amountSold: sellAmount,
        percentage,
        signature,
      },
      message: `Successfully sold ${percentage}% (${sellAmount.toFixed(0)} tokens)`,
    })
  } catch (error: any) {
    console.error('Error executing sell:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute sell',
    })
  }
})

export default router
