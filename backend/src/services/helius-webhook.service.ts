// ═══════════════════════════════════════════════════════════════════════════
// HELIUS WEBHOOK SERVICE
// Processes Helius webhook events and triggers reactive MM trades
// ═══════════════════════════════════════════════════════════════════════════

import { loggers } from '../utils/logger'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { multiUserMMService } from './multi-user-mm.service'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

// Helius enhanced transaction webhook payload
interface HeliusTransaction {
  signature: string
  type: string // SWAP, BUY, SELL, etc.
  source: string // DEX/protocol name
  timestamp: number
  slot: number
  fee: number
  feePayer: string
  description?: string
  accountData?: Array<{
    account: string
    nativeBalanceChange: number
    tokenBalanceChanges: Array<{
      userAccount: string
      tokenAccount: string
      mint: string
      rawTokenAmount: {
        tokenAmount: string
        decimals: number
      }
    }>
  }>
  nativeTransfers?: Array<{
    fromUserAccount: string
    toUserAccount: string
    amount: number
  }>
  tokenTransfers?: Array<{
    fromUserAccount: string
    toUserAccount: string
    fromTokenAccount: string
    toTokenAccount: string
    tokenAmount: number
    mint: string
    tokenStandard: string
  }>
  events?: {
    swap?: {
      nativeInput?: { account: string; amount: string }
      nativeOutput?: { account: string; amount: string }
      tokenInputs?: Array<{ userAccount: string; tokenAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>
      tokenOutputs?: Array<{ userAccount: string; tokenAccount: string; mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>
      innerSwaps?: Array<{
        tokenInputs: Array<{ mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>
        tokenOutputs: Array<{ mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>
      }>
    }
  }
}

// Cached reactive token configs - refreshed periodically
interface ReactiveTokenConfig {
  privyTokenId: string
  tokenMint: string
  opsWalletAddress: string
  minTriggerSol: number
  scalePercent: number
  maxResponsePercent: number
  cooldownMs: number
}

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

// Cache of reactive-enabled tokens (keyed by token mint)
let reactiveTokensCache: Map<string, ReactiveTokenConfig> = new Map()
let lastCacheRefresh = 0
const CACHE_TTL_MS = 60000 // Refresh cache every minute

// Track processed signatures to avoid duplicates (circular buffer approach)
const processedSignatures = new Set<string>()
const CLEANUP_THRESHOLD = 4000 // Clean when reaching this threshold

// ═══════════════════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load/refresh reactive token configs from database
 */
async function refreshReactiveTokensCache(): Promise<void> {
  if (!isPrismaConfigured()) return

  try {
    const tokens = await prisma.privyTokenConfig.findMany({
      where: {
        reactiveEnabled: true,
        flywheelActive: true,
        algorithmMode: 'transaction_reactive',
      },
      include: {
        token: {
          include: {
            opsWallet: true,
          },
        },
      },
    })

    const newCache = new Map<string, ReactiveTokenConfig>()
    for (const config of tokens) {
      if (config.token && config.token.opsWallet) {
        newCache.set(config.token.tokenMintAddress, {
          privyTokenId: config.privyTokenId,
          tokenMint: config.token.tokenMintAddress,
          opsWalletAddress: config.token.opsWallet.walletAddress,
          minTriggerSol: Number(config.reactiveMinTriggerSol),
          scalePercent: config.reactiveScalePercent,
          maxResponsePercent: config.reactiveMaxResponsePercent,
          cooldownMs: config.reactiveCooldownMs,
        })
      }
    }

    reactiveTokensCache = newCache
    lastCacheRefresh = Date.now()

    loggers.server.debug({ tokenCount: newCache.size }, '🔄 Refreshed reactive tokens cache')
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Failed to refresh reactive tokens cache')
  }
}

/**
 * Get reactive config for a token mint, refreshing cache if needed
 */
async function getReactiveConfig(tokenMint: string): Promise<ReactiveTokenConfig | null> {
  // Refresh cache if stale
  if (Date.now() - lastCacheRefresh > CACHE_TTL_MS) {
    await refreshReactiveTokensCache()
  }

  return reactiveTokensCache.get(tokenMint) || null
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process incoming Helius webhook transaction
 */
export async function processHeliusWebhook(tx: HeliusTransaction): Promise<void> {
  try {
    const { signature, type, source } = tx

    // Skip if already processed (Helius may retry)
    if (processedSignatures.has(signature)) {
      loggers.server.debug({ signature }, 'Skipping duplicate webhook')
      return
    }

    // Track processed signature with aggressive cleanup to prevent memory growth
    processedSignatures.add(signature)
    if (processedSignatures.size > CLEANUP_THRESHOLD) {
      // Clean up oldest half of signatures when threshold reached
      const toDelete = Array.from(processedSignatures).slice(0, Math.floor(processedSignatures.size / 2))
      toDelete.forEach(sig => processedSignatures.delete(sig))
      loggers.server.debug({ remaining: processedSignatures.size }, 'Cleaned up processed signatures')
    }

    // Only process swap/buy/sell transactions
    const relevantTypes = ['SWAP', 'BUY', 'SELL']
    if (!relevantTypes.includes(type)) {
      loggers.server.debug({ signature, type }, 'Ignoring non-swap transaction')
      return
    }

    loggers.server.info({
      signature,
      type,
      source,
    }, `📥 Processing ${type} transaction from ${source}`)

    // Extract token mints and SOL amount from the transaction
    const { tokenMint, solAmount, tradeType } = parseTransaction(tx)

    loggers.server.info({ signature, tokenMint, solAmount, tradeType }, '🔍 Parsed transaction')

    if (!tokenMint || solAmount === 0) {
      loggers.server.info({ signature, tokenMint, solAmount }, '⏭️ Could not parse transaction details')
      return
    }

    // Check if this token has reactive mode enabled
    const config = await getReactiveConfig(tokenMint)
    if (!config) {
      loggers.server.info({ tokenMint, signature }, '⏭️ Token not configured for reactive mode')
      return
    }

    // Check if this is our own transaction (from ops wallet)
    if (isOwnTransaction(tx, config.opsWalletAddress)) {
      loggers.server.info({ signature }, '⏭️ Ignoring own transaction')
      return
    }

    // Check minimum threshold
    if (solAmount < config.minTriggerSol) {
      loggers.server.info({
        signature,
        solAmount,
        minTrigger: config.minTriggerSol,
      }, '⏭️ Transaction below threshold')
      return
    }

    loggers.server.info({
      tokenMint,
      type: tradeType,
      solAmount,
      signature,
    }, `🎯 Triggering reactive ${tradeType === 'buy' ? 'SELL' : 'BUY'} for ${solAmount} SOL trade`)

    // Execute reactive trade (opposite of detected trade)
    const result = await multiUserMMService.executeReactiveTrade(
      config.privyTokenId,
      tradeType, // The detected trade type - service will do opposite
      solAmount,
      {
        minTriggerSol: config.minTriggerSol,
        scalePercent: config.scalePercent,
        maxResponsePercent: config.maxResponsePercent,
        cooldownMs: config.cooldownMs,
      }
    )

    if (result) {
      if (result.success) {
        loggers.server.info({
          tokenSymbol: result.tokenSymbol,
          tradeType: result.tradeType,
          amount: result.amount,
          responseSignature: result.signature,
          triggerSignature: signature,
          triggerSolAmount: solAmount,
        }, '✅ Reactive trade completed')
      } else {
        loggers.server.warn({
          tokenSymbol: result.tokenSymbol,
          error: result.error,
          triggerSignature: signature,
        }, '⚠️ Reactive trade failed')
      }
    }
  } catch (error) {
    loggers.server.error({
      signature: tx?.signature,
      error: String(error),
    }, 'Error processing Helius webhook')
  }
}

/**
 * Parse transaction to extract token mint, SOL amount, and trade type
 */
function parseTransaction(tx: HeliusTransaction): {
  tokenMint: string | null
  solAmount: number
  tradeType: 'buy' | 'sell'
} {
  let tokenMint: string | null = null
  let solAmount = 0
  let tradeType: 'buy' | 'sell' = 'buy'

  const SOL_MINT = 'So11111111111111111111111111111111111111112'

  // Try to parse from events.swap (most reliable for swaps)
  if (tx.events?.swap) {
    const swap = tx.events.swap

    // Get SOL amount from native input/output
    if (swap.nativeInput) {
      solAmount = parseInt(swap.nativeInput.amount) / 1e9
      tradeType = 'buy' // Native SOL input = buying tokens
    } else if (swap.nativeOutput) {
      solAmount = parseInt(swap.nativeOutput.amount) / 1e9
      tradeType = 'sell' // Native SOL output = selling tokens
    }

    // Get token mint from outputs (for buy) or inputs (for sell)
    if (tradeType === 'buy' && swap.tokenOutputs?.length) {
      tokenMint = swap.tokenOutputs[0].mint
    } else if (tradeType === 'sell' && swap.tokenInputs?.length) {
      tokenMint = swap.tokenInputs[0].mint
    }
  }

  // Fallback: parse from tokenTransfers
  if (!tokenMint && tx.tokenTransfers?.length) {
    for (const transfer of tx.tokenTransfers) {
      if (transfer.mint !== SOL_MINT) {
        tokenMint = transfer.mint
        break
      }
    }
  }

  // Fallback: parse SOL from nativeTransfers
  if (solAmount === 0 && tx.nativeTransfers?.length) {
    for (const transfer of tx.nativeTransfers) {
      const amount = transfer.amount / 1e9
      if (amount > solAmount) {
        solAmount = amount
      }
    }
  }

  // Fallback: parse from accountData
  if ((!tokenMint || solAmount === 0) && tx.accountData?.length) {
    for (const account of tx.accountData) {
      // Get SOL amount from native balance changes
      if (solAmount === 0 && account.nativeBalanceChange) {
        const change = Math.abs(account.nativeBalanceChange) / 1e9
        if (change > solAmount) {
          solAmount = change
        }
      }

      // Get token mint from balance changes
      if (!tokenMint && account.tokenBalanceChanges?.length) {
        for (const tokenChange of account.tokenBalanceChanges) {
          if (tokenChange.mint !== SOL_MINT) {
            tokenMint = tokenChange.mint
            break
          }
        }
      }
    }
  }

  return { tokenMint, solAmount, tradeType }
}

/**
 * Check if transaction is from our own ops wallet
 */
function isOwnTransaction(tx: HeliusTransaction, opsWalletAddress: string): boolean {
  // Check if fee payer is our wallet
  if (tx.feePayer === opsWalletAddress) {
    return true
  }

  // Check native transfers
  if (tx.nativeTransfers?.some(t => t.fromUserAccount === opsWalletAddress)) {
    return true
  }

  // Check token transfers
  if (tx.tokenTransfers?.some(t => t.fromUserAccount === opsWalletAddress)) {
    return true
  }

  return false
}

/**
 * Get list of monitored token mints (for webhook setup)
 */
export async function getMonitoredTokenMints(): Promise<string[]> {
  await refreshReactiveTokensCache()
  return Array.from(reactiveTokensCache.keys())
}

/**
 * Initialize the service (pre-load cache)
 */
export async function initHeliusWebhookService(): Promise<void> {
  await refreshReactiveTokensCache()
  loggers.server.info({ tokenCount: reactiveTokensCache.size }, '🚀 Helius webhook service initialized')
}

// ═══════════════════════════════════════════════════════════════════════════
// HELIUS WEBHOOK MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const HELIUS_API_BASE = 'https://api.helius.xyz/v0'

interface HeliusWebhook {
  webhookID: string
  wallet: string
  webhookURL: string
  transactionTypes: string[]
  accountAddresses: string[]
  webhookType: string
}

/**
 * Create or update Helius webhook for reactive MM
 */
export async function setupHeliusWebhook(webhookUrl: string): Promise<{ success: boolean; webhookId?: string; error?: string }> {
  const apiKey = process.env.HELIUS_API_KEY
  if (!apiKey) {
    return { success: false, error: 'HELIUS_API_KEY not configured' }
  }

  try {
    // Get all monitored token mints
    const tokenMints = await getMonitoredTokenMints()
    if (tokenMints.length === 0) {
      return { success: false, error: 'No tokens configured for reactive mode' }
    }

    loggers.server.info({ tokenMints, webhookUrl }, '🔧 Setting up Helius webhook')

    // Check if webhook already exists
    const existingWebhooks = await listHeliusWebhooks()
    const existingWebhook = existingWebhooks.find(w => w.webhookURL === webhookUrl)

    // Helius API requires api-key in query params; Authorization header is optional
    const headers = {
      'Content-Type': 'application/json',
    }

    if (existingWebhook) {
      // Update existing webhook
      const response = await fetch(`${HELIUS_API_BASE}/webhooks/${existingWebhook.webhookID}?api-key=${apiKey}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          webhookURL: webhookUrl,
          transactionTypes: ['SWAP', 'BUY', 'SELL'],
          accountAddresses: tokenMints,
          webhookType: 'enhanced',
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        return { success: false, error: `Failed to update webhook: ${error}` }
      }

      loggers.server.info({ webhookId: existingWebhook.webhookID }, '✅ Updated Helius webhook')
      return { success: true, webhookId: existingWebhook.webhookID }
    } else {
      // Create new webhook
      const response = await fetch(`${HELIUS_API_BASE}/webhooks?api-key=${apiKey}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          webhookURL: webhookUrl,
          transactionTypes: ['SWAP', 'BUY', 'SELL'],
          accountAddresses: tokenMints,
          webhookType: 'enhanced',
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        return { success: false, error: `Failed to create webhook: ${error}` }
      }

      const data = await response.json() as { webhookID: string }
      loggers.server.info({ webhookId: data.webhookID }, '✅ Created Helius webhook')
      return { success: true, webhookId: data.webhookID }
    }
  } catch (error) {
    loggers.server.error({ error: String(error) }, 'Error setting up Helius webhook')
    return { success: false, error: String(error) }
  }
}

/**
 * List all Helius webhooks
 */
export async function listHeliusWebhooks(): Promise<HeliusWebhook[]> {
  const apiKey = process.env.HELIUS_API_KEY
  if (!apiKey) {
    return []
  }

  try {
    const response = await fetch(`${HELIUS_API_BASE}/webhooks?api-key=${apiKey}`)
    if (!response.ok) {
      return []
    }
    return await response.json() as HeliusWebhook[]
  } catch {
    return []
  }
}

/**
 * Delete a Helius webhook
 */
export async function deleteHeliusWebhook(webhookId: string): Promise<boolean> {
  const apiKey = process.env.HELIUS_API_KEY
  if (!apiKey) {
    return false
  }

  try {
    const response = await fetch(`${HELIUS_API_BASE}/webhooks/${webhookId}?api-key=${apiKey}`, {
      method: 'DELETE',
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Get webhook status and info
 */
export async function getWebhookStatus(): Promise<{
  configured: boolean
  webhookUrl: string | null
  monitoredTokens: string[]
  webhooks: HeliusWebhook[]
}> {
  await refreshReactiveTokensCache()
  const webhooks = await listHeliusWebhooks()
  const monitoredTokens = Array.from(reactiveTokensCache.keys())

  return {
    configured: webhooks.length > 0,
    webhookUrl: webhooks[0]?.webhookURL || null,
    monitoredTokens,
    webhooks,
  }
}
