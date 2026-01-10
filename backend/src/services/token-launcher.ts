// ═══════════════════════════════════════════════════════════════════════════
// TOKEN LAUNCHER SERVICE
// Launches new tokens on Bags.fm using the official Bags SDK
// ═══════════════════════════════════════════════════════════════════════════

import {
  Keypair,
  PublicKey,
  VersionedTransaction,
  Connection,
} from '@solana/web3.js'
import bs58 from 'bs58'
import { env } from '../config/env'
import { getConnection } from '../config/solana'
import { decrypt } from './encryption.service'
import { loggers } from '../utils/logger'
import { privyService } from './privy.service'

// Import Bags SDK
import { BagsSDK, signAndSendTransaction } from '@bagsfm/bags-sdk'

/**
 * Sign and send a VersionedTransaction using Privy delegated signing.
 *
 * IMPORTANT: Refreshes blockhash before sending to handle Privy API latency.
 * The Bags API returns transactions, but by the time Privy signs and broadcasts,
 * the original blockhash may have expired. We update the blockhash in-place
 * on the message object (safe because transaction is unsigned).
 */
async function signAndSendWithPrivy(
  connection: Connection,
  walletAddress: string,
  transaction: VersionedTransaction,
  description: string = 'transaction'
): Promise<string> {
  loggers.token.debug({ description }, `Signing ${description} with Privy`)

  // Get fresh blockhash to prevent expiry during Privy API latency
  // Using 'finalized' commitment for longer validity window
  const { blockhash } = await connection.getLatestBlockhash('finalized')

  // Update blockhash in-place on the message
  // This is safe because the transaction is unsigned (signatures array is empty)
  // We're modifying the existing message object, not creating a new one
  const message = transaction.message as any
  const oldBlockhash = message.recentBlockhash
  message.recentBlockhash = blockhash

  loggers.token.debug({
    description,
    oldBlockhash: oldBlockhash?.slice(0, 8) + '...',
    newBlockhash: blockhash.slice(0, 8) + '...'
  }, 'Updated blockhash')

  // Send to Privy for signing and broadcasting
  const signature = await privyService.signAndSendSolanaTransaction(walletAddress, transaction)

  if (!signature) {
    throw new Error(`Privy signing returned null for ${description}`)
  }

  loggers.token.debug({ signature, description }, `${description} signed and sent`)
  return signature
}

export interface LaunchTokenParams {
  tokenName: string
  tokenSymbol: string
  tokenDescription: string
  tokenImageUrl: string
  // Social links (optional)
  twitterUrl?: string
  telegramUrl?: string
  websiteUrl?: string
  discordUrl?: string
  // Wallet encryption
  devWalletAddress: string
  devWalletPrivateKeyEncrypted: string
  devEncryptionIv: string
  devEncryptionAuthTag: string
  opsWalletAddress: string
  opsWalletPrivateKeyEncrypted: string
  opsEncryptionIv: string
  opsEncryptionAuthTag: string
}

export interface LaunchResult {
  success: boolean
  tokenMint?: string
  transactionSignature?: string
  error?: string
}

// Simplified params for Privy launch (no encrypted keys needed)
export interface PrivyLaunchTokenParams {
  tokenName: string
  tokenSymbol: string
  tokenDescription: string
  tokenImageUrl: string
  twitterUrl?: string
  telegramUrl?: string
  websiteUrl?: string
  discordUrl?: string
  devWalletAddress: string  // Just the public address - signing is via Privy
  devBuySol?: number  // Optional initial buy amount in SOL
}

class TokenLauncherService {
  private apiKey: string | null = null
  private sdk: BagsSDK | null = null

  constructor() {
    this.apiKey = env.bagsFmApiKey || null
    this.initSdk()
  }

  /**
   * Initialize the Bags SDK
   */
  private initSdk(): void {
    if (this.apiKey) {
      const connection = getConnection()
      this.sdk = new BagsSDK(this.apiKey, connection, 'confirmed')
    }
  }

  /**
   * Set the Bags.fm API key
   */
  setApiKey(key: string): void {
    this.apiKey = key
    this.initSdk()
  }

  /**
   * Launch a new token on Bags.fm using the SDK
   * Following Token Launch v2 flow:
   * 1. Create metadata
   * 2. Create config (fee share configuration)
   * 3. Get token creation transaction
   * 4. Sign transaction
   * 5. Broadcast transaction
   */
  async launchToken(params: LaunchTokenParams): Promise<LaunchResult> {
    if (!this.apiKey || !this.sdk) {
      return {
        success: false,
        error: 'Bags.fm API key not configured (set BAGS_FM_API_KEY)',
      }
    }

    try {
      loggers.token.info({ tokenName: params.tokenName, tokenSymbol: params.tokenSymbol }, 'Launching token')

      // Decrypt the dev wallet private key
      const devPrivateKey = decrypt({
        ciphertext: params.devWalletPrivateKeyEncrypted,
        iv: params.devEncryptionIv,
        authTag: params.devEncryptionAuthTag,
      })

      const keypair = Keypair.fromSecretKey(bs58.decode(devPrivateKey))
      const connection = getConnection()
      const commitment = this.sdk.state.getCommitment()

      // Step 1: Create token info and metadata
      loggers.token.info('Creating token info and metadata')
      const tokenInfoResponse = await this.sdk.tokenLaunch.createTokenInfoAndMetadata({
        imageUrl: params.tokenImageUrl,
        name: params.tokenName,
        description: params.tokenDescription,
        symbol: params.tokenSymbol.toUpperCase().replace('$', ''),
        twitter: params.twitterUrl,
        website: params.websiteUrl,
        telegram: params.telegramUrl,
      })

      loggers.token.info({ tokenMint: tokenInfoResponse.tokenMint, metadataUri: tokenInfoResponse.tokenMetadata }, 'Token info created')

      const tokenMint = new PublicKey(tokenInfoResponse.tokenMint)

      // Step 2: Create fee share config
      // Creator must always be explicitly included with 10000 BPS (100%)
      loggers.token.info('Creating fee share config')
      const feeClaimers = [
        {
          user: keypair.publicKey,
          userBps: 10000, // 100% of fees to creator
        },
      ]

      loggers.token.debug({ creatorWallet: keypair.publicKey.toString() }, 'Fee sharing: 100% to creator')

      const configResult = await this.sdk.config.createBagsFeeShareConfig({
        payer: keypair.publicKey,
        baseMint: tokenMint,
        feeClaimers,
      })

      // Sign and send any config transactions
      if (configResult.transactions && configResult.transactions.length > 0) {
        loggers.token.debug({ transactionCount: configResult.transactions.length }, 'Signing config transactions')
        for (const tx of configResult.transactions) {
          await signAndSendTransaction(connection, commitment, tx, keypair)
        }
      }

      // Handle bundles if returned (for large fee claimer lists)
      if (configResult.bundles && configResult.bundles.length > 0) {
        loggers.token.debug({ bundleCount: configResult.bundles.length }, 'Processing bundles')
        for (const bundle of configResult.bundles) {
          for (const tx of bundle) {
            tx.sign([keypair])
            await connection.sendTransaction(tx, { maxRetries: 3 })
          }
        }
      }

      const configKey = configResult.meteoraConfigKey
      loggers.token.debug({ configKey: configKey.toString() }, 'Config key generated')

      // Step 3: Create launch transaction
      loggers.token.info('Creating launch transaction')
      const launchTransaction = await this.sdk.tokenLaunch.createLaunchTransaction({
        metadataUrl: tokenInfoResponse.tokenMetadata,
        tokenMint: tokenMint,
        launchWallet: keypair.publicKey,
        initialBuyLamports: 0, // No initial buy, just launch
        configKey: configKey,
      })

      // Step 4 & 5: Sign and broadcast
      loggers.token.info('Signing and broadcasting transaction')
      const signature = await signAndSendTransaction(
        connection,
        commitment,
        launchTransaction,
        keypair
      )

      loggers.token.info({ tokenMint: tokenInfoResponse.tokenMint, signature, url: `https://bags.fm/${tokenInfoResponse.tokenMint}` }, 'Token launched successfully')

      return {
        success: true,
        tokenMint: tokenInfoResponse.tokenMint,
        transactionSignature: signature,
      }
    } catch (error: any) {
      loggers.token.error({ error: String(error) }, 'Token launch failed')
      return {
        success: false,
        error: error.message || 'Unknown error during token launch',
      }
    }
  }

  /**
   * Launch a new token on Bags.fm using Privy delegated signing
   * Same flow as launchToken but uses Privy API for transaction signing.
   *
   * IMPORTANT: This follows the same pattern as the Bags SDK's signAndSendTransaction -
   * we do NOT modify the transaction's blockhash. The Bags API returns transactions
   * with fresh blockhashes that should be valid for the signing operation.
   */
  async launchTokenWithPrivySigning(params: PrivyLaunchTokenParams): Promise<LaunchResult> {
    if (!this.apiKey || !this.sdk) {
      return {
        success: false,
        error: 'Bags.fm API key not configured (set BAGS_FM_API_KEY)',
      }
    }

    try {
      loggers.token.info({ tokenName: params.tokenName, tokenSymbol: params.tokenSymbol }, 'Launching token with Privy signing')

      const devWalletPubkey = new PublicKey(params.devWalletAddress)
      const connection = getConnection()
      const commitment = this.sdk.state.getCommitment()

      // Step 1: Create token info and metadata
      loggers.token.info('Creating token info and metadata')
      const tokenInfoResponse = await this.sdk.tokenLaunch.createTokenInfoAndMetadata({
        imageUrl: params.tokenImageUrl,
        name: params.tokenName,
        description: params.tokenDescription,
        symbol: params.tokenSymbol.toUpperCase().replace('$', ''),
        twitter: params.twitterUrl,
        website: params.websiteUrl,
        telegram: params.telegramUrl,
      })

      loggers.token.info({ tokenMint: tokenInfoResponse.tokenMint, metadataUri: tokenInfoResponse.tokenMetadata }, 'Token info created')

      const tokenMint = new PublicKey(tokenInfoResponse.tokenMint)

      // Step 2: Create fee share config
      loggers.token.info('Creating fee share config')
      const feeClaimers = [
        {
          user: devWalletPubkey,
          userBps: 10000, // 100% of fees to creator
        },
      ]

      loggers.token.debug({ creatorWallet: params.devWalletAddress }, 'Fee sharing: 100% to creator')

      const configResult = await this.sdk.config.createBagsFeeShareConfig({
        payer: devWalletPubkey,
        baseMint: tokenMint,
        feeClaimers,
      })

      // Sign and send config transactions using Privy
      // Refresh blockhash before each to handle Privy API latency
      if (configResult.transactions && configResult.transactions.length > 0) {
        loggers.token.debug({ transactionCount: configResult.transactions.length }, 'Signing config transactions with Privy')
        for (let i = 0; i < configResult.transactions.length; i++) {
          const tx = configResult.transactions[i]
          const signature = await signAndSendWithPrivy(
            connection,
            params.devWalletAddress,
            tx,
            `config transaction ${i + 1}/${configResult.transactions.length}`
          )
          // Wait for confirmation
          await connection.confirmTransaction(signature, commitment)
        }
      }

      // Handle bundles if returned
      if (configResult.bundles && configResult.bundles.length > 0) {
        loggers.token.debug({ bundleCount: configResult.bundles.length }, 'Processing bundles with Privy')
        for (let i = 0; i < configResult.bundles.length; i++) {
          const bundle = configResult.bundles[i]
          for (let j = 0; j < bundle.length; j++) {
            const tx = bundle[j]
            const signature = await signAndSendWithPrivy(
              connection,
              params.devWalletAddress,
              tx,
              `bundle ${i + 1} transaction ${j + 1}`
            )
            await connection.confirmTransaction(signature, commitment)
          }
        }
      }

      const configKey = configResult.meteoraConfigKey
      loggers.token.debug({ configKey: configKey.toString() }, 'Config key generated')

      // Step 3: Create launch transaction
      // Convert devBuySol to lamports (1 SOL = 1_000_000_000 lamports)
      const initialBuyLamports = params.devBuySol ? Math.floor(params.devBuySol * 1_000_000_000) : 0
      loggers.token.info({ initialBuyLamports, devBuySol: params.devBuySol || 0 }, 'Creating launch transaction')
      const launchTransaction = await this.sdk.tokenLaunch.createLaunchTransaction({
        metadataUrl: tokenInfoResponse.tokenMetadata,
        tokenMint: tokenMint,
        launchWallet: devWalletPubkey,
        initialBuyLamports,
        configKey: configKey,
      })

      // Step 4 & 5: Sign and broadcast using Privy
      // Refresh blockhash to handle Privy API latency
      loggers.token.info('Signing and broadcasting launch transaction with Privy')
      const signature = await signAndSendWithPrivy(
        connection,
        params.devWalletAddress,
        launchTransaction,
        'launch transaction'
      )

      // Confirm the transaction
      await connection.confirmTransaction(signature, commitment)

      loggers.token.info({ tokenMint: tokenInfoResponse.tokenMint, signature, url: `https://bags.fm/${tokenInfoResponse.tokenMint}` }, 'Token launched successfully with Privy signing')

      return {
        success: true,
        tokenMint: tokenInfoResponse.tokenMint,
        transactionSignature: signature,
      }
    } catch (error: any) {
      loggers.token.error({ error: String(error) }, 'Token launch with Privy signing failed')
      return {
        success: false,
        error: error.message || 'Unknown error during token launch',
      }
    }
  }

  /**
   * Check if Bags.fm API is configured and accessible
   */
  async checkApiHealth(): Promise<boolean> {
    if (!this.apiKey) {
      return false
    }

    try {
      const response = await fetch('https://public-api-v2.bags.fm/api/v1/health', {
        headers: {
          'x-api-key': this.apiKey,
        },
      })
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Get token info from Bags.fm
   */
  async getTokenInfo(tokenMint: string): Promise<any | null> {
    try {
      const response = await fetch(
        `https://public-api-v2.bags.fm/api/v1/token-launch/creator/v3?tokenMint=${tokenMint}`,
        {
          headers: this.apiKey ? { 'x-api-key': this.apiKey } : {},
        }
      )

      if (!response.ok) {
        return null
      }

      const data = await response.json() as any
      return data.response || data.data || data
    } catch {
      return null
    }
  }
}

// Export singleton instance
export const tokenLauncherService = new TokenLauncherService()
