import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { verifySignature, isMessageRecent, hashConfig, extractConfigHash, generateSecureNonceMessage } from '../utils/signature-verify'
import { supabase } from '../config/database'
import { env } from '../config/env'
import { marketMaker } from '../services/market-maker'
import { walletMonitor } from '../services/wallet-monitor'

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN ROUTES
// Protected endpoints requiring wallet signature verification
// ═══════════════════════════════════════════════════════════════════════════

const router = Router()

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

export default router
