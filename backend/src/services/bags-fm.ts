import { env } from '../config/env'

// ═══════════════════════════════════════════════════════════════════════════
// BAGS.FM API SERVICE
// Integration with Bags.fm token launchpad for fee tracking and claiming
// ═══════════════════════════════════════════════════════════════════════════

const BAGS_API_BASE = 'https://public-api-v2.bags.fm/api/v1'

interface BagsApiResponse<T> {
  success: boolean
  response?: T
  error?: string
}

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
}

export interface ClaimStats {
  totalClaimed: number
  totalClaimedUsd: number
  pendingClaims: number
  pendingClaimsUsd: number
  lastClaimTime: string | null
}

export interface TradeQuote {
  // Raw quote response - needed for swap execution
  rawQuoteResponse: any
  // Parsed fields for convenience
  inputMint: string
  outputMint: string
  inputAmount: number
  outputAmount: number
  priceImpact: number
  fee: number
}

export interface SwapTransaction {
  transaction: string // Base64 encoded serialized transaction
  lastValidBlockHeight: number
}

// ═══════════════════════════════════════════════════════════════════════════
// API CLIENT
// ═══════════════════════════════════════════════════════════════════════════

class BagsFmService {
  private apiKey: string | null = null

  setApiKey(key: string) {
    this.apiKey = key
  }

  private async fetch<T>(endpoint: string, options: RequestInit = {}): Promise<T | null> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'x-api-key': this.apiKey } : {}),
        ...(options.headers as Record<string, string> || {}),
      }

      const url = `${BAGS_API_BASE}${endpoint}`
      console.log(`📡 Bags.fm API: ${options.method || 'GET'} ${endpoint}`)

      const response = await fetch(url, {
        ...options,
        headers,
      })

      const responseText = await response.text()

      if (!response.ok) {
        console.error(`Bags.fm API error: ${response.status} ${response.statusText}`)
        console.error(`Response body: ${responseText.slice(0, 500)}`)
        return null
      }

      // Try to parse JSON
      let data: any
      try {
        data = JSON.parse(responseText)
      } catch {
        console.error(`Bags.fm API: Invalid JSON response: ${responseText.slice(0, 200)}`)
        return null
      }

      // Handle different response formats - some endpoints return data directly
      if (data.success === false) {
        console.error(`Bags.fm API error: ${data.error || data.message || 'Unknown error'}`)
        return null
      }

      // Return response field if exists, otherwise return data directly
      const result = data.response ?? data.data ?? data
      console.log(`✅ Bags.fm API response received`)
      console.log(`📦 Response data: ${JSON.stringify(result).slice(0, 500)}`)
      return result as T
    } catch (error) {
      console.error('Bags.fm API request failed:', error)
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
   * Get token creator/launch info
   */
  async getTokenCreatorInfo(tokenMint: string): Promise<TokenCreatorInfo | null> {
    const data = await this.fetch<any>(`/token-launch/creator/v3?tokenMint=${tokenMint}`)

    if (!data) return null

    return {
      tokenMint,
      creatorWallet: data.creatorWallet || '',
      tokenName: data.tokenName || '',
      tokenSymbol: data.tokenSymbol || '',
      tokenImage: data.tokenImage || '',
      bondingCurveProgress: data.bondingCurveProgress || 0,
      isGraduated: data.isGraduated || false,
      marketCap: data.marketCap || 0,
      volume24h: data.volume24h || 0,
      holders: data.holders || 0,
      createdAt: data.createdAt || '',
    }
  }

  /**
   * Get claimable fee positions for a wallet
   */
  async getClaimablePositions(walletAddress: string): Promise<ClaimablePosition[]> {
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
   * Get a trade quote
   * Note: side is determined by inputMint/outputMint (SOL→token = buy, token→SOL = sell)
   */
  async getTradeQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    _side?: 'buy' | 'sell' // Kept for API compatibility but not sent to Bags.fm
  ): Promise<TradeQuote | null> {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
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
   * Generate a swap transaction for bonding curve trades
   * Requires the full quote response from getTradeQuote()
   */
  async generateSwapTransaction(
    walletAddress: string,
    quoteResponse: any
  ): Promise<SwapTransaction | null> {
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
   */
  async generateClaimTransactions(
    walletAddress: string,
    tokenMints: string[]
  ): Promise<string[] | null> {
    const data = await this.fetch<any>('/token-launch/claim-txs/v2', {
      method: 'POST',
      body: JSON.stringify({
        wallet: walletAddress,
        tokenMints,
      }),
    })

    if (!data || !Array.isArray(data.transactions)) return null

    return data.transactions
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
