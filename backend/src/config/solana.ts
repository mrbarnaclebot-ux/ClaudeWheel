import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { env } from './env'
import { loggers } from '../utils/logger'

// ═══════════════════════════════════════════════════════════════════════════
// SOLANA CONNECTION
// ═══════════════════════════════════════════════════════════════════════════

// Use Helius RPC when available (much faster than public RPC)
const getRpcUrl = (): string => {
  if (env.heliusApiKey) {
    return `https://mainnet.helius-rpc.com/?api-key=${env.heliusApiKey}`
  }
  return env.solanaRpcUrl
}

const rpcUrl = getRpcUrl()
loggers.solana.info({ rpcUrl: rpcUrl.includes('helius') ? 'Helius (fast)' : 'Public (slow)' }, 'Using RPC')

export const connection = new Connection(rpcUrl, {
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

// Wallet keypair functions removed - all wallets now use Privy delegated signing
// WHEEL platform token is registered in Prisma with tokenSource='platform'

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
    loggers.solana.warn({ tokenMintAddress: env.tokenMintAddress }, 'Invalid token mint address')
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const RPC_TIMEOUT_MS = 30000 // 30 second timeout for RPC calls

/**
 * Wraps a promise with a timeout
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  let timeoutId: NodeJS.Timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutId!)
    return result
  } catch (error) {
    clearTimeout(timeoutId!)
    throw error
  }
}

export async function getBalance(publicKey: PublicKey): Promise<number> {
  const balance = await withTimeout(
    connection.getBalance(publicKey),
    RPC_TIMEOUT_MS,
    'getBalance'
  )
  return balance / LAMPORTS_PER_SOL
}

export async function getTokenBalance(
  walletAddress: PublicKey,
  mintAddress: PublicKey
): Promise<number> {
  try {
    const tokenAccounts = await withTimeout(
      connection.getParsedTokenAccountsByOwner(
        walletAddress,
        { mint: mintAddress }
      ),
      RPC_TIMEOUT_MS,
      'getTokenBalance'
    )

    if (tokenAccounts.value.length === 0) {
      return 0
    }

    const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount
    return balance || 0
  } catch (error) {
    loggers.solana.error({ error: String(error) }, 'Failed to get token balance')
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
  loggers.solana.warn({ cachedPrice: cachedSolPrice }, 'All SOL price sources failed, using cached')
  return cachedSolPrice
}
