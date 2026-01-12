import { prisma, isPrismaConfigured } from '../config/prisma'
import { createLogger } from '../utils/logger'

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM CONFIG SERVICE
// Handles platform-level settings (replaces Supabase config table)
// Uses Prisma for database operations (Render Postgres)
// ═══════════════════════════════════════════════════════════════════════════

const logger = createLogger('platform-config')

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Platform configuration interface
 * Matches the PlatformConfig Prisma model from migration plan
 */
export interface PlatformConfig {
  id: string

  // Token settings
  tokenMintAddress: string
  tokenSymbol: string
  tokenDecimals: number

  // Feature flags
  flywheelActive: boolean
  marketMakingEnabled: boolean
  feeCollectionEnabled: boolean

  // Fee settings
  feeThresholdSol: number
  feePercentage: number
  platformFeePercentage: number

  // WHEEL trading limits
  wheelMinBuySol: number
  wheelMaxBuySol: number
  wheelMinSellSol: number
  wheelMaxSellSol: number

  // Trading settings
  minBuyAmountSol: number
  maxBuyAmountSol: number
  buyIntervalMinutes: number
  slippageBps: number

  // Job settings
  fastClaimIntervalSeconds: number
  fastClaimEnabled: boolean
  flywheelJobEnabled: boolean

  updatedAt: Date
}

export interface WheelTradingLimits {
  minBuy: number
  maxBuy: number
  minSell: number
  maxSell: number
}

export interface FeeSettings {
  feeThresholdSol: number
  platformFeePercentage: number
}

export interface JobSettings {
  fastClaimIntervalSeconds: number
  fastClaimEnabled: boolean
  flywheelJobEnabled: boolean
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIG
// Used when no config exists or during migration
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: Omit<PlatformConfig, 'updatedAt'> = {
  id: 'main',

  // Token settings
  tokenMintAddress: process.env.TOKEN_MINT_ADDRESS || '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS',
  tokenSymbol: 'WHEEL',
  tokenDecimals: 6,

  // Feature flags
  flywheelActive: true,
  marketMakingEnabled: true,
  feeCollectionEnabled: true,

  // Fee settings
  feeThresholdSol: 0.1,
  feePercentage: 100,
  platformFeePercentage: 10,

  // WHEEL trading limits
  wheelMinBuySol: 0.01,
  wheelMaxBuySol: 0.1,
  wheelMinSellSol: 0.01,
  wheelMaxSellSol: 0.1,

  // Trading settings
  minBuyAmountSol: 0.01,
  maxBuyAmountSol: 0.1,
  buyIntervalMinutes: 5,
  slippageBps: 300,

  // Job settings
  fastClaimIntervalSeconds: 30,
  fastClaimEnabled: true,
  flywheelJobEnabled: true,
}

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM CONFIG SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class PlatformConfigService {
  private cachedConfig: PlatformConfig | null = null
  private cacheExpiry: number = 0
  private readonly CACHE_TTL_MS = 60 * 1000 // 1 minute cache

  /**
   * Check if the PlatformConfig table exists in the database
   * Used during migration to handle graceful fallback
   */
  private async tableExists(): Promise<boolean> {
    if (!isPrismaConfigured()) {
      return false
    }

    try {
      // Try to query the table - if it doesn't exist, this will throw
      await (prisma as any).platformConfig.findUnique({
        where: { id: 'main' },
      })
      return true
    } catch (error: any) {
      // Check for "table does not exist" or similar error
      const errorStr = String(error)
      if (
        errorStr.includes('does not exist') ||
        errorStr.includes('relation') ||
        errorStr.includes('P2021') // Prisma error code for table not found
      ) {
        logger.debug('PlatformConfig table does not exist yet')
        return false
      }
      // Re-throw unexpected errors
      throw error
    }
  }

  /**
   * Get platform configuration
   * Creates default config if it doesn't exist
   * Falls back to defaults if table doesn't exist yet (during migration)
   */
  async getConfig(): Promise<PlatformConfig> {
    // Return cached config if still valid
    if (this.cachedConfig && Date.now() < this.cacheExpiry) {
      return this.cachedConfig
    }

    if (!isPrismaConfigured()) {
      logger.warn('Prisma not configured, using default config')
      return { ...DEFAULT_CONFIG, updatedAt: new Date() }
    }

    try {
      // Check if table exists (handles migration gracefully)
      const exists = await this.tableExists()
      if (!exists) {
        logger.info('PlatformConfig table not yet created, using defaults')
        return { ...DEFAULT_CONFIG, updatedAt: new Date() }
      }

      // Try to get existing config
      const config = await (prisma as any).platformConfig.findUnique({
        where: { id: 'main' },
      })

      if (config) {
        // Convert Decimal types to numbers for easier use
        const normalized = this.normalizeConfig(config)
        this.cachedConfig = normalized
        this.cacheExpiry = Date.now() + this.CACHE_TTL_MS
        return normalized
      }

      // Create default config if none exists
      logger.info('Creating default platform config')
      const created = await (prisma as any).platformConfig.create({
        data: DEFAULT_CONFIG,
      })

      const normalized = this.normalizeConfig(created)
      this.cachedConfig = normalized
      this.cacheExpiry = Date.now() + this.CACHE_TTL_MS
      return normalized
    } catch (error) {
      logger.error({ error: String(error) }, 'Failed to get platform config, using defaults')
      return { ...DEFAULT_CONFIG, updatedAt: new Date() }
    }
  }

  /**
   * Update platform configuration
   */
  async updateConfig(updates: Partial<PlatformConfig>): Promise<PlatformConfig> {
    if (!isPrismaConfigured()) {
      logger.error('Prisma not configured')
      throw new Error('Database not configured')
    }

    try {
      // Check if table exists
      const exists = await this.tableExists()
      if (!exists) {
        throw new Error('PlatformConfig table not yet created. Run database migration first.')
      }

      // Remove id and updatedAt from updates (these are managed by the database)
      const { id, updatedAt, ...validUpdates } = updates

      // Ensure config exists first
      await this.getConfig()

      const updated = await (prisma as any).platformConfig.update({
        where: { id: 'main' },
        data: validUpdates,
      })

      const normalized = this.normalizeConfig(updated)

      // Invalidate cache
      this.cachedConfig = normalized
      this.cacheExpiry = Date.now() + this.CACHE_TTL_MS

      logger.info({ updates: validUpdates }, 'Updated platform config')
      return normalized
    } catch (error) {
      logger.error({ error: String(error), updates }, 'Failed to update platform config')
      throw error
    }
  }

  /**
   * Get WHEEL trading limits
   */
  async getWheelTradingLimits(): Promise<WheelTradingLimits> {
    const config = await this.getConfig()
    return {
      minBuy: config.wheelMinBuySol,
      maxBuy: config.wheelMaxBuySol,
      minSell: config.wheelMinSellSol,
      maxSell: config.wheelMaxSellSol,
    }
  }

  /**
   * Get fee settings
   */
  async getFeeSettings(): Promise<FeeSettings> {
    const config = await this.getConfig()
    return {
      feeThresholdSol: config.feeThresholdSol,
      platformFeePercentage: config.platformFeePercentage,
    }
  }

  /**
   * Get job settings
   */
  async getJobSettings(): Promise<JobSettings> {
    const config = await this.getConfig()
    return {
      fastClaimIntervalSeconds: config.fastClaimIntervalSeconds,
      fastClaimEnabled: config.fastClaimEnabled,
      flywheelJobEnabled: config.flywheelJobEnabled,
    }
  }

  /**
   * Invalidate cached config (call after external updates)
   */
  invalidateCache(): void {
    this.cachedConfig = null
    this.cacheExpiry = 0
    logger.debug('Platform config cache invalidated')
  }

  /**
   * Normalize config from Prisma (convert Decimals to numbers)
   */
  private normalizeConfig(config: any): PlatformConfig {
    return {
      id: config.id,
      tokenMintAddress: config.tokenMintAddress,
      tokenSymbol: config.tokenSymbol,
      tokenDecimals: config.tokenDecimals,
      flywheelActive: config.flywheelActive,
      marketMakingEnabled: config.marketMakingEnabled,
      feeCollectionEnabled: config.feeCollectionEnabled,
      feeThresholdSol: this.toNumber(config.feeThresholdSol),
      feePercentage: config.feePercentage,
      platformFeePercentage: config.platformFeePercentage,
      wheelMinBuySol: this.toNumber(config.wheelMinBuySol),
      wheelMaxBuySol: this.toNumber(config.wheelMaxBuySol),
      wheelMinSellSol: this.toNumber(config.wheelMinSellSol),
      wheelMaxSellSol: this.toNumber(config.wheelMaxSellSol),
      minBuyAmountSol: this.toNumber(config.minBuyAmountSol),
      maxBuyAmountSol: this.toNumber(config.maxBuyAmountSol),
      buyIntervalMinutes: config.buyIntervalMinutes,
      slippageBps: config.slippageBps,
      fastClaimIntervalSeconds: config.fastClaimIntervalSeconds,
      fastClaimEnabled: config.fastClaimEnabled,
      flywheelJobEnabled: config.flywheelJobEnabled,
      updatedAt: config.updatedAt,
    }
  }

  /**
   * Convert Prisma Decimal to number
   */
  private toNumber(value: any): number {
    if (value === null || value === undefined) {
      return 0
    }
    if (typeof value === 'number') {
      return value
    }
    // Handle Prisma Decimal type
    if (typeof value.toNumber === 'function') {
      return value.toNumber()
    }
    return parseFloat(String(value))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const platformConfigService = new PlatformConfigService()
