// ═══════════════════════════════════════════════════════════════════════════
// JUPITER SWAP SERVICE
// For trading graduated/bonded tokens via Jupiter aggregator
// ═══════════════════════════════════════════════════════════════════════════

import { loggers } from '../utils/logger'

const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface JupiterQuoteResponse {
  inputMint: string
  outputMint: string
  inAmount: string
  outAmount: string
  otherAmountThreshold: string
  swapMode: string
  slippageBps: number
  priceImpactPct: string
  routePlan: Array<{
    swapInfo: {
      ammKey: string
      label?: string
      inputMint: string
      outputMint: string
      inAmount: string
      outAmount: string
      feeAmount: string
      feeMint: string
    }
    percent: number
  }>
  contextSlot?: number
  timeTaken?: number
}

export interface JupiterSwapResponse {
  swapTransaction: string // Base64 encoded transaction
  lastValidBlockHeight: number
  prioritizationFeeLamports?: number
}

export interface TradeQuote {
  rawQuoteResponse: JupiterQuoteResponse
  inputMint: string
  outputMint: string
  inputAmount: number
  outputAmount: number
  priceImpact: number
  fee: number
}

export interface SwapTransaction {
  transaction: string
  lastValidBlockHeight: number
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class JupiterService {
  /**
   * Get a trade quote from Jupiter
   */
  async getTradeQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    slippageBps: number = 300
  ): Promise<TradeQuote | null> {
    try {
      // Validate amount
      if (!amount || amount <= 0 || !Number.isFinite(amount)) {
        loggers.flywheel.error({ amount }, 'Invalid amount for Jupiter quote')
        return null
      }

      const amountInt = Math.floor(amount)
      if (amountInt < 1000) {
        loggers.flywheel.error({ amount, amountInt }, 'Amount too small for Jupiter quote')
        return null
      }

      const params = new URLSearchParams({
        inputMint,
        outputMint,
        amount: amountInt.toString(),
        slippageBps: slippageBps.toString(),
        onlyDirectRoutes: 'false',
        asLegacyTransaction: 'false',
      })

      const url = `${JUPITER_API_BASE}/quote?${params}`
      loggers.flywheel.info({
        inputMint,
        outputMint,
        amount: amountInt,
        slippageBps,
        url,
      }, 'Requesting Jupiter quote')

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        const errorText = await response.text()
        loggers.flywheel.error({
          status: response.status,
          statusText: response.statusText,
          error: errorText.slice(0, 500),
        }, 'Jupiter quote API error')
        return null
      }

      const data = await response.json() as JupiterQuoteResponse

      if (!data.outAmount) {
        loggers.flywheel.error({ data }, 'Jupiter returned empty quote')
        return null
      }

      return {
        rawQuoteResponse: data,
        inputMint: data.inputMint,
        outputMint: data.outputMint,
        inputAmount: parseInt(data.inAmount) || amount,
        outputAmount: parseInt(data.outAmount) || 0,
        priceImpact: parseFloat(data.priceImpactPct) || 0,
        fee: 0, // Jupiter fees are embedded in the route
      }
    } catch (error) {
      loggers.flywheel.error({ error: String(error) }, 'Jupiter quote request failed')
      return null
    }
  }

  /**
   * Generate a swap transaction from Jupiter
   */
  async generateSwapTransaction(
    walletAddress: string,
    quoteResponse: JupiterQuoteResponse
  ): Promise<SwapTransaction | null> {
    try {
      const response = await fetch(`${JUPITER_API_BASE}/swap`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          userPublicKey: walletAddress,
          quoteResponse,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
        signal: AbortSignal.timeout(15000),
      })

      if (!response.ok) {
        const errorText = await response.text()
        loggers.flywheel.error({
          status: response.status,
          error: errorText.slice(0, 500),
        }, 'Jupiter swap API error')
        return null
      }

      const data = await response.json() as JupiterSwapResponse

      if (!data.swapTransaction) {
        loggers.flywheel.error({ data }, 'Jupiter returned no swap transaction')
        return null
      }

      return {
        transaction: data.swapTransaction,
        lastValidBlockHeight: data.lastValidBlockHeight,
      }
    } catch (error) {
      loggers.flywheel.error({ error: String(error) }, 'Jupiter swap request failed')
      return null
    }
  }

  /**
   * Check if a token has liquidity on Jupiter (used to verify graduated status)
   * Returns true if there's tradeable liquidity
   */
  async hasLiquidity(tokenMint: string): Promise<boolean> {
    try {
      const SOL_MINT = 'So11111111111111111111111111111111111111112'

      // Try to get a small quote to check if token is tradeable
      const params = new URLSearchParams({
        inputMint: SOL_MINT,
        outputMint: tokenMint,
        amount: '10000000', // 0.01 SOL
        slippageBps: '500',
      })

      const response = await fetch(`${JUPITER_API_BASE}/quote?${params}`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json() as JupiterQuoteResponse

      // Check if we got a valid quote with reasonable output
      const hasValidQuote = Boolean(data.outAmount && parseInt(data.outAmount) > 0)

      loggers.flywheel.debug({
        tokenMint,
        hasLiquidity: hasValidQuote,
        outAmount: data.outAmount,
      }, 'Jupiter liquidity check')

      return hasValidQuote
    } catch (error) {
      loggers.flywheel.debug({ tokenMint, error: String(error) }, 'Jupiter liquidity check failed')
      return false
    }
  }
}

export const jupiterService = new JupiterService()
