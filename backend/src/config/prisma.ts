// ═══════════════════════════════════════════════════════════════════════════
// PRISMA CLIENT
// Database client for Privy system (Render Postgres)
// Legacy WHEEL token uses Supabase (database.ts)
// ═══════════════════════════════════════════════════════════════════════════

import { PrismaClient } from '@prisma/client'
import { loggers } from '../utils/logger'

// Global prisma instance to prevent multiple connections in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create Prisma client with logging
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if Prisma database is configured
 */
export function isPrismaConfigured(): boolean {
  return !!process.env.PRIVY_DATABASE_URL
}

/**
 * Test database connection
 */
export async function testPrismaConnection(): Promise<boolean> {
  if (!isPrismaConfigured()) {
    loggers.privy.warn('Prisma database not configured (PRIVY_DATABASE_URL missing)')
    return false
  }

  try {
    await prisma.$queryRaw`SELECT 1`
    loggers.privy.info('Prisma database connection successful')
    return true
  } catch (error) {
    loggers.privy.error({ error: String(error) }, 'Prisma database connection failed')
    return false
  }
}

/**
 * Disconnect from database (call on shutdown)
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect()
  loggers.privy.info('Prisma database disconnected')
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// Re-export Prisma types for use in services
// ═══════════════════════════════════════════════════════════════════════════

export type {
  PrivyUser,
  PrivyWallet,
  PrivyUserToken,
  PrivyTokenConfig,
  PrivyFlywheelState,
  PrivyPendingLaunch,
  PrivyTransaction,
  PrivyClaimHistory,
} from '@prisma/client'

// ═══════════════════════════════════════════════════════════════════════════
// QUERY HELPERS
// Common query patterns for Privy system
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get user with all wallets
 */
export async function getUserWithWallets(privyUserId: string) {
  return prisma.privyUser.findUnique({
    where: { privyUserId },
    include: { wallets: true },
  })
}

/**
 * Get user's tokens with config and state
 */
export async function getUserTokens(privyUserId: string) {
  return prisma.privyUserToken.findMany({
    where: { privyUserId, isActive: true },
    include: {
      devWallet: true,
      opsWallet: true,
      config: true,
      flywheelState: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Get token by ID with all relations
 */
export async function getTokenById(tokenId: string) {
  return prisma.privyUserToken.findUnique({
    where: { id: tokenId },
    include: {
      devWallet: true,
      opsWallet: true,
      config: true,
      flywheelState: true,
    },
  })
}

/**
 * Get all active tokens with flywheel enabled (for flywheel job)
 */
export async function getActiveFlywheelTokens() {
  return prisma.privyUserToken.findMany({
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
}

/**
 * Get all active tokens with auto-claim enabled (for claim job)
 */
export async function getAutoClaimTokens() {
  return prisma.privyUserToken.findMany({
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
}

/**
 * Get pending launches awaiting deposit
 */
export async function getPendingLaunches() {
  return prisma.privyPendingLaunch.findMany({
    where: {
      status: 'awaiting_deposit',
      expiresAt: { gt: new Date() },
    },
    include: {
      user: true,
      devWallet: true,
      opsWallet: true,
    },
  })
}

/**
 * Record a transaction
 */
export async function recordTransaction(data: {
  privyTokenId: string
  type: string
  amount: number
  signature?: string
  status?: string
  message?: string
  tradingRoute?: string
}) {
  return prisma.privyTransaction.create({
    data: {
      privyTokenId: data.privyTokenId,
      type: data.type,
      amount: data.amount,
      signature: data.signature,
      status: data.status || 'confirmed',
      message: data.message,
      tradingRoute: data.tradingRoute,
    },
  })
}

/**
 * Record a claim
 */
export async function recordClaim(data: {
  privyTokenId: string
  amountSol: number
  platformFeeSol: number
  userReceivedSol: number
  signature?: string
  status?: string
}) {
  return prisma.privyClaimHistory.create({
    data: {
      privyTokenId: data.privyTokenId,
      amountSol: data.amountSol,
      totalAmountSol: data.amountSol,
      platformFeeSol: data.platformFeeSol,
      userReceivedSol: data.userReceivedSol,
      transactionSignature: data.signature,
      claimSignature: data.signature,
      status: data.status || 'completed',
      claimedAt: new Date(),
      completedAt: new Date(),
    },
  })
}

/**
 * Update flywheel state
 */
export async function updateFlywheelState(
  privyTokenId: string,
  updates: {
    cyclePhase?: string
    buyCount?: number
    sellCount?: number
    sellPhaseTokenSnapshot?: number
    sellAmountPerTx?: number
    lastTradeAt?: Date
    consecutiveFailures?: number
    lastFailureReason?: string
    lastFailureAt?: Date
    pausedUntil?: Date | null
    totalFailures?: number
    lastCheckedAt?: Date
    lastCheckResult?: string
  }
) {
  return prisma.privyFlywheelState.update({
    where: { privyTokenId },
    data: updates,
  })
}
