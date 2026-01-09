import { PublicKey } from '@solana/web3.js'

// Re-export error types
export * from './errors'

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type TransactionType = 'fee_collection' | 'transfer' | 'buy' | 'sell'

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  token: string
  signature: string
  status: 'pending' | 'confirmed' | 'failed'
  created_at: Date
}

// ═══════════════════════════════════════════════════════════════════════════
// WALLET TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type WalletType = 'dev' | 'ops'

export interface WalletBalance {
  wallet_type: WalletType
  address: string
  sol_balance: number
  token_balance: number
  usd_value: number
  updated_at: Date
}

// ═══════════════════════════════════════════════════════════════════════════
// FEE STATS TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface FeeStats {
  total_collected: number
  today_collected: number
  hour_collected: number
  updated_at: Date
}

// ═══════════════════════════════════════════════════════════════════════════
// FLYWHEEL STATUS
// ═══════════════════════════════════════════════════════════════════════════

export interface FlywheelStatus {
  is_active: boolean
  last_fee_collection: Date | null
  last_market_making: Date | null
  dev_wallet_balance: number
  ops_wallet_balance: number
  total_fees_collected: number
}

// ═══════════════════════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  timestamp: string
}

// ═══════════════════════════════════════════════════════════════════════════
// MARKET MAKING TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MarketMakingOrder {
  type: 'buy' | 'sell'
  amount: number
  price: number
  signature?: string
  status: 'pending' | 'executed' | 'failed'
}

export interface PriceData {
  price_usd: number
  price_sol: number
  volume_24h: number
  market_cap: number
  change_24h: number
}
