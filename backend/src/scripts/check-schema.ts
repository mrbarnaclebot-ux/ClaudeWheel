/**
 * Check user_tokens table schema
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('                    TABLE SCHEMA CHECK')
  console.log('═══════════════════════════════════════════════════════════════\n')

  // Get user_tokens columns from information_schema
  const { data, error } = await supabase
    .rpc('get_table_columns', { table_name: 'user_tokens' })

  if (error) {
    console.log('RPC not available, trying direct query...')

    // Try inserting with just the essential fields to see what columns exist
    const { error: insertError } = await supabase
      .from('user_tokens')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        telegram_user_id: '00000000-0000-0000-0000-000000000000',
        token_mint_address: 'test_' + Date.now(),
        token_symbol: 'TEST',
        token_name: 'Test Token',
        dev_wallet_address: 'test',
        ops_wallet_address: 'test',
        launched_via_telegram: true,
        is_active: true,
      })

    console.log('Insert test result:', insertError?.message || 'Success')
    console.log('Full error:', insertError)
  }

  // Check pending_token_launches columns that have encryption data
  console.log('\n📋 Checking pending_token_launches encryption columns...')
  const { data: launch, error: launchError } = await supabase
    .from('pending_token_launches')
    .select('*')
    .eq('status', 'completed')
    .single()

  if (launchError) {
    console.log('Error:', launchError.message)
  } else {
    console.log('Encryption columns in pending_token_launches:')
    console.log('  dev_wallet_private_key_encrypted:', launch.dev_wallet_private_key_encrypted ? 'YES' : 'NO')
    console.log('  dev_encryption_iv:', launch.dev_encryption_iv ? 'YES' : 'NO')
    console.log('  dev_encryption_auth_tag:', launch.dev_encryption_auth_tag ? 'YES' : 'NO')
    console.log('  ops_wallet_private_key_encrypted:', launch.ops_wallet_private_key_encrypted ? 'YES' : 'NO')
    console.log('  ops_encryption_iv:', launch.ops_encryption_iv ? 'YES' : 'NO')
    console.log('  ops_encryption_auth_tag:', launch.ops_encryption_auth_tag ? 'YES' : 'NO')

    console.log('\nAll columns in pending_token_launches:')
    const keys = Object.keys(launch).sort()
    keys.forEach(key => {
      const value = launch[key]
      const display = value === null ? 'NULL'
        : typeof value === 'string' && value.length > 30 ? value.slice(0, 30) + '...'
        : value
      console.log(`  ${key}: ${display}`)
    })
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
