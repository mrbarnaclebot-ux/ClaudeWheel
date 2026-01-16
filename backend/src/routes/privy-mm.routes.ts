import { Router, Request, Response, NextFunction } from 'express'
import { Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { privyService } from '../services/privy.service'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { bagsFmService } from '../services/bags-fm'
import { loggers } from '../utils/logger'
import { z } from 'zod'
import { getConnection, getTokenBalance } from '../config/solana'
import { sendTransactionWithPrivySigning } from '../utils/transaction'
import { env } from '../config/env'

const router = Router()

// ═══════════════════════════════════════════════════════════════════════════
// PRIVY MM ROUTES
// MM-only mode: user funds ops wallet to market-make any Bags token
// ═══════════════════════════════════════════════════════════════════════════

// Extend Request type with privyUserId
interface PrivyRequest extends Request {
  privyUserId?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTH MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

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
// VALIDATION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

const startMmSchema = z.object({
  tokenMint: z.string().min(32).max(64),
  mmAlgorithm: z.enum(['simple', 'turbo_lite', 'rebalance']).default('simple'),
})

const withdrawSchema = z.object({
  destinationAddress: z.string().min(32).max(64),
})

// ═══════════════════════════════════════════════════════════════════════════
// MM ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/privy/mm/start
 * Start MM-only mode for a token
 * - Validates token mint exists (fetches metadata from Helius/Bags)
 * - Creates pending MM deposit
 * - Returns deposit address (ops wallet)
 */
router.post('/start', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const parsed = startMmSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        details: parsed.error.errors,
      })
    }

    const { tokenMint, mmAlgorithm } = parsed.data

    // Check if user already has a pending MM deposit
    const existingPending = await prisma.privyMmPending.findFirst({
      where: {
        privyUserId: req.privyUserId,
        status: 'awaiting_deposit',
      },
    })

    if (existingPending) {
      return res.status(400).json({
        success: false,
        error: 'You already have a pending MM deposit. Cancel it first or wait for it to expire.',
      })
    }

    // Check if user already has this token registered
    const existingToken = await prisma.privyUserToken.findFirst({
      where: {
        privyUserId: req.privyUserId,
        tokenMintAddress: tokenMint,
        isActive: true,
      },
    })

    if (existingToken) {
      return res.status(400).json({
        success: false,
        error: 'You already have this token registered. Use the existing token settings.',
      })
    }

    // Get user's ops wallet
    const opsWallet = await prisma.privyWallet.findFirst({
      where: {
        privyUserId: req.privyUserId,
        walletType: 'ops',
      },
    })

    if (!opsWallet) {
      return res.status(400).json({
        success: false,
        error: 'Ops wallet not found. Complete onboarding first.',
      })
    }

    // Validate token mint and get metadata from Helius
    let tokenInfo: { name: string; symbol: string; image?: string; decimals: number } | null = null

    try {
      // Try Helius DAS API first
      const heliusUrl = env.solanaRpcUrl
      if (heliusUrl && heliusUrl.includes('helius')) {
        const response = await fetch(heliusUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'get-asset',
            method: 'getAsset',
            params: { id: tokenMint },
          }),
        })
        const data = await response.json() as { result?: any }

        if (data.result) {
          const asset = data.result as any
          tokenInfo = {
            name: asset.content?.metadata?.name || asset.content?.metadata?.symbol || 'Unknown',
            symbol: asset.content?.metadata?.symbol || 'UNKNOWN',
            image: asset.content?.links?.image || asset.content?.files?.[0]?.uri,
            decimals: asset.token_info?.decimals || 6,
          }
        }
      }
    } catch (error) {
      loggers.privy.warn({ error: String(error), tokenMint }, 'Failed to fetch token info from Helius')
    }

    // Fallback: Try Bags.fm API
    if (!tokenInfo) {
      try {
        const bagsToken = await bagsFmService.getTokenCreatorInfo(tokenMint)
        if (bagsToken) {
          tokenInfo = {
            name: bagsToken.tokenName || 'Unknown',
            symbol: bagsToken.tokenSymbol || 'UNKNOWN',
            image: bagsToken.tokenImage,
            decimals: 6, // Bags tokens are always 6 decimals
          }
        }
      } catch (error) {
        loggers.privy.warn({ error: String(error), tokenMint }, 'Failed to fetch token info from Bags.fm')
      }
    }

    if (!tokenInfo) {
      return res.status(400).json({
        success: false,
        error: 'Could not find token. Make sure it\'s a valid Bags.fm token.',
      })
    }

    // Create pending MM deposit (expires in 24 hours)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

    const mmPending = await prisma.privyMmPending.create({
      data: {
        privyUserId: req.privyUserId!,
        tokenMintAddress: tokenMint,
        tokenSymbol: tokenInfo.symbol,
        tokenName: tokenInfo.name,
        tokenImage: tokenInfo.image,
        tokenDecimals: tokenInfo.decimals,
        opsWalletId: opsWallet.id,
        depositAddress: opsWallet.walletAddress,
        minDepositSol: 0.1,
        mmAlgorithm,
        status: 'awaiting_deposit',
        expiresAt,
      },
    })

    loggers.privy.info({
      userId: req.privyUserId,
      tokenMint,
      tokenSymbol: tokenInfo.symbol,
      depositAddress: opsWallet.walletAddress,
    }, 'MM-only pending deposit created')

    return res.json({
      success: true,
      data: {
        id: mmPending.id,
        tokenMint,
        tokenSymbol: tokenInfo.symbol,
        tokenName: tokenInfo.name,
        tokenImage: tokenInfo.image,
        depositAddress: opsWallet.walletAddress,
        minDepositSol: 0.1,
        mmAlgorithm,
        expiresAt: expiresAt.toISOString(),
      },
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error starting MM-only mode')
    return res.status(500).json({
      success: false,
      error: 'Failed to start MM-only mode',
    })
  }
})

/**
 * GET /api/privy/mm/pending
 * Get user's current pending MM deposit
 */
router.get('/pending', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const pending = await prisma.privyMmPending.findFirst({
      where: {
        privyUserId: req.privyUserId,
        status: 'awaiting_deposit',
      },
      include: {
        opsWallet: true,
      },
    })

    if (!pending) {
      return res.json({
        success: true,
        data: null,
      })
    }

    // Check current balance
    const connection = getConnection()
    const balance = await connection.getBalance(new PublicKey(pending.depositAddress))
    const balanceSol = balance / LAMPORTS_PER_SOL

    return res.json({
      success: true,
      data: {
        id: pending.id,
        tokenMint: pending.tokenMintAddress,
        tokenSymbol: pending.tokenSymbol,
        tokenName: pending.tokenName,
        tokenImage: pending.tokenImage,
        depositAddress: pending.depositAddress,
        minDepositSol: Number(pending.minDepositSol),
        currentBalanceSol: balanceSol,
        mmAlgorithm: pending.mmAlgorithm,
        status: pending.status,
        expiresAt: pending.expiresAt.toISOString(),
      },
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error getting pending MM deposit')
    return res.status(500).json({
      success: false,
      error: 'Failed to get pending MM deposit',
    })
  }
})

/**
 * DELETE /api/privy/mm/pending/:id
 * Cancel pending MM deposit
 */
router.delete('/pending/:id', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const { id } = req.params

    const pending = await prisma.privyMmPending.findFirst({
      where: {
        id,
        privyUserId: req.privyUserId,
        status: 'awaiting_deposit',
      },
    })

    if (!pending) {
      return res.status(404).json({
        success: false,
        error: 'Pending MM deposit not found',
      })
    }

    await prisma.privyMmPending.update({
      where: { id },
      data: { status: 'cancelled' },
    })

    loggers.privy.info({ userId: req.privyUserId, pendingId: id }, 'MM pending deposit cancelled')

    return res.json({
      success: true,
      message: 'MM deposit cancelled',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error cancelling MM deposit')
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel MM deposit',
    })
  }
})

/**
 * POST /api/privy/mm/:tokenId/withdraw
 * Stop MM and withdraw all funds
 * - Stops flywheel
 * - Sells all tokens for SOL
 * - Transfers SOL to destination address
 * - Marks token as inactive
 */
router.post('/:tokenId/withdraw', async (req: PrivyRequest, res: Response) => {
  try {
    if (!isPrismaConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured',
      })
    }

    const parsed = withdrawSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid destination address',
      })
    }

    const { tokenId } = req.params
    const { destinationAddress } = parsed.data

    // Validate destination address
    try {
      new PublicKey(destinationAddress)
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid Solana address',
      })
    }

    // Get token and verify ownership + mm_only type
    const token = await prisma.privyUserToken.findFirst({
      where: {
        id: tokenId,
        privyUserId: req.privyUserId,
        tokenSource: 'mm_only',
      },
    })

    // Get opsWallet and config separately
    const [opsWallet, config] = await Promise.all([
      token ? prisma.privyWallet.findUnique({ where: { id: token.opsWalletId } }) : null,
      token ? prisma.privyTokenConfig.findUnique({ where: { privyTokenId: token.id } }) : null,
    ])

    if (!token || !opsWallet) {
      return res.status(404).json({
        success: false,
        error: 'MM-only token not found',
      })
    }

    const opsWalletAddress = opsWallet.walletAddress
    const connection = getConnection()

    loggers.privy.info({
      tokenId,
      tokenSymbol: token.tokenSymbol,
      opsWallet: opsWalletAddress,
      destination: destinationAddress,
    }, 'Starting MM withdrawal')

    // Step 1: Stop flywheel
    if (config?.flywheelActive) {
      await prisma.privyTokenConfig.update({
        where: { privyTokenId: tokenId },
        data: { flywheelActive: false },
      })
      loggers.privy.info({ tokenSymbol: token.tokenSymbol }, 'Flywheel stopped for withdrawal')
    }

    // Step 2: Get token balance in ops wallet
    const opsPubkey = new PublicKey(opsWalletAddress)
    const tokenMintPubkey = new PublicKey(token.tokenMintAddress)
    const tokenBalance = await getTokenBalance(opsPubkey, tokenMintPubkey)

    let sellSignature: string | undefined

    // Step 3: Sell all tokens if balance > 0
    if (tokenBalance > 0) {
      loggers.privy.info({ tokenSymbol: token.tokenSymbol, tokenBalance }, 'Selling tokens for withdrawal')

      const tokenUnits = Math.floor(tokenBalance * Math.pow(10, token.tokenDecimals))

      // Get sell quote
      const quote = await bagsFmService.getTradeQuote(
        token.tokenMintAddress,
        'So11111111111111111111111111111111111111112', // SOL
        tokenUnits,
        'sell',
        500 // 5% slippage for withdrawal
      )

      if (!quote) {
        return res.status(500).json({
          success: false,
          error: 'Failed to get sell quote. Try again later.',
        })
      }

      // Execute swap
      const swapResult = await bagsFmService.generateSwapTransaction(opsWalletAddress, quote.rawQuoteResponse)

      if (!swapResult) {
        return res.status(500).json({
          success: false,
          error: 'Failed to create sell transaction. Try again later.',
        })
      }

      // Deserialize and sign with Privy
      const { VersionedTransaction } = await import('@solana/web3.js')
      const bs58 = await import('bs58')
      const txBuffer = bs58.default.decode(swapResult.transaction)
      const transaction = VersionedTransaction.deserialize(txBuffer)

      const result = await sendTransactionWithPrivySigning(connection, transaction, opsWalletAddress, {
        logContext: { action: 'mm-withdraw-sell', tokenSymbol: token.tokenSymbol },
      })

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error || 'Sell transaction failed. Try again later.',
        })
      }

      sellSignature = result.signature
      loggers.privy.info({ tokenSymbol: token.tokenSymbol, tokenBalance, signature: sellSignature }, 'Tokens sold for withdrawal')

      // Wait a moment for balance to update
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // Step 4: Get SOL balance and transfer to destination
    const solBalance = await connection.getBalance(opsPubkey)
    const rentReserve = 0.002 * LAMPORTS_PER_SOL // Keep small reserve for rent
    const transferAmountLamports = Math.max(0, solBalance - rentReserve)

    let transferSignature: string | undefined
    let actualTransferredSol = 0

    if (transferAmountLamports > 0.001 * LAMPORTS_PER_SOL) {
      const transferTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: opsPubkey,
          toPubkey: new PublicKey(destinationAddress),
          lamports: Math.floor(transferAmountLamports),
        })
      )
      transferTx.feePayer = opsPubkey

      const transferResult = await sendTransactionWithPrivySigning(connection, transferTx, opsWalletAddress, {
        logContext: { action: 'mm-withdraw-transfer', tokenSymbol: token.tokenSymbol },
      })

      if (!transferResult.success) {
        return res.status(500).json({
          success: false,
          error: transferResult.error || 'SOL transfer failed. Try again later.',
          sellSignature, // Return sell signature if sell succeeded
        })
      }

      transferSignature = transferResult.signature
      actualTransferredSol = transferAmountLamports / LAMPORTS_PER_SOL
      loggers.privy.info({
        tokenSymbol: token.tokenSymbol,
        amountSol: actualTransferredSol,
        signature: transferSignature,
        destination: destinationAddress,
      }, 'SOL transferred for withdrawal')
    }

    // Step 5: Mark token as inactive
    await prisma.privyUserToken.update({
      where: { id: tokenId },
      data: { isActive: false },
    })

    loggers.privy.info({
      tokenId,
      tokenSymbol: token.tokenSymbol,
      tokensSold: tokenBalance,
      solTransferred: actualTransferredSol,
    }, 'MM withdrawal completed')

    return res.json({
      success: true,
      data: {
        tokensSold: tokenBalance,
        solTransferred: actualTransferredSol,
        sellSignature,
        transferSignature,
        destination: destinationAddress,
      },
      message: 'Withdrawal completed successfully',
    })
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Error during MM withdrawal')
    return res.status(500).json({
      success: false,
      error: 'Withdrawal failed. Please try again.',
    })
  }
})

export default router
