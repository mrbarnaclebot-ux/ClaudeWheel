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

/**
 * Get the Solana connection instance
 * (Helper for services that prefer a function call)
 */
export function getConnection(): Connection {
  return connection
}

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
// SOL PRICE - Fetches real price with caching and multiple fallbacks
// ═══════════════════════════════════════════════════════════════════════════

let cachedSolPrice: number = 200
let lastPriceFetch: Date | null = null
const PRICE_CACHE_MS = 5 * 60 * 1000 // Cache for 5 minutes to reduce API calls

export async function getSolPrice(): Promise<number> {
  // Return cached price if fresh
  if (lastPriceFetch && Date.now() - lastPriceFetch.getTime() < PRICE_CACHE_MS) {
    return cachedSolPrice
  }

  // Try multiple price sources in order of reliability
  const priceSources = [
    // Binance - most reliable, high rate limits
    async () => {
      const response = await fetch(
        'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
        { signal: AbortSignal.timeout(5000) }
      )
      if (response.ok) {
        const data = await response.json() as { price?: string }
        if (data.price) return parseFloat(data.price)
      }
      return null
    },
    // CoinGecko - free tier has rate limits
    async () => {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        { signal: AbortSignal.timeout(5000) }
      )
      if (response.ok) {
        const data = await response.json() as { solana?: { usd?: number } }
        if (data.solana?.usd) return data.solana.usd
      }
      return null
    },
    // Jupiter price API
    async () => {
      const response = await fetch(
        'https://price.jup.ag/v6/price?ids=SOL',
        { signal: AbortSignal.timeout(5000) }
      )
      if (response.ok) {
        const data = await response.json() as { data?: { SOL?: { price?: number } } }
        if (data.data?.SOL?.price) return data.data.SOL.price
      }
      return null
    },
  ]

  for (const getPrice of priceSources) {
    try {
      const price = await getPrice()
      if (price && price > 0) {
        cachedSolPrice = price
        lastPriceFetch = new Date()
        return cachedSolPrice
      }
    } catch {
      // Try next source
    }
  }

  // All sources failed - use cached price but don't update timestamp
  // so we retry on next call
  console.warn('⚠️ All SOL price sources failed, using cached:', cachedSolPrice)
  return cachedSolPrice
}
