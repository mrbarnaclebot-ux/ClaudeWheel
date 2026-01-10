// ═══════════════════════════════════════════════════════════════════════════
// BAGS.FM API SERVICE
// Integration with Bags.fm token launchpad for fee tracking and claiming
// Uses official Bags SDK for trading operations
// ═══════════════════════════════════════════════════════════════════════════

import { PublicKey, VersionedTransaction, Transaction } from '@solana/web3.js'
import { BagsSDK } from '@bagsfm/bags-sdk'
import bs58 from 'bs58'
import { getConnection } from '../config/solana'
import { loggers } from '../utils/logger'

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TokenLifetimeFees {
  tokenMint: string
  totalFeesCollected: number
  totalFeesCollectedUsd: number
  creatorFeesCollected: number
  creatorFeesCollectedUsd: number
  lastUpdated: string
}

export interface TokenCreatorInfo {
  tokenMint: string
  creatorWallet: string
  tokenName: string
  tokenSymbol: string
  tokenImage: string
  bondingCurveProgress: number
  isGraduated: boolean
  marketCap: number
  volume24h: number
  holders: number
  createdAt: string
}

export interface ClaimablePosition {
  tokenMint: string
  tokenSymbol: string
  claimableAmount: number
  claimableAmountUsd: number
  lastClaimTime: string | null
  _rawPosition?: unknown // SDK raw position for claim tx generation
}

export interface ClaimStats {
  totalClaimed: number
  totalClaimedUsd: number
  pendingClaims: number
  pendingClaimsUsd: number
  lastClaimTime: string | null
}

// Raw quote response structure from Bags.fm API
export interface RawQuoteResponse {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  priceImpactPct?: string
  platformFee?: {
    amount?: string
    feeBps?: number
  }
  routePlan?: unknown[]
  contextSlot?: number
  timeTaken?: number
}

export interface TradeQuote {
  // Raw quote response - needed for swap execution
  rawQuoteResponse: RawQuoteResponse
  // Parsed fields for convenience
  inputMint: string
  outputMint: string
  inputAmount: number
  outputAmount: number
  priceImpact: number
  fee: number
}

export interface SwapTransaction {
  transaction: string // Base58 encoded serialized transaction
  lastValidBlockHeight: number
}

// ═══════════════════════════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════════════════════════

class BagsFmService {
  private apiKey: string | null = null
  private sdk: BagsSDK | null = null

  setApiKey(key: string) {
    this.apiKey = key
    this.initSdk()
  }

  private initSdk(): void {
    if (this.apiKey) {
      try {
        const connection = getConnection()
        this.sdk = new BagsSDK(this.apiKey, connection, 'confirmed')
        loggers.bags.info('Bags SDK initialized successfully')
      } catch (error) {
        loggers.bags.error({ error: String(error) }, 'Failed to initialize Bags SDK')
      }
    }
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
        ...(options.headers as Record<string, string> || {}),
      }

      const url = `${BAGS_API_BASE}${endpoint}`
      loggers.bags.debug({
        method: options.method || 'GET',
        endpoint,
        hasApiKey: !!this.apiKey,
        url,
      }, 'Bags.fm API request')

      const response = await fetch(url, {
        ...options,
        headers,
      })

      const responseText = await response.text()

      if (!response.ok) {
        loggers.bags.error({ status: response.status, statusText: response.statusText, responseBody: responseText.slice(0, 500) }, 'Bags.fm API error')
        return null
      }

      // Try to parse JSON
      let data: any
      try {
        data = JSON.parse(responseText)
      } catch {
        loggers.bags.error({ responseText: responseText.slice(0, 200) }, 'Bags.fm API: Invalid JSON response')
        return null
      }

      // Handle different response formats - some endpoints return data directly
      if (data.success === false) {
        loggers.bags.error({ error: data.error || data.message || 'Unknown error' }, 'Bags.fm API error')
        return null
      }

      // Return response field if exists, otherwise return data directly
      const result = data.response ?? data.data ?? data
      loggers.bags.debug({ endpoint, responseDataPreview: JSON.stringify(result).slice(0, 200) }, 'Bags.fm API response received')
      return result as T
    } catch (error) {
      loggers.bags.error({ error: String(error) }, 'Bags.fm API request failed')
      return null
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get lifetime fees collected for a token
   */
  async getLifetimeFees(tokenMint: string): Promise<TokenLifetimeFees | null> {
    const data = await this.fetch<any>(`/token-launch/lifetime-fees?tokenMint=${tokenMint}`)

    if (!data) return null

    return {
      tokenMint,
      totalFeesCollected: data.totalFeesCollected || 0,
      totalFeesCollectedUsd: data.totalFeesCollectedUsd || 0,
      creatorFeesCollected: data.creatorFeesCollected || 0,
      creatorFeesCollectedUsd: data.creatorFeesCollectedUsd || 0,
      lastUpdated: new Date().toISOString(),
    }
  }

  /**
   * Get token info from Bags.fm
   * Tries multiple endpoints and combines with DexScreener data
   */
  async getTokenCreatorInfo(tokenMint: string): Promise<TokenCreatorInfo | null> {
    // Try the creator endpoint for basic info
    const creatorData = await this.fetch<any>(`/token-launch/creator/v3?tokenMint=${tokenMint}`)

    let tokenInfo: TokenCreatorInfo = {
      tokenMint,
      creatorWallet: '',
      tokenName: '',
      tokenSymbol: '',
      tokenImage: '',
      bondingCurveProgress: 0,
      isGraduated: false,
      marketCap: 0,
      volume24h: 0,
      holders: 0,
      createdAt: '',
    }

    // Extract creator info if available
    if (creatorData && Array.isArray(creatorData) && creatorData.length > 0) {
      const creator = creatorData.find((c: any) => c.isCreator) || creatorData[0]
      tokenInfo.creatorWallet = creator.wallet || ''
      tokenInfo.tokenName = creator.username || ''
      tokenInfo.tokenImage = creator.pfp || ''
      tokenInfo.isGraduated = false // On bonding curve if we have creator data
    }

    // Try to get additional data from DexScreener
    try {
      const dexData = await this.fetchDexScreenerData(tokenMint)
      if (dexData) {
        tokenInfo.marketCap = dexData.marketCap
        tokenInfo.volume24h = dexData.volume24h
        tokenInfo.tokenName = dexData.tokenName || tokenInfo.tokenName
        tokenInfo.tokenSymbol = dexData.tokenSymbol || tokenInfo.tokenSymbol
        tokenInfo.tokenImage = dexData.tokenImage || tokenInfo.tokenImage
        // Set graduated status from DexScreener (checks if on Raydium vs bonding curve)
        tokenInfo.isGraduated = dexData.isGraduated
        // Estimate bonding curve progress from market cap (bonding curves typically graduate at ~$69k)
        // Progress is stored as decimal 0-1 for frontend compatibility
        // If graduated, show 100% complete
        if (dexData.isGraduated) {
          tokenInfo.bondingCurveProgress = 1
        } else if (dexData.marketCap > 0) {
          tokenInfo.bondingCurveProgress = Math.min(1, dexData.marketCap / 69000)
        }
      }
    } catch (error) {
      loggers.bags.warn({ error: String(error) }, 'Could not fetch DexScreener data')
    }

    // Try to get holder count from Solana FM or Helius (free tier)
    try {
      const holders = await this.fetchHolderCount(tokenMint)
      if (holders > 0) {
        tokenInfo.holders = holders
      }
    } catch (error) {
      loggers.bags.warn({ error: String(error) }, 'Could not fetch holder count')
    }

    return tokenInfo
  }

  /**
   * Fetch token data from DexScreener
   */
  private async fetchDexScreenerData(tokenMint: string): Promise<{
    marketCap: number
    volume24h: number
    tokenName: string
    tokenSymbol: string
    tokenImage: string
    isGraduated: boolean
  } | null> {
    try {
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
        { signal: AbortSignal.timeout(5000) }
      )

      if (!response.ok) return null

      const data = await response.json() as { pairs?: any[] }

      if (!data.pairs || data.pairs.length === 0) return null

      // Get the pair with highest liquidity
      const bestPair = data.pairs.reduce((best: any, pair: any) => {
        return (pair.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? pair : best
      }, data.pairs[0])

      // Check if token has graduated (moved to Raydium or other DEX from bonding curve)
      // Graduated tokens are on raydium, orca, meteora, etc. instead of bonding curve
      const bondingCurveDexes = ['pump', 'bags', 'moonshot', 'bonding']
      const dexId = (bestPair.dexId || '').toLowerCase()
      const isGraduated = !bondingCurveDexes.some(bc => dexId.includes(bc))

      return {
        marketCap: bestPair.marketCap || bestPair.fdv || 0,
        volume24h: bestPair.volume?.h24 || 0,
        tokenName: bestPair.baseToken?.name || '',
        tokenSymbol: bestPair.baseToken?.symbol || '',
        tokenImage: bestPair.info?.imageUrl || '',
        isGraduated,
      }
    } catch (error) {
      return null
    }
  }

  /**
   * Fetch holder count for a token
   * Tries multiple APIs with fallbacks
   */
  private async fetchHolderCount(tokenMint: string): Promise<number> {
    // Try Birdeye API first (public endpoint for basic data)
    try {
      const response = await fetch(
        `https://public-api.birdeye.so/defi/token_overview?address=${tokenMint}`,
        {
          headers: { 'x-chain': 'solana' },
          signal: AbortSignal.timeout(5000),
        }
      )

      if (response.ok) {
        const data = await response.json() as { data?: { holder?: number } }
        if (data.data?.holder && data.data.holder > 0) {
          return data.data.holder
        }
      }
    } catch {
      // Fall through to other methods
    }

    // Try Solscan API (public endpoint)
    try {
      const response = await fetch(
        `https://api.solscan.io/token/holders?token=${tokenMint}&offset=0&size=1`,
        {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000),
        }
      )

      if (response.ok) {
        const data = await response.json() as { data?: { total?: number } }
        if (data.data?.total && data.data.total > 0) {
          return data.data.total
        }
      }
    } catch {
      // Fall through
    }

    // Try Helius API if configured (free tier: 10 req/sec)
    const heliusKey = process.env.HELIUS_API_KEY
    if (heliusKey) {
      try {
        const response = await fetch(
          `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'holders',
              method: 'getTokenLargestAccounts',
              params: [tokenMint],
            }),
            signal: AbortSignal.timeout(5000),
          }
        )

        if (response.ok) {
          const data = await response.json() as { result?: { value?: any[] } }
          // This returns largest accounts, use count as rough estimate
          if (data.result?.value?.length) {
            return data.result.value.length
          }
        }
      } catch {
        // Fall through
      }
    }

    // Try SolanaFM API (public endpoint)
    try {
      const response = await fetch(
        `https://api.solana.fm/v1/tokens/${tokenMint}/holders?page=1&pageSize=1`,
        { signal: AbortSignal.timeout(5000) }
      )

      if (response.ok) {
        const data = await response.json() as { pagination?: { total?: number } }
        if (data.pagination?.total && data.pagination.total > 0) {
          return data.pagination.total
        }
      }
    } catch {
      // Ignore error
    }

    return 0
  }

  /**
   * Get claimable fee positions for a wallet
   * Uses SDK if available, falls back to REST API
   */
  async getClaimablePositions(walletAddress: string): Promise<ClaimablePosition[]> {
    // Try SDK first (preferred method)
    if (this.sdk) {
      try {
        const positions = await this.sdk.fee.getAllClaimablePositions(
          new PublicKey(walletAddress)
        )

        loggers.bags.info({
          wallet: walletAddress,
          positionsCount: positions.length,
          positions: positions.map(p => ({
            baseMint: p.baseMint,
            claimableLamports: p.totalClaimableLamportsUserShare,
            claimableSOL: p.totalClaimableLamportsUserShare / 1e9,
          })),
        }, 'SDK claimable positions fetched')

        return positions.map(p => ({
          tokenMint: p.baseMint || '',
          tokenSymbol: '', // SDK doesn't return symbol
          claimableAmount: p.totalClaimableLamportsUserShare / 1e9, // Convert lamports to SOL
          claimableAmountUsd: 0, // SDK doesn't return USD value
          lastClaimTime: null,
          // Store raw position for claim transaction generation
          _rawPosition: p,
        })) as ClaimablePosition[]
      } catch (error) {
        loggers.bags.error({ error: String(error) }, 'SDK getAllClaimablePositions failed, falling back to REST API')
      }
    }

    // Fallback to REST API
    const data = await this.fetch<any[]>(`/token-launch/claimable-positions?wallet=${walletAddress}`)

    if (!data || !Array.isArray(data)) return []

    return data.map(item => ({
      tokenMint: item.tokenMint || '',
      tokenSymbol: item.tokenSymbol || '',
      claimableAmount: item.claimableAmount || 0,
      claimableAmountUsd: item.claimableAmountUsd || 0,
      lastClaimTime: item.lastClaimTime || null,
    }))
  }

  /**
   * Get claim statistics for a wallet
   */
  async getClaimStats(walletAddress: string): Promise<ClaimStats | null> {
    const data = await this.fetch<any>(`/token-launch/claim-stats?wallet=${walletAddress}`)

    if (!data) return null

    return {
      totalClaimed: data.totalClaimed || 0,
      totalClaimedUsd: data.totalClaimedUsd || 0,
      pendingClaims: data.pendingClaims || 0,
      pendingClaimsUsd: data.pendingClaimsUsd || 0,
      lastClaimTime: data.lastClaimTime || null,
    }
  }

  /**
   * Get a trade quote using the official Bags SDK
   * Note: side is determined by inputMint/outputMint (SOL→token = buy, token→SOL = sell)
   */
  async getTradeQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    _side?: 'buy' | 'sell', // Kept for API compatibility but not sent to Bags.fm
    slippageBps: number = 300 // Default 3% slippage for bonding curve trades
  ): Promise<TradeQuote | null> {
    // Validate amount - must be positive integer (lamports/smallest units)
    if (!amount || amount <= 0 || !Number.isFinite(amount)) {
      loggers.bags.error({ amount }, 'Invalid amount for trade quote - must be positive number')
      return null
    }

    // Ensure amount is an integer (lamports)
    const amountInt = Math.floor(amount)
    if (amountInt < 1000) {
      loggers.bags.error({ amount, amountInt }, 'Amount too small for trade quote - minimum ~1000 lamports')
      return null
    }

    loggers.bags.info({
      inputMint,
      outputMint,
      amount: amountInt,
      slippageBps,
      side: _side,
      usingSdk: !!this.sdk,
    }, 'Requesting trade quote from Bags.fm')

    // Use SDK if available (preferred method)
    if (this.sdk) {
      try {
        const quoteResponse = await this.sdk.trade.getQuote({
          inputMint: new PublicKey(inputMint),
          outputMint: new PublicKey(outputMint),
          amount: amountInt,
          slippageMode: 'manual',
          slippageBps,
        })

        loggers.bags.info({
          inAmount: quoteResponse.inAmount,
          outAmount: quoteResponse.outAmount,
          priceImpactPct: quoteResponse.priceImpactPct,
        }, 'SDK quote received')

        return {
          rawQuoteResponse: quoteResponse as unknown as RawQuoteResponse,
          inputMint: quoteResponse.inputMint,
          outputMint: quoteResponse.outputMint,
          inputAmount: parseInt(quoteResponse.inAmount) || amountInt,
          outputAmount: parseInt(quoteResponse.outAmount) || 0,
          priceImpact: parseFloat(quoteResponse.priceImpactPct) || 0,
          fee: quoteResponse.platformFee?.amount ? parseInt(quoteResponse.platformFee.amount) : 0,
        }
      } catch (error: any) {
        loggers.bags.error({ error: String(error), errorMessage: error.message }, 'SDK quote failed')
        // Fall through to REST API fallback
      }
    }

    // Fallback to REST API
    loggers.bags.warn('Falling back to REST API for quote')
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amountInt.toString(),
      slippageMode: 'manual',
      slippageBps: slippageBps.toString(),
    })

    const data = await this.fetch<any>(`/trade/quote?${params}`)

    if (!data) return null

    return {
      rawQuoteResponse: data, // Store full response for swap
      inputMint: data.inputMint || inputMint,
      outputMint: data.outputMint || outputMint,
      inputAmount: parseInt(data.inAmount) || amount,
      outputAmount: parseInt(data.outAmount) || 0,
      priceImpact: parseFloat(data.priceImpactPct) || 0,
      fee: data.platformFee?.amount ? parseInt(data.platformFee.amount) : 0,
    }
  }

  /**
   * Generate a swap transaction for bonding curve trades using SDK
   * Requires the full quote response from getTradeQuote()
   */
  async generateSwapTransaction(
    walletAddress: string,
    quoteResponse: RawQuoteResponse
  ): Promise<SwapTransaction | null> {
    loggers.bags.info({ walletAddress, usingSdk: !!this.sdk }, 'Generating swap transaction')

    // Use SDK if available (preferred method)
    if (this.sdk) {
      try {
        const result = await this.sdk.trade.createSwapTransaction({
          quoteResponse: quoteResponse as any, // SDK expects full TradeQuoteResponse
          userPublicKey: new PublicKey(walletAddress),
        })

        // SDK returns a VersionedTransaction, serialize to bs58 for compatibility
        const serializedTx = bs58.encode(result.transaction.serialize())

        loggers.bags.info({
          lastValidBlockHeight: result.lastValidBlockHeight,
          computeUnitLimit: result.computeUnitLimit,
        }, 'SDK swap transaction created')

        return {
          transaction: serializedTx,
          lastValidBlockHeight: result.lastValidBlockHeight,
        }
      } catch (error: any) {
        loggers.bags.error({ error: String(error), errorMessage: error.message }, 'SDK swap transaction failed')
        // Fall through to REST API fallback
      }
    }

    // Fallback to REST API
    loggers.bags.warn('Falling back to REST API for swap transaction')
    const data = await this.fetch<any>('/trade/swap', {
      method: 'POST',
      body: JSON.stringify({
        userPublicKey: walletAddress,
        quoteResponse,
      }),
    })

    // Response has swapTransaction field (not transaction)
    if (!data || !data.swapTransaction) return null

    return {
      transaction: data.swapTransaction,
      lastValidBlockHeight: data.lastValidBlockHeight || 0,
    }
  }

  /**
   * Generate claim transactions for claimable fees
   * Uses SDK if available, falls back to REST API
   * Includes retry logic for transient 500 errors
   */
  async generateClaimTransactions(
    walletAddress: string,
    tokenMints: string[],
    maxRetries: number = 3
  ): Promise<string[] | null> {
    const retryDelays = [1000, 2000, 4000] // Exponential backoff

    // Try SDK approach - get positions first, then generate claim txs
    if (this.sdk) {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const wallet = new PublicKey(walletAddress)
          const positions = await this.sdk.fee.getAllClaimablePositions(wallet)

          // Filter positions for requested token mints
          const matchingPositions = positions.filter(p =>
            tokenMints.includes(p.baseMint)
          )

          if (matchingPositions.length === 0) {
            loggers.bags.warn({
              wallet: walletAddress,
              requestedMints: tokenMints,
              availableMints: positions.map(p => p.baseMint),
            }, 'No matching positions found for requested token mints')
            return null
          }

          loggers.bags.info({
            wallet: walletAddress,
            matchingPositions: matchingPositions.length,
            positions: matchingPositions.map(p => ({
              baseMint: p.baseMint,
              claimableSOL: p.totalClaimableLamportsUserShare / 1e9,
            })),
            attempt: attempt + 1,
          }, 'Generating SDK claim transactions')

          // Generate claim transactions for each position
          const allTransactions: string[] = []
          let lastError: Error | null = null

          for (const position of matchingPositions) {
            try {
              const txs = await this.sdk.fee.getClaimTransaction(wallet, position)

              // Check if SDK returned empty array (possible silent failure)
              if (!txs || txs.length === 0) {
                loggers.bags.warn({
                  baseMint: position.baseMint,
                  claimableSOL: position.totalClaimableLamportsUserShare / 1e9,
                }, 'SDK returned empty transactions array for position')
                continue
              }

              // Serialize transactions to base64
              for (const tx of txs) {
                const serialized = tx.serialize({ requireAllSignatures: false })
                allTransactions.push(Buffer.from(serialized).toString('base64'))
              }

              loggers.bags.debug({
                baseMint: position.baseMint,
                txCount: txs.length,
              }, 'Generated claim transaction for position')
            } catch (txError: any) {
              lastError = txError
              const errorStr = String(txError)
              const is500Error = errorStr.includes('500') || errorStr.includes('Internal Server Error')

              loggers.bags.error({
                error: errorStr,
                baseMint: position.baseMint,
                attempt: attempt + 1,
                is500Error,
              }, 'Failed to generate claim transaction for position')

              // If it's a 500 error, we might want to retry
              if (is500Error && attempt < maxRetries - 1) {
                break // Break inner loop to retry entire SDK attempt
              }
            }
          }

          if (allTransactions.length > 0) {
            loggers.bags.info({
              transactionCount: allTransactions.length,
            }, 'SDK claim transactions generated')
            return allTransactions
          }

          // If we got here with no transactions but had 500 errors, retry
          if (lastError && String(lastError).includes('500') && attempt < maxRetries - 1) {
            loggers.bags.warn({
              attempt: attempt + 1,
              maxRetries,
              delay: retryDelays[attempt],
            }, 'SDK claim failed with 500 error, retrying...')
            await this.sleep(retryDelays[attempt])
            continue
          }

          // No transactions and no retryable errors - fall through to REST
          break
        } catch (error: any) {
          const errorStr = String(error)
          const is500Error = errorStr.includes('500') || errorStr.includes('Internal Server Error')

          loggers.bags.error({
            error: errorStr,
            attempt: attempt + 1,
            is500Error,
          }, 'SDK claim transaction generation failed')

          // Retry on 500 errors
          if (is500Error && attempt < maxRetries - 1) {
            loggers.bags.warn({
              attempt: attempt + 1,
              maxRetries,
              delay: retryDelays[attempt],
            }, 'Retrying SDK claim after 500 error...')
            await this.sleep(retryDelays[attempt])
            continue
          }

          // Non-retryable error or max retries reached - fall through to REST
          break
        }
      }

      loggers.bags.warn('SDK claim generation exhausted, falling back to REST API')
    }

    // Fallback to REST API with retry logic
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const data = await this.fetch<any>('/token-launch/claim-txs/v2', {
        method: 'POST',
        body: JSON.stringify({
          wallet: walletAddress,
          tokenMints,
        }),
      })

      if (data && Array.isArray(data.transactions) && data.transactions.length > 0) {
        loggers.bags.info({
          transactionCount: data.transactions.length,
        }, 'REST API claim transactions generated')
        return data.transactions
      }

      // Check if it's worth retrying
      if (attempt < maxRetries - 1) {
        loggers.bags.warn({
          attempt: attempt + 1,
          maxRetries,
          delay: retryDelays[attempt],
        }, 'REST API claim failed, retrying...')
        await this.sleep(retryDelays[attempt])
      }
    }

    loggers.bags.error({
      wallet: walletAddress,
      tokenMints,
    }, 'All claim transaction generation attempts failed')
    return null
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Generate raw claim transactions (returns transaction objects, not serialized)
   * Use this for Privy signing to avoid serialization/deserialization issues.
   * Following the same pattern as token-launcher.ts which works.
   */
  async generateClaimTransactionsRaw(
    walletAddress: string,
    tokenMints: string[]
  ): Promise<(VersionedTransaction | Transaction)[] | null> {
    if (!this.sdk) {
      loggers.bags.error('Bags SDK not initialized for raw claim transactions')
      return null
    }

    try {
      const wallet = new PublicKey(walletAddress)
      const positions = await this.sdk.fee.getAllClaimablePositions(wallet)

      // Filter positions for requested token mints
      const matchingPositions = positions.filter(p =>
        tokenMints.includes(p.baseMint)
      )

      if (matchingPositions.length === 0) {
        loggers.bags.warn({
          wallet: walletAddress,
          requestedMints: tokenMints,
          availableMints: positions.map(p => p.baseMint),
        }, 'No matching positions found for requested token mints (raw)')
        return null
      }

      loggers.bags.info({
        wallet: walletAddress,
        matchingPositions: matchingPositions.length,
        positions: matchingPositions.map(p => ({
          baseMint: p.baseMint,
          claimableSOL: p.totalClaimableLamportsUserShare / 1e9,
        })),
      }, 'Generating raw SDK claim transactions (no serialization)')

      // Generate claim transactions for each position
      const allTransactions: (VersionedTransaction | Transaction)[] = []

      for (const position of matchingPositions) {
        try {
          const txs = await this.sdk.fee.getClaimTransaction(wallet, position)

          if (!txs || txs.length === 0) {
            loggers.bags.warn({
              baseMint: position.baseMint,
              claimableSOL: position.totalClaimableLamportsUserShare / 1e9,
            }, 'SDK returned empty transactions array for position (raw)')
            continue
          }

          // Add raw transactions directly - NO SERIALIZATION
          for (const tx of txs) {
            allTransactions.push(tx)
          }

          loggers.bags.debug({
            baseMint: position.baseMint,
            txCount: txs.length,
          }, 'Generated raw claim transaction for position')
        } catch (txError: any) {
          loggers.bags.error({
            error: String(txError),
            baseMint: position.baseMint,
          }, 'Failed to generate raw claim transaction for position')
        }
      }

      if (allTransactions.length > 0) {
        loggers.bags.info({
          transactionCount: allTransactions.length,
        }, 'Raw SDK claim transactions generated successfully')
        return allTransactions
      }

      return null
    } catch (error) {
      loggers.bags.error({ error: String(error) }, 'Failed to generate raw claim transactions')
      return null
    }
  }

  /**
   * Get comprehensive token data combining multiple endpoints
   */
  async getTokenDashboardData(tokenMint: string, creatorWallet: string): Promise<{
    tokenInfo: TokenCreatorInfo | null
    lifetimeFees: TokenLifetimeFees | null
    claimablePositions: ClaimablePosition[]
    claimStats: ClaimStats | null
  }> {
    const [tokenInfo, lifetimeFees, claimablePositions, claimStats] = await Promise.all([
      this.getTokenCreatorInfo(tokenMint),
      this.getLifetimeFees(tokenMint),
      this.getClaimablePositions(creatorWallet),
      this.getClaimStats(creatorWallet),
    ])

    return {
      tokenInfo,
      lifetimeFees,
      claimablePositions,
      claimStats,
    }
  }
}

export const bagsFmService = new BagsFmService()
