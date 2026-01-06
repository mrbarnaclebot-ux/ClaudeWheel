import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE CLIENT (Backend - uses service role key)
// ═══════════════════════════════════════════════════════════════════════════

export const supabase = env.supabaseUrl && env.supabaseServiceKey
  ? createClient(env.supabaseUrl, env.supabaseServiceKey)
  : null

if (!supabase) {
  console.warn('⚠️ Supabase not configured - database features disabled')
}

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function insertTransaction(data: {
  type: string
  amount: number
  token: string
  signature: string
  status: string
}) {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured - skipping transaction insert')
    return null
  }

  console.log(`📝 Inserting ${data.type} transaction to Supabase: ${data.amount} ${data.token}`)

  const { data: result, error } = await supabase
    .from('transactions')
    .insert([{
      ...data,
      created_at: new Date().toISOString(),
    }])
    .select()
    .single()

  if (error) {
    console.error('❌ Failed to insert transaction:', error)
    return null
  }

  console.log(`✅ Transaction inserted successfully`)
  return result
}

export async function updateWalletBalance(data: {
  wallet_type: 'dev' | 'ops'
  address: string
  sol_balance: number
  token_balance: number
  usd_value: number
}) {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured - skipping wallet balance update')
    return null
  }

  console.log(`📝 Updating ${data.wallet_type} wallet balance in Supabase: ${data.sol_balance.toFixed(6)} SOL, ${data.token_balance} tokens`)

  const { data: result, error } = await supabase
    .from('wallet_balances')
    .upsert([{
      ...data,
      updated_at: new Date().toISOString(),
    }], {
      onConflict: 'wallet_type',
    })
    .select()
    .single()

  if (error) {
    console.error('❌ Failed to update wallet balance:', error)
    return null
  }

  console.log(`✅ Wallet balance updated successfully`)
  return result
}

export async function updateFeeStats(data: {
  total_collected: number
  today_collected: number
  hour_collected: number
}) {
  if (!supabase) return null

  const { data: result, error } = await supabase
    .from('fee_stats')
    .upsert([{
      id: 'main', // Single row for stats
      ...data,
      updated_at: new Date().toISOString(),
    }], {
      onConflict: 'id',
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to update fee stats:', error)
    return null
  }

  return result
}

export async function getRecentTransactions(limit: number = 20) {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Failed to get transactions:', error)
    return []
  }

  return data
}

export interface FlywheelConfig {
  flywheel_active: boolean
  market_making_enabled: boolean
  fee_collection_enabled: boolean
  fee_threshold_sol: number
  fee_percentage: number
  min_buy_amount_sol: number
  max_buy_amount_sol: number
  buy_interval_minutes: number
  slippage_bps: number
  algorithm_mode: 'simple' | 'smart' | 'rebalance'
  target_sol_allocation: number
  target_token_allocation: number
  rebalance_threshold: number
  use_twap: boolean
  twap_threshold_usd: number
}

const DEFAULT_CONFIG: FlywheelConfig = {
  flywheel_active: false,
  market_making_enabled: false,
  fee_collection_enabled: true,
  fee_threshold_sol: 0.01,
  fee_percentage: 50,
  min_buy_amount_sol: 0.01,
  max_buy_amount_sol: 0.1,
  buy_interval_minutes: 5,
  slippage_bps: 100,
  algorithm_mode: 'simple',
  target_sol_allocation: 30,
  target_token_allocation: 70,
  rebalance_threshold: 10,
  use_twap: true,
  twap_threshold_usd: 50,
}

export async function fetchConfig(): Promise<FlywheelConfig> {
  if (!supabase) return DEFAULT_CONFIG

  const { data, error } = await supabase
    .from('config')
    .select('*')
    .eq('id', 'main')
    .single()

  if (error) {
    console.error('Failed to fetch config:', error)
    return DEFAULT_CONFIG
  }

  return {
    ...DEFAULT_CONFIG,
    ...data,
  }
}
