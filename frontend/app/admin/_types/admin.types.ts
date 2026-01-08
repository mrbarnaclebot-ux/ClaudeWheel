/**
 * Admin Dashboard TypeScript Types
 */

// Auth Types
export interface AdminAuth {
  isAuthenticated: boolean
  publicKey: string | null
  signature: string | null
  message: string | null
}

// Tab Types
export type AdminTab = 'overview' | 'tokens' | 'telegram' | 'logs' | 'wheel' | 'settings'

// Platform Stats
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
    fastClaim: JobStatus
    claim: JobStatus
    flywheel: JobStatus & { maxTradesPerMinute?: number }
    balanceUpdate: JobStatus
  }
}

export interface JobStatus {
  enabled: boolean
  running: boolean
  intervalMinutes: number
  lastRunAt: string | null
}

// System Status
export interface SystemStatus {
  rpcConnection: boolean
  databaseConnection: boolean
  memoryUsage: {
    heapUsed: number
    heapTotal: number
    percentage: number
  }
  uptime: number
  environment: string
  version: string
}

// Token Types
export interface UserToken {
  id: string
  user_id: string
  telegram_user_id?: string
  token_mint_address: string
  token_symbol: string
  token_name?: string
  token_image?: string
  token_decimals: number
  dev_wallet_address: string
  ops_wallet_address: string
  is_active: boolean
  is_graduated: boolean
  is_verified: boolean
  is_suspended: boolean
  suspend_reason?: string
  risk_level: 'low' | 'medium' | 'high'
  daily_trade_limit_sol: number
  max_position_size_sol: number
  launched_via_telegram: boolean
  created_at: string
  updated_at: string
  // Joined data
  config?: UserTokenConfig
  flywheelState?: FlywheelState
  telegramUser?: TelegramUserInfo
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
  updated_at: string
}

export interface FlywheelState {
  id: string
  user_token_id: string
  cycle_phase: 'buy' | 'sell'
  buy_count: number
  sell_count: number
  sell_phase_token_snapshot: number
  sell_amount_per_tx: number
  last_trade_at?: string
  last_checked_at?: string
  last_check_result?: string
  updated_at: string
}

// Telegram Types
export interface TelegramUserInfo {
  id: string
  telegram_id: number
  telegram_username?: string
  user_id?: string
  created_at: string
}

export interface TelegramLaunch {
  id: string
  telegram_user_id: string
  token_name: string
  token_symbol: string
  token_description?: string
  token_image_url?: string
  dev_wallet_address: string
  ops_wallet_address: string
  status: LaunchStatus
  deposit_received_sol: number
  token_mint_address?: string
  user_token_id?: string
  error_message?: string
  retry_count: number
  expires_at: string
  launched_at?: string
  created_at: string
  updated_at: string
  // Joined
  telegram_users?: TelegramUserInfo
  original_funder?: string
}

export type LaunchStatus = 'awaiting_deposit' | 'launching' | 'completed' | 'failed' | 'expired' | 'refunded'

export interface TelegramLaunchStats {
  total: number
  awaitingDeposit: number
  launching: number
  completed: number
  failed: number
  expired: number
  refunded: number
  totalDeposits: number
  successRate: number
}

// Log Types
export interface LogEntry {
  id: string
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  source: 'flywheel' | 'telegram' | 'system' | 'claim'
  message: string
  details?: Record<string, unknown>
}

export interface AuditLogEntry {
  id: string
  event_type: string
  pending_launch_id?: string
  user_token_id?: string
  telegram_id?: number
  details?: Record<string, unknown>
  created_at: string
}

// Transaction Types
export interface Transaction {
  id: string
  user_token_id?: string
  type: 'buy' | 'sell' | 'claim' | 'transfer' | 'fee_collection' | 'info'
  amount: number
  token?: string
  signature?: string
  message?: string
  status: 'pending' | 'confirmed' | 'failed'
  created_at: string
}

// WebSocket Types
export interface WSMessage {
  channel: string
  type: string
  payload: unknown
  timestamp: string
}

export type WSChannel =
  | 'job_status'
  | 'transactions'
  | 'launch_updates'
  | 'balance_updates'
  | 'logs'

// Filter Types
export interface TokenFilters {
  status?: 'all' | 'active' | 'suspended' | 'inactive'
  source?: 'all' | 'website' | 'telegram'
  riskLevel?: 'all' | 'low' | 'medium' | 'high'
  flywheel?: 'all' | 'active' | 'inactive'
  search?: string
}

export interface LogFilters {
  source?: 'all' | 'flywheel' | 'telegram' | 'system' | 'claim'
  level?: 'all' | 'info' | 'warn' | 'error' | 'debug'
  from?: string
  to?: string
  search?: string
}

// Chart Types
export interface ChartDataPoint {
  date: string
  value: number
  label?: string
}

export interface LaunchChartData {
  date: string
  completed: number
  failed: number
  expired: number
  refunded: number
}

// Wallet Types
export interface WalletBalance {
  wallet_type: 'dev' | 'ops'
  address: string
  sol_balance: number
  token_balance: number
  usd_value: number
  updated_at: string
}

// Fee Stats
export interface FeeStats {
  total_collected: number
  today_collected: number
  hour_collected: number
  updated_at: string
}

// Bot Health
export interface BotHealth {
  status: 'healthy' | 'degraded' | 'down'
  lastPing: string
  activeCommands: number
  memoryUsage: number
  uptime: number
  isMaintenanceMode: boolean
  maintenanceReason?: string
}

// Refund Types
export interface RefundPreview {
  wallets: {
    dev: { address: string; balance: number }
    ops: { address: string; balance: number }
  }
  totalRefundable: number
  suggestedRefundAddress?: string
}

export interface RefundResult {
  success: boolean
  totalRefunded?: number
  signatures?: string[]
  error?: string
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
