/**
 * Check TEST2 Launch Details
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  const { data, error } = await supabase
    .from('pending_token_launches')
    .select('*')
    .eq('status', 'completed')
    .eq('token_symbol', 'TEST2')
    .single()

  if (error) {
    console.log('Error:', error.message)
    return
  }

  console.log('\nTEST2 Completed Launch Details:')
  console.log('═════════════════════════════════════════════════════════')
  console.log('ID:', data.id)
  console.log('Token:', data.token_name, '(' + data.token_symbol + ')')
  console.log('Mint:', data.token_mint_address)
  console.log('Status:', data.status)
  console.log('')
  console.log('telegram_user_id:', data.telegram_user_id)
  console.log('user_token_id:', data.user_token_id || '⚠️ NULL (needs migration)')
  console.log('')
  console.log('Dev Wallet:', data.dev_wallet_address)
  console.log('Ops Wallet:', data.ops_wallet_address)
  console.log('')
  console.log('Has dev_wallet_private_key_encrypted:', data.dev_wallet_private_key_encrypted ? 'YES' : 'NO')
  console.log('Has dev_encryption_iv:', data.dev_encryption_iv ? 'YES' : 'NO')
  console.log('Has dev_encryption_auth_tag:', data.dev_encryption_auth_tag ? 'YES' : 'NO')
  console.log('Has ops_wallet_private_key_encrypted:', data.ops_wallet_private_key_encrypted ? 'YES' : 'NO')
  console.log('Has ops_encryption_iv:', data.ops_encryption_iv ? 'YES' : 'NO')
  console.log('Has ops_encryption_auth_tag:', data.ops_encryption_auth_tag ? 'YES' : 'NO')
  console.log('')
  console.log('Created:', data.created_at)
  console.log('Updated:', data.updated_at)
  console.log('Error Message:', data.error_message || 'None')
  console.log('═════════════════════════════════════════════════════════')
  console.log('')
  console.log('📋 NEXT STEP: Click "Link" button on Telegram admin page')
  console.log('   This will create the user_tokens record and enable /mytokens')
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
