// ═══════════════════════════════════════════════════════════════════════════
// API CLIENT
// Fetch real data from the backend
// ═══════════════════════════════════════════════════════════════════════════

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export interface WalletBalance {
  wallet_type: 'dev' | 'ops'
  address: string
  sol_balance: number
  token_balance: number
  usd_value: number
  updated_at: Date
}

export interface FlywheelStatus {
  is_active: boolean
  last_fee_collection: Date | null
  last_market_making: Date | null
  dev_wallet_balance: number
  ops_wallet_balance: number
  total_fees_collected: number
}

export interface Transaction {
  id: string
  type: 'fee_collection' | 'transfer' | 'buy' | 'sell'
  amount: number
  token: string
  signature: string
  status: string
  created_at: Date
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  timestamp: string
}

// Fetch flywheel status
export async function fetchStatus(): Promise<FlywheelStatus | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status`)
    const json: ApiResponse<FlywheelStatus> = await response.json()
    if (json.success && json.data) {
      return json.data
    }
    return null
  } catch (error) {
    console.error('Failed to fetch status:', error)
    return null
  }
}

// Fetch wallet balances
export async function fetchWalletBalances(): Promise<{
  devWallet: WalletBalance | null
  opsWallet: WalletBalance | null
} | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status/wallets`)
    const json: ApiResponse<{ devWallet: WalletBalance | null; opsWallet: WalletBalance | null }> =
      await response.json()
    if (json.success && json.data) {
      return json.data
    }
    return null
  } catch (error) {
    console.error('Failed to fetch wallet balances:', error)
    return null
  }
}

// Fetch recent transactions
export async function fetchTransactions(limit: number = 20): Promise<Transaction[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status/transactions?limit=${limit}`)
    const json: ApiResponse<Transaction[]> = await response.json()
    if (json.success && json.data) {
      return json.data
    }
    return []
  } catch (error) {
    console.error('Failed to fetch transactions:', error)
    return []
  }
}

// Check backend health
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status/health`)
    const json: ApiResponse<{ status: string }> = await response.json()
    return json.success && json.data?.status === 'healthy'
  } catch (error) {
    console.error('Health check failed:', error)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN API (Requires wallet signature)
// ═══════════════════════════════════════════════════════════════════════════

export interface AdminConfig {
  token_mint_address?: string
  token_symbol?: string
  token_decimals?: number
  flywheel_active?: boolean
  market_making_enabled?: boolean
  fee_collection_enabled?: boolean
  ops_wallet_address?: string
  fee_threshold_sol?: number
  fee_percentage?: number
  min_buy_amount_sol?: number
  max_buy_amount_sol?: number
  buy_interval_minutes?: number
  slippage_bps?: number
  algorithm_mode?: 'simple' | 'smart' | 'rebalance'
  target_sol_allocation?: number
  target_token_allocation?: number
  rebalance_threshold?: number
  use_twap?: boolean
  twap_threshold_usd?: number
}

// Get a nonce message to sign for admin actions
// The config is included in the nonce request to generate a hash that binds the signature to the config
export async function fetchAdminNonce(config: AdminConfig): Promise<{
  message: string
  timestamp: number
  nonce: string
  configHash: string
} | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/nonce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config }),
    })

    if (!response.ok) {
      const json = await response.json()
      console.error('Failed to fetch admin nonce:', json.error)
      return null
    }

    const json = await response.json()
    return json
  } catch (error) {
    console.error('Failed to fetch admin nonce:', error)
    return null
  }
}

// Update config with signed message
export async function updateConfigWithSignature(
  message: string,
  signature: string,
  publicKey: string,
  config: AdminConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        signature,
        publicKey,
        config,
      }),
    })

    const json = await response.json()

    if (!response.ok) {
      return { success: false, error: json.error || 'Failed to update config' }
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to update config:', error)
    return { success: false, error: 'Network error' }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM STATUS API
// ═══════════════════════════════════════════════════════════════════════════

export interface SystemCheck {
  name: string
  status: 'connected' | 'disconnected' | 'not_configured'
  message: string
  latency?: number
}

export interface SystemStatus {
  checks: SystemCheck[]
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

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

// Fetch comprehensive system status
export async function fetchSystemStatus(): Promise<SystemStatus | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status/system`)
    const json: ApiResponse<SystemStatus> = await response.json()
    if (json.success && json.data) {
      return json.data
    }
    return null
  } catch (error) {
    console.error('Failed to fetch system status:', error)
    return null
  }
}

// Fetch backend logs
export async function fetchLogs(limit: number = 50): Promise<LogEntry[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/status/logs?limit=${limit}`)
    const json: ApiResponse<LogEntry[]> = await response.json()
    if (json.success && json.data) {
      return json.data
    }
    return []
  } catch (error) {
    console.error('Failed to fetch logs:', error)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BAGS.FM API
// ═══════════════════════════════════════════════════════════════════════════

export interface BagsTokenInfo {
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

export interface BagsLifetimeFees {
  tokenMint: string
  totalFeesCollected: number
  totalFeesCollectedUsd: number
  creatorFeesCollected: number
  creatorFeesCollectedUsd: number
  lastUpdated: string
}

export interface BagsClaimablePosition {
  tokenMint: string
  tokenSymbol: string
  claimableAmount: number
  claimableAmountUsd: number
  lastClaimTime: string | null
}

export interface BagsClaimStats {
  totalClaimed: number
  totalClaimedUsd: number
  pendingClaims: number
  pendingClaimsUsd: number
  lastClaimTime: string | null
}

export interface BagsDashboardData {
  tokenInfo: BagsTokenInfo | null
  lifetimeFees: BagsLifetimeFees | null
  claimablePositions: BagsClaimablePosition[]
  claimStats: BagsClaimStats | null
}

// Fetch token info from Bags.fm
export async function fetchBagsTokenInfo(tokenMint: string): Promise<BagsTokenInfo | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/bags/token/${tokenMint}`)
    const json: ApiResponse<BagsTokenInfo> = await response.json()
    if (json.success && json.data) {
      return json.data
    }
    return null
  } catch (error) {
    console.error('Failed to fetch Bags token info:', error)
    return null
  }
}

// Fetch lifetime fees from Bags.fm
export async function fetchBagsLifetimeFees(tokenMint: string): Promise<BagsLifetimeFees | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/bags/fees/${tokenMint}`)
    const json: ApiResponse<BagsLifetimeFees> = await response.json()
    if (json.success && json.data) {
      return json.data
    }
    return null
  } catch (error) {
    console.error('Failed to fetch Bags lifetime fees:', error)
    return null
  }
}

// Fetch claimable positions for a wallet
export async function fetchBagsClaimablePositions(wallet: string): Promise<BagsClaimablePosition[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/bags/claimable/${wallet}`)
    const json: ApiResponse<BagsClaimablePosition[]> = await response.json()
    if (json.success && json.data) {
      return json.data
    }
    return []
  } catch (error) {
    console.error('Failed to fetch Bags claimable positions:', error)
    return []
  }
}

// Fetch claim stats for a wallet
export async function fetchBagsClaimStats(wallet: string): Promise<BagsClaimStats | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/bags/claim-stats/${wallet}`)
    const json: ApiResponse<BagsClaimStats> = await response.json()
    if (json.success && json.data) {
      return json.data
    }
    return null
  } catch (error) {
    console.error('Failed to fetch Bags claim stats:', error)
    return null
  }
}

// Fetch comprehensive Bags.fm dashboard data
export async function fetchBagsDashboard(tokenMint?: string, wallet?: string): Promise<BagsDashboardData | null> {
  try {
    const params = new URLSearchParams()
    if (tokenMint) params.set('tokenMint', tokenMint)
    if (wallet) params.set('wallet', wallet)

    const response = await fetch(`${API_BASE_URL}/api/bags/dashboard?${params}`)
    const json: ApiResponse<BagsDashboardData> = await response.json()
    if (json.success && json.data) {
      return json.data
    }
    return null
  } catch (error) {
    console.error('Failed to fetch Bags dashboard:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MANUAL TRADING API
// ═══════════════════════════════════════════════════════════════════════════

export interface ManualSellResult {
  success: boolean
  message?: string
  transaction?: {
    signature: string
    amount: number
    token: string
  }
  error?: string
}

// Get a nonce message to sign for manual sell
export async function fetchManualSellNonce(percentage: number): Promise<{
  message: string
  timestamp: number
  nonce: string
  percentage: number
} | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/manual-sell/nonce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ percentage }),
    })

    if (!response.ok) {
      const json = await response.json()
      console.error('Failed to fetch manual sell nonce:', json.error)
      return null
    }

    const json = await response.json()
    return json
  } catch (error) {
    console.error('Failed to fetch manual sell nonce:', error)
    return null
  }
}

// Execute manual sell with signed message
export async function executeManualSell(
  message: string,
  signature: string,
  publicKey: string,
  percentage: number
): Promise<ManualSellResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/manual-sell`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        signature,
        publicKey,
        percentage,
      }),
    })

    const json = await response.json()

    if (!response.ok) {
      return { success: false, error: json.error || 'Failed to execute sell' }
    }

    return {
      success: true,
      message: json.message,
      transaction: json.transaction,
    }
  } catch (error) {
    console.error('Failed to execute manual sell:', error)
    return { success: false, error: 'Network error' }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION API
// Wallet-based auth for multi-user support
// ═══════════════════════════════════════════════════════════════════════════

export interface AuthUser {
  id: string
  walletAddress: string
  displayName: string | null
  isActive: boolean
  createdAt: string
}

export interface AuthNonce {
  message: string
  nonce: string
  timestamp: number
  expiresAt: number
}

// Request auth nonce for wallet to sign
export async function requestAuthNonce(walletAddress: string): Promise<AuthNonce | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress }),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to request auth nonce:', error)
    return null
  }
}

// Verify signed message and authenticate user
export async function verifyAuth(
  walletAddress: string,
  signature: string,
  message: string
): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress, signature, message }),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data.user : null
  } catch (error) {
    console.error('Failed to verify auth:', error)
    return null
  }
}

// Get current user by wallet address
export async function getCurrentUser(walletAddress: string): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/user`, {
      headers: { 'x-wallet-address': walletAddress },
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to get current user:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// USER TOKENS API
// Manage user's registered tokens
// ═══════════════════════════════════════════════════════════════════════════

export interface UserToken {
  id: string
  user_id: string
  token_mint_address: string
  token_symbol: string
  token_name: string | null
  token_image: string | null
  token_decimals: number
  dev_wallet_address: string
  ops_wallet_address: string
  is_active: boolean
  is_graduated: boolean
  created_at: string
  updated_at: string
  config?: UserTokenConfig
  flywheelState?: UserFlywheelState
}

export interface UserTokenConfig {
  id: string
  user_token_id: string
  flywheel_active: boolean
  market_making_enabled: boolean
  auto_claim_enabled: boolean
  fee_threshold_sol: number
  min_buy_amount_sol: number
  max_buy_amount_sol: number
  max_sell_amount_tokens: number
  buy_interval_minutes: number
  slippage_bps: number
  algorithm_mode: 'simple' | 'smart' | 'rebalance'
  target_sol_allocation: number
  target_token_allocation: number
  rebalance_threshold: number
  use_twap: boolean
  twap_threshold_usd: number
}

export interface UserFlywheelState {
  cycle_phase: 'buy' | 'sell'
  buy_count: number
  sell_count: number
  sell_phase_token_snapshot: number
  sell_amount_per_tx: number
  last_trade_at: string | null
}

export interface RegisterTokenParams {
  tokenMintAddress: string
  tokenSymbol: string
  tokenName?: string
  tokenImage?: string
  tokenDecimals: number
  devWalletPrivateKey: string
  opsWalletAddress: string
}

// Get all tokens for current user
export async function getUserTokens(walletAddress: string): Promise<UserToken[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/tokens`, {
      headers: { 'x-wallet-address': walletAddress },
    })

    if (!response.ok) return []

    const json = await response.json()
    return json.success ? json.data : []
  } catch (error) {
    console.error('Failed to get user tokens:', error)
    return []
  }
}

// Register a new token (requires signature)
export async function registerUserToken(
  walletAddress: string,
  signature: string,
  message: string,
  params: RegisterTokenParams
): Promise<UserToken | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': walletAddress,
        'x-wallet-signature': signature,
        'x-wallet-message': message,
      },
      body: JSON.stringify(params),
    })

    const json = await response.json()

    if (!response.ok) {
      throw new Error(json.error || 'Failed to register token')
    }

    return json.success ? json.data : null
  } catch (error: any) {
    console.error('Failed to register token:', error)
    throw error
  }
}

// Get a specific token
export async function getUserToken(
  walletAddress: string,
  tokenId: string
): Promise<UserToken | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/tokens/${tokenId}`, {
      headers: { 'x-wallet-address': walletAddress },
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to get token:', error)
    return null
  }
}

// Delete/deactivate a token (requires signature)
export async function deleteUserToken(
  walletAddress: string,
  signature: string,
  message: string,
  tokenId: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/tokens/${tokenId}`, {
      method: 'DELETE',
      headers: {
        'x-wallet-address': walletAddress,
        'x-wallet-signature': signature,
        'x-wallet-message': message,
      },
    })

    const json = await response.json()
    return json.success
  } catch (error) {
    console.error('Failed to delete token:', error)
    return false
  }
}

// Get config nonce for signing
export async function getConfigNonce(
  tokenId: string,
  config: Partial<UserTokenConfig>
): Promise<{ message: string; configHash: string } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/tokens/${tokenId}/config/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to get config nonce:', error)
    return null
  }
}

// Update token config (requires signature)
export async function updateUserTokenConfig(
  walletAddress: string,
  signature: string,
  message: string,
  tokenId: string,
  config: Partial<UserTokenConfig>
): Promise<UserTokenConfig | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/tokens/${tokenId}/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': walletAddress,
        'x-wallet-signature': signature,
        'x-wallet-message': message,
      },
      body: JSON.stringify({ config }),
    })

    const json = await response.json()

    if (!response.ok) {
      throw new Error(json.error || 'Failed to update config')
    }

    return json.success ? json.data : null
  } catch (error: any) {
    console.error('Failed to update config:', error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN TOKEN MANAGEMENT API
// View and manage all registered tokens (admin only)
// ═══════════════════════════════════════════════════════════════════════════

export interface AdminToken {
  id: string
  userId: string
  userWallet: string
  tokenMint: string
  tokenSymbol: string
  tokenName: string | null
  tokenImage: string | null
  tokenDecimals: number
  devWallet: string
  opsWallet: string
  isActive: boolean
  isVerified: boolean
  isSuspended: boolean
  suspendReason: string | null
  riskLevel: 'low' | 'medium' | 'high'
  dailyTradeLimitSol: number
  maxPositionSizeSol: number
  createdAt: string
  config: {
    flywheel_active: boolean
    market_making_enabled: boolean
    auto_claim_enabled: boolean
    algorithm_mode: string
  } | null
}

export interface PlatformStats {
  users: {
    total: number
  }
  tokens: {
    total: number
    active: number
    suspended: number
    activeFlywheels: number
  }
  jobs: {
    claim: {
      enabled: boolean
      running: boolean
      intervalMinutes: number
      lastRunAt: string | null
    }
    flywheel: {
      enabled: boolean
      running: boolean
      intervalMinutes: number
      lastRunAt: string | null
    }
  }
}

// Helper to create admin auth headers
function createAdminHeaders(
  publicKey: string,
  signature: string,
  message: string
): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-wallet-pubkey': publicKey,
    'x-wallet-signature': signature,
    'x-wallet-message': message,
  }
}

// Get admin auth nonce
export async function fetchAdminAuthNonce(): Promise<{
  message: string
  timestamp: number
  nonce: string
} | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/auth/nonce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) return null

    const json = await response.json()
    return json
  } catch (error) {
    console.error('Failed to fetch admin auth nonce:', error)
    return null
  }
}

// Fetch all registered tokens (admin only)
export async function fetchAdminTokens(
  publicKey: string,
  signature: string,
  message: string,
  filters?: { status?: string; risk?: string; search?: string; limit?: number; offset?: number }
): Promise<{ tokens: AdminToken[]; total: number } | null> {
  try {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.risk) params.set('risk', filters.risk)
    if (filters?.search) params.set('search', filters.search)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const response = await fetch(`${API_BASE_URL}/api/admin/tokens?${params}`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch admin tokens:', error)
    return null
  }
}

// Get platform stats (admin only)
export async function fetchPlatformStats(
  publicKey: string,
  signature: string,
  message: string
): Promise<PlatformStats | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/platform-stats`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch platform stats:', error)
    return null
  }
}

// Verify a token (admin only)
export async function verifyAdminToken(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/tokens/${tokenId}/verify`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    })

    const json = await response.json()
    return json.success
  } catch (error) {
    console.error('Failed to verify token:', error)
    return false
  }
}

// Suspend a token (admin only)
export async function suspendAdminToken(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string,
  reason: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/tokens/${tokenId}/suspend`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ reason }),
    })

    const json = await response.json()
    return json.success
  } catch (error) {
    console.error('Failed to suspend token:', error)
    return false
  }
}

// Unsuspend a token (admin only)
export async function unsuspendAdminToken(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/tokens/${tokenId}/unsuspend`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    })

    const json = await response.json()
    return json.success
  } catch (error) {
    console.error('Failed to unsuspend token:', error)
    return false
  }
}

// Update token limits (admin only)
export async function updateAdminTokenLimits(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string,
  limits: {
    dailyTradeLimitSol?: number
    maxPositionSizeSol?: number
    riskLevel?: 'low' | 'medium' | 'high'
  }
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/tokens/${tokenId}/limits`, {
      method: 'PUT',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify(limits),
    })

    const json = await response.json()
    return json.success
  } catch (error) {
    console.error('Failed to update token limits:', error)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BULK ADMIN ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface BulkSuspendResult {
  success: boolean
  message: string
  suspendedCount: number
  skippedCount: number
}

// Bulk suspend all tokens except platform token (admin only)
export async function bulkSuspendAllTokens(
  publicKey: string,
  signature: string,
  message: string,
  reason: string
): Promise<BulkSuspendResult | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/tokens/suspend-all`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ reason }),
    })

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to bulk suspend tokens:', error)
    return null
  }
}

// Bulk unsuspend all tokens (admin only)
export async function bulkUnsuspendAllTokens(
  publicKey: string,
  signature: string,
  message: string
): Promise<BulkSuspendResult | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/tokens/unsuspend-all`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    })

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to bulk unsuspend tokens:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM SETTINGS API
// ═══════════════════════════════════════════════════════════════════════════

export interface PlatformSettings {
  claimJobIntervalMinutes: number
  flywheelIntervalMinutes: number
  maxTradesPerMinute: number
  claimJobEnabled: boolean
  flywheelJobEnabled: boolean
}

// Get current platform settings (admin only)
export async function fetchPlatformSettings(
  publicKey: string,
  signature: string,
  message: string
): Promise<PlatformSettings | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/platform-settings`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch platform settings:', error)
    return null
  }
}

// Update platform settings (admin only)
export async function updatePlatformSettings(
  publicKey: string,
  signature: string,
  message: string,
  settings: Partial<PlatformSettings>
): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/platform-settings`, {
      method: 'PUT',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify(settings),
    })

    const json = await response.json()
    return { success: json.success, message: json.message }
  } catch (error) {
    console.error('Failed to update platform settings:', error)
    return { success: false }
  }
}
