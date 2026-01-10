/**
 * Admin API Client with AbortController Support
 * Provides cancellable requests and consistent error handling
 */

import type {
  ApiResponse,
  PlatformStats,
  SystemStatus,
  UserToken,
  TelegramLaunch,
  TelegramLaunchStats,
  LogEntry,
  AuditLogEntry,
  Transaction,
  WalletBalance,
  FeeStats,
  BotHealth,
  RefundPreview,
  RefundResult,
  TokenFilters,
  LogFilters,
} from '../_types/admin.types'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

// Request state tracking for deduplication
const pendingRequests = new Map<string, AbortController>()

/**
 * Cancel any existing request with the same key and create new controller
 */
function getAbortController(requestKey: string): AbortController {
  // Cancel existing request if any
  const existing = pendingRequests.get(requestKey)
  if (existing) {
    existing.abort()
  }

  // Create and track new controller
  const controller = new AbortController()
  pendingRequests.set(requestKey, controller)
  return controller
}

/**
 * Clean up completed request
 */
function cleanupRequest(requestKey: string) {
  pendingRequests.delete(requestKey)
}

/**
 * Create admin authentication headers
 */
function createAdminHeaders(
  publicKey: string,
  signature: string,
  message: string
): HeadersInit {
  const encodedMessage = btoa(unescape(encodeURIComponent(message)))
  return {
    'Content-Type': 'application/json',
    'x-wallet-pubkey': publicKey,
    'x-wallet-signature': signature,
    'x-wallet-message': encodedMessage,
    'x-message-encoding': 'base64',
  }
}

/**
 * Base fetch with error handling and abort support
 */
async function adminFetch<T>(
  url: string,
  options: RequestInit & { requestKey?: string } = {}
): Promise<ApiResponse<T>> {
  const { requestKey, ...fetchOptions } = options

  try {
    const response = await fetch(url, fetchOptions)
    const json = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: json.error || `HTTP ${response.status}`,
      }
    }

    return {
      success: true,
      data: json.data ?? json,
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Request cancelled' }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  } finally {
    if (requestKey) {
      cleanupRequest(requestKey)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchAdminAuthNonce(): Promise<{
  message: string
  timestamp: number
  nonce: string
} | null> {
  const result = await adminFetch<{ message: string; timestamp: number; nonce: string }>(
    `${API_BASE_URL}/api/admin/auth/nonce`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } }
  )
  return result.success ? result.data ?? null : null
}

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM STATUS
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchPlatformStats(
  publicKey: string,
  signature: string,
  message: string,
  signal?: AbortSignal
): Promise<PlatformStats | null> {
  const requestKey = 'platformStats'
  const controller = signal ? undefined : getAbortController(requestKey)

  const result = await adminFetch<PlatformStats>(
    `${API_BASE_URL}/api/admin/platform-stats`,
    {
      headers: createAdminHeaders(publicKey, signature, message),
      signal: signal ?? controller?.signal,
      requestKey,
    }
  )
  return result.success ? result.data ?? null : null
}

interface SystemStatusApiResponse {
  checks: Array<{
    name: string
    status: 'connected' | 'disconnected' | 'not_configured'
    message: string
    latency?: number
  }>
  environment: {
    nodeEnv: string
    port: number
    solanaRpcUrl: string
    jupiterApiUrl: string
    marketMakingEnabled: boolean
    minFeeThresholdSol: number
    maxBuyAmountSol: number
  }
  uptime: number
  memory: {
    heapUsed: number
    heapTotal: number
  }
}

export async function fetchSystemStatus(signal?: AbortSignal): Promise<SystemStatus | null> {
  const requestKey = 'systemStatus'
  const controller = signal ? undefined : getAbortController(requestKey)

  const result = await adminFetch<SystemStatusApiResponse>(
    `${API_BASE_URL}/api/status/system`,
    { signal: signal ?? controller?.signal, requestKey }
  )

  if (!result.success || !result.data) return null

  // Transform API response to match SystemStatus type
  const data = result.data
  const supabaseCheck = data.checks.find(c => c.name === 'Supabase')
  const rpcCheck = data.checks.find(c => c.name === 'Solana RPC')

  return {
    rpcConnection: rpcCheck?.status === 'connected',
    databaseConnection: supabaseCheck?.status === 'connected',
    memoryUsage: data.memory ? {
      heapUsed: data.memory.heapUsed * 1024 * 1024, // Convert MB back to bytes
      heapTotal: data.memory.heapTotal * 1024 * 1024,
      percentage: (data.memory.heapUsed / data.memory.heapTotal) * 100,
    } : undefined,
    uptime: data.uptime,
    environment: data.environment,
    version: '1.0.0', // Backend doesn't return version, use default
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKENS
// ═══════════════════════════════════════════════════════════════════════════

export interface FetchTokensParams {
  status?: string
  source?: string
  riskLevel?: string
  flywheel?: string
  search?: string
  limit?: number
  offset?: number
}

export async function fetchAdminTokens(
  publicKey: string,
  signature: string,
  message: string,
  params?: FetchTokensParams,
  signal?: AbortSignal
): Promise<{ tokens: UserToken[]; total: number } | null> {
  const requestKey = `tokens-${JSON.stringify(params)}`
  const controller = signal ? undefined : getAbortController(requestKey)

  const searchParams = new URLSearchParams()
  if (params?.status && params.status !== 'all') searchParams.set('status', params.status)
  if (params?.source && params.source !== 'all') searchParams.set('source', params.source)
  if (params?.riskLevel && params.riskLevel !== 'all') searchParams.set('risk', params.riskLevel)
  if (params?.flywheel && params.flywheel !== 'all') searchParams.set('flywheel', params.flywheel)
  if (params?.search) searchParams.set('search', params.search)
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.offset) searchParams.set('offset', String(params.offset))

  const result = await adminFetch<{ tokens: UserToken[]; total: number }>(
    `${API_BASE_URL}/api/admin/tokens?${searchParams}`,
    {
      headers: createAdminHeaders(publicKey, signature, message),
      signal: signal ?? controller?.signal,
      requestKey,
    }
  )
  return result.success ? result.data ?? null : null
}

export async function fetchTokenDetail(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string,
  signal?: AbortSignal
): Promise<UserToken | null> {
  const requestKey = `token-${tokenId}`
  const controller = signal ? undefined : getAbortController(requestKey)

  const result = await adminFetch<UserToken>(
    `${API_BASE_URL}/api/admin/tokens/${tokenId}`,
    {
      headers: createAdminHeaders(publicKey, signature, message),
      signal: signal ?? controller?.signal,
      requestKey,
    }
  )
  return result.success ? result.data ?? null : null
}

export async function verifyToken(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string
): Promise<boolean> {
  const result = await adminFetch<{ verified: boolean }>(
    `${API_BASE_URL}/api/admin/tokens/${tokenId}/verify`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    }
  )
  return result.success
}

export async function suspendToken(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string,
  reason: string
): Promise<boolean> {
  const result = await adminFetch<{ suspended: boolean }>(
    `${API_BASE_URL}/api/admin/tokens/${tokenId}/suspend`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ reason }),
    }
  )
  return result.success
}

export async function unsuspendToken(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string
): Promise<boolean> {
  const result = await adminFetch<{ unsuspended: boolean }>(
    `${API_BASE_URL}/api/admin/tokens/${tokenId}/unsuspend`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    }
  )
  return result.success
}

export async function bulkSuspendTokens(
  publicKey: string,
  signature: string,
  message: string,
  reason: string
): Promise<{ suspended: number; skipped: number } | null> {
  const result = await adminFetch<{ suspendedCount: number; skippedCount: number }>(
    `${API_BASE_URL}/api/admin/tokens/suspend-all`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ reason }),
    }
  )
  return result.success && result.data
    ? { suspended: result.data.suspendedCount, skipped: result.data.skippedCount }
    : null
}

export async function bulkUnsuspendTokens(
  publicKey: string,
  signature: string,
  message: string
): Promise<{ unsuspended: number } | null> {
  const result = await adminFetch<{ unsuspendedCount: number }>(
    `${API_BASE_URL}/api/admin/tokens/unsuspend-all`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    }
  )
  return result.success && result.data ? { unsuspended: result.data.unsuspendedCount } : null
}

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM
// ═══════════════════════════════════════════════════════════════════════════

export interface FetchLaunchesParams {
  status?: string
  search?: string
  limit?: number
  offset?: number
}

export async function fetchTelegramStats(
  publicKey: string,
  signature: string,
  message: string,
  signal?: AbortSignal
): Promise<TelegramLaunchStats | null> {
  const requestKey = 'telegramStats'
  const controller = signal ? undefined : getAbortController(requestKey)

  const result = await adminFetch<TelegramLaunchStats>(
    `${API_BASE_URL}/api/admin/telegram/stats`,
    {
      headers: createAdminHeaders(publicKey, signature, message),
      signal: signal ?? controller?.signal,
      requestKey,
    }
  )
  return result.success ? result.data ?? null : null
}

export async function fetchTelegramLaunches(
  publicKey: string,
  signature: string,
  message: string,
  params?: FetchLaunchesParams,
  signal?: AbortSignal
): Promise<{ launches: TelegramLaunch[]; total: number } | null> {
  const requestKey = `telegramLaunches-${JSON.stringify(params)}`
  const controller = signal ? undefined : getAbortController(requestKey)

  const searchParams = new URLSearchParams()
  if (params?.status && params.status !== 'all') searchParams.set('status', params.status)
  if (params?.search) searchParams.set('search', params.search)
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.offset) searchParams.set('offset', String(params.offset))

  const result = await adminFetch<{ launches: TelegramLaunch[]; total: number }>(
    `${API_BASE_URL}/api/admin/telegram/launches/search?${searchParams}`,
    {
      headers: createAdminHeaders(publicKey, signature, message),
      signal: signal ?? controller?.signal,
      requestKey,
    }
  )
  return result.success ? result.data ?? null : null
}

export async function fetchBotHealth(
  publicKey: string,
  signature: string,
  message: string,
  signal?: AbortSignal
): Promise<BotHealth | null> {
  const requestKey = 'botHealth'
  const controller = signal ? undefined : getAbortController(requestKey)

  const result = await adminFetch<BotHealth>(
    `${API_BASE_URL}/api/admin/telegram/bot-health`,
    {
      headers: createAdminHeaders(publicKey, signature, message),
      signal: signal ?? controller?.signal,
      requestKey,
    }
  )
  return result.success ? result.data ?? null : null
}

export async function executeRefund(
  publicKey: string,
  signature: string,
  message: string,
  launchId: string,
  refundAddress: string
): Promise<RefundResult> {
  const result = await adminFetch<{ signature: string; amountRefunded: number }>(
    `${API_BASE_URL}/api/admin/telegram/refund/${launchId}`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ refundAddress }),
    }
  )

  if (result.success && result.data) {
    return {
      success: true,
      totalRefunded: result.data.amountRefunded,
      signatures: [result.data.signature],
    }
  }
  return { success: false, error: result.error }
}

export async function cancelLaunch(
  publicKey: string,
  signature: string,
  message: string,
  launchId: string,
  reason?: string
): Promise<boolean> {
  const result = await adminFetch<{ cancelled: boolean }>(
    `${API_BASE_URL}/api/admin/telegram/launch/${launchId}/cancel`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ reason }),
    }
  )
  return result.success
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGS
// ═══════════════════════════════════════════════════════════════════════════

export interface FetchLogsParams {
  source?: string
  level?: string
  from?: string
  to?: string
  search?: string
  limit?: number
  offset?: number
}

export async function fetchSystemLogs(
  limit: number = 100,
  signal?: AbortSignal
): Promise<LogEntry[]> {
  const requestKey = 'systemLogs'
  const controller = signal ? undefined : getAbortController(requestKey)

  const result = await adminFetch<LogEntry[]>(
    `${API_BASE_URL}/api/status/logs?limit=${limit}`,
    { signal: signal ?? controller?.signal, requestKey }
  )
  return result.success && result.data ? result.data : []
}

export async function fetchAuditLogs(
  publicKey: string,
  signature: string,
  message: string,
  params?: FetchLogsParams,
  signal?: AbortSignal
): Promise<{ logs: AuditLogEntry[]; total: number } | null> {
  const requestKey = `auditLogs-${JSON.stringify(params)}`
  const controller = signal ? undefined : getAbortController(requestKey)

  const searchParams = new URLSearchParams()
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.source && params.source !== 'all') searchParams.set('event_type', params.source)

  const result = await adminFetch<{ logs: AuditLogEntry[]; total: number }>(
    `${API_BASE_URL}/api/admin/telegram/logs?${searchParams}`,
    {
      headers: createAdminHeaders(publicKey, signature, message),
      signal: signal ?? controller?.signal,
      requestKey,
    }
  )
  return result.success ? result.data ?? null : null
}

// ═══════════════════════════════════════════════════════════════════════════
// JOBS
// ═══════════════════════════════════════════════════════════════════════════

export async function triggerFlywheelCycle(
  publicKey: string,
  signature: string,
  message: string,
  maxTrades?: number
): Promise<{ success: boolean; message?: string; error?: string }> {
  const result = await adminFetch<{ message: string }>(
    `${API_BASE_URL}/api/admin/flywheel/trigger`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ maxTrades }),
    }
  )
  return {
    success: result.success,
    message: result.data?.message,
    error: result.error,
  }
}

export async function triggerFastClaim(
  publicKey: string,
  signature: string,
  message: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const result = await adminFetch<{ message: string }>(
    `${API_BASE_URL}/api/admin/fast-claim/trigger`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    }
  )
  return {
    success: result.success,
    message: result.data?.message,
    error: result.error,
  }
}

export async function triggerBalanceUpdate(
  publicKey: string,
  signature: string,
  message: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const result = await adminFetch<{ message: string }>(
    `${API_BASE_URL}/api/admin/balance-update/trigger`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    }
  )
  return {
    success: result.success,
    message: result.data?.message,
    error: result.error,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REFUNDS
// ═══════════════════════════════════════════════════════════════════════════

export async function previewTokenRefund(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string,
  signal?: AbortSignal
): Promise<RefundPreview | null> {
  const requestKey = `refundPreview-${tokenId}`
  const controller = signal ? undefined : getAbortController(requestKey)

  const result = await adminFetch<RefundPreview>(
    `${API_BASE_URL}/api/admin/tokens/${tokenId}/refund-preview`,
    {
      headers: createAdminHeaders(publicKey, signature, message),
      signal: signal ?? controller?.signal,
      requestKey,
    }
  )
  return result.success ? result.data ?? null : null
}

export async function stopFlywheelAndRefund(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string,
  refundAddress?: string
): Promise<{
  success: boolean
  totalRefunded?: number
  flywheelStopped?: boolean
  error?: string
}> {
  const result = await adminFetch<{
    totalRefunded: number
    flywheelStopped: boolean
    refundExecuted: boolean
  }>(
    `${API_BASE_URL}/api/admin/tokens/${tokenId}/stop-and-refund`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ refundAddress }),
    }
  )

  if (result.success && result.data) {
    return {
      success: true,
      totalRefunded: result.data.totalRefunded,
      flywheelStopped: result.data.flywheelStopped,
    }
  }
  return { success: false, error: result.error }
}

// ═══════════════════════════════════════════════════════════════════════════
// ORPHANED LAUNCHES
// ═══════════════════════════════════════════════════════════════════════════

export async function migrateOrphanedLaunches(
  publicKey: string,
  signature: string,
  message: string
): Promise<{
  success: boolean
  migrated?: number
  failed?: number
  error?: string
}> {
  const result = await adminFetch<{ migrated: number; failed: number }>(
    `${API_BASE_URL}/api/admin/migrate-orphaned-launches`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    }
  )

  if (result.success && result.data) {
    return {
      success: true,
      migrated: result.data.migrated,
      failed: result.data.failed,
    }
  }
  return { success: false, error: result.error }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAINTENANCE & BROADCAST
// ═══════════════════════════════════════════════════════════════════════════

export async function enableMaintenanceMode(
  publicKey: string,
  signature: string,
  message: string,
  reason: string,
  estimatedEndTime?: string,
  notifyUsers: boolean = true
): Promise<{ success: boolean; notifiedUsers?: number; error?: string }> {
  const result = await adminFetch<{ notifiedUsers: number }>(
    `${API_BASE_URL}/api/admin/telegram/maintenance/enable`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ reason, estimatedEndTime, notifyUsers }),
    }
  )

  return {
    success: result.success,
    notifiedUsers: result.data?.notifiedUsers,
    error: result.error,
  }
}

export async function disableMaintenanceMode(
  publicKey: string,
  signature: string,
  message: string,
  notifyUsers: boolean = true
): Promise<{ success: boolean; notifiedUsers?: number; error?: string }> {
  const result = await adminFetch<{ notifiedUsers: number }>(
    `${API_BASE_URL}/api/admin/telegram/maintenance/disable`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ notifyUsers }),
    }
  )

  return {
    success: result.success,
    notifiedUsers: result.data?.notifiedUsers,
    error: result.error,
  }
}

export async function sendBroadcast(
  publicKey: string,
  signature: string,
  message: string,
  title: string,
  body: string
): Promise<{
  success: boolean
  total?: number
  successful?: number
  failed?: number
  error?: string
}> {
  const result = await adminFetch<{ total: number; successful: number; failed: number }>(
    `${API_BASE_URL}/api/admin/telegram/broadcast`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ title, body }),
    }
  )

  if (result.success && result.data) {
    return {
      success: true,
      total: result.data.total,
      successful: result.data.successful,
      failed: result.data.failed,
    }
  }
  return { success: false, error: result.error }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY: Cancel all pending requests
// ═══════════════════════════════════════════════════════════════════════════

export function cancelAllPendingRequests() {
  pendingRequests.forEach((controller) => {
    controller.abort()
  })
  pendingRequests.clear()
}

export function cancelRequest(requestKey: string) {
  const controller = pendingRequests.get(requestKey)
  if (controller) {
    controller.abort()
    pendingRequests.delete(requestKey)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WHEEL (PLATFORM TOKEN)
// ═══════════════════════════════════════════════════════════════════════════

export interface WheelData {
  tokenMint: string
  symbol: string
  tokenName: string
  tokenImage?: string
  devWallet: {
    address: string
    solBalance: number
    tokenBalance: number
  }
  opsWallet: {
    address: string
    solBalance: number
    tokenBalance: number
  }
  feeStats: {
    totalCollected: number
    todayCollected: number
    hourCollected: number
  }
  flywheelState: {
    phase: 'buy' | 'sell'
    buyCount: number
    sellCount: number
    lastTradeAt: string | null
  } | null
  config: {
    flywheelActive: boolean
    algorithmMode: string
    minBuySol: number
    maxBuySol: number
    slippageBps: number
  } | null
  marketData?: {
    marketCap: number
    volume24h: number
    isGraduated: boolean
    bondingCurveProgress: number
    holders: number
  }
  isActive: boolean
  createdAt: string
}

export async function fetchWheelData(
  publicKey: string,
  signature: string,
  message: string,
  signal?: AbortSignal
): Promise<WheelData | null> {
  const requestKey = 'wheelData'
  const controller = signal ? undefined : getAbortController(requestKey)

  const result = await adminFetch<WheelData>(
    `${API_BASE_URL}/api/admin/wheel`,
    {
      headers: createAdminHeaders(publicKey, signature, message),
      signal: signal ?? controller?.signal,
      requestKey,
    }
  )
  return result.success ? result.data ?? null : null
}

export async function executeWheelSell(
  publicKey: string,
  signature: string,
  message: string,
  percentage: number
): Promise<{ success: boolean; message?: string; error?: string }> {
  const result = await adminFetch<{ message: string }>(
    `${API_BASE_URL}/api/admin/wheel/sell`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ percentage }),
    }
  )
  return {
    success: result.success,
    message: result.data?.message,
    error: result.error,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

export interface PlatformSettings {
  claimJobIntervalMinutes: number
  flywheelIntervalMinutes: number
  maxTradesPerMinute: number
  claimJobEnabled: boolean
  flywheelJobEnabled: boolean
  fastClaimEnabled: boolean
  fastClaimIntervalSeconds: number
  // WHEEL trading configuration
  wheelMinBuySol: number
  wheelMaxBuySol: number
  wheelMinSellSol: number
  wheelMaxSellSol: number
}

export async function fetchPlatformSettings(
  publicKey: string,
  signature: string,
  message: string,
  signal?: AbortSignal
): Promise<PlatformSettings | null> {
  const requestKey = 'settings'
  const controller = signal ? undefined : getAbortController(requestKey)

  const result = await adminFetch<PlatformSettings>(
    `${API_BASE_URL}/api/admin/settings`,
    {
      headers: createAdminHeaders(publicKey, signature, message),
      signal: signal ?? controller?.signal,
      requestKey,
    }
  )
  return result.success ? result.data ?? null : null
}

export async function updatePlatformSettings(
  publicKey: string,
  signature: string,
  message: string,
  settings: Partial<PlatformSettings>
): Promise<{ success: boolean; message?: string; error?: string }> {
  const result = await adminFetch<{ message: string }>(
    `${API_BASE_URL}/api/admin/settings`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify(settings),
    }
  )
  return {
    success: result.success,
    message: result.data?.message,
    error: result.error,
  }
}

export async function emergencyStopAll(
  publicKey: string,
  signature: string,
  message: string,
  reason: string
): Promise<{ success: boolean; actions?: string[]; error?: string }> {
  const result = await adminFetch<{ actions: string[] }>(
    `${API_BASE_URL}/api/admin/emergency-stop`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ reason }),
    }
  )
  return {
    success: result.success,
    actions: result.data?.actions,
    error: result.error,
  }
}

export async function clearAllCaches(
  publicKey: string,
  signature: string,
  message: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const result = await adminFetch<{ message: string }>(
    `${API_BASE_URL}/api/admin/clear-caches`,
    {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    }
  )
  return {
    success: result.success,
    message: result.data?.message,
    error: result.error,
  }
}
