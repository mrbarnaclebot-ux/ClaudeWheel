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
