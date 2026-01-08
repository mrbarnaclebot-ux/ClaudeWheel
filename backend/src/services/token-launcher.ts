// ═══════════════════════════════════════════════════════════════════════════
// TOKEN LAUNCHER SERVICE
// Launches new tokens on Bags.fm using their API
// ═══════════════════════════════════════════════════════════════════════════

import { Keypair, Transaction, Connection, sendAndConfirmTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { env } from '../config/env'
import { getConnection } from '../config/solana'
import { decrypt } from './encryption.service'

// Bags.fm API base URL
const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1'

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

  constructor() {
    this.apiKey = env.bagsFmApiKey || null
  }

  /**
   * Set the Bags.fm API key
   */
  setApiKey(key: string): void {
    this.apiKey = key
  }

  /**
   * Launch a new token on Bags.fm
   */
  async launchToken(params: LaunchTokenParams): Promise<LaunchResult> {
    if (!this.apiKey) {
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

      const devKeypair = Keypair.fromSecretKey(bs58.decode(devPrivateKey))

      // Step 1: Create token info and get mint address
      const tokenInfoResult = await this.createTokenInfo({
        name: params.tokenName,
        symbol: params.tokenSymbol,
        description: params.tokenDescription,
        imageUrl: params.tokenImageUrl,
        creatorWallet: params.devWalletAddress,
        twitterUrl: params.twitterUrl,
        telegramUrl: params.telegramUrl,
        websiteUrl: params.websiteUrl,
        discordUrl: params.discordUrl,
      })

      if (!tokenInfoResult.success || !tokenInfoResult.tokenMint) {
        return {
          success: false,
          error: tokenInfoResult.error || 'Failed to create token info',
        }
      }

      console.log(`📝 Token info created, mint: ${tokenInfoResult.tokenMint}`)

      // Step 2: Configure fee sharing (required for Token Launch v2)
      const feeShareResult = await this.configureFeeSharing({
        tokenMint: tokenInfoResult.tokenMint,
        creatorWallet: params.devWalletAddress,
        creatorBps: 10000, // 100% to creator (10000 bps = 100%)
      })

      if (!feeShareResult.success) {
        console.warn(`⚠️ Fee sharing configuration failed: ${feeShareResult.error}`)
        // Continue anyway - some launches may work without explicit fee config
      } else {
        console.log(`💰 Fee sharing configured: 100% to creator`)
      }

      // Step 3: Create launch transaction
      const launchTxResult = await this.createLaunchTransaction({
        tokenMint: tokenInfoResult.tokenMint,
        creatorWallet: params.devWalletAddress,
      })

      if (!launchTxResult.success || !launchTxResult.transaction) {
        return {
          success: false,
          error: launchTxResult.error || 'Failed to create launch transaction',
        }
      }

      console.log(`📄 Launch transaction created`)

      // Step 4: Sign and submit the transaction
      const connection = getConnection()
      const signature = await this.signAndSubmitTransaction(
        connection,
        devKeypair,
        launchTxResult.transaction
      )

      if (!signature) {
        return {
          success: false,
          error: 'Failed to sign and submit transaction',
        }
      }

      console.log(`✅ Token launched successfully: ${tokenInfoResult.tokenMint}`)
      console.log(`   Transaction: ${signature}`)

      return {
        success: true,
        tokenMint: tokenInfoResult.tokenMint,
        transactionSignature: signature,
      }
    } catch (error: any) {
      console.error('Error launching token:', error)
      return {
        success: false,
        error: error.message || 'Unknown error during token launch',
      }
    }
  }

  /**
   * Create token info on Bags.fm
   * Note: This endpoint requires multipart/form-data, NOT application/json
   */
  private async createTokenInfo(params: {
    name: string
    symbol: string
    description: string
    imageUrl: string
    creatorWallet: string
    twitterUrl?: string
    telegramUrl?: string
    websiteUrl?: string
    discordUrl?: string
  }): Promise<{ success: boolean; tokenMint?: string; error?: string }> {
    try {
      // Build FormData - Bags.fm API requires multipart/form-data
      const formData = new FormData()
      formData.append('name', params.name)
      formData.append('symbol', params.symbol)
      formData.append('description', params.description)
      formData.append('imageUrl', params.imageUrl)

      // Add social links if provided
      if (params.twitterUrl) formData.append('twitter', params.twitterUrl)
      if (params.telegramUrl) formData.append('telegram', params.telegramUrl)
      if (params.websiteUrl) formData.append('website', params.websiteUrl)
      if (params.discordUrl) formData.append('discord', params.discordUrl)

      console.log('📤 Creating token info with FormData:', {
        name: params.name,
        symbol: params.symbol,
        description: params.description,
        imageUrl: params.imageUrl,
        twitter: params.twitterUrl || 'N/A',
        telegram: params.telegramUrl || 'N/A',
        website: params.websiteUrl || 'N/A',
        discord: params.discordUrl || 'N/A',
      })

      // Note: Do NOT set Content-Type header - let fetch set it automatically for FormData
      // This ensures the correct boundary is included in the multipart/form-data header
      const response = await fetch(`${BAGS_API_BASE}/token-launch/create-token-info`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey!,
        },
        body: formData,
      })

      const data = await response.json() as any

      // Log the full response to debug token mint extraction
      console.log('📥 Token info API response:', JSON.stringify(data, null, 2))

      if (!response.ok) {
        return {
          success: false,
          error: data.error || data.message || `API error: ${response.status}`,
        }
      }

      // Handle different response formats - check both camelCase and snake_case
      const tokenMint = data.response?.tokenMint || data.response?.token_mint ||
                        data.data?.tokenMint || data.data?.token_mint ||
                        data.tokenMint || data.token_mint ||
                        data.response?.mint || data.data?.mint || data.mint ||
                        data.response?.mintAddress || data.data?.mintAddress || data.mintAddress

      if (!tokenMint) {
        console.error('❌ Could not find token mint in response. Available keys:', {
          topLevel: Object.keys(data),
          response: data.response ? Object.keys(data.response) : 'N/A',
          data: data.data ? Object.keys(data.data) : 'N/A',
        })
        return {
          success: false,
          error: `No token mint in response. Response keys: ${Object.keys(data).join(', ')}`,
        }
      }

      return {
        success: true,
        tokenMint,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create token info',
      }
    }
  }

  /**
   * Configure fee sharing for a token (required for Token Launch v2)
   */
  private async configureFeeSharing(params: {
    tokenMint: string
    creatorWallet: string
    creatorBps: number // Basis points (10000 = 100%)
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${BAGS_API_BASE}/token-launch/fee-share/create-config`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenMint: params.tokenMint,
          userBps: params.creatorBps,
        }),
      })

      const data = await response.json() as any

      if (!response.ok) {
        return {
          success: false,
          error: data.error || data.message || `API error: ${response.status}`,
        }
      }

      return { success: true }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to configure fee sharing',
      }
    }
  }

  /**
   * Create launch transaction on Bags.fm
   */
  private async createLaunchTransaction(params: {
    tokenMint: string
    creatorWallet: string
  }): Promise<{ success: boolean; transaction?: string; error?: string }> {
    try {
      const response = await fetch(`${BAGS_API_BASE}/token-launch/create-launch-transaction`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenMint: params.tokenMint,
          creatorWallet: params.creatorWallet,
        }),
      })

      const data = await response.json() as any
      console.log('📤 Launch transaction response:', JSON.stringify(data, null, 2).slice(0, 500))

      if (!response.ok) {
        return {
          success: false,
          error: data.error || data.message || `API error: ${response.status}`,
        }
      }

      // Handle different response formats
      const transaction = data.response?.transaction || data.data?.transaction || data.transaction

      if (!transaction) {
        return {
          success: false,
          error: 'No transaction in response',
        }
      }

      return {
        success: true,
        transaction,
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create launch transaction',
      }
    }
  }

  /**
   * Sign and submit a transaction to Solana
   */
  private async signAndSubmitTransaction(
    connection: Connection,
    signer: Keypair,
    transactionBase64: string
  ): Promise<string | null> {
    try {
      // Decode the transaction
      const transactionBuffer = Buffer.from(transactionBase64, 'base64')
      const transaction = Transaction.from(transactionBuffer)

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = signer.publicKey

      // Sign the transaction
      transaction.sign(signer)

      // Send and confirm
      const signature = await sendAndConfirmTransaction(connection, transaction, [signer], {
        commitment: 'confirmed',
        maxRetries: 3,
      })

      return signature
    } catch (error: any) {
      console.error('Error signing/submitting transaction:', error)

      // Try with versioned transaction if regular fails
      try {
        const { VersionedTransaction } = await import('@solana/web3.js')
        const transactionBuffer = Buffer.from(transactionBase64, 'base64')
        const versionedTx = VersionedTransaction.deserialize(transactionBuffer)

        versionedTx.sign([signer])

        const signature = await connection.sendTransaction(versionedTx, {
          maxRetries: 3,
        })

        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(signature, 'confirmed')

        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
        }

        return signature
      } catch (versionedError) {
        console.error('Error with versioned transaction:', versionedError)
        return null
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
      const response = await fetch(`${BAGS_API_BASE}/health`, {
        headers: {
          'x-api-key': this.apiKey!,
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
        `${BAGS_API_BASE}/token-launch/creator/v3?tokenMint=${tokenMint}`,
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
