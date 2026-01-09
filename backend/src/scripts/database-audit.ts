/**
 * Database Audit Script
 * Examines all tables, relationships, and identifies issues/gaps
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

interface Issue {
  severity: 'critical' | 'warning' | 'info'
  table: string
  description: string
  affected?: number
  suggestion?: string
}

const issues: Issue[] = []

async function auditDatabase() {
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log('                      DATABASE AUDIT REPORT')
  console.log('═══════════════════════════════════════════════════════════════════════\n')

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. TELEGRAM USERS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📱 TELEGRAM_USERS')
  console.log('─────────────────────────────────────────────────────────────────────')

  const { data: telegramUsers, error: tuErr, count: tuCount } = await supabase
    .from('telegram_users')
    .select('*', { count: 'exact' })

  if (tuErr) {
    console.log('  ❌ Error:', tuErr.message)
    issues.push({ severity: 'critical', table: 'telegram_users', description: `Cannot query: ${tuErr.message}` })
  } else {
    console.log(`  Total records: ${tuCount}`)

    if (telegramUsers) {
      // Check for duplicates
      const telegramIds = telegramUsers.map(u => u.telegram_id)
      const duplicates = telegramIds.filter((id, i) => telegramIds.indexOf(id) !== i)
      if (duplicates.length > 0) {
        issues.push({ severity: 'warning', table: 'telegram_users', description: `Duplicate telegram_ids found`, affected: duplicates.length })
      }

      // Check for missing usernames
      const missingUsernames = telegramUsers.filter(u => !u.telegram_username).length
      if (missingUsernames > 0) {
        console.log(`  ⚠️ Users without username: ${missingUsernames}`)
      }

      console.table(telegramUsers.map(u => ({
        id: u.id?.slice(0, 8) + '...',
        telegram_id: u.telegram_id,
        username: u.telegram_username || '(none)',
        created: new Date(u.created_at).toLocaleDateString()
      })))
    }
  }
  console.log()

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. USERS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('👤 USERS')
  console.log('─────────────────────────────────────────────────────────────────────')

  const { data: users, error: usersErr, count: usersCount } = await supabase
    .from('users')
    .select('*', { count: 'exact' })

  if (usersErr) {
    console.log('  ❌ Error:', usersErr.message)
    issues.push({ severity: 'critical', table: 'users', description: `Cannot query: ${usersErr.message}` })
  } else {
    console.log(`  Total records: ${usersCount}`)
    if (users && users.length > 0) {
      console.table(users.slice(0, 10).map(u => ({
        id: u.id?.slice(0, 8) + '...',
        wallet: u.wallet_address?.slice(0, 12) + '...',
        created: new Date(u.created_at).toLocaleDateString()
      })))
    } else {
      console.log('  (empty)')
    }
  }
  console.log()

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PENDING_TOKEN_LAUNCHES TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🚀 PENDING_TOKEN_LAUNCHES')
  console.log('─────────────────────────────────────────────────────────────────────')

  const { data: launches, error: launchErr, count: launchCount } = await supabase
    .from('pending_token_launches')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (launchErr) {
    console.log('  ❌ Error:', launchErr.message)
    issues.push({ severity: 'critical', table: 'pending_token_launches', description: `Cannot query: ${launchErr.message}` })
  } else {
    console.log(`  Total records: ${launchCount}`)

    if (launches) {
      // Status breakdown
      const statusCounts: Record<string, number> = {}
      launches.forEach(l => {
        statusCounts[l.status] = (statusCounts[l.status] || 0) + 1
      })
      console.log('  Status breakdown:', statusCounts)

      // Check for orphaned launches (completed but no user_token_id)
      const orphaned = launches.filter(l => l.status === 'completed' && !l.user_token_id)
      if (orphaned.length > 0) {
        issues.push({
          severity: 'critical',
          table: 'pending_token_launches',
          description: 'Completed launches without user_token_id (orphaned)',
          affected: orphaned.length,
          suggestion: 'Run orphaned launches migration from admin panel'
        })
        console.log(`  ⚠️ Orphaned launches: ${orphaned.length}`)
      }

      // Check for launches with missing telegram_user_id
      const missingTgUser = launches.filter(l => !l.telegram_user_id)
      if (missingTgUser.length > 0) {
        issues.push({
          severity: 'warning',
          table: 'pending_token_launches',
          description: 'Launches without telegram_user_id',
          affected: missingTgUser.length
        })
      }

      // Check for completed launches with null mint address
      const completedNoMint = launches.filter(l => l.status === 'completed' && !l.token_mint_address)
      if (completedNoMint.length > 0) {
        issues.push({
          severity: 'critical',
          table: 'pending_token_launches',
          description: 'Completed launches without token_mint_address',
          affected: completedNoMint.length,
          suggestion: 'Data integrity issue - completed tokens should have mint address'
        })
      }

      // Check for expired launches that were never processed
      const now = new Date()
      const expiredNotMarked = launches.filter(l =>
        l.status === 'awaiting_deposit' && new Date(l.expires_at) < now
      )
      if (expiredNotMarked.length > 0) {
        issues.push({
          severity: 'warning',
          table: 'pending_token_launches',
          description: 'Awaiting launches past expiry date',
          affected: expiredNotMarked.length,
          suggestion: 'These should be marked as expired'
        })
      }

      // Check for missing encryption data
      const missingEncryption = launches.filter(l =>
        !l.dev_wallet_private_key_encrypted || !l.dev_encryption_iv || !l.dev_encryption_auth_tag
      )
      if (missingEncryption.length > 0) {
        issues.push({
          severity: 'critical',
          table: 'pending_token_launches',
          description: 'Launches missing encryption data for dev wallet',
          affected: missingEncryption.length
        })
      }

      console.table(launches.slice(0, 15).map(l => ({
        id: l.id?.slice(0, 8) + '...',
        symbol: l.token_symbol,
        status: l.status,
        user_token_id: l.user_token_id ? l.user_token_id.slice(0, 8) + '...' : 'NULL',
        tg_user_id: l.telegram_user_id ? l.telegram_user_id.slice(0, 8) + '...' : 'NULL',
        mint: l.token_mint_address ? l.token_mint_address.slice(0, 8) + '...' : '-'
      })))
    }
  }
  console.log()

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. USER_TOKENS TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🪙 USER_TOKENS')
  console.log('─────────────────────────────────────────────────────────────────────')

  const { data: userTokens, error: utErr, count: utCount } = await supabase
    .from('user_tokens')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (utErr) {
    console.log('  ❌ Error:', utErr.message)
    issues.push({ severity: 'critical', table: 'user_tokens', description: `Cannot query: ${utErr.message}` })
  } else {
    console.log(`  Total records: ${utCount}`)

    if (userTokens && userTokens.length > 0) {
      // Check for tokens launched via telegram but missing telegram_user_id
      const tgLaunchedNoId = userTokens.filter(t => t.launched_via_telegram && !t.telegram_user_id)
      if (tgLaunchedNoId.length > 0) {
        issues.push({
          severity: 'critical',
          table: 'user_tokens',
          description: 'Tokens marked as launched_via_telegram but missing telegram_user_id',
          affected: tgLaunchedNoId.length,
          suggestion: 'Run orphaned migration or manually update telegram_user_id'
        })
      }

      // Check for inactive tokens
      const inactive = userTokens.filter(t => !t.is_active).length
      console.log(`  Active: ${utCount! - inactive}, Inactive: ${inactive}`)

      // Check for missing encryption data
      const missingEncryption = userTokens.filter(t =>
        !t.dev_wallet_private_key_encrypted || !t.dev_encryption_iv
      )
      if (missingEncryption.length > 0) {
        issues.push({
          severity: 'critical',
          table: 'user_tokens',
          description: 'Tokens missing encryption data',
          affected: missingEncryption.length
        })
      }

      console.table(userTokens.slice(0, 15).map(t => ({
        id: t.id?.slice(0, 8) + '...',
        symbol: t.token_symbol,
        tg_user_id: t.telegram_user_id ? t.telegram_user_id.slice(0, 8) + '...' : 'NULL',
        via_tg: t.launched_via_telegram ? 'Yes' : 'No',
        active: t.is_active ? 'Yes' : 'No',
        mint: t.token_mint_address?.slice(0, 8) + '...'
      })))
    } else {
      console.log('  (empty)')

      // If pending launches completed but user_tokens is empty
      if (launches && launches.some(l => l.status === 'completed')) {
        issues.push({
          severity: 'critical',
          table: 'user_tokens',
          description: 'Table is empty but there are completed launches',
          suggestion: 'Run orphaned launches migration from admin panel'
        })
      }
    }
  }
  console.log()

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. USER_TOKEN_CONFIG TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('⚙️ USER_TOKEN_CONFIG')
  console.log('─────────────────────────────────────────────────────────────────────')

  const { data: configs, error: configErr, count: configCount } = await supabase
    .from('user_token_config')
    .select('*', { count: 'exact' })

  if (configErr) {
    console.log('  ❌ Error:', configErr.message)
    issues.push({ severity: 'critical', table: 'user_token_config', description: `Cannot query: ${configErr.message}` })
  } else {
    console.log(`  Total records: ${configCount}`)

    if (configs && configs.length > 0) {
      const activeFlywheels = configs.filter(c => c.flywheel_active).length
      console.log(`  Active flywheels: ${activeFlywheels}`)

      // Check for orphaned configs (user_token_id doesn't exist)
      if (userTokens) {
        const tokenIds = new Set(userTokens.map(t => t.id))
        const orphanedConfigs = configs.filter(c => !tokenIds.has(c.user_token_id))
        if (orphanedConfigs.length > 0) {
          issues.push({
            severity: 'warning',
            table: 'user_token_config',
            description: 'Config records referencing non-existent user_tokens',
            affected: orphanedConfigs.length
          })
        }
      }

      console.table(configs.slice(0, 10).map(c => ({
        user_token_id: c.user_token_id?.slice(0, 8) + '...',
        flywheel: c.flywheel_active ? 'Active' : 'Inactive',
        mode: c.algorithm_mode,
        min_buy: c.min_buy_amount_sol,
        max_buy: c.max_buy_amount_sol,
        auto_claim: c.auto_claim_enabled ? 'Yes' : 'No'
      })))
    } else {
      console.log('  (empty)')
    }
  }
  console.log()

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. USER_FLYWHEEL_STATE TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🔄 USER_FLYWHEEL_STATE')
  console.log('─────────────────────────────────────────────────────────────────────')

  const { data: states, error: stateErr, count: stateCount } = await supabase
    .from('user_flywheel_state')
    .select('*', { count: 'exact' })

  if (stateErr) {
    console.log('  ❌ Error:', stateErr.message)
    issues.push({ severity: 'critical', table: 'user_flywheel_state', description: `Cannot query: ${stateErr.message}` })
  } else {
    console.log(`  Total records: ${stateCount}`)

    if (states && states.length > 0) {
      console.table(states.slice(0, 10).map(s => ({
        user_token_id: s.user_token_id?.slice(0, 8) + '...',
        phase: s.cycle_phase,
        buys: s.buy_count,
        sells: s.sell_count,
        updated: new Date(s.updated_at).toLocaleString()
      })))
    } else {
      console.log('  (empty)')
    }
  }
  console.log()

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. AUDIT_LOG TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('📋 AUDIT_LOG')
  console.log('─────────────────────────────────────────────────────────────────────')

  const { data: auditLogs, error: auditErr, count: auditCount } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(20)

  if (auditErr) {
    console.log('  ❌ Error:', auditErr.message)
    issues.push({ severity: 'info', table: 'audit_log', description: `Cannot query: ${auditErr.message}` })
  } else {
    console.log(`  Total records: ${auditCount}`)

    if (auditLogs && auditLogs.length > 0) {
      // Event type breakdown
      const eventCounts: Record<string, number> = {}
      auditLogs.forEach(l => {
        eventCounts[l.event_type] = (eventCounts[l.event_type] || 0) + 1
      })
      console.log('  Recent events:', eventCounts)

      console.table(auditLogs.slice(0, 10).map(l => ({
        event: l.event_type,
        launch_id: l.pending_launch_id?.slice(0, 8) || '-',
        token_id: l.user_token_id?.slice(0, 8) || '-',
        tg_id: l.telegram_id || '-',
        created: new Date(l.created_at).toLocaleString()
      })))
    } else {
      console.log('  (empty)')
    }
  }
  console.log()

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. USER_WALLET_BALANCES TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('💰 USER_WALLET_BALANCES')
  console.log('─────────────────────────────────────────────────────────────────────')

  const { data: balances, error: balErr, count: balCount } = await supabase
    .from('user_wallet_balances')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(20)

  if (balErr) {
    console.log('  ❌ Error:', balErr.message)
  } else {
    console.log(`  Total records: ${balCount}`)

    if (balances && balances.length > 0) {
      console.table(balances.slice(0, 10).map(b => ({
        user_token_id: b.user_token_id?.slice(0, 8) + '...',
        wallet: b.wallet_type,
        sol: Number(b.sol_balance).toFixed(6),
        tokens: Number(b.token_balance).toFixed(2),
        updated: new Date(b.updated_at).toLocaleString()
      })))
    } else {
      console.log('  (empty)')
    }
  }
  console.log()

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. USER_CLAIM_HISTORY TABLE
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('💸 USER_CLAIM_HISTORY')
  console.log('─────────────────────────────────────────────────────────────────────')

  const { data: claims, error: claimErr, count: claimCount } = await supabase
    .from('user_claim_history')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(20)

  if (claimErr) {
    console.log('  ❌ Error:', claimErr.message)
  } else {
    console.log(`  Total records: ${claimCount}`)

    if (claims && claims.length > 0) {
      const totalClaimed = claims.reduce((sum, c) => sum + Number(c.amount_sol || 0), 0)
      console.log(`  Total claimed (visible): ${totalClaimed.toFixed(6)} SOL`)

      console.table(claims.slice(0, 10).map(c => ({
        user_token_id: c.user_token_id?.slice(0, 8) + '...',
        amount: Number(c.amount_sol).toFixed(6) + ' SOL',
        status: c.status,
        tx: c.transaction_signature?.slice(0, 8) + '...' || '-',
        created: new Date(c.created_at).toLocaleString()
      })))
    } else {
      console.log('  (empty)')
    }
  }
  console.log()

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. REFERENTIAL INTEGRITY CHECKS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('🔗 REFERENTIAL INTEGRITY')
  console.log('─────────────────────────────────────────────────────────────────────')

  // Check: pending_token_launches.telegram_user_id -> telegram_users.id
  if (launches && telegramUsers) {
    const tgUserIds = new Set(telegramUsers.map(u => u.id))
    const invalidRefs = launches.filter(l => l.telegram_user_id && !tgUserIds.has(l.telegram_user_id))
    if (invalidRefs.length > 0) {
      issues.push({
        severity: 'critical',
        table: 'pending_token_launches',
        description: 'telegram_user_id references non-existent telegram_users',
        affected: invalidRefs.length
      })
      console.log(`  ❌ Launches with invalid telegram_user_id: ${invalidRefs.length}`)
    } else {
      console.log(`  ✅ All launch telegram_user_id references are valid`)
    }
  }

  // Check: user_tokens.telegram_user_id -> telegram_users.id
  if (userTokens && telegramUsers) {
    const tgUserIds = new Set(telegramUsers.map(u => u.id))
    const invalidRefs = userTokens.filter(t => t.telegram_user_id && !tgUserIds.has(t.telegram_user_id))
    if (invalidRefs.length > 0) {
      issues.push({
        severity: 'critical',
        table: 'user_tokens',
        description: 'telegram_user_id references non-existent telegram_users',
        affected: invalidRefs.length
      })
      console.log(`  ❌ Tokens with invalid telegram_user_id: ${invalidRefs.length}`)
    } else if (userTokens.length > 0) {
      console.log(`  ✅ All token telegram_user_id references are valid`)
    }
  }

  // Check: user_tokens.user_id -> users.id
  if (userTokens && users) {
    const userIds = new Set(users.map(u => u.id))
    const invalidRefs = userTokens.filter(t => t.user_id && !userIds.has(t.user_id))
    if (invalidRefs.length > 0) {
      issues.push({
        severity: 'critical',
        table: 'user_tokens',
        description: 'user_id references non-existent users',
        affected: invalidRefs.length
      })
      console.log(`  ❌ Tokens with invalid user_id: ${invalidRefs.length}`)
    } else if (userTokens.length > 0) {
      console.log(`  ✅ All token user_id references are valid`)
    }
  }

  // Check: Completed launches should have corresponding user_tokens
  if (launches && userTokens) {
    const completedLaunches = launches.filter(l => l.status === 'completed' && l.token_mint_address)
    const tokenMints = new Set(userTokens.map(t => t.token_mint_address))
    const missingTokens = completedLaunches.filter(l => !tokenMints.has(l.token_mint_address))
    if (missingTokens.length > 0) {
      issues.push({
        severity: 'critical',
        table: 'cross-reference',
        description: 'Completed launches without corresponding user_tokens entry',
        affected: missingTokens.length,
        suggestion: 'Run orphaned launches migration'
      })
      console.log(`  ❌ Completed launches missing user_tokens: ${missingTokens.length}`)
    } else if (completedLaunches.length > 0) {
      console.log(`  ✅ All completed launches have user_tokens`)
    }
  }
  console.log()

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log('                          ISSUES SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════════════\n')

  const critical = issues.filter(i => i.severity === 'critical')
  const warnings = issues.filter(i => i.severity === 'warning')
  const info = issues.filter(i => i.severity === 'info')

  console.log(`  🔴 Critical: ${critical.length}`)
  console.log(`  🟡 Warnings: ${warnings.length}`)
  console.log(`  🔵 Info:     ${info.length}`)
  console.log()

  if (critical.length > 0) {
    console.log('🔴 CRITICAL ISSUES:')
    console.log('─────────────────────────────────────────────────────────────────────')
    critical.forEach((issue, i) => {
      console.log(`  ${i + 1}. [${issue.table}] ${issue.description}`)
      if (issue.affected) console.log(`     Affected: ${issue.affected} record(s)`)
      if (issue.suggestion) console.log(`     💡 Suggestion: ${issue.suggestion}`)
    })
    console.log()
  }

  if (warnings.length > 0) {
    console.log('🟡 WARNINGS:')
    console.log('─────────────────────────────────────────────────────────────────────')
    warnings.forEach((issue, i) => {
      console.log(`  ${i + 1}. [${issue.table}] ${issue.description}`)
      if (issue.affected) console.log(`     Affected: ${issue.affected} record(s)`)
      if (issue.suggestion) console.log(`     💡 Suggestion: ${issue.suggestion}`)
    })
    console.log()
  }

  console.log('═══════════════════════════════════════════════════════════════════════')
  console.log('                        RECOMMENDED ACTIONS')
  console.log('═══════════════════════════════════════════════════════════════════════\n')

  if (issues.some(i => i.description.includes('orphaned') || i.description.includes('user_tokens entry'))) {
    console.log('  1. 🔗 Run Orphaned Launches Migration')
    console.log('     Go to Telegram Admin Page > Click "Link" button on completed launches')
    console.log('     This will create missing user_tokens entries\n')
  }

  if (issues.some(i => i.description.includes('telegram_user_id'))) {
    console.log('  2. 🔧 Fix Missing telegram_user_id')
    console.log('     The orphaned migration should also fix this for linked tokens\n')
  }

  if (issues.some(i => i.description.includes('expired'))) {
    console.log('  3. ⏰ Clean Up Expired Launches')
    console.log('     Update status to "expired" for awaiting_deposit launches past expiry\n')
  }

  console.log('═══════════════════════════════════════════════════════════════════════\n')
}

auditDatabase()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Audit failed:', err)
    process.exit(1)
  })
