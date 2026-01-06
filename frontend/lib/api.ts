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
