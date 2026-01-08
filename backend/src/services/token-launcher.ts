// ═══════════════════════════════════════════════════════════════════════════
// TOKEN LAUNCHER SERVICE
// Launches new tokens on Bags.fm using the official Bags SDK
// ═══════════════════════════════════════════════════════════════════════════

import { Keypair, PublicKey, Connection, VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { env } from '../config/env'
import { getConnection } from '../config/solana'
import { decrypt } from './encryption.service'

// Import Bags SDK
import { BagsSDK, signAndSendTransaction } from '@bagsfm/bags-sdk'

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
      console.log(`🚀 Launching token: ${params.tokenName} (${params.tokenSymbol})`)

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
      console.log('📝 Step 1: Creating token info and metadata...')
      const tokenInfoResponse = await this.sdk.tokenLaunch.createTokenInfoAndMetadata({
        imageUrl: params.tokenImageUrl,
        name: params.tokenName,
        description: params.tokenDescription,
        symbol: params.tokenSymbol.toUpperCase().replace('$', ''),
        twitter: params.twitterUrl,
        website: params.websiteUrl,
        telegram: params.telegramUrl,
      })

      console.log(`✨ Token info created! Mint: ${tokenInfoResponse.tokenMint}`)
      console.log(`📄 Metadata URI: ${tokenInfoResponse.tokenMetadata}`)

      const tokenMint = new PublicKey(tokenInfoResponse.tokenMint)

      // Step 2: Create fee share config
      // Creator must always be explicitly included with 10000 BPS (100%)
      console.log('⚙️ Step 2: Creating fee share config...')
      const feeClaimers = [
        {
          user: keypair.publicKey,
          userBps: 10000, // 100% of fees to creator
        },
      ]

      console.log(`💰 Fee sharing: 100% to creator (${keypair.publicKey.toString().slice(0, 8)}...)`)

      const configResult = await this.sdk.config.createBagsFeeShareConfig({
        payer: keypair.publicKey,
        baseMint: tokenMint,
        feeClaimers,
      })

      // Sign and send any config transactions
      if (configResult.transactions && configResult.transactions.length > 0) {
        console.log(`📝 Signing ${configResult.transactions.length} config transaction(s)...`)
        for (const tx of configResult.transactions) {
          await signAndSendTransaction(connection, commitment, tx, keypair)
        }
      }

      // Handle bundles if returned (for large fee claimer lists)
      if (configResult.bundles && configResult.bundles.length > 0) {
        console.log(`📦 Processing ${configResult.bundles.length} bundle(s)...`)
        for (const bundle of configResult.bundles) {
          for (const tx of bundle) {
            tx.sign([keypair])
            await connection.sendTransaction(tx, { maxRetries: 3 })
          }
        }
      }

      const configKey = configResult.meteoraConfigKey
      console.log(`🔑 Config key: ${configKey.toString().slice(0, 8)}...`)

      // Step 3: Create launch transaction
      console.log('🎯 Step 3: Creating launch transaction...')
      const launchTransaction = await this.sdk.tokenLaunch.createLaunchTransaction({
        metadataUrl: tokenInfoResponse.tokenMetadata,
        tokenMint: tokenMint,
        launchWallet: keypair.publicKey,
        initialBuyLamports: 0, // No initial buy, just launch
        configKey: configKey,
      })

      // Step 4 & 5: Sign and broadcast
      console.log('📡 Step 4 & 5: Signing and broadcasting transaction...')
      const signature = await signAndSendTransaction(
        connection,
        commitment,
        launchTransaction,
        keypair
      )

      console.log(`✅ Token launched successfully!`)
      console.log(`🪙 Token Mint: ${tokenInfoResponse.tokenMint}`)
      console.log(`🔑 Signature: ${signature}`)
      console.log(`🌐 View at: https://bags.fm/${tokenInfoResponse.tokenMint}`)

      return {
        success: true,
        tokenMint: tokenInfoResponse.tokenMint,
        transactionSignature: signature,
      }
    } catch (error: any) {
      console.error('🚨 Token launch failed:', error)
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
