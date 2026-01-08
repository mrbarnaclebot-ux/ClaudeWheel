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
): Promise<{ success: boolean; error?: string; configReloadTriggered?: boolean }> {
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

    return { success: true, configReloadTriggered: json.configReloadTriggered }
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
  opsWalletPrivateKey: string
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
    // Encode message as base64 to avoid newline issues in HTTP headers
    const encodedMessage = btoa(unescape(encodeURIComponent(message)))

    const response = await fetch(`${API_BASE_URL}/api/user/tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': walletAddress,
        'x-wallet-signature': signature,
        'x-wallet-message': encodedMessage,
        'x-message-encoding': 'base64',
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
    // Encode message as base64 to avoid newline issues in HTTP headers
    const encodedMessage = btoa(unescape(encodeURIComponent(message)))

    const response = await fetch(`${API_BASE_URL}/api/user/tokens/${tokenId}`, {
      method: 'DELETE',
      headers: {
        'x-wallet-address': walletAddress,
        'x-wallet-signature': signature,
        'x-wallet-message': encodedMessage,
        'x-message-encoding': 'base64',
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
    // Encode message as base64 to avoid newline issues in HTTP headers
    const encodedMessage = btoa(unescape(encodeURIComponent(message)))

    const response = await fetch(`${API_BASE_URL}/api/user/tokens/${tokenId}/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': walletAddress,
        'x-wallet-signature': signature,
        'x-wallet-message': encodedMessage,
        'x-message-encoding': 'base64',
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
// ACTIVITY LOGS API
// Fetch combined claims and transactions for terminal display
// ═══════════════════════════════════════════════════════════════════════════

export interface ActivityLog {
  id: string
  type: 'claim' | 'buy' | 'sell' | 'transfer' | 'info'
  message: string
  amount: number
  signature: string | null
  timestamp: string
}

export interface ActivityLogsResponse {
  activities: ActivityLog[]
  tokenSymbol: string
  devWallet: string
  opsWallet: string
  flywheelState?: {
    cyclePhase: 'buy' | 'sell'
    buyCount: number
    sellCount: number
    lastTradeAt: string | null
    lastCheckedAt: string | null
    lastCheckResult: string | null
  } | null
}

// Get activity logs for a token (claims + transactions)
export async function getTokenActivityLogs(
  walletAddress: string,
  tokenId: string,
  limit: number = 50
): Promise<ActivityLogsResponse | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/tokens/${tokenId}/activity?limit=${limit}`, {
      headers: { 'x-wallet-address': walletAddress },
    })

    const json = await response.json()
    if (!response.ok || !json.success) {
      throw new Error(json.error || 'Failed to fetch activity logs')
    }

    return json.data
  } catch (error) {
    console.error('Failed to fetch activity logs:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// USER TOKEN MANUAL SELL API
// Manual sell functionality for user-owned tokens
// ═══════════════════════════════════════════════════════════════════════════

// Get a nonce message to sign for user token manual sell
export async function fetchUserTokenSellNonce(
  walletAddress: string,
  tokenId: string,
  percentage: number
): Promise<{
  message: string
  timestamp: number
  nonce: string
  percentage: number
} | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/tokens/${tokenId}/sell/nonce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': walletAddress,
      },
      body: JSON.stringify({ percentage }),
    })

    const json = await response.json()
    if (!response.ok || !json.success) {
      console.error('Failed to fetch user token sell nonce:', json.error)
      return null
    }

    return json.data
  } catch (error) {
    console.error('Failed to fetch user token sell nonce:', error)
    return null
  }
}

// Execute user token manual sell with signed message
export async function executeUserTokenSell(
  walletAddress: string,
  tokenId: string,
  message: string,
  signature: string,
  percentage: number
): Promise<{
  success: boolean
  amountSold?: number
  signature?: string
  message?: string
  error?: string
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user/tokens/${tokenId}/sell`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-wallet-address': walletAddress,
      },
      body: JSON.stringify({
        message,
        signature,
        percentage,
      }),
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to execute sell' }
    }

    return {
      success: true,
      amountSold: json.data.amountSold,
      signature: json.data.signature,
      message: json.message,
    }
  } catch (error) {
    console.error('Failed to execute user token sell:', error)
    return { success: false, error: 'Network error' }
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
  // Encode message as base64 to avoid newline issues in HTTP headers
  const encodedMessage = btoa(unescape(encodeURIComponent(message)))

  return {
    'Content-Type': 'application/json',
    'x-wallet-pubkey': publicKey,
    'x-wallet-signature': signature,
    'x-wallet-message': encodedMessage,
    'x-message-encoding': 'base64',
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
    if (!json.success || !json.data) return null

    // Map the nested response to flat structure
    const { claim, flywheel } = json.data
    return {
      claimJobIntervalMinutes: claim?.intervalMinutes ?? 60,
      flywheelIntervalMinutes: flywheel?.intervalMinutes ?? 1,
      maxTradesPerMinute: flywheel?.maxTradesPerMinute ?? 30,
      claimJobEnabled: claim?.enabled ?? false,
      flywheelJobEnabled: flywheel?.enabled ?? false,
    }
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

// ═══════════════════════════════════════════════════════════════════════════
// TELEGRAM ADMIN API
// Monitor launches and process refunds
// ═══════════════════════════════════════════════════════════════════════════

export interface TelegramLaunchStats {
  total: number
  awaiting: number
  launching: number
  completed: number
  failed: number
  expired: number
  refunded: number
  totalDeposited: number
  totalRefunded: number
}

export interface TelegramLaunch {
  id: string
  telegram_user_id: string
  token_name: string
  token_symbol: string
  token_description: string | null
  token_image_url: string | null
  dev_wallet_address: string
  ops_wallet_address: string
  status: 'awaiting_deposit' | 'launching' | 'completed' | 'failed' | 'expired' | 'refunded'
  deposit_received_sol: number
  token_mint_address: string | null
  error_message: string | null
  retry_count: number
  expires_at: string
  created_at: string
  updated_at: string
  telegram_users: {
    telegram_id: number
    telegram_username: string | null
  } | null
  // Enriched fields from refund service
  current_balance?: number
  original_funder?: string | null
}

export interface TelegramAuditLog {
  id: string
  event_type: string
  pending_launch_id: string | null
  user_token_id: string | null
  telegram_id: number | null
  details: Record<string, any>
  created_at: string
}

// Get Telegram launch statistics (admin only)
export async function fetchTelegramStats(
  publicKey: string,
  signature: string,
  message: string
): Promise<TelegramLaunchStats | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/stats`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch telegram stats:', error)
    return null
  }
}

// Get all Telegram launches (admin only)
export async function fetchTelegramLaunches(
  publicKey: string,
  signature: string,
  message: string,
  filters?: { status?: string; limit?: number; offset?: number }
): Promise<{ launches: TelegramLaunch[]; total: number } | null> {
  try {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))

    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/launches?${params}`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch telegram launches:', error)
    return null
  }
}

// Get pending refunds (admin only)
export async function fetchPendingRefunds(
  publicKey: string,
  signature: string,
  message: string
): Promise<{ refunds: TelegramLaunch[]; total: number } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/refunds`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch pending refunds:', error)
    return null
  }
}

// Execute a refund (admin only)
export async function executeRefund(
  publicKey: string,
  signature: string,
  message: string,
  launchId: string,
  refundAddress: string
): Promise<{ success: boolean; signature?: string; amountRefunded?: number; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/refund/${launchId}`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ refundAddress }),
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      return { success: false, error: json.error || 'Refund failed' }
    }

    return {
      success: true,
      signature: json.data.signature,
      amountRefunded: json.data.amountRefunded,
    }
  } catch (error) {
    console.error('Failed to execute refund:', error)
    return { success: false, error: 'Network error' }
  }
}

// Get Telegram audit logs (admin only)
export async function fetchTelegramLogs(
  publicKey: string,
  signature: string,
  message: string,
  filters?: { limit?: number; event_type?: string }
): Promise<{ logs: TelegramAuditLog[]; total: number } | null> {
  try {
    const params = new URLSearchParams()
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.event_type) params.set('event_type', filters.event_type)

    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/logs?${params}`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch telegram logs:', error)
    return null
  }
}

// Cancel a pending launch (admin only)
export async function cancelTelegramLaunch(
  publicKey: string,
  signature: string,
  message: string,
  launchId: string,
  reason?: string
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/launch/${launchId}/cancel`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ reason }),
    })

    const json = await response.json()
    return json.success
  } catch (error) {
    console.error('Failed to cancel launch:', error)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED TELEGRAM ADMIN API
// Bot health, financial metrics, user analytics, search, bulk operations
// ═══════════════════════════════════════════════════════════════════════════

export interface BotHealthStatus {
  depositMonitor: {
    running: boolean
    isProcessing: boolean
  }
  lastActivity: {
    timestamp: string
    eventType: string
    minutesAgo: number
  } | null
  lastLaunch: {
    timestamp: string
    tokenSymbol: string
    status: string
  } | null
  botHealthy: boolean
}

export interface FinancialMetrics {
  totalSolProcessed: number
  totalRefunded: number
  pendingSol: number
  launchFeesCollected: number
  platformRevenue: number
  today: {
    launches: number
    deposits: number
  }
}

export interface TelegramUser {
  id: string
  telegramId: number
  username: string | null
  createdAt: string
  launchCount: number
}

export interface BulkRefundResult {
  launchId: string
  success: boolean
  signature?: string
  amountRefunded?: number
  error?: string
}

// Get bot health status (admin only)
export async function fetchBotHealth(
  publicKey: string,
  signature: string,
  message: string
): Promise<BotHealthStatus | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/bot-health`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch bot health:', error)
    return null
  }
}

// Get financial metrics (admin only)
export async function fetchFinancialMetrics(
  publicKey: string,
  signature: string,
  message: string
): Promise<FinancialMetrics | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/financial-metrics`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch financial metrics:', error)
    return null
  }
}

// Get Telegram users list (admin only)
export async function fetchTelegramUsers(
  publicKey: string,
  signature: string,
  message: string,
  filters?: { limit?: number; offset?: number; search?: string }
): Promise<{ users: TelegramUser[]; total: number } | null> {
  try {
    const params = new URLSearchParams()
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))
    if (filters?.search) params.set('search', filters.search)

    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/users?${params}`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch telegram users:', error)
    return null
  }
}

// Execute bulk refunds (admin only)
export async function executeBulkRefunds(
  publicKey: string,
  signature: string,
  message: string,
  launchIds: string[]
): Promise<{ results: BulkRefundResult[]; summary: { total: number; successful: number; failed: number } } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/bulk-refund`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ launchIds }),
    })

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to execute bulk refunds:', error)
    return null
  }
}

// Search launches with advanced filters (admin only)
export async function searchTelegramLaunches(
  publicKey: string,
  signature: string,
  message: string,
  filters?: {
    status?: string
    search?: string
    username?: string
    dateFrom?: string
    dateTo?: string
    limit?: number
    offset?: number
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }
): Promise<{ launches: TelegramLaunch[]; total: number } | null> {
  try {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.search) params.set('search', filters.search)
    if (filters?.username) params.set('username', filters.username)
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom)
    if (filters?.dateTo) params.set('dateTo', filters.dateTo)
    if (filters?.limit) params.set('limit', String(filters.limit))
    if (filters?.offset) params.set('offset', String(filters.offset))
    if (filters?.sortBy) params.set('sortBy', filters.sortBy)
    if (filters?.sortOrder) params.set('sortOrder', filters.sortOrder)

    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/launches/search?${params}`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to search launches:', error)
    return null
  }
}

// Export launches data (admin only)
export async function exportTelegramLaunches(
  publicKey: string,
  signature: string,
  message: string,
  filters?: { status?: string; dateFrom?: string; dateTo?: string }
): Promise<Blob | null> {
  try {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom)
    if (filters?.dateTo) params.set('dateTo', filters.dateTo)

    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/export?${params}`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    return await response.blob()
  } catch (error) {
    console.error('Failed to export launches:', error)
    return null
  }
}

// Chart data types
export interface DailyChartData {
  date: string
  displayDate: string
  total: number
  completed: number
  failed: number
  expired: number
  refunded: number
  awaiting: number
  launching: number
  solProcessed: number
}

export interface SuccessRateData {
  date: string
  displayDate: string
  successRate: number
}

export interface StatusDistribution {
  name: string
  value: number
  color: string
}

export interface ChartData {
  dailyData: DailyChartData[]
  successRateData: SuccessRateData[]
  statusDistribution: StatusDistribution[]
  summary: {
    totalLaunches: number
    avgLaunchesPerDay: number
    overallSuccessRate: number
  }
}

// Get chart data for trends (admin only)
export async function fetchChartData(
  publicKey: string,
  signature: string,
  message: string,
  days: number = 30
): Promise<ChartData | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/chart-data?days=${days}`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch chart data:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BOT ALERTS & MAINTENANCE API
// Manage downtime alerts and broadcast messages
// ═══════════════════════════════════════════════════════════════════════════

export interface BotAlertStatus {
  botStatus: {
    isMaintenanceMode: boolean
    maintenanceReason?: string
    maintenanceStartedAt?: string
    estimatedEndTime?: string
    lastUpdated: string
  }
  subscriberCount: number
  subscribers: Array<{
    telegramId: number
    username: string | null
    subscribedAt: string
  }>
}

export interface BroadcastResult {
  total: number
  successful: number
  failed: number
  errors: string[]
}

// Get bot alert status (admin only)
export async function fetchBotAlertStatus(
  publicKey: string,
  signature: string,
  message: string
): Promise<BotAlertStatus | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/alerts/status`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch bot alert status:', error)
    return null
  }
}

// Enable maintenance mode (admin only)
export async function enableMaintenanceMode(
  publicKey: string,
  signature: string,
  message: string,
  reason: string,
  estimatedEndTime?: string,
  notifyUsers: boolean = true
): Promise<{ success: boolean; notifiedUsers?: number; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/maintenance/enable`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ reason, estimatedEndTime, notifyUsers }),
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to enable maintenance mode' }
    }

    return { success: true, notifiedUsers: json.notifiedUsers }
  } catch (error) {
    console.error('Failed to enable maintenance mode:', error)
    return { success: false, error: 'Network error' }
  }
}

// Disable maintenance mode (admin only)
export async function disableMaintenanceMode(
  publicKey: string,
  signature: string,
  message: string,
  notifyUsers: boolean = true
): Promise<{ success: boolean; notifiedUsers?: number; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/maintenance/disable`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ notifyUsers }),
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to disable maintenance mode' }
    }

    return { success: true, notifiedUsers: json.notifiedUsers }
  } catch (error) {
    console.error('Failed to disable maintenance mode:', error)
    return { success: false, error: 'Network error' }
  }
}

// Send broadcast message (admin only)
export async function sendBroadcast(
  publicKey: string,
  signature: string,
  message: string,
  title: string,
  body: string
): Promise<{ success: boolean; result?: BroadcastResult; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/broadcast`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ title, body }),
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to send broadcast' }
    }

    return { success: true, result: json.data }
  } catch (error) {
    console.error('Failed to send broadcast:', error)
    return { success: false, error: 'Network error' }
  }
}

// Preview broadcast message (admin only)
export async function previewBroadcast(
  publicKey: string,
  signature: string,
  message: string,
  title: string,
  body: string
): Promise<{ preview: string; subscriberCount: number; estimatedDeliveryTime: string } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/telegram/broadcast/preview`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ title, body }),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to preview broadcast:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB CONTROLS API
// Manually trigger background jobs
// ═══════════════════════════════════════════════════════════════════════════

// Trigger flywheel cycle manually (admin only)
export async function triggerFlywheelCycle(
  publicKey: string,
  signature: string,
  message: string,
  maxTrades?: number
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/flywheel/trigger`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ maxTrades }),
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to trigger flywheel' }
    }

    return { success: true, message: json.message }
  } catch (error) {
    console.error('Failed to trigger flywheel:', error)
    return { success: false, error: 'Network error' }
  }
}

// Trigger fast claim cycle manually (admin only)
export async function triggerFastClaim(
  publicKey: string,
  signature: string,
  message: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/fast-claim/trigger`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to trigger fast claim' }
    }

    return { success: true, message: json.message }
  } catch (error) {
    console.error('Failed to trigger fast claim:', error)
    return { success: false, error: 'Network error' }
  }
}

// Trigger balance update cycle manually (admin only)
export async function triggerBalanceUpdate(
  publicKey: string,
  signature: string,
  message: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/balance-update/trigger`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      return { success: false, error: json.error || 'Failed to trigger balance update' }
    }

    return { success: true, message: json.message }
  } catch (error) {
    console.error('Failed to trigger balance update:', error)
    return { success: false, error: 'Network error' }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ORPHANED LAUNCHES MIGRATION API
// Recover completed launches that weren't properly registered
// ═══════════════════════════════════════════════════════════════════════════

export interface OrphanedLaunch {
  id: string
  token_name: string
  token_symbol: string
  token_mint_address: string
  dev_wallet_address: string
  status: string
  created_at: string
  telegram_users: {
    telegram_id: number
    telegram_username: string | null
  } | null
}

export interface MigrationResult {
  id: string
  tokenSymbol: string
  success: boolean
  error?: string
  userTokenId?: string
}

// Get list of orphaned launches (admin only)
export async function fetchOrphanedLaunches(
  publicKey: string,
  signature: string,
  message: string
): Promise<{ launches: OrphanedLaunch[]; total: number } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/orphaned-launches`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to fetch orphaned launches:', error)
    return null
  }
}

// Migrate orphaned launches (admin only)
export async function migrateOrphanedLaunches(
  publicKey: string,
  signature: string,
  message: string
): Promise<{
  success: boolean
  message?: string
  migrated?: number
  failed?: number
  results?: MigrationResult[]
  error?: string
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/migrate-orphaned-launches`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
    })

    const json = await response.json()

    if (!response.ok || !json.success) {
      return { success: false, error: json.error || 'Migration failed' }
    }

    return {
      success: true,
      message: json.message,
      migrated: json.migrated,
      failed: json.failed,
      results: json.results,
    }
  } catch (error) {
    console.error('Failed to migrate orphaned launches:', error)
    return { success: false, error: 'Network error' }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STOP FLYWHEEL AND REFUND API
// Stop flywheel and refund remaining SOL for test launches
// ═══════════════════════════════════════════════════════════════════════════

export interface RefundPreview {
  tokenId: string
  tokenSymbol: string
  tokenName: string | null
  isActive: boolean
  flywheelActive: boolean
  wallets: {
    dev: {
      address: string
      balance: number
      refundable: number
    }
    ops: {
      address: string
      balance: number
      refundable: number
    }
  }
  totalRefundable: number
  suggestedRefundAddress: string | null
}

export interface RefundWalletResult {
  wallet: string
  walletType: 'dev' | 'ops'
  balance: number
  refundAmount: number
  signature?: string
  error?: string
}

export interface StopAndRefundResult {
  success: boolean
  message?: string
  flywheelStopped?: boolean
  refundExecuted?: boolean
  needsRefundAddress?: boolean
  refundAddress?: string
  totalRefunded?: number
  results?: RefundWalletResult[]
  error?: string
}

// Preview refund for a token (admin only)
export async function previewTokenRefund(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string
): Promise<RefundPreview | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/tokens/${tokenId}/refund-preview`, {
      headers: createAdminHeaders(publicKey, signature, message),
    })

    if (!response.ok) return null

    const json = await response.json()
    return json.success ? json.data : null
  } catch (error) {
    console.error('Failed to preview refund:', error)
    return null
  }
}

// Stop flywheel and refund remaining SOL (admin only)
export async function stopFlywheelAndRefund(
  publicKey: string,
  signature: string,
  message: string,
  tokenId: string,
  refundAddress?: string
): Promise<StopAndRefundResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin/tokens/${tokenId}/stop-and-refund`, {
      method: 'POST',
      headers: createAdminHeaders(publicKey, signature, message),
      body: JSON.stringify({ refundAddress }),
    })

    const json = await response.json()

    if (!response.ok) {
      return { success: false, error: json.error || 'Stop and refund failed' }
    }

    return {
      success: json.success,
      message: json.message,
      flywheelStopped: json.flywheelStopped,
      refundExecuted: json.refundExecuted,
      needsRefundAddress: json.needsRefundAddress,
      refundAddress: json.refundAddress,
      totalRefunded: json.totalRefunded,
      results: json.results,
    }
  } catch (error) {
    console.error('Failed to stop and refund:', error)
    return { success: false, error: 'Network error' }
  }
}
