/**
 * Test Orphaned Launches Migration
 * Directly tests the database queries used in migration
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('              ORPHANED LAUNCHES MIGRATION TEST')
  console.log('═══════════════════════════════════════════════════════════════\n')

  // Step 1: Check what the GET /orphaned-launches endpoint returns
  console.log('📋 Step 1: Checking orphaned-launches query (GET endpoint)...')
  const { data: orphanedGET, error: getError } = await supabase
    .from('pending_token_launches')
    .select(`
      id,
      token_name,
      token_symbol,
      token_mint_address,
      dev_wallet_address,
      status,
      user_token_id,
      created_at,
      telegram_users (telegram_id, telegram_username)
    `)
    .eq('status', 'completed')
    .is('user_token_id', null)
    .not('token_mint_address', 'is', null)
    .order('created_at', { ascending: false })

  if (getError) {
    console.log('  ❌ Error:', getError.message)
  } else {
    console.log(`  Found ${orphanedGET?.length || 0} orphaned launches via GET query`)
    if (orphanedGET?.length) {
      console.table(orphanedGET.map(l => ({
        id: l.id.slice(0, 8),
        symbol: l.token_symbol,
        status: l.status,
        user_token_id: l.user_token_id,
        mint: l.token_mint_address?.slice(0, 12),
      })))
    }
  }
  console.log()

  // Step 2: Check what the POST /migrate-orphaned-launches endpoint uses
  console.log('📋 Step 2: Checking migration query (POST endpoint)...')
  const { data: orphanedPOST, error: postError } = await supabase
    .from('pending_token_launches')
    .select('*')
    .eq('status', 'completed')
    .is('user_token_id', null)
    .not('token_mint_address', 'is', null)

  if (postError) {
    console.log('  ❌ Error:', postError.message)
  } else {
    console.log(`  Found ${orphanedPOST?.length || 0} orphaned launches via POST query`)
    if (orphanedPOST?.length) {
      for (const launch of orphanedPOST) {
        console.log(`\n  Launch: ${launch.token_symbol} (${launch.id.slice(0, 8)})`)
        console.log(`    status: ${launch.status}`)
        console.log(`    user_token_id: ${launch.user_token_id}`)
        console.log(`    token_mint_address: ${launch.token_mint_address}`)
        console.log(`    telegram_user_id: ${launch.telegram_user_id}`)
      }
    }
  }
  console.log()

  // Step 3: Check all completed launches regardless of filters
  console.log('📋 Step 3: All completed launches (no filters)...')
  const { data: allCompleted, error: allError } = await supabase
    .from('pending_token_launches')
    .select('id, token_symbol, status, user_token_id, token_mint_address')
    .eq('status', 'completed')

  if (allError) {
    console.log('  ❌ Error:', allError.message)
  } else {
    console.log(`  Found ${allCompleted?.length || 0} completed launches`)
    if (allCompleted?.length) {
      console.table(allCompleted.map(l => ({
        id: l.id.slice(0, 8),
        symbol: l.token_symbol,
        user_token_id: l.user_token_id || 'NULL',
        mint: l.token_mint_address?.slice(0, 12) || 'NULL',
      })))
    }
  }
  console.log()

  // Step 4: Check user_tokens table
  console.log('📋 Step 4: Current user_tokens table...')
  const { data: userTokens, error: utError } = await supabase
    .from('user_tokens')
    .select('id, token_symbol, token_mint_address, telegram_user_id')

  if (utError) {
    console.log('  ❌ Error:', utError.message)
  } else {
    console.log(`  Found ${userTokens?.length || 0} user tokens`)
    if (userTokens?.length) {
      console.table(userTokens.map(t => ({
        id: t.id.slice(0, 8),
        symbol: t.token_symbol,
        mint: t.token_mint_address?.slice(0, 12),
        tg_user: t.telegram_user_id?.slice(0, 8) || 'NULL',
      })))
    }
  }
  console.log()

  // Step 5: Manually run the migration for TEST2
  if (orphanedPOST && orphanedPOST.length > 0) {
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('              MANUAL MIGRATION ATTEMPT')
    console.log('═══════════════════════════════════════════════════════════════\n')

    for (const launch of orphanedPOST) {
      console.log(`🔄 Migrating: ${launch.token_symbol}...`)

      // Check if user_token already exists for this mint
      const { data: existingToken, error: existingError } = await supabase
        .from('user_tokens')
        .select('id')
        .eq('token_mint_address', launch.token_mint_address)
        .single()

      if (existingError && existingError.code !== 'PGRST116') {
        console.log(`  ⚠️ Error checking existing token: ${existingError.message}`)
      }

      if (existingToken) {
        console.log(`  ℹ️ Token already exists with id: ${existingToken.id}`)
        console.log(`  Updating pending_token_launches.user_token_id...`)

        const { error: updateError } = await supabase
          .from('pending_token_launches')
          .update({ user_token_id: existingToken.id })
          .eq('id', launch.id)

        if (updateError) {
          console.log(`  ❌ Update failed: ${updateError.message}`)
        } else {
          console.log(`  ✅ Updated user_token_id reference`)
        }

        // Also update telegram_user_id on user_tokens if missing
        if (launch.telegram_user_id) {
          const { error: tgError } = await supabase
            .from('user_tokens')
            .update({
              telegram_user_id: launch.telegram_user_id,
              launched_via_telegram: true,
            })
            .eq('id', existingToken.id)
            .is('telegram_user_id', null)

          if (tgError) {
            console.log(`  ⚠️ Failed to update telegram_user_id: ${tgError.message}`)
          } else {
            console.log(`  ✅ Updated telegram_user_id on user_tokens`)
          }
        }
        continue
      }

      // Get or create main user
      console.log(`  Creating user for wallet: ${launch.dev_wallet_address.slice(0, 8)}...`)
      let { data: mainUser, error: userFetchError } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', launch.dev_wallet_address)
        .single()

      if (userFetchError && userFetchError.code === 'PGRST116') {
        console.log(`  User not found, creating new user...`)
        const { data: newUser, error: createUserError } = await supabase
          .from('users')
          .insert({ wallet_address: launch.dev_wallet_address })
          .select('id')
          .single()

        if (createUserError) {
          console.log(`  ❌ Failed to create user: ${createUserError.message}`)
          continue
        }
        mainUser = newUser
        console.log(`  ✅ Created user: ${mainUser?.id}`)
      } else if (userFetchError) {
        console.log(`  ❌ Error fetching user: ${userFetchError.message}`)
        continue
      } else {
        console.log(`  ✅ Found existing user: ${mainUser?.id}`)
      }

      // Create user_token record
      console.log(`  Creating user_token record...`)
      const { data: userToken, error: tokenError } = await supabase
        .from('user_tokens')
        .insert({
          user_id: mainUser?.id,
          telegram_user_id: launch.telegram_user_id,
          token_mint_address: launch.token_mint_address,
          token_symbol: launch.token_symbol,
          token_name: launch.token_name,
          token_image: launch.token_image_url,
          dev_wallet_address: launch.dev_wallet_address,
          dev_wallet_private_key_encrypted: launch.dev_wallet_private_key_encrypted,
          dev_encryption_iv: launch.dev_encryption_iv,
          dev_encryption_auth_tag: launch.dev_encryption_auth_tag || '',
          ops_wallet_address: launch.ops_wallet_address,
          ops_wallet_private_key_encrypted: launch.ops_wallet_private_key_encrypted,
          ops_encryption_iv: launch.ops_encryption_iv,
          ops_encryption_auth_tag: launch.ops_encryption_auth_tag || '',
          launched_via_telegram: true,
          is_active: true,
        })
        .select('id')
        .single()

      if (tokenError) {
        console.log(`  ❌ Failed to create user_token: ${tokenError.message}`)
        console.log(`  Full error:`, tokenError)
        continue
      }

      console.log(`  ✅ Created user_token: ${userToken?.id}`)

      // Create config
      console.log(`  Creating user_token_config...`)
      const { error: configError } = await supabase.from('user_token_config').insert({
        user_token_id: userToken?.id,
        flywheel_active: true,
        algorithm_mode: 'simple',
        min_buy_amount_sol: 0.01,
        max_buy_amount_sol: 0.05,
        slippage_bps: 300,
        auto_claim_enabled: true,
      })

      if (configError) {
        console.log(`  ⚠️ Failed to create config: ${configError.message}`)
      } else {
        console.log(`  ✅ Created config`)
      }

      // Create flywheel state
      console.log(`  Creating user_flywheel_state...`)
      const { error: stateError } = await supabase.from('user_flywheel_state').insert({
        user_token_id: userToken?.id,
        cycle_phase: 'buy',
        buy_count: 0,
        sell_count: 0,
      })

      if (stateError) {
        console.log(`  ⚠️ Failed to create flywheel state: ${stateError.message}`)
      } else {
        console.log(`  ✅ Created flywheel state`)
      }

      // Update pending launch with user_token_id
      console.log(`  Updating pending_token_launches...`)
      const { error: updateLaunchError } = await supabase
        .from('pending_token_launches')
        .update({ user_token_id: userToken?.id })
        .eq('id', launch.id)

      if (updateLaunchError) {
        console.log(`  ⚠️ Failed to update launch: ${updateLaunchError.message}`)
      } else {
        console.log(`  ✅ Updated launch with user_token_id`)
      }

      console.log(`\n✅ Migration complete for ${launch.token_symbol}!`)
    }
  } else {
    console.log('ℹ️ No orphaned launches to migrate')
  }

  console.log('\n═══════════════════════════════════════════════════════════════')
  console.log('                        DONE')
  console.log('═══════════════════════════════════════════════════════════════')
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
