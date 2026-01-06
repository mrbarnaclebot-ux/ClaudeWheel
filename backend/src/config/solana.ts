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
// SOL PRICE - Fetches real price with caching
// ═══════════════════════════════════════════════════════════════════════════

let cachedSolPrice: number = 200
let lastPriceFetch: Date | null = null
const PRICE_CACHE_MS = 60000 // Cache for 1 minute

export async function getSolPrice(): Promise<number> {
  // Return cached price if fresh
  if (lastPriceFetch && Date.now() - lastPriceFetch.getTime() < PRICE_CACHE_MS) {
    return cachedSolPrice
  }

  try {
    // Try CoinGecko first (free, no API key)
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { signal: AbortSignal.timeout(5000) }
    )

    if (response.ok) {
      const data = await response.json() as { solana?: { usd?: number } }
      if (data.solana?.usd) {
        cachedSolPrice = data.solana.usd
        lastPriceFetch = new Date()
        return cachedSolPrice
      }
    }

    // Fallback: Try Jupiter price API
    const jupResponse = await fetch(
      'https://price.jup.ag/v6/price?ids=SOL',
      { signal: AbortSignal.timeout(5000) }
    )

    if (jupResponse.ok) {
      const jupData = await jupResponse.json() as { data?: { SOL?: { price?: number } } }
      if (jupData.data?.SOL?.price) {
        cachedSolPrice = jupData.data.SOL.price
        lastPriceFetch = new Date()
        return cachedSolPrice
      }
    }

    // Return cached price if API calls fail
    return cachedSolPrice
  } catch (error) {
    console.warn('⚠️ Failed to fetch SOL price, using cached:', cachedSolPrice)
    return cachedSolPrice
  }
}
