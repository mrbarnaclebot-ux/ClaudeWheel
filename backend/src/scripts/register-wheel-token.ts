// ═══════════════════════════════════════════════════════════════════════════
// REGISTER WHEEL TOKEN SCRIPT
// Registers the platform WHEEL token as a user token to enable TWAP/VWAP mode
// Run with: npx tsx src/scripts/register-wheel-token.ts
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '../config/database'
import { env } from '../config/env'
import { encrypt } from '../services/encryption.service'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

// WHEEL token constants
const WHEEL_TOKEN_MINT = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'
const WHEEL_TOKEN_SYMBOL = 'WHEEL'
const WHEEL_TOKEN_NAME = 'Claude Flywheel'
const WHEEL_TOKEN_DECIMALS = 9

// Platform user ID (deterministic UUID for the platform)
const PLATFORM_USER_ID = '00000000-0000-0000-0000-000000000001'
const PLATFORM_WALLET = 'PLATFORM_WHEEL' // Placeholder, actual wallets are from env

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('WHEEL Token Registration Script')
  console.log('═══════════════════════════════════════════════════════════════\n')

  if (!supabase) {
    console.error('❌ Supabase not configured. Cannot register WHEEL token.')
    process.exit(1)
  }

  // Check for required environment variables
  if (!env.devWalletPrivateKey) {
    console.error('❌ DEV_WALLET_PRIVATE_KEY not set. Cannot register WHEEL token.')
    process.exit(1)
  }

  if (!env.opsWalletPrivateKey) {
    console.error('❌ OPS_WALLET_PRIVATE_KEY not set. Cannot register WHEEL token.')
    process.exit(1)
  }

  try {
    // Derive wallet addresses from private keys
    const devSecretKey = bs58.decode(env.devWalletPrivateKey)
    const devKeypair = Keypair.fromSecretKey(devSecretKey)
    const devWalletAddress = devKeypair.publicKey.toString()

    const opsSecretKey = bs58.decode(env.opsWalletPrivateKey)
    const opsKeypair = Keypair.fromSecretKey(opsSecretKey)
    const opsWalletAddress = opsKeypair.publicKey.toString()

    console.log(`Dev wallet: ${devWalletAddress}`)
    console.log(`Ops wallet: ${opsWalletAddress}\n`)

    // Step 1: Check if platform user exists, create if not
    console.log('Step 1: Checking for platform user...')
    const { data: existingUser, error: userCheckError } = await supabase
      .from('users')
      .select('id, wallet_address')
      .eq('id', PLATFORM_USER_ID)
      .single()

    if (userCheckError && userCheckError.code !== 'PGRST116') {
      throw new Error(`Failed to check for platform user: ${userCheckError.message}`)
    }

    if (!existingUser) {
      console.log('   Creating platform user...')
      const { error: createUserError } = await supabase
        .from('users')
        .insert([{
          id: PLATFORM_USER_ID,
          wallet_address: PLATFORM_WALLET,
          created_at: new Date().toISOString(),
        }])

      if (createUserError) {
        throw new Error(`Failed to create platform user: ${createUserError.message}`)
      }
      console.log('   ✅ Platform user created')
    } else {
      console.log('   ✅ Platform user already exists')
    }

    // Step 2: Check if WHEEL token is already registered
    console.log('\nStep 2: Checking if WHEEL token is already registered...')
    const { data: existingToken, error: tokenCheckError } = await supabase
      .from('user_tokens')
      .select('id, token_symbol')
      .eq('token_mint_address', WHEEL_TOKEN_MINT)
      .single()

    if (tokenCheckError && tokenCheckError.code !== 'PGRST116') {
      throw new Error(`Failed to check for existing token: ${tokenCheckError.message}`)
    }

    let tokenId: string

    if (existingToken) {
      console.log(`   ✅ WHEEL token already registered (ID: ${existingToken.id})`)
      tokenId = existingToken.id
    } else {
      // Step 3: Register WHEEL token directly (bypassing the service to avoid trading_route issue)
      console.log('\nStep 3: Registering WHEEL token...')

      // Encrypt the wallet keys
      const encryptedDevKey = encrypt(env.devWalletPrivateKey)
      const encryptedOpsKey = encrypt(env.opsWalletPrivateKey)

      // Insert the token
      const { data: tokenData, error: tokenError } = await supabase
        .from('user_tokens')
        .insert([{
          user_id: PLATFORM_USER_ID,
          token_mint_address: WHEEL_TOKEN_MINT,
          token_symbol: WHEEL_TOKEN_SYMBOL,
          token_name: WHEEL_TOKEN_NAME,
          token_decimals: WHEEL_TOKEN_DECIMALS,
          dev_wallet_address: devWalletAddress,
          dev_wallet_private_key_encrypted: encryptedDevKey.ciphertext,
          dev_encryption_iv: encryptedDevKey.iv,
          dev_encryption_auth_tag: encryptedDevKey.authTag,
          ops_wallet_address: opsWalletAddress,
          ops_wallet_private_key_encrypted: encryptedOpsKey.ciphertext,
          ops_encryption_iv: encryptedOpsKey.iv,
          ops_encryption_auth_tag: encryptedOpsKey.authTag,
          is_active: true,
          is_graduated: true, // WHEEL is already on Jupiter
        }])
        .select()
        .single()

      if (tokenError) {
        throw new Error(`Failed to register token: ${tokenError.message}`)
      }

      tokenId = tokenData.id
      console.log(`   ✅ WHEEL token registered (ID: ${tokenId})`)

      // Create config - use only columns that exist in base schema (migration 003)
      // algorithm_mode='simple' for now; will update to 'twap_vwap' after migrations are applied
      const { error: configError } = await supabase
        .from('user_token_config')
        .insert([{
          user_token_id: tokenId,
          flywheel_active: true,
          market_making_enabled: true,
          auto_claim_enabled: true,
          fee_threshold_sol: 0.05,
          min_buy_amount_sol: 0.02,
          max_buy_amount_sol: 0.1,
          max_sell_amount_tokens: 1000000,
          buy_interval_minutes: 1,
          slippage_bps: 300,
          algorithm_mode: 'simple', // Start with simple, update after migrations
          target_sol_allocation: 30,
          target_token_allocation: 70,
          rebalance_threshold: 10,
          use_twap: true, // Original schema has use_twap, not twap_enabled
          twap_threshold_usd: 50,
        }])

      if (configError) {
        // Clean up token if config fails
        await supabase.from('user_tokens').delete().eq('id', tokenId)
        throw new Error(`Failed to create config: ${configError.message}`)
      }

      // Create flywheel state - use only columns that exist in base schema (migration 003)
      const { error: stateError } = await supabase
        .from('user_flywheel_state')
        .insert([{
          user_token_id: tokenId,
          cycle_phase: 'buy',
          buy_count: 0,
          sell_count: 0,
          sell_phase_token_snapshot: 0,
          sell_amount_per_tx: 0,
        }])

      if (stateError) {
        // Clean up
        await supabase.from('user_token_config').delete().eq('user_token_id', tokenId)
        await supabase.from('user_tokens').delete().eq('id', tokenId)
        throw new Error(`Failed to create flywheel state: ${stateError.message}`)
      }
    }

    // Step 4: Verify and show final config
    console.log('\nStep 4: Verifying configuration...')
    const { data: finalConfig } = await supabase
      .from('user_token_config')
      .select('*')
      .eq('user_token_id', tokenId)
      .single()

    if (finalConfig) {
      console.log('   ✅ Configuration verified')
      console.log('\n═══════════════════════════════════════════════════════════════')
      console.log('✅ WHEEL token registered successfully!')
      console.log('═══════════════════════════════════════════════════════════════\n')

      console.log('Current configuration:')
      console.log(JSON.stringify({
        algorithm_mode: finalConfig.algorithm_mode,
        flywheel_active: finalConfig.flywheel_active,
        use_twap: finalConfig.use_twap,
      }, null, 2))
    }

    console.log('\n⚠️  NEXT STEPS:')
    console.log('   1. Apply migrations 005 and 007 in Supabase SQL Editor')
    console.log('   2. Update algorithm_mode to "twap_vwap" in the database')
    console.log('   3. Set WHEEL_FLYWHEEL_ENABLED=false in your environment')
    console.log('   4. WHEEL will be processed by the multi-user flywheel job\n')

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  process.exit(0)
}

main()
