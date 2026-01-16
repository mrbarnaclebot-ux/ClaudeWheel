import { prisma, isPrismaConfigured } from '../config/prisma'
import { loggers } from '../utils/logger'

// ═══════════════════════════════════════════════════════════════════════════
// USER TOKEN SERVICE
// Privy-only implementation using Prisma for data storage
// Delegated signing via Privy API (no private keys stored)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface UserTokenConfig {
  id: string
  user_token_id: string
  flywheel_active: boolean
  market_making_enabled: boolean
  auto_claim_enabled: boolean
  fee_threshold_sol: number
  slippage_bps: number
  // Trading route: 'bags' (bonding curve), 'jupiter' (graduated), 'auto' (detect)
  trading_route: 'bags' | 'jupiter' | 'auto'
  updated_at: string

  // Algorithm mode selection
  algorithm_mode?: 'simple' | 'turbo_lite' | 'rebalance' | 'twap_vwap' | 'dynamic'

  // Percentage-based trading: 20% of current balance per trade
  buy_percent: number   // % of SOL balance to use for buys (default 20)
  sell_percent: number  // % of token balance to use for sells (default 20)

  // Turbo Lite mode configuration
  turbo_job_interval_seconds?: number      // Job interval in seconds (default 15)
  turbo_cycle_size_buys?: number           // Number of buys per cycle (default 8)
  turbo_cycle_size_sells?: number          // Number of sells per cycle (default 8)
  turbo_inter_token_delay_ms?: number      // Delay between tokens in ms (default 200)
  turbo_global_rate_limit?: number         // Max trades per minute (default 60)
  turbo_confirmation_timeout?: number      // Confirmation timeout in seconds (default 45)
  turbo_batch_state_updates?: boolean      // Batch DB writes every 3 trades (default true)
}

export interface UserFlywheelState {
  id: string
  user_token_id: string
  cycle_phase: 'buy' | 'sell'
  buy_count: number
  sell_count: number
  last_trade_at: string | null
  // Failure tracking
  consecutive_failures: number
  last_failure_reason: string | null
  last_failure_at: string | null
  paused_until: string | null
  total_failures: number
  last_checked_at: string | null
  last_check_result: string | null
  updated_at: string
}

/**
 * Privy token with config and wallet info
 */
export interface PrivyTokenWithConfig {
  id: string
  privy_user_id: string
  token_mint_address: string
  token_symbol: string
  token_name: string | null
  token_image: string | null
  token_decimals: number
  is_active: boolean
  is_graduated: boolean
  created_at: string
  updated_at: string
  // Joined wallet addresses
  dev_wallet: { id: string; wallet_address: string }
  ops_wallet: { id: string; wallet_address: string }
  // Joined config
  privy_token_config: UserTokenConfig
  // Joined flywheel state (optional)
  privy_flywheel_state?: UserFlywheelState
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map Prisma token result to PrivyTokenWithConfig interface
 */
function mapPrismaTokenToPrivyTokenWithConfig(token: any): PrivyTokenWithConfig {
  return {
    id: token.id,
    privy_user_id: token.privyUserId,
    token_mint_address: token.tokenMintAddress,
    token_symbol: token.tokenSymbol,
    token_name: token.tokenName,
    token_image: token.tokenImage,
    token_decimals: token.tokenDecimals,
    is_active: token.isActive,
    is_graduated: token.isGraduated,
    created_at: token.createdAt.toISOString(),
    updated_at: token.updatedAt.toISOString(),
    dev_wallet: {
      id: token.devWallet.id,
      wallet_address: token.devWallet.walletAddress,
    },
    ops_wallet: {
      id: token.opsWallet.id,
      wallet_address: token.opsWallet.walletAddress,
    },
    privy_token_config: token.config ? {
      id: token.config.id,
      user_token_id: token.config.privyTokenId,
      flywheel_active: token.config.flywheelActive,
      market_making_enabled: token.config.marketMakingEnabled,
      auto_claim_enabled: token.config.autoClaimEnabled,
      fee_threshold_sol: Number(token.config.feeThresholdSol),
      slippage_bps: token.config.slippageBps,
      trading_route: token.config.tradingRoute as 'bags' | 'jupiter' | 'auto',
      updated_at: token.config.updatedAt.toISOString(),
      buy_percent: token.config.buyPercent ?? 20,
      sell_percent: token.config.sellPercent ?? 20,

      // Algorithm mode (CRITICAL - missing this causes turbo mode to fail)
      algorithm_mode: token.config.algorithmMode as any,

      // Turbo mode configuration fields
      turbo_job_interval_seconds: token.config.turboJobIntervalSeconds ?? undefined,
      turbo_cycle_size_buys: token.config.turboCycleSizeBuys ?? undefined,
      turbo_cycle_size_sells: token.config.turboCycleSizeSells ?? undefined,
      turbo_inter_token_delay_ms: token.config.turboInterTokenDelayMs ?? undefined,
      turbo_global_rate_limit: token.config.turboGlobalRateLimit ?? undefined,
      turbo_confirmation_timeout: token.config.turboConfirmationTimeout ?? undefined,
      turbo_batch_state_updates: token.config.turboBatchStateUpdates ?? undefined,
    } : undefined as any,
    privy_flywheel_state: token.flywheelState ? {
      id: token.flywheelState.id,
      user_token_id: token.flywheelState.privyTokenId,
      cycle_phase: token.flywheelState.cyclePhase as 'buy' | 'sell',
      buy_count: token.flywheelState.buyCount,
      sell_count: token.flywheelState.sellCount,
      last_trade_at: token.flywheelState.lastTradeAt?.toISOString() || null,
      consecutive_failures: token.flywheelState.consecutiveFailures,
      last_failure_reason: token.flywheelState.lastFailureReason,
      last_failure_at: token.flywheelState.lastFailureAt?.toISOString() || null,
      paused_until: token.flywheelState.pausedUntil?.toISOString() || null,
      total_failures: token.flywheelState.totalFailures,
      last_checked_at: token.flywheelState.lastCheckedAt?.toISOString() || null,
      last_check_result: token.flywheelState.lastCheckResult,
      updated_at: token.flywheelState.updatedAt.toISOString(),
    } : undefined,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIVY TOKEN METHODS
// Uses Prisma for data storage and Privy for delegated signing
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get active Privy tokens with flywheel enabled
 */
export async function getPrivyTokensForFlywheel(): Promise<PrivyTokenWithConfig[]> {
  if (!isPrismaConfigured()) {
    return []
  }

  try {
    const tokens = await prisma.privyUserToken.findMany({
      where: {
        isActive: true,
        config: {
          flywheelActive: true,
        },
      },
      include: {
        devWallet: true,
        opsWallet: true,
        config: true,
        flywheelState: true,
      },
    })

    return tokens.map(mapPrismaTokenToPrivyTokenWithConfig)
  } catch (error) {
    loggers.user.error({ error: String(error) }, 'Failed to get Privy tokens for flywheel')
    return []
  }
}

/**
 * Get active Privy tokens with auto-claim enabled
 */
export async function getPrivyTokensForAutoClaim(): Promise<PrivyTokenWithConfig[]> {
  if (!isPrismaConfigured()) {
    return []
  }

  try {
    const tokens = await prisma.privyUserToken.findMany({
      where: {
        isActive: true,
        config: {
          autoClaimEnabled: true,
        },
      },
      include: {
        devWallet: true,
        opsWallet: true,
        config: true,
      },
    })

    return tokens.map(mapPrismaTokenToPrivyTokenWithConfig)
  } catch (error) {
    loggers.user.error({ error: String(error) }, 'Failed to get Privy tokens for auto-claim')
    return []
  }
}

/**
 * Get dev wallet address for a Privy token
 * No decryption needed - just fetches the public address
 */
export async function getPrivyDevWalletAddress(privyTokenId: string): Promise<string | null> {
  if (!isPrismaConfigured()) {
    return null
  }

  try {
    const token = await prisma.privyUserToken.findUnique({
      where: { id: privyTokenId },
      include: { devWallet: true },
    })

    if (!token) {
      return null
    }

    return token.devWallet.walletAddress
  } catch (error) {
    loggers.user.error({ error: String(error), privyTokenId }, 'Failed to get Privy dev wallet address')
    return null
  }
}

/**
 * Get ops wallet address for a Privy token
 * No decryption needed - just fetches the public address
 */
export async function getPrivyOpsWalletAddress(privyTokenId: string): Promise<string | null> {
  if (!isPrismaConfigured()) {
    return null
  }

  try {
    const token = await prisma.privyUserToken.findUnique({
      where: { id: privyTokenId },
      include: { opsWallet: true },
    })

    if (!token) {
      return null
    }

    return token.opsWallet.walletAddress
  } catch (error) {
    loggers.user.error({ error: String(error), privyTokenId }, 'Failed to get Privy ops wallet address')
    return null
  }
}

/**
 * Get flywheel state for a Privy token
 */
export async function getPrivyFlywheelState(privyTokenId: string): Promise<UserFlywheelState | null> {
  if (!isPrismaConfigured()) {
    return null
  }

  try {
    const state = await prisma.privyFlywheelState.findUnique({
      where: { privyTokenId },
    })

    if (!state) {
      return null
    }

    // Map Prisma model to simplified UserFlywheelState interface
    return {
      id: state.id,
      user_token_id: state.privyTokenId,
      cycle_phase: state.cyclePhase as 'buy' | 'sell',
      buy_count: state.buyCount,
      sell_count: state.sellCount,
      last_trade_at: state.lastTradeAt?.toISOString() || null,
      consecutive_failures: state.consecutiveFailures,
      last_failure_reason: state.lastFailureReason,
      last_failure_at: state.lastFailureAt?.toISOString() || null,
      paused_until: state.pausedUntil?.toISOString() || null,
      total_failures: state.totalFailures,
      last_checked_at: state.lastCheckedAt?.toISOString() || null,
      last_check_result: state.lastCheckResult || null,
      updated_at: state.updatedAt.toISOString(),
    }
  } catch (error) {
    loggers.user.error({ error: String(error), privyTokenId }, 'Failed to get Privy flywheel state')
    return null
  }
}

/**
 * Update flywheel state for a Privy token
 */
export async function updatePrivyFlywheelState(
  privyTokenId: string,
  updates: Partial<Omit<UserFlywheelState, 'id' | 'user_token_id' | 'updated_at'>>
): Promise<boolean> {
  if (!isPrismaConfigured()) {
    return false
  }

  try {
    // Map snake_case interface fields to camelCase Prisma fields
    const prismaUpdates: any = {}

    if (updates.cycle_phase !== undefined) prismaUpdates.cyclePhase = updates.cycle_phase
    if (updates.buy_count !== undefined) prismaUpdates.buyCount = updates.buy_count
    if (updates.sell_count !== undefined) prismaUpdates.sellCount = updates.sell_count
    if (updates.last_trade_at !== undefined) prismaUpdates.lastTradeAt = updates.last_trade_at ? new Date(updates.last_trade_at) : null
    if (updates.consecutive_failures !== undefined) prismaUpdates.consecutiveFailures = updates.consecutive_failures
    if (updates.last_failure_reason !== undefined) prismaUpdates.lastFailureReason = updates.last_failure_reason
    if (updates.last_failure_at !== undefined) prismaUpdates.lastFailureAt = updates.last_failure_at ? new Date(updates.last_failure_at) : null
    if (updates.paused_until !== undefined) prismaUpdates.pausedUntil = updates.paused_until ? new Date(updates.paused_until) : null
    if (updates.total_failures !== undefined) prismaUpdates.totalFailures = updates.total_failures

    await prisma.privyFlywheelState.update({
      where: { privyTokenId },
      data: prismaUpdates,
    })

    return true
  } catch (error) {
    loggers.user.error({ error: String(error), privyTokenId }, 'Failed to update Privy flywheel state')
    return false
  }
}

/**
 * Get token config for a Privy token
 */
export async function getPrivyTokenConfig(privyTokenId: string): Promise<UserTokenConfig | null> {
  if (!isPrismaConfigured()) {
    return null
  }

  try {
    const config = await prisma.privyTokenConfig.findUnique({
      where: { privyTokenId },
    })

    if (!config) {
      return null
    }

    return {
      id: config.id,
      user_token_id: config.privyTokenId,
      flywheel_active: config.flywheelActive,
      market_making_enabled: config.marketMakingEnabled,
      auto_claim_enabled: config.autoClaimEnabled,
      fee_threshold_sol: Number(config.feeThresholdSol),
      slippage_bps: config.slippageBps,
      trading_route: config.tradingRoute as 'bags' | 'jupiter' | 'auto',
      updated_at: config.updatedAt.toISOString(),
      buy_percent: config.buyPercent ?? 20,
      sell_percent: config.sellPercent ?? 20,

      // Algorithm mode
      algorithm_mode: config.algorithmMode as any,

      // Turbo mode configuration fields
      turbo_job_interval_seconds: config.turboJobIntervalSeconds ?? undefined,
      turbo_cycle_size_buys: config.turboCycleSizeBuys ?? undefined,
      turbo_cycle_size_sells: config.turboCycleSizeSells ?? undefined,
      turbo_inter_token_delay_ms: config.turboInterTokenDelayMs ?? undefined,
      turbo_global_rate_limit: config.turboGlobalRateLimit ?? undefined,
      turbo_confirmation_timeout: config.turboConfirmationTimeout ?? undefined,
      turbo_batch_state_updates: config.turboBatchStateUpdates ?? undefined,
    }
  } catch (error) {
    loggers.user.error({ error: String(error), privyTokenId }, 'Failed to get Privy token config')
    return null
  }
}

/**
 * Update token config for a Privy token
 */
export async function updatePrivyTokenConfig(
  privyTokenId: string,
  updates: Partial<Omit<UserTokenConfig, 'id' | 'user_token_id' | 'updated_at'>>
): Promise<UserTokenConfig | null> {
  if (!isPrismaConfigured()) {
    return null
  }

  try {
    // Map snake_case interface fields to camelCase Prisma fields
    const prismaUpdates: any = {}

    if (updates.flywheel_active !== undefined) prismaUpdates.flywheelActive = updates.flywheel_active
    if (updates.market_making_enabled !== undefined) prismaUpdates.marketMakingEnabled = updates.market_making_enabled
    if (updates.auto_claim_enabled !== undefined) prismaUpdates.autoClaimEnabled = updates.auto_claim_enabled
    if (updates.fee_threshold_sol !== undefined) prismaUpdates.feeThresholdSol = updates.fee_threshold_sol
    if (updates.slippage_bps !== undefined) prismaUpdates.slippageBps = updates.slippage_bps
    if (updates.trading_route !== undefined) prismaUpdates.tradingRoute = updates.trading_route
    if (updates.buy_percent !== undefined) prismaUpdates.buyPercent = updates.buy_percent
    if (updates.sell_percent !== undefined) prismaUpdates.sellPercent = updates.sell_percent

    // Algorithm mode
    if (updates.algorithm_mode !== undefined) prismaUpdates.algorithmMode = updates.algorithm_mode

    // Turbo mode configuration fields
    if (updates.turbo_job_interval_seconds !== undefined) prismaUpdates.turboJobIntervalSeconds = updates.turbo_job_interval_seconds
    if (updates.turbo_cycle_size_buys !== undefined) prismaUpdates.turboCycleSizeBuys = updates.turbo_cycle_size_buys
    if (updates.turbo_cycle_size_sells !== undefined) prismaUpdates.turboCycleSizeSells = updates.turbo_cycle_size_sells
    if (updates.turbo_inter_token_delay_ms !== undefined) prismaUpdates.turboInterTokenDelayMs = updates.turbo_inter_token_delay_ms
    if (updates.turbo_global_rate_limit !== undefined) prismaUpdates.turboGlobalRateLimit = updates.turbo_global_rate_limit
    if (updates.turbo_confirmation_timeout !== undefined) prismaUpdates.turboConfirmationTimeout = updates.turbo_confirmation_timeout
    if (updates.turbo_batch_state_updates !== undefined) prismaUpdates.turboBatchStateUpdates = updates.turbo_batch_state_updates

    const config = await prisma.privyTokenConfig.update({
      where: { privyTokenId },
      data: prismaUpdates,
    })

    return {
      id: config.id,
      user_token_id: config.privyTokenId,
      flywheel_active: config.flywheelActive,
      market_making_enabled: config.marketMakingEnabled,
      auto_claim_enabled: config.autoClaimEnabled,
      fee_threshold_sol: Number(config.feeThresholdSol),
      slippage_bps: config.slippageBps,
      trading_route: config.tradingRoute as 'bags' | 'jupiter' | 'auto',
      updated_at: config.updatedAt.toISOString(),
      buy_percent: config.buyPercent ?? 20,
      sell_percent: config.sellPercent ?? 20,

      // Algorithm mode
      algorithm_mode: config.algorithmMode as any,

      // Turbo mode configuration fields
      turbo_job_interval_seconds: config.turboJobIntervalSeconds ?? undefined,
      turbo_cycle_size_buys: config.turboCycleSizeBuys ?? undefined,
      turbo_cycle_size_sells: config.turboCycleSizeSells ?? undefined,
      turbo_inter_token_delay_ms: config.turboInterTokenDelayMs ?? undefined,
      turbo_global_rate_limit: config.turboGlobalRateLimit ?? undefined,
      turbo_confirmation_timeout: config.turboConfirmationTimeout ?? undefined,
      turbo_batch_state_updates: config.turboBatchStateUpdates ?? undefined,
    }
  } catch (error) {
    loggers.user.error({ error: String(error), privyTokenId }, 'Failed to update Privy token config')
    return null
  }
}

/**
 * Get a specific Privy token by ID with all related data
 */
export async function getPrivyToken(privyTokenId: string): Promise<PrivyTokenWithConfig | null> {
  if (!isPrismaConfigured()) {
    return null
  }

  try {
    const token = await prisma.privyUserToken.findUnique({
      where: { id: privyTokenId },
      include: {
        devWallet: true,
        opsWallet: true,
        config: true,
        flywheelState: true,
      },
    })

    if (!token) {
      return null
    }

    return mapPrismaTokenToPrivyTokenWithConfig(token)
  } catch (error) {
    loggers.user.error({ error: String(error), privyTokenId }, 'Failed to get Privy token')
    return null
  }
}

/**
 * Get all Privy tokens for a user
 */
export async function getPrivyUserTokens(privyUserId: string): Promise<PrivyTokenWithConfig[]> {
  if (!isPrismaConfigured()) {
    return []
  }

  try {
    const tokens = await prisma.privyUserToken.findMany({
      where: { privyUserId },
      include: {
        devWallet: true,
        opsWallet: true,
        config: true,
        flywheelState: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return tokens.map(mapPrismaTokenToPrivyTokenWithConfig)
  } catch (error) {
    loggers.user.error({ error: String(error), privyUserId }, 'Failed to get Privy user tokens')
    return []
  }
}
