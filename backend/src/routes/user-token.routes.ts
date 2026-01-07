import { Router, Request, Response } from 'express'
import { verifySignature, hashConfig, isMessageRecent } from '../utils/signature-verify'
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
  const message = req.headers['x-wallet-message'] as string

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
      opsWalletAddress,
    } = req.body

    // Validate required fields
    if (!tokenMintAddress || !tokenSymbol || !devWalletPrivateKey || !opsWalletAddress) {
      return res.status(400).json({
        success: false,
        error: 'tokenMintAddress, tokenSymbol, devWalletPrivateKey, and opsWalletAddress are required',
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
      opsWalletAddress,
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
    const { userId, config } = req.body
    const message = req.headers['x-wallet-message'] as string

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

export default router
