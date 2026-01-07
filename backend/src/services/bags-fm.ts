// ═══════════════════════════════════════════════════════════════════════════
// BAGS.FM API SERVICE
// Integration with Bags.fm token launchpad for fee tracking and claiming
// ═══════════════════════════════════════════════════════════════════════════

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
  transaction: string // Base58 encoded serialized transaction
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
        // Estimate bonding curve progress from market cap (bonding curves typically graduate at ~$69k)
        // Progress is stored as decimal 0-1 for frontend compatibility
        if (dexData.marketCap > 0) {
          tokenInfo.bondingCurveProgress = Math.min(1, dexData.marketCap / 69000)
        }
      }
    } catch (error) {
      console.warn('Could not fetch DexScreener data:', error)
    }

    // Try to get holder count from Solana FM or Helius (free tier)
    try {
      const holders = await this.fetchHolderCount(tokenMint)
      if (holders > 0) {
        tokenInfo.holders = holders
      }
    } catch (error) {
      console.warn('Could not fetch holder count:', error)
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

      return {
        marketCap: bestPair.marketCap || bestPair.fdv || 0,
        volume24h: bestPair.volume?.h24 || 0,
        tokenName: bestPair.baseToken?.name || '',
        tokenSymbol: bestPair.baseToken?.symbol || '',
        tokenImage: bestPair.info?.imageUrl || '',
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
    _side?: 'buy' | 'sell', // Kept for API compatibility but not sent to Bags.fm
    slippageBps: number = 300 // Default 3% slippage for bonding curve trades
  ): Promise<TradeQuote | null> {
    // GET request with query params (API does not support POST for quote)
    // Use explicit slippage instead of 'auto' which only gives 1%
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
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
