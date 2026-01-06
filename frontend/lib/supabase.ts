import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

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
  updated_at: string
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
