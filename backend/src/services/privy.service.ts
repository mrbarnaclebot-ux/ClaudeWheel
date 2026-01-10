import { PrivyClient, SolanaCaip2ChainId } from '@privy-io/server-auth'
import { Transaction, VersionedTransaction } from '@solana/web3.js'
import { env } from '../config/env'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { createLogger } from '../utils/logger'

// ═══════════════════════════════════════════════════════════════════════════
// PRIVY SERVICE
// Handles Privy authentication, wallet management, and delegated signing
// Uses Prisma for database operations (Render Postgres)
// ═══════════════════════════════════════════════════════════════════════════

const logger = createLogger('privy')

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface LinkTelegramParams {
  privyUserId: string
  telegramId: number
  telegramUsername?: string
  devWalletAddress: string
  devWalletId: string
  opsWalletAddress: string
  opsWalletId: string
}

export interface TelegramUserResult {
  privyUserId: string
  devWallet: any | null
  opsWallet: any | null
  isDelegated: boolean
  telegramUsername?: string
}

export interface AuthTokenResult {
  valid: boolean
  userId: string | null
}

class PrivyService {
  private client: PrivyClient | null = null

  constructor() {
    if (env.privyAppId && env.privyAppSecret) {
      // Initialize with authorization key for delegated wallet signing
      const options = env.privyAuthorizationKey
        ? { walletApi: { authorizationPrivateKey: env.privyAuthorizationKey } }
        : undefined

      this.client = new PrivyClient(env.privyAppId, env.privyAppSecret, options)

      if (env.privyAuthorizationKey) {
        logger.info('Privy client initialized with authorization key for wallet signing')
      } else {
        logger.warn('Privy client initialized WITHOUT authorization key - wallet signing will fail')
      }
    } else {
      logger.warn('Privy not configured - set PRIVY_APP_ID and PRIVY_APP_SECRET')
    }
  }

  /**
   * Check if Privy is configured
   */
  isConfigured(): boolean {
    return this.client !== null
  }

  /**
   * Check if wallet signing is available (requires authorization key)
   */
  canSignTransactions(): boolean {
    return this.client !== null && !!env.privyAuthorizationKey
  }

  /**
   * Check if database is configured
   */
  isDatabaseConfigured(): boolean {
    return isPrismaConfigured()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTH TOKEN VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Verify a Privy auth token
   * Returns the Privy user ID if valid
   */
  async verifyAuthToken(authToken: string): Promise<{ valid: boolean; userId: string | null }> {
    if (!this.client) {
      logger.error('Privy client not configured')
      return { valid: false, userId: null }
    }

    try {
      const claims = await this.client.verifyAuthToken(authToken)
      return { valid: true, userId: claims.userId }
    } catch (error) {
      logger.debug({ error: String(error) }, 'Auth token verification failed')
      return { valid: false, userId: null }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get Privy user info from Privy API
   */
  async getPrivyUser(privyUserId: string) {
    if (!this.client) {
      logger.error('Privy client not configured')
      return null
    }

    try {
      return await this.client.getUser(privyUserId)
    } catch (error) {
      logger.error({ error: String(error), privyUserId }, 'Failed to get Privy user')
      return null
    }
  }

  /**
   * Get user from database by Privy user ID
   */
  async getDbUser(privyUserId: string) {
    if (!isPrismaConfigured()) {
      logger.error('Prisma not configured')
      return null
    }

    try {
      const user = await prisma.privyUser.findUnique({
        where: { privyUserId },
        include: { wallets: true },
      })
      return user
    } catch (error) {
      logger.error({ error: String(error), privyUserId }, 'Failed to get user from database')
      return null
    }
  }

  /**
   * Get user by Telegram ID
   */
  async getTelegramUser(telegramId: number): Promise<TelegramUserResult | null> {
    if (!isPrismaConfigured()) {
      logger.error('Prisma not configured')
      return null
    }

    try {
      const user = await prisma.privyUser.findUnique({
        where: { telegramId: BigInt(telegramId) },
        include: { wallets: true },
      })

      if (!user) return null

      return {
        privyUserId: user.privyUserId,
        devWallet: user.wallets?.find((w) => w.walletType === 'dev') || null,
        opsWallet: user.wallets?.find((w) => w.walletType === 'ops') || null,
        isDelegated: user.walletsDelegated,
        telegramUsername: user.telegramUsername || undefined,
      }
    } catch (error) {
      logger.error({ error: String(error), telegramId }, 'Failed to get Telegram user')
      return null
    }
  }

  /**
   * Get user's wallets from database
   */
  async getUserWallets(privyUserId: string) {
    if (!isPrismaConfigured()) {
      logger.error('Prisma not configured')
      return null
    }

    try {
      const wallets = await prisma.privyWallet.findMany({
        where: { privyUserId },
      })
      return wallets
    } catch (error) {
      logger.error({ error: String(error), privyUserId }, 'Failed to get user wallets')
      return null
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DELEGATED SIGNING (Server-Side)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Sign a Solana transaction using delegated access (Orica pattern)
   * Uses walletApi.rpc method which is more reliable than walletApi.solana.signTransaction
   * IMPORTANT: Only works if user has delegated the wallet via frontend
   */
  async signSolanaTransaction(
    walletAddress: string,
    transaction: Transaction | VersionedTransaction
  ): Promise<Transaction | VersionedTransaction | null> {
    if (!this.client) {
      logger.error('Privy client not configured')
      return null
    }

    try {
      // Look up the Privy wallet ID from our database (Orica uses walletId, not address)
      let walletId: string = walletAddress // fallback to address
      if (isPrismaConfigured()) {
        const wallet = await prisma.privyWallet.findUnique({
          where: { walletAddress },
          select: { privyWalletId: true },
        })
        if (wallet?.privyWalletId) {
          walletId = wallet.privyWalletId
        }
      }

      logger.debug({ walletAddress, walletId }, 'Signing transaction with Privy RPC method')

      // Use walletApi.rpc method like Orica does (more reliable than walletApi.solana.signTransaction)
      const privyClient = this.client as any
      const signResult = await privyClient.walletApi.rpc({
        walletId: walletId,
        caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', // mainnet
        method: 'signTransaction',
        params: {
          transaction: transaction,
        },
      })

      logger.debug({ signResult: JSON.stringify(signResult) }, 'Privy sign result')

      // Handle multiple response formats (Orica pattern)
      const signedTx =
        signResult?.signedTransaction ||
        signResult?.data?.signedTransaction ||
        signResult?.transaction ||
        signResult?.data?.transaction ||
        signResult

      if (!signedTx) {
        logger.error('No signed transaction in Privy response')
        return null
      }

      // If it's already a Transaction/VersionedTransaction object, return it
      if (signedTx instanceof Transaction || signedTx instanceof VersionedTransaction) {
        return signedTx
      }

      // If it's base64 encoded, deserialize it
      if (typeof signedTx === 'string') {
        const buffer = Buffer.from(signedTx, 'base64')
        try {
          return VersionedTransaction.deserialize(buffer)
        } catch {
          return Transaction.from(buffer)
        }
      }

      // If it has a serialize method, it's likely a transaction object
      if (signedTx.serialize) {
        return signedTx
      }

      logger.error({ signedTxType: typeof signedTx }, 'Unknown signed transaction format')
      return null
    } catch (error) {
      logger.error({ error: String(error), walletAddress }, 'Failed to sign Solana transaction')
      return null
    }
  }

  /**
   * Sign and send a Solana transaction in one call
   * More efficient for automated trading
   *
   * Throws an error with a descriptive message on failure instead of returning null.
   * The error message will indicate if this is a blockhash/signature issue that
   * might be resolved by retrying with a fresh transaction.
   */
  async signAndSendSolanaTransaction(
    walletAddress: string,
    transaction: Transaction | VersionedTransaction,
    caip2: SolanaCaip2ChainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' // mainnet
  ): Promise<string | null> {
    if (!this.client) {
      logger.error('Privy client not configured')
      throw new Error('Privy client not configured')
    }

    try {
      // Look up the Privy wallet ID from our database
      let walletId: string | undefined
      if (isPrismaConfigured()) {
        const wallet = await prisma.privyWallet.findUnique({
          where: { walletAddress },
          select: { privyWalletId: true },
        })
        walletId = wallet?.privyWalletId
      }

      // Validate wallet ID format - Privy IDs look like UUIDs, not Solana addresses
      // Solana addresses are base58 and typically 32-44 chars, Privy IDs are UUIDs
      const isValidPrivyWalletId = walletId &&
        (walletId.includes('-') || walletId.length < 30) && // UUIDs have dashes, addresses don't
        walletId !== walletAddress // Make sure it's not just the address stored as ID

      let hash: string
      if (isValidPrivyWalletId && walletId) {
        // Use walletId (preferred)
        const result = await this.client.walletApi.solana.signAndSendTransaction({
          walletId,
          chainType: 'solana',
          transaction,
          caip2,
        })
        hash = result.hash
      } else {
        // Fall back to address (deprecated but works)
        const result = await this.client.walletApi.solana.signAndSendTransaction({
          address: walletAddress,
          chainType: 'solana',
          transaction,
          caip2,
        })
        hash = result.hash
      }

      return hash
    } catch (error: any) {
      const errorMsg = String(error)

      // Detect specific error types for better handling
      const isBlockhashError = errorMsg.includes('Blockhash not found') ||
        errorMsg.includes('blockhash') ||
        errorMsg.includes('block height exceeded')
      const isSignatureError = errorMsg.includes('signature verification failure') ||
        errorMsg.includes('Transaction signature verification')
      const isBroadcastError = errorMsg.includes('transaction_broadcast_failure')

      if (isBlockhashError) {
        logger.warn({ error: errorMsg, walletAddress }, 'Privy transaction failed - blockhash expired (retry may help)')
        throw new Error(`BLOCKHASH_EXPIRED: ${errorMsg}`)
      } else if (isSignatureError) {
        logger.error({ error: errorMsg, walletAddress }, 'Privy transaction failed - signature verification failure')
        throw new Error(`SIGNATURE_VERIFICATION_FAILED: ${errorMsg}`)
      } else if (isBroadcastError) {
        logger.error({ error: errorMsg, walletAddress }, 'Privy transaction failed - broadcast failure')
        throw new Error(`BROADCAST_FAILED: ${errorMsg}`)
      } else {
        logger.error({ error: errorMsg, walletAddress }, 'Failed to sign and send Solana transaction')
        throw new Error(`PRIVY_SIGNING_FAILED: ${errorMsg}`)
      }
    }
  }

  /**
   * Sign a message (for verification purposes)
   */
  async signMessage(walletAddress: string, message: string): Promise<Uint8Array | null> {
    if (!this.client) {
      logger.error('Privy client not configured')
      return null
    }

    try {
      const result = await this.client.walletApi.solana.signMessage({
        address: walletAddress,
        chainType: 'solana',
        message,
      })

      return result.signature
    } catch (error) {
      logger.error({ error: String(error), walletAddress }, 'Failed to sign message')
      return null
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // USER ONBOARDING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create or update user in database after onboarding
   */
  async createOrUpdateUser(params: {
    privyUserId: string
    telegramId?: number
    telegramUsername?: string
    email?: string
    walletsDelegated?: boolean
  }) {
    if (!isPrismaConfigured()) {
      logger.error('Prisma not configured')
      return null
    }

    const { privyUserId, telegramId, telegramUsername, email, walletsDelegated } = params

    try {
      const user = await prisma.privyUser.upsert({
        where: { privyUserId },
        update: {
          telegramId: telegramId ? BigInt(telegramId) : undefined,
          telegramUsername,
          email,
          walletsDelegated,
        },
        create: {
          privyUserId,
          telegramId: telegramId ? BigInt(telegramId) : null,
          telegramUsername,
          email,
          walletsDelegated: walletsDelegated ?? false,
        },
      })

      logger.info({ privyUserId, telegramId }, 'Upserted Privy user')
      return user
    } catch (error) {
      logger.error({ error: String(error), privyUserId }, 'Failed to upsert user')
      return null
    }
  }

  /**
   * Store wallet records for a user
   */
  async storeUserWallets(params: {
    privyUserId: string
    devWalletAddress: string
    devWalletId: string
    opsWalletAddress: string
    opsWalletId: string
  }) {
    if (!isPrismaConfigured()) {
      logger.error('Prisma not configured')
      return false
    }

    const { privyUserId, devWalletAddress, devWalletId, opsWalletAddress, opsWalletId } = params

    try {
      await prisma.privyWallet.createMany({
        data: [
          {
            privyUserId,
            walletType: 'dev',
            walletAddress: devWalletAddress,
            privyWalletId: devWalletId,
          },
          {
            privyUserId,
            walletType: 'ops',
            walletAddress: opsWalletAddress,
            privyWalletId: opsWalletId,
          },
        ],
        skipDuplicates: true,
      })

      logger.info({ privyUserId, devWalletAddress, opsWalletAddress }, 'Stored user wallets')
      return true
    } catch (error) {
      logger.error({ error: String(error), privyUserId }, 'Failed to store user wallets')
      return false
    }
  }

  /**
   * Link Telegram ID to Privy user after TMA setup
   * Combined operation: creates user record + stores wallets
   */
  async linkTelegramToPrivy(params: LinkTelegramParams): Promise<boolean> {
    if (!isPrismaConfigured()) {
      logger.error('Prisma not configured')
      return false
    }

    const {
      privyUserId,
      telegramId,
      telegramUsername,
      devWalletAddress,
      devWalletId,
      opsWalletAddress,
      opsWalletId,
    } = params

    try {
      // Use transaction to ensure atomicity
      await prisma.$transaction(async (tx) => {
        // Upsert user
        await tx.privyUser.upsert({
          where: { privyUserId },
          update: {
            telegramId: BigInt(telegramId),
            telegramUsername,
            walletsDelegated: true,
          },
          create: {
            privyUserId,
            telegramId: BigInt(telegramId),
            telegramUsername,
            walletsDelegated: true,
          },
        })

        // Upsert wallets (using upsert to handle duplicates)
        await tx.privyWallet.upsert({
          where: {
            privyUserId_walletType: {
              privyUserId,
              walletType: 'dev',
            },
          },
          update: {
            walletAddress: devWalletAddress,
            privyWalletId: devWalletId,
          },
          create: {
            privyUserId,
            walletType: 'dev',
            walletAddress: devWalletAddress,
            privyWalletId: devWalletId,
            chainType: 'solana',
          },
        })

        await tx.privyWallet.upsert({
          where: {
            privyUserId_walletType: {
              privyUserId,
              walletType: 'ops',
            },
          },
          update: {
            walletAddress: opsWalletAddress,
            privyWalletId: opsWalletId,
          },
          create: {
            privyUserId,
            walletType: 'ops',
            walletAddress: opsWalletAddress,
            privyWalletId: opsWalletId,
            chainType: 'solana',
          },
        })
      })

      logger.info({ telegramId, privyUserId, devWalletAddress, opsWalletAddress }, 'Linked Telegram to Privy user')
      return true
    } catch (error) {
      logger.error({ error: String(error), privyUserId }, 'Failed to link Telegram to Privy')
      return false
    }
  }

  /**
   * Update user's delegation status
   */
  async updateDelegationStatus(privyUserId: string, isDelegated: boolean): Promise<boolean> {
    if (!isPrismaConfigured()) {
      logger.error('Prisma not configured')
      return false
    }

    try {
      await prisma.privyUser.update({
        where: { privyUserId },
        data: { walletsDelegated: isDelegated },
      })

      logger.info({ privyUserId, isDelegated }, 'Updated delegation status')
      return true
    } catch (error) {
      logger.error({ error: String(error), privyUserId }, 'Failed to update delegation status')
      return false
    }
  }

  /**
   * Get wallet address by Privy user ID and wallet type
   */
  async getWalletAddress(privyUserId: string, walletType: 'dev' | 'ops'): Promise<string | null> {
    const wallets = await this.getUserWallets(privyUserId)
    if (!wallets) return null

    const wallet = wallets.find((w) => w.walletType === walletType)
    return wallet?.walletAddress || null
  }
}

export const privyService = new PrivyService()
