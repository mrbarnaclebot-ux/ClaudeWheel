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

export async function calculateAndUpdateFeeStats(): Promise<{
  total_collected: number
  today_collected: number
  hour_collected: number
} | null> {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured - skipping fee stats calculation')
    return null
  }

  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()

    // Get all fee_collection transactions
    const { data: allFees, error: allError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('type', 'fee_collection')
      .eq('status', 'confirmed')

    if (allError) {
      console.error('Failed to fetch total fees:', allError)
      return null
    }

    // Get today's fee collections
    const { data: todayFees, error: todayError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('type', 'fee_collection')
      .eq('status', 'confirmed')
      .gte('created_at', todayStart)

    if (todayError) {
      console.error('Failed to fetch today fees:', todayError)
      return null
    }

    // Get last hour's fee collections
    const { data: hourFees, error: hourError } = await supabase
      .from('transactions')
      .select('amount')
      .eq('type', 'fee_collection')
      .eq('status', 'confirmed')
      .gte('created_at', hourAgo)

    if (hourError) {
      console.error('Failed to fetch hour fees:', hourError)
      return null
    }

    const total_collected = allFees?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0
    const today_collected = todayFees?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0
    const hour_collected = hourFees?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0

    console.log(`📊 Fee stats: Total=${total_collected.toFixed(4)} SOL, Today=${today_collected.toFixed(4)} SOL, Hour=${hour_collected.toFixed(4)} SOL`)

    // Update the fee_stats table
    await updateFeeStats({
      total_collected,
      today_collected,
      hour_collected,
    })

    return { total_collected, today_collected, hour_collected }
  } catch (error) {
    console.error('Failed to calculate fee stats:', error)
    return null
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// FLYWHEEL STATE PERSISTENCE
// Saves/loads cycle state so we resume after restarts
// ═══════════════════════════════════════════════════════════════════════════

export interface FlywheelState {
  cycle_phase: 'buy' | 'sell'
  buy_count: number
  sell_count: number
  sell_phase_token_snapshot: number
  sell_amount_per_tx: number
  updated_at: string
}

const DEFAULT_FLYWHEEL_STATE: FlywheelState = {
  cycle_phase: 'buy',
  buy_count: 0,
  sell_count: 0,
  sell_phase_token_snapshot: 0,
  sell_amount_per_tx: 0,
  updated_at: new Date().toISOString(),
}

export async function saveFlywheelState(state: Omit<FlywheelState, 'updated_at'>): Promise<boolean> {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured - flywheel state not persisted')
    return false
  }

  const { error } = await supabase
    .from('flywheel_state')
    .upsert([{
      id: 'main',
      ...state,
      updated_at: new Date().toISOString(),
    }], {
      onConflict: 'id',
    })

  if (error) {
    console.error('❌ Failed to save flywheel state:', error)
    return false
  }

  return true
}

export async function loadFlywheelState(): Promise<FlywheelState> {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured - using default flywheel state')
    return DEFAULT_FLYWHEEL_STATE
  }

  const { data, error } = await supabase
    .from('flywheel_state')
    .select('*')
    .eq('id', 'main')
    .single()

  if (error) {
    // Table might not exist yet or no row - return defaults
    if (error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.warn('⚠️ Could not load flywheel state:', error.message)
    }
    return DEFAULT_FLYWHEEL_STATE
  }

  console.log(`📂 Loaded flywheel state: ${data.cycle_phase} phase, buys: ${data.buy_count}, sells: ${data.sell_count}`)

  // IMPORTANT: Supabase returns NUMERIC columns as strings for large values
  // Must explicitly convert to numbers to avoid calculation issues
  return {
    cycle_phase: data.cycle_phase || 'buy',
    buy_count: Number(data.buy_count) || 0,
    sell_count: Number(data.sell_count) || 0,
    sell_phase_token_snapshot: Number(data.sell_phase_token_snapshot) || 0,
    sell_amount_per_tx: Number(data.sell_amount_per_tx) || 0,
    updated_at: data.updated_at || new Date().toISOString(),
  }
}
