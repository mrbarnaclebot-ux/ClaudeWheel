import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import bs58 from 'bs58'
import { env } from './env'

// ═══════════════════════════════════════════════════════════════════════════
// SOLANA CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

export const connection = new Connection(env.solanaRpcUrl, {
  commitment: 'confirmed',
  wsEndpoint: env.solanaWsUrl,
})

// ═══════════════════════════════════════════════════════════════════════════
// WALLET INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

export function getDevWallet(): Keypair | null {
  if (!env.devWalletPrivateKey) {
    console.warn('⚠️ Dev wallet private key not configured')
    return null
  }

  try {
    const secretKey = bs58.decode(env.devWalletPrivateKey)
    return Keypair.fromSecretKey(secretKey)
  } catch (error) {
    console.error('❌ Failed to load dev wallet:', error)
    return null
  }
}

export function getOpsWallet(): Keypair | null {
  if (!env.opsWalletPrivateKey) {
    console.warn('⚠️ Ops wallet private key not configured')
    return null
  }

  try {
    const secretKey = bs58.decode(env.opsWalletPrivateKey)
    return Keypair.fromSecretKey(secretKey)
  } catch (error) {
    console.error('❌ Failed to load ops wallet:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN MINT
// ═══════════════════════════════════════════════════════════════════════════

export function getTokenMint(): PublicKey | null {
  if (!env.tokenMintAddress ||
      env.tokenMintAddress === 'PLACEHOLDER_UPDATE_AFTER_TOKEN_LAUNCH' ||
      env.tokenMintAddress.length < 32) {
    return null
  }

  try {
    return new PublicKey(env.tokenMintAddress)
  } catch (error) {
    console.warn('⚠️ Invalid token mint address:', env.tokenMintAddress)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function getBalance(publicKey: PublicKey): Promise<number> {
  const balance = await connection.getBalance(publicKey)
  return balance / LAMPORTS_PER_SOL
}

export async function getTokenBalance(
  walletAddress: PublicKey,
  mintAddress: PublicKey
): Promise<number> {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletAddress,
      { mint: mintAddress }
    )

    if (tokenAccounts.value.length === 0) {
      return 0
    }

    const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount
    return balance || 0
  } catch (error) {
    console.error('Failed to get token balance:', error)
    return 0
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SOL PRICE (simplified - would use oracle in production)
// ═══════════════════════════════════════════════════════════════════════════

export async function getSolPrice(): Promise<number> {
  try {
    // In production, use Pyth, Switchboard, or a price API
    // For now, return a mock price
    return 227.50 // Mock SOL price in USD
  } catch (error) {
    console.error('Failed to get SOL price:', error)
    return 0
  }
}
