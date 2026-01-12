/**
 * Recover SOL from a legacy Supabase wallet
 *
 * Usage: npx tsx src/scripts/recover-wallet.ts <wallet_address> <destination_address>
 *
 * This script:
 * 1. Queries Supabase for the encrypted private key
 * 2. Decrypts it using ENCRYPTION_MASTER_KEY
 * 3. Transfers all SOL (minus fees) to the destination address
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { decrypt } from '../services/encryption.service'

const WALLET_ADDRESS = process.argv[2] || 'DNu7DZnS9PFcSvfswxfj6iqT6bjHcopFhdVATQWVKdjH'
const DESTINATION_ADDRESS = process.argv[3]

async function main() {
  console.log('='.repeat(60))
  console.log('WALLET RECOVERY SCRIPT')
  console.log('='.repeat(60))
  console.log(`\nWallet to recover: ${WALLET_ADDRESS}`)

  if (!DESTINATION_ADDRESS) {
    console.log('\nUsage: npx tsx src/scripts/recover-wallet.ts <wallet_address> <destination_address>')
    console.log('\nFirst, let me check the wallet balance and find the encrypted key...\n')
  } else {
    console.log(`Destination: ${DESTINATION_ADDRESS}\n`)
  }

  // Initialize Supabase
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY required')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Initialize Solana connection
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
  const connection = new Connection(rpcUrl, 'confirmed')

  // Check wallet balance first
  console.log('Checking wallet balance...')
  try {
    const balance = await connection.getBalance(new PublicKey(WALLET_ADDRESS))
    console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL (${balance} lamports)`)

    if (balance === 0) {
      console.log('\nWallet is empty, nothing to recover.')
      process.exit(0)
    }
  } catch (error) {
    console.error('Failed to check balance:', error)
  }

  // Look for the wallet in user_tokens table
  console.log('\nSearching for wallet in user_tokens table...')
  const { data: userToken, error: tokenError } = await supabase
    .from('user_tokens')
    .select('id, token_symbol, dev_wallet_address, dev_wallet_private_key_encrypted, encryption_iv, encryption_auth_tag')
    .eq('dev_wallet_address', WALLET_ADDRESS)
    .single()

  if (tokenError || !userToken) {
    console.log('Not found in user_tokens, checking pending_token_launches...')

    // Check pending_token_launches (including refunded ones)
    // Note: column names are different here: dev_encryption_iv, dev_encryption_auth_tag
    const { data: pendingLaunches, error: launchError } = await supabase
      .from('pending_token_launches')
      .select('id, token_symbol, status, dev_wallet_address, dev_wallet_private_key_encrypted, dev_encryption_iv, dev_encryption_auth_tag')
      .eq('dev_wallet_address', WALLET_ADDRESS)

    const pendingLaunch = pendingLaunches?.[0]

    if (launchError || !pendingLaunch) {
      console.error('\nWallet not found in any table!')
      console.log('\nChecking all tables for this address...')

      // Try to find anywhere
      const { data: allTokens } = await supabase
        .from('user_tokens')
        .select('dev_wallet_address, token_symbol')

      const { data: allLaunches } = await supabase
        .from('pending_token_launches')
        .select('dev_wallet_address, token_symbol, status')

      console.log('\nAll user_tokens dev wallets:')
      allTokens?.forEach(t => console.log(`  - ${t.dev_wallet_address} (${t.token_symbol})`))

      console.log('\nAll pending_token_launches dev wallets:')
      allLaunches?.forEach(l => console.log(`  - ${l.dev_wallet_address} (${l.token_symbol}) [${l.status}]`))

      process.exit(1)
    }

    console.log(`Found in pending_token_launches: ${pendingLaunch.token_symbol} [${pendingLaunch.status}]`)
    // Map pending_token_launches column names to expected format
    await recoverFromEncrypted(connection, {
      dev_wallet_address: pendingLaunch.dev_wallet_address,
      dev_wallet_private_key_encrypted: pendingLaunch.dev_wallet_private_key_encrypted,
      encryption_iv: pendingLaunch.dev_encryption_iv,
      encryption_auth_tag: pendingLaunch.dev_encryption_auth_tag || '',
    }, DESTINATION_ADDRESS)
  } else {
    console.log(`Found in user_tokens: ${userToken.token_symbol}`)
    await recoverFromEncrypted(connection, userToken, DESTINATION_ADDRESS)
  }
}

async function recoverFromEncrypted(
  connection: Connection,
  record: {
    dev_wallet_private_key_encrypted: string
    encryption_iv: string
    encryption_auth_tag: string
    dev_wallet_address: string
  },
  destinationAddress?: string
) {
  console.log('\nDecrypting private key...')

  try {
    const privateKeyBase58 = decrypt({
      ciphertext: record.dev_wallet_private_key_encrypted,
      iv: record.encryption_iv,
      authTag: record.encryption_auth_tag
    })

    // Verify the key
    const secretKey = bs58.decode(privateKeyBase58)
    const keypair = Keypair.fromSecretKey(secretKey)
    const derivedAddress = keypair.publicKey.toString()

    if (derivedAddress !== record.dev_wallet_address) {
      console.error(`ERROR: Decrypted key derives to ${derivedAddress}, expected ${record.dev_wallet_address}`)
      process.exit(1)
    }

    console.log(`Decryption successful! Key matches wallet address.`)

    // Get current balance
    const balance = await connection.getBalance(keypair.publicKey)
    console.log(`\nCurrent balance: ${balance / LAMPORTS_PER_SOL} SOL`)

    if (!destinationAddress) {
      console.log('\n' + '='.repeat(60))
      console.log('To transfer the SOL, run:')
      console.log(`npx tsx src/scripts/recover-wallet.ts ${record.dev_wallet_address} <YOUR_DESTINATION_WALLET>`)
      console.log('='.repeat(60))

      // Also output the private key so user can import to Phantom if needed
      console.log('\nAlternatively, here is the private key to import into Phantom:')
      console.log(privateKeyBase58)
      return
    }

    // Calculate transfer amount (leave 5000 lamports for fees)
    const feeBuffer = 5000
    const transferAmount = balance - feeBuffer

    if (transferAmount <= 0) {
      console.log('Balance too low to transfer after fees')
      process.exit(1)
    }

    console.log(`\nTransferring ${transferAmount / LAMPORTS_PER_SOL} SOL to ${destinationAddress}...`)

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(destinationAddress),
        lamports: transferAmount
      })
    )

    const signature = await sendAndConfirmTransaction(connection, transaction, [keypair])

    console.log(`\nSuccess! Transaction signature: ${signature}`)
    console.log(`https://solscan.io/tx/${signature}`)

  } catch (error) {
    console.error('Decryption failed:', error)
    console.log('\nMake sure ENCRYPTION_MASTER_KEY is set correctly in .env')
    process.exit(1)
  }
}

main().catch(console.error)
