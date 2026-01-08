/**
 * Migration Script: Recover Completed Token Launches
 *
 * This script finds pending_token_launches with status='completed' that don't have
 * corresponding user_tokens records, and creates them.
 *
 * Run with: npx ts-node src/scripts/migrate-completed-launches.ts
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface CompletedLaunch {
  id: string
  telegram_user_id: string
  token_name: string
  token_symbol: string
  token_description: string | null
  token_image_url: string | null
  token_mint_address: string
  dev_wallet_address: string
  dev_wallet_private_key_encrypted: string
  dev_encryption_iv: string
  dev_encryption_auth_tag: string | null
  ops_wallet_address: string
  ops_wallet_private_key_encrypted: string
  ops_encryption_iv: string
  ops_encryption_auth_tag: string | null
  user_token_id: string | null
}

async function migrateCompletedLaunches() {
  console.log('🔍 Finding completed launches without user_tokens...\n')

  // Find completed launches that don't have a user_token_id set
  const { data: completedLaunches, error: fetchError } = await supabase
    .from('pending_token_launches')
    .select('*')
    .eq('status', 'completed')
    .is('user_token_id', null)
    .not('token_mint_address', 'is', null)

  if (fetchError) {
    console.error('❌ Error fetching completed launches:', fetchError)
    process.exit(1)
  }

  if (!completedLaunches || completedLaunches.length === 0) {
    console.log('✅ No orphaned completed launches found. All good!')
    return
  }

  console.log(`📋 Found ${completedLaunches.length} completed launch(es) to migrate:\n`)

  for (const launch of completedLaunches as CompletedLaunch[]) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`🪙 ${launch.token_name} (${launch.token_symbol})`)
    console.log(`   Mint: ${launch.token_mint_address}`)
    console.log(`   Dev Wallet: ${launch.dev_wallet_address.slice(0, 8)}...`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

    try {
      // Check if user_token already exists for this mint
      const { data: existingToken } = await supabase
        .from('user_tokens')
        .select('id')
        .eq('token_mint_address', launch.token_mint_address)
        .single()

      if (existingToken) {
        console.log(`   ⚠️ Token already exists in user_tokens (id: ${existingToken.id})`)
        // Update the pending_token_launches to reference it
        await supabase
          .from('pending_token_launches')
          .update({ user_token_id: existingToken.id })
          .eq('id', launch.id)
        console.log(`   ✅ Updated pending_token_launches reference`)
        continue
      }

      // Get or create main user
      let { data: mainUser } = await supabase
        .from('users')
        .select('id')
        .eq('wallet_address', launch.dev_wallet_address)
        .single()

      if (!mainUser) {
        const { data: newUser, error: createUserError } = await supabase
          .from('users')
          .insert({ wallet_address: launch.dev_wallet_address })
          .select('id')
          .single()

        if (createUserError) {
          console.error(`   ❌ Failed to create user:`, createUserError)
          continue
        }
        mainUser = newUser
        console.log(`   👤 Created user: ${mainUser?.id}`)
      } else {
        console.log(`   👤 Found existing user: ${mainUser.id}`)
      }

      // Create user_token record
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
          encryption_iv: launch.dev_encryption_iv,
          encryption_auth_tag: launch.dev_encryption_auth_tag || '',
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
        console.error(`   ❌ Failed to create user_token:`, tokenError)
        continue
      }

      console.log(`   📝 Created user_token: ${userToken?.id}`)

      // Create config with flywheel enabled
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
        console.error(`   ⚠️ Failed to create config:`, configError)
      } else {
        console.log(`   ⚙️ Created user_token_config`)
      }

      // Create flywheel state
      const { error: stateError } = await supabase.from('user_flywheel_state').insert({
        user_token_id: userToken?.id,
        cycle_phase: 'buy',
        buy_count: 0,
        sell_count: 0,
      })

      if (stateError) {
        console.error(`   ⚠️ Failed to create flywheel state:`, stateError)
      } else {
        console.log(`   🔄 Created user_flywheel_state`)
      }

      // Update pending_token_launches with user_token_id
      await supabase
        .from('pending_token_launches')
        .update({ user_token_id: userToken?.id })
        .eq('id', launch.id)

      console.log(`   ✅ Migration complete for ${launch.token_symbol}!`)

    } catch (error) {
      console.error(`   ❌ Unexpected error:`, error)
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ Migration complete!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

// Run the migration
migrateCompletedLaunches()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
