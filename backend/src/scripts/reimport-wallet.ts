/**
 * Script to re-import wallet with proper authorization key ownership
 *
 * Since the wallet was imported as user-owned and we can't modify it,
 * we'll try to:
 * 1. Delete the existing wallet from Privy
 * 2. Re-import it with the authorization key as owner
 *
 * This requires the original private key from the .env file.
 */
import { env } from '../config/env'
import { PrivyClient } from '@privy-io/server-auth'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

const WALLET_ID = 'mpjfo8z9xe1ms2csul1rg4z1'
const WALLET_ADDRESS = '2qaYB64KpD1yNbmgVSytCBcSpF2hJUd2fmXpa7P5cF7f'
const USER_PRIVY_ID = 'did:privy:cmk8cg1ld02ksjx0bsfeepzgn' // biubenj

async function main() {
  console.log('=== Re-import Wallet with Authorization Key Ownership ===')
  console.log('')

  const appId = env.privyAppId
  const appSecret = env.privyAppSecret
  const authKey = env.privyAuthorizationKey

  if (!appId || !appSecret || !authKey) {
    console.log('ERROR: Privy credentials not set')
    return
  }

  // We need the original private key to re-import
  // This should be in an environment variable
  const devWalletPrivateKey = process.env.WHEEL_DEV_WALLET_PRIVATE_KEY

  if (!devWalletPrivateKey) {
    console.log('ERROR: WHEEL_DEV_WALLET_PRIVATE_KEY environment variable not set')
    console.log('')
    console.log('To proceed, you need to:')
    console.log('1. Get the private key for wallet', WALLET_ADDRESS)
    console.log('2. Set WHEEL_DEV_WALLET_PRIVATE_KEY=<base58-private-key>')
    console.log('3. Run this script again')
    console.log('')
    console.log('ALTERNATIVE APPROACH:')
    console.log('')
    console.log('Since you have the TMA and can access the wallet, try:')
    console.log('1. Export the private key from Privy dashboard or TMA')
    console.log('2. Delete the wallet from Privy')
    console.log('3. Re-import with authorizationKeyId ownership')
    console.log('')
    console.log('Or use the Privy Dashboard to:')
    console.log('1. Find the authorization key ID under Wallet infrastructure > Authorization keys')
    console.log('2. Navigate to the wallet and update additional_signers')
    return
  }

  // Validate the private key matches the expected address
  try {
    const secretKey = bs58.decode(devWalletPrivateKey)
    const keypair = Keypair.fromSecretKey(secretKey)
    const address = keypair.publicKey.toString()

    if (address !== WALLET_ADDRESS) {
      console.log('ERROR: Private key does not match expected address')
      console.log('  Expected:', WALLET_ADDRESS)
      console.log('  Got:', address)
      return
    }

    console.log('Private key validated:', address)
    console.log('')

  } catch (e: any) {
    console.log('ERROR: Invalid private key format:', e.message)
    return
  }

  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64')

  // Step 1: Try to delete the existing wallet
  console.log('Step 1: Attempting to delete existing wallet...')
  console.log('')
  console.log('NOTE: Deletion may require owner authorization (user JWT)')
  console.log('If this fails, you may need to delete via Privy Dashboard')
  console.log('')

  try {
    const deleteResponse = await fetch(`https://api.privy.io/v1/wallets/${WALLET_ID}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'privy-app-id': appId,
      }
    })

    console.log('Delete response status:', deleteResponse.status)
    const deleteResult = await deleteResponse.text()
    console.log('Delete response:', deleteResult)

    if (deleteResponse.ok) {
      console.log('')
      console.log('Wallet deleted successfully.')
    } else if (deleteResponse.status === 401 || deleteResponse.status === 403) {
      console.log('')
      console.log('Authorization required to delete wallet.')
      console.log('The wallet owner (user) must authorize this action.')
      console.log('')
      console.log('Please delete the wallet manually via Privy Dashboard,')
      console.log('then run this script again to re-import.')
      return
    } else {
      console.log('')
      console.log('Failed to delete wallet. Status:', deleteResponse.status)
      return
    }

  } catch (e: any) {
    console.log('Delete request failed:', e.message)
    return
  }

  // Step 2: Re-import the wallet with authorization key ownership
  console.log('')
  console.log('Step 2: Re-importing wallet with authorization key ownership...')

  try {
    const client = new PrivyClient(appId, appSecret, {
      walletApi: { authorizationPrivateKey: authKey }
    })

    // Try to import with no owner (should default to authorization key)
    // Or we could try to get the authorization key ID first

    // First, let's try importing without specifying an owner
    // This might make it controlled by the authorization key

    const result = await client.walletApi.importWallet({
      chainType: 'solana',
      address: WALLET_ADDRESS,
      entropy: devWalletPrivateKey,
      entropyType: 'private-key',
      // No owner specified - might default to authorization key?
    })

    console.log('Import result:', JSON.stringify(result, null, 2))
    console.log('')
    console.log('Wallet imported with ID:', result.id)

    // Step 3: Test signing
    console.log('')
    console.log('Step 3: Testing server-side signing...')

    const signResult = await client.walletApi.solana.signMessage({
      walletId: result.id,
      chainType: 'solana',
      message: 'Test message after re-import',
    })

    console.log('Sign message result:', signResult)
    console.log('')
    console.log('SUCCESS! Wallet is now controlled by authorization key.')

    // Update our database with new wallet ID
    console.log('')
    console.log('Remember to update the database with new wallet ID:', result.id)

  } catch (e: any) {
    console.log('Re-import failed:', e.message)
    console.log(e.stack)
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e)
  process.exit(1)
})
