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
  if (!supabase) return null

  const { data: result, error } = await supabase
    .from('transactions')
    .insert([{
      ...data,
      created_at: new Date().toISOString(),
    }])
    .select()
    .single()

  if (error) {
    console.error('Failed to insert transaction:', error)
    return null
  }

  return result
}

export async function updateWalletBalance(data: {
  wallet_type: 'dev' | 'ops'
  address: string
  sol_balance: number
  token_balance: number
  usd_value: number
}) {
  if (!supabase) return null

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
    console.error('Failed to update wallet balance:', error)
    return null
  }

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
