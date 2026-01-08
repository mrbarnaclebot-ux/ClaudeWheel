/**
 * View Supabase Tables - Debug Script
 * Run with: npx ts-node src/scripts/view-tables.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function viewTables() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('                    SUPABASE DATA VIEWER')
  console.log('═══════════════════════════════════════════════════════════════\n')

  // 1. Telegram Users
  console.log('📱 TELEGRAM USERS')
  console.log('─────────────────────────────────────────────────────────────────')
  const { data: telegramUsers, error: tuErr } = await supabase
    .from('telegram_users')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (tuErr) {
    console.log('  Error:', tuErr.message)
  } else if (telegramUsers?.length) {
    console.table(telegramUsers.map(u => ({
      id: u.id?.slice(0, 8) + '...',
      telegram_id: u.telegram_id,
      username: u.telegram_username || '-',
      created: new Date(u.created_at).toLocaleString()
    })))
  } else {
    console.log('  No telegram users found')
  }
  console.log()

  // 2. Pending Token Launches
  console.log('🚀 PENDING TOKEN LAUNCHES')
  console.log('─────────────────────────────────────────────────────────────────')
  const { data: launches, error: launchErr } = await supabase
    .from('pending_token_launches')
    .select(`
      *,
      telegram_users (telegram_id, telegram_username)
    `)
    .order('created_at', { ascending: false })
    .limit(15)

  if (launchErr) {
    console.log('  Error:', launchErr.message)
  } else if (launches?.length) {
    console.table(launches.map(l => ({
      id: l.id?.slice(0, 8) + '...',
      symbol: l.token_symbol,
      status: l.status,
      deposit: l.deposit_received_sol?.toFixed(4) || '0',
      user_token_id: l.user_token_id ? l.user_token_id.slice(0, 8) + '...' : 'NULL',
      telegram_user_id: l.telegram_user_id ? l.telegram_user_id.slice(0, 8) + '...' : 'NULL',
      tg_user: l.telegram_users?.telegram_username || l.telegram_users?.telegram_id || '-',
      mint: l.token_mint_address ? l.token_mint_address.slice(0, 8) + '...' : '-'
    })))
  } else {
    console.log('  No launches found')
  }
  console.log()

  // 3. User Tokens
  console.log('🪙 USER TOKENS')
  console.log('─────────────────────────────────────────────────────────────────')
  const { data: userTokens, error: utErr } = await supabase
    .from('user_tokens')
    .select(`
      *,
      user_token_config (flywheel_active, algorithm_mode)
    `)
    .order('created_at', { ascending: false })
    .limit(15)

  if (utErr) {
    console.log('  Error:', utErr.message)
  } else if (userTokens?.length) {
    console.table(userTokens.map(t => {
      const config = Array.isArray(t.user_token_config) ? t.user_token_config[0] : t.user_token_config
      return {
        id: t.id?.slice(0, 8) + '...',
        symbol: t.token_symbol,
        name: t.token_name?.slice(0, 15) || '-',
        telegram_user_id: t.telegram_user_id ? t.telegram_user_id.slice(0, 8) + '...' : 'NULL',
        launched_via_tg: t.launched_via_telegram ? 'Yes' : 'No',
        is_active: t.is_active ? 'Yes' : 'No',
        flywheel: config?.flywheel_active ? 'Active' : 'Inactive',
        mint: t.token_mint_address?.slice(0, 8) + '...'
      }
    }))
  } else {
    console.log('  No user tokens found')
  }
  console.log()

  // 4. Check for orphaned launches (completed but no user_token_id)
  console.log('⚠️  ORPHANED LAUNCHES (completed but no user_token_id)')
  console.log('─────────────────────────────────────────────────────────────────')
  const { data: orphaned, error: orphErr } = await supabase
    .from('pending_token_launches')
    .select('*')
    .eq('status', 'completed')
    .is('user_token_id', null)

  if (orphErr) {
    console.log('  Error:', orphErr.message)
  } else if (orphaned?.length) {
    console.log(`  Found ${orphaned.length} orphaned launch(es):`)
    console.table(orphaned.map(l => ({
      id: l.id?.slice(0, 8) + '...',
      symbol: l.token_symbol,
      telegram_user_id: l.telegram_user_id ? l.telegram_user_id.slice(0, 8) + '...' : 'NULL',
      mint: l.token_mint_address?.slice(0, 8) + '...'
    })))
  } else {
    console.log('  ✅ No orphaned launches found')
  }
  console.log()

  // 5. Check for user_tokens with missing telegram_user_id
  console.log('⚠️  USER TOKENS WITH MISSING TELEGRAM_USER_ID')
  console.log('─────────────────────────────────────────────────────────────────')
  const { data: missingTgId, error: missingErr } = await supabase
    .from('user_tokens')
    .select('*')
    .eq('launched_via_telegram', true)
    .is('telegram_user_id', null)

  if (missingErr) {
    console.log('  Error:', missingErr.message)
  } else if (missingTgId?.length) {
    console.log(`  Found ${missingTgId.length} token(s) with missing telegram_user_id:`)
    console.table(missingTgId.map(t => ({
      id: t.id?.slice(0, 8) + '...',
      symbol: t.token_symbol,
      mint: t.token_mint_address?.slice(0, 8) + '...'
    })))
  } else {
    console.log('  ✅ All telegram-launched tokens have telegram_user_id set')
  }
  console.log()

  // 6. Summary
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('                         SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════')

  const { count: totalLaunches } = await supabase.from('pending_token_launches').select('*', { count: 'exact', head: true })
  const { count: completedLaunches } = await supabase.from('pending_token_launches').select('*', { count: 'exact', head: true }).eq('status', 'completed')
  const { count: totalTokens } = await supabase.from('user_tokens').select('*', { count: 'exact', head: true })
  const { count: activeTokens } = await supabase.from('user_tokens').select('*', { count: 'exact', head: true }).eq('is_active', true)
  const { count: tgUsers } = await supabase.from('telegram_users').select('*', { count: 'exact', head: true })

  console.log(`  Total Telegram Users:    ${tgUsers || 0}`)
  console.log(`  Total Launches:          ${totalLaunches || 0} (${completedLaunches || 0} completed)`)
  console.log(`  Total User Tokens:       ${totalTokens || 0} (${activeTokens || 0} active)`)
  console.log(`  Orphaned Launches:       ${orphaned?.length || 0}`)
  console.log(`  Missing telegram_user_id: ${missingTgId?.length || 0}`)
  console.log()
}

viewTables()
  .then(() => {
    console.log('Done!')
    process.exit(0)
  })
  .catch(err => {
    console.error('Error:', err)
    process.exit(1)
  })
