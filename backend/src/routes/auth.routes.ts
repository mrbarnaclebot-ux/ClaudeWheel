import { Router, Request, Response } from 'express'
import { verifySignature, isValidSolanaAddress } from '../utils/signature-verify'
import {
  generateAuthNonce,
  verifyNonce,
  consumeNonce,
  createOrGetUser,
  getUserByWallet,
} from '../services/user.service'

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION ROUTES
// Wallet-based authentication using signature verification
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/nonce
 * Generate a nonce message for the wallet to sign
 */
router.post('/nonce', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.body

    if (!walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Wallet address is required',
      })
    }

    // Validate wallet address format using proper Solana validation
    const addressValidation = isValidSolanaAddress(walletAddress)
    if (!addressValidation.valid) {
      return res.status(400).json({
        success: false,
        error: addressValidation.error || 'Invalid wallet address format',
      })
    }

    const authNonce = generateAuthNonce(walletAddress)

    res.json({
      success: true,
      data: {
        message: authNonce.message,
        nonce: authNonce.nonce,
        timestamp: authNonce.timestamp,
        expiresAt: authNonce.expiresAt,
      },
    })
  } catch (error) {
    console.error('Error generating nonce:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to generate authentication nonce',
    })
  }
})

/**
 * POST /api/auth/verify
 * Verify the signed message and authenticate/register the user
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { walletAddress, signature, message } = req.body

    if (!walletAddress || !signature || !message) {
      return res.status(400).json({
        success: false,
        error: 'walletAddress, signature, and message are required',
      })
    }

    // Verify the nonce exists and is valid
    const authNonce = verifyNonce(walletAddress)
    if (!authNonce) {
      return res.status(401).json({
        success: false,
        error: 'Nonce expired or not found. Please request a new nonce.',
      })
    }

    // Verify the message matches
    if (message !== authNonce.message) {
      return res.status(401).json({
        success: false,
        error: 'Message does not match the expected nonce message',
      })
    }

    // Verify the signature
    const verificationResult = verifySignature(message, signature, walletAddress)
    if (!verificationResult.valid) {
      return res.status(401).json({
        success: false,
        error: verificationResult.error || 'Signature verification failed',
      })
    }

    // Consume the nonce (one-time use)
    consumeNonce(walletAddress)

    // Create or get the user
    const user = await createOrGetUser(walletAddress)
    if (!user) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create or retrieve user',
      })
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'User account is deactivated',
      })
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          walletAddress: user.wallet_address,
          displayName: user.display_name,
          isActive: user.is_active,
          createdAt: user.created_at,
        },
        message: 'Authentication successful',
      },
    })
  } catch (error) {
    console.error('Error verifying signature:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to verify authentication',
    })
  }
})

/**
 * GET /api/auth/user
 * Get user info by wallet address (requires wallet signature in header)
 */
router.get('/user', async (req: Request, res: Response) => {
  try {
    const walletAddress = req.headers['x-wallet-address'] as string

    if (!walletAddress) {
      return res.status(401).json({
        success: false,
        error: 'Wallet address required in x-wallet-address header',
      })
    }

    const user = await getUserByWallet(walletAddress)
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      })
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        walletAddress: user.wallet_address,
        displayName: user.display_name,
        isActive: user.is_active,
        createdAt: user.created_at,
      },
    })
  } catch (error) {
    console.error('Error getting user:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get user',
    })
  }
})

/**
 * POST /api/auth/verify-ownership
 * Verify wallet ownership with a fresh signature (for sensitive operations)
 * This is used before operations like registering a token or updating config
 */
router.post('/verify-ownership', async (req: Request, res: Response) => {
  try {
    const { walletAddress, signature, message, action } = req.body

    if (!walletAddress || !signature || !message) {
      return res.status(400).json({
        success: false,
        error: 'walletAddress, signature, and message are required',
      })
    }

    // Verify the signature
    const verificationResult = verifySignature(message, signature, walletAddress)
    if (!verificationResult.valid) {
      return res.status(401).json({
        success: false,
        error: verificationResult.error || 'Signature verification failed',
      })
    }

    // Check message freshness (5 minute window)
    const timestampMatch = message.match(/Timestamp: (\d+)/)
    if (timestampMatch) {
      const timestamp = parseInt(timestampMatch[1], 10)
      const now = Date.now()
      const maxAge = 5 * 60 * 1000 // 5 minutes

      if (now - timestamp > maxAge) {
        return res.status(401).json({
          success: false,
          error: 'Message has expired. Please sign a fresh message.',
        })
      }
    }

    // Verify user exists
    const user = await getUserByWallet(walletAddress)
    if (!user || !user.is_active) {
      return res.status(404).json({
        success: false,
        error: 'User not found or inactive',
      })
    }

    res.json({
      success: true,
      data: {
        verified: true,
        userId: user.id,
        action: action || 'ownership_verification',
      },
    })
  } catch (error) {
    console.error('Error verifying ownership:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to verify wallet ownership',
    })
  }
})

export default router
