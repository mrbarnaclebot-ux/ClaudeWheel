// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION MONITOR SERVICE
// Real-time transaction monitoring for reactive MM mode
// Uses Solana WebSocket to detect large buys/sells on monitored tokens
// ═══════════════════════════════════════════════════════════════════════════

import { Connection, PublicKey, Logs, Context } from '@solana/web3.js'
import { EventEmitter } from 'events'
import { env } from '../config/env'
import { loggers } from '../utils/logger'
import { prisma, isPrismaConfigured } from '../config/prisma'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TokenTransaction {
  tokenMint: string
  signature: string
  type: 'buy' | 'sell'
  solAmount: number
  timestamp: Date
  slot: number
}

export interface MonitoredToken {
  tokenMint: string
  privyTokenId: string
  opsWalletAddress: string
  subscriptionId: number | null
  reactiveConfig: {
    minTriggerSol: number
    scalePercent: number
    maxResponsePercent: number
    cooldownMs: number
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

// SOL mint address (native SOL wrapped)
const SOL_MINT = 'So11111111111111111111111111111111111111112'

// Bags.fm program ID (bonding curve AMM)
const BAGS_PROGRAM_ID = 'BAGSPuZVLLsDMDhUhVW5irFoLhqhRFuaEohWmGiJUJW9'

// Reconnection settings
const RECONNECT_DELAY_MS = 5000
const MAX_RECONNECT_ATTEMPTS = 10

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION MONITOR SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class TransactionMonitorService extends EventEmitter {
  private wsConnection: Connection | null = null
  private monitoredTokens: Map<string, MonitoredToken> = new Map()
  private reconnectAttempts: number = 0
  private isShuttingDown: boolean = false

  constructor() {
    super()
  }

  /**
   * Initialize WebSocket connection for transaction monitoring
   */
  async initialize(): Promise<void> {
    if (!env.solanaWsUrl) {
      loggers.server.warn('SOLANA_WS_URL not configured, transaction monitoring disabled')
      return
    }

    try {
      // Create dedicated WebSocket connection for monitoring
      this.wsConnection = new Connection(env.solanaRpcUrl, {
        commitment: 'confirmed',
        wsEndpoint: env.solanaWsUrl,
      })

      loggers.server.info({ wsUrl: env.solanaWsUrl }, '🔌 Transaction monitor WebSocket initialized')

      // Load and subscribe to all reactive-enabled tokens
      await this.loadReactiveTokens()

      this.reconnectAttempts = 0
    } catch (error) {
      loggers.server.error({ error: String(error) }, 'Failed to initialize transaction monitor')
      this.scheduleReconnect()
    }
  }

  /**
   * Load all tokens with reactive mode enabled and subscribe to them
   */
  async loadReactiveTokens(): Promise<void> {
    if (!isPrismaConfigured() || !this.wsConnection) return

    try {
      const reactiveTokens = await prisma.privyTokenConfig.findMany({
        where: {
          reactiveEnabled: true,
          flywheelActive: true,
        },
        include: {
          token: {
            include: {
              opsWallet: true,
            },
          },
        },
      })

      loggers.server.info({ count: reactiveTokens.length }, '📡 Loading reactive tokens for monitoring')

      for (const config of reactiveTokens) {
        if (config.token && config.token.opsWallet) {
          await this.subscribeToToken({
            tokenMint: config.token.tokenMintAddress,
            privyTokenId: config.privyTokenId,
            opsWalletAddress: config.token.opsWallet.walletAddress,
            subscriptionId: null,
            reactiveConfig: {
              minTriggerSol: Number(config.reactiveMinTriggerSol),
              scalePercent: config.reactiveScalePercent,
              maxResponsePercent: config.reactiveMaxResponsePercent,
              cooldownMs: config.reactiveCooldownMs,
            },
          })
        }
      }
    } catch (error) {
      loggers.server.error({ error: String(error) }, 'Failed to load reactive tokens')
    }
  }

  /**
   * Subscribe to transaction logs for a specific token
   */
  async subscribeToToken(token: MonitoredToken): Promise<void> {
    if (!this.wsConnection || this.monitoredTokens.has(token.tokenMint)) {
      return
    }

    try {
      const tokenMintPubkey = new PublicKey(token.tokenMint)

      // Subscribe to logs mentioning this token mint
      const subscriptionId = this.wsConnection.onLogs(
        tokenMintPubkey,
        (logs: Logs, context: Context) => this.handleLogs(token, logs, context),
        'confirmed'
      )

      token.subscriptionId = subscriptionId
      this.monitoredTokens.set(token.tokenMint, token)

      loggers.server.info({
        tokenMint: token.tokenMint,
        subscriptionId,
      }, '✅ Subscribed to token transactions')
    } catch (error) {
      loggers.server.error({
        tokenMint: token.tokenMint,
        error: String(error),
      }, 'Failed to subscribe to token')
    }
  }

  /**
   * Unsubscribe from a token's transaction logs
   */
  async unsubscribeFromToken(tokenMint: string): Promise<void> {
    const token = this.monitoredTokens.get(tokenMint)
    if (!token || token.subscriptionId === null || !this.wsConnection) {
      return
    }

    try {
      await this.wsConnection.removeOnLogsListener(token.subscriptionId)
      this.monitoredTokens.delete(tokenMint)

      loggers.server.info({ tokenMint }, '🔌 Unsubscribed from token transactions')
    } catch (error) {
      loggers.server.error({ tokenMint, error: String(error) }, 'Failed to unsubscribe from token')
    }
  }

  /**
   * Handle incoming transaction logs
   * Parse to detect buy/sell and SOL amount
   */
  private handleLogs(token: MonitoredToken, logs: Logs, context: Context): void {
    try {
      // Skip failed transactions
      if (logs.err) {
        return
      }

      const signature = logs.signature
      const logMessages = logs.logs

      // Parse the transaction to determine type and amount
      const parsedTx = this.parseTransactionLogs(token, logMessages, signature)

      if (parsedTx) {
        // Check if this is from our own ops wallet (ignore our own trades)
        if (this.isOwnTransaction(token, logMessages)) {
          loggers.server.debug({ signature, tokenMint: token.tokenMint }, 'Ignoring own transaction')
          return
        }

        // Check minimum threshold
        if (parsedTx.solAmount < token.reactiveConfig.minTriggerSol) {
          loggers.server.debug({
            signature,
            solAmount: parsedTx.solAmount,
            minTrigger: token.reactiveConfig.minTriggerSol,
          }, 'Transaction below threshold, ignoring')
          return
        }

        loggers.server.info({
          tokenMint: token.tokenMint,
          type: parsedTx.type,
          solAmount: parsedTx.solAmount,
          signature,
        }, `🎯 Detected ${parsedTx.type.toUpperCase()} transaction`)

        // Emit event for reactive handler
        this.emit('transaction', {
          ...parsedTx,
          privyTokenId: token.privyTokenId,
          reactiveConfig: token.reactiveConfig,
        })
      }
    } catch (error) {
      loggers.server.error({
        tokenMint: token.tokenMint,
        signature: logs.signature,
        error: String(error),
      }, 'Error handling transaction logs')
    }
  }

  /**
   * Parse transaction logs to extract buy/sell type and SOL amount
   * Bags.fm logs follow a specific pattern for swaps
   */
  private parseTransactionLogs(
    token: MonitoredToken,
    logMessages: string[],
    signature: string
  ): TokenTransaction | null {
    try {
      // Look for Bags program invoke
      const hasBagsProgram = logMessages.some(log =>
        log.includes(BAGS_PROGRAM_ID) || log.includes('Program BAGSPu')
      )

      if (!hasBagsProgram) {
        return null
      }

      // Parse SOL amount from logs
      // Bags.fm logs typically show: "Program log: Swap: X lamports"
      // or we can detect from token transfer logs
      let solAmount = 0
      let type: 'buy' | 'sell' = 'buy'

      for (const log of logMessages) {
        // Look for lamport amounts in logs
        const lamportMatch = log.match(/(\d+)\s*lamports/i)
        if (lamportMatch) {
          const lamports = parseInt(lamportMatch[1], 10)
          if (lamports > solAmount * 1e9) {
            solAmount = lamports / 1e9
          }
        }

        // Look for swap direction indicators
        // Buy: SOL -> Token (SOL is input)
        // Sell: Token -> SOL (Token is input)
        if (log.toLowerCase().includes('swap') || log.toLowerCase().includes('trade')) {
          if (log.includes(SOL_MINT) && log.indexOf(SOL_MINT) < log.indexOf(token.tokenMint)) {
            type = 'buy' // SOL comes before token = buying token with SOL
          } else if (log.includes(SOL_MINT)) {
            type = 'sell' // SOL comes after or token mentioned first = selling token for SOL
          }
        }
      }

      // If we couldn't parse amount from logs, try to estimate from instruction data
      // This is a fallback - the amount might be approximate
      if (solAmount === 0) {
        // Look for any large number that could be lamports
        for (const log of logMessages) {
          const numbers = log.match(/\b(\d{9,})\b/g) // 9+ digits = likely lamports
          if (numbers) {
            for (const num of numbers) {
              const parsed = parseInt(num, 10)
              if (parsed > 1e8 && parsed < 1e15) { // Between 0.1 SOL and 1M SOL
                const sol = parsed / 1e9
                if (sol > solAmount) {
                  solAmount = sol
                }
              }
            }
          }
        }
      }

      // If still no amount, skip this transaction
      if (solAmount === 0) {
        return null
      }

      return {
        tokenMint: token.tokenMint,
        signature,
        type,
        solAmount,
        timestamp: new Date(),
        slot: 0, // Will be filled by context if needed
      }
    } catch (error) {
      loggers.server.error({
        signature,
        error: String(error),
      }, 'Failed to parse transaction logs')
      return null
    }
  }

  /**
   * Check if transaction is from our own ops wallet
   */
  private isOwnTransaction(token: MonitoredToken, logMessages: string[]): boolean {
    // Check if any log contains our ops wallet address
    return logMessages.some(log => log.includes(token.opsWalletAddress))
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.isShuttingDown) return

    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      loggers.server.error('Max reconnection attempts reached for transaction monitor')
      return
    }

    this.reconnectAttempts++
    const delay = RECONNECT_DELAY_MS * this.reconnectAttempts

    loggers.server.info({
      attempt: this.reconnectAttempts,
      delayMs: delay,
    }, 'Scheduling transaction monitor reconnection')

    setTimeout(() => this.initialize(), delay)
  }

  /**
   * Add a new token to monitoring (called when reactive mode is enabled)
   */
  async addToken(
    tokenMint: string,
    privyTokenId: string,
    opsWalletAddress: string,
    reactiveConfig: MonitoredToken['reactiveConfig']
  ): Promise<void> {
    await this.subscribeToToken({
      tokenMint,
      privyTokenId,
      opsWalletAddress,
      subscriptionId: null,
      reactiveConfig,
    })
  }

  /**
   * Remove a token from monitoring (called when reactive mode is disabled)
   */
  async removeToken(tokenMint: string): Promise<void> {
    await this.unsubscribeFromToken(tokenMint)
  }

  /**
   * Update reactive config for a monitored token
   */
  updateTokenConfig(tokenMint: string, reactiveConfig: MonitoredToken['reactiveConfig']): void {
    const token = this.monitoredTokens.get(tokenMint)
    if (token) {
      token.reactiveConfig = reactiveConfig
      this.monitoredTokens.set(tokenMint, token)
    }
  }

  /**
   * Get list of monitored tokens
   */
  getMonitoredTokens(): string[] {
    return Array.from(this.monitoredTokens.keys())
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true

    // Unsubscribe from all tokens
    for (const tokenMint of this.monitoredTokens.keys()) {
      await this.unsubscribeFromToken(tokenMint)
    }

    loggers.server.info('Transaction monitor service shut down')
  }
}

// Export singleton instance
export const transactionMonitorService = new TransactionMonitorService()
