import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface WalletBalance {
  id: string
  wallet_type: 'dev' | 'ops'
  address: string
  sol_balance: number
  token_balance: number
  usd_value: number
  updated_at: string
}

export interface Transaction {
  id: string
  type: 'fee_collection' | 'transfer' | 'buy' | 'sell'
  amount: number
  token: string
  signature: string
  status: string
  created_at: string
}

export interface FeeStats {
  id: string
  total_collected: number
  today_collected: number
  hour_collected: number
  total_change?: number
  today_change?: number
  hour_change?: number
  updated_at: string
}

export interface Config {
  id: string
  token_mint_address: string | null
  token_symbol: string
  token_decimals: number
  flywheel_active: boolean
  market_making_enabled: boolean
  fee_collection_enabled: boolean
  ops_wallet_address: string | null
  // Fee collection settings
  fee_threshold_sol: number
  fee_percentage: number
  // Market making settings
  min_buy_amount_sol: number
  max_buy_amount_sol: number
  buy_interval_minutes: number
  slippage_bps: number
  // Advanced algorithm settings
  algorithm_mode: 'simple' | 'smart' | 'rebalance'
  target_sol_allocation: number
  target_token_allocation: number
  rebalance_threshold: number
  use_twap: boolean
  twap_threshold_usd: number
  updated_at: string
}

// ═══════════════════════════════════════════════════════════════════════════
// FETCH FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchWalletBalances(): Promise<WalletBalance[]> {
  const { data, error } = await supabase
    .from('wallet_balances')
    .select('*')
    .order('wallet_type', { ascending: true })

  if (error) {
    console.error('Error fetching wallet balances:', error)
    return []
  }
  return data || []
}

export async function fetchTransactions(limit: number = 20): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching transactions:', error)
    return []
  }
  return data || []
}

export async function fetchFeeStats(): Promise<FeeStats | null> {
  const { data, error } = await supabase
    .from('fee_stats')
    .select('*')
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching fee stats:', error)
    return null
  }
  return data
}

export async function fetchConfig(): Promise<Config | null> {
  const { data, error } = await supabase
    .from('config')
    .select('*')
    .eq('id', 'main')
    .single()

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching config:', error)
    return null
  }
  return data
}

// Real-time subscription helpers
export function subscribeToWalletBalances(
  callback: (payload: WalletBalance) => void
) {
  return supabase
    .channel('wallet_balances')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'wallet_balances' },
      (payload) => callback(payload.new as WalletBalance)
    )
    .subscribe()
}

export function subscribeToTransactions(
  callback: (payload: Transaction) => void
) {
  return supabase
    .channel('transactions')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'transactions' },
      (payload) => callback(payload.new as Transaction)
    )
    .subscribe()
}

export function subscribeToFeeStats(
  callback: (payload: FeeStats) => void
) {
  return supabase
    .channel('fee_stats')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'fee_stats' },
      (payload) => callback(payload.new as FeeStats)
    )
    .subscribe()
}

export function subscribeToConfig(
  callback: (payload: Config) => void
) {
  return supabase
    .channel('config')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'config' },
      (payload) => callback(payload.new as Config)
    )
    .subscribe()
}
