/**
 * Script to fix wallet delegation by adding authorization key as additional signer
 *
 * The WHEEL dev wallet was imported as user-owned, but the user hasn't delegated it.
 * This script adds the authorization key as an additional signer, enabling server-side signing.
 *
 * Based on Privy docs: https://docs.privy.io/wallets/wallets/update-a-wallet
 */
import { env } from '../config/env'
import { generateAuthorizationSignature } from '@privy-io/server-auth'

const WALLET_ID = 'mpjfo8z9xe1ms2csul1rg4z1' // WHEEL dev wallet ID
const WALLET_ADDRESS = '2qaYB64KpD1yNbmgVSytCBcSpF2hJUd2fmXpa7P5cF7f'

async function main() {
  console.log('=== Fix Wallet Delegation ===')
  console.log('')

  const appId = env.privyAppId
  const appSecret = env.privyAppSecret
  const authKey = env.privyAuthorizationKey

  if (!appId || !appSecret || !authKey) {
    console.log('ERROR: Privy credentials not set')
    return
  }

  // Step 1: List authorization keys to find our key's ID
  console.log('Step 1: Listing authorization keys...')

  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64')

  try {
    // Try to list authorization keys
    const listResponse = await fetch('https://api.privy.io/v1/authorization_keys', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'privy-app-id': appId,
      }
    })

    if (listResponse.ok) {
      const keys = await listResponse.json()
      console.log('Authorization keys:', JSON.stringify(keys, null, 2))
    } else {
      console.log('List keys response:', listResponse.status, await listResponse.text())
    }
  } catch (e: any) {
    console.log('Failed to list keys:', e.message)
  }

  // Step 2: Get the current wallet info
  console.log('')
  console.log('Step 2: Getting wallet info...')

  try {
    const walletResponse = await fetch(`https://api.privy.io/v1/wallets/${WALLET_ID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'privy-app-id': appId,
      }
    })

    if (walletResponse.ok) {
      const wallet = await walletResponse.json()
      console.log('Wallet info:', JSON.stringify(wallet, null, 2))

      // Check if we can see the owner_id format
      if (wallet.owner_id) {
        console.log('')
        console.log('Owner ID:', wallet.owner_id)
        console.log('Additional signers:', wallet.additional_signers)
      }
    } else {
      console.log('Get wallet response:', walletResponse.status, await walletResponse.text())
    }
  } catch (e: any) {
    console.log('Failed to get wallet:', e.message)
  }

  // Step 3: Try to register our authorization key's public key
  console.log('')
  console.log('Step 3: Registering authorization key...')

  // Parse the authorization key to get the public key
  // Format is: wallet-auth:<base64-encoded-DER-private-key>
  if (authKey.startsWith('wallet-auth:')) {
    const keyData = authKey.substring('wallet-auth:'.length)

    try {
      // Decode the base64 DER key
      const derBuffer = Buffer.from(keyData, 'base64')
      console.log('DER key length:', derBuffer.length)
      console.log('First 30 bytes (hex):', derBuffer.slice(0, 30).toString('hex'))

      // Try to register the public key
      // For P-256 keys in DER format, we need to extract the public key portion
      // The private key DER contains: SEQUENCE { version, algorithm, privateKey, [publicKey] }

      // Let's try a different approach - use the SDK to see registered keys
      console.log('')
      console.log('Checking Privy dashboard for registered authorization keys...')
      console.log('You can find the authorization key ID in the Privy dashboard under:')
      console.log('  Wallet infrastructure > Authorization keys')
      console.log('')
      console.log('Once you have the key ID, we can add it as an additional signer.')

    } catch (e: any) {
      console.log('Failed to parse key:', e.message)
    }
  }

  // Step 4: Try different owner configurations
  console.log('')
  console.log('Step 4: Testing alternative approaches...')

  // Option A: Try to update the wallet with the authorization key as owner
  // This requires knowing the authorization key's ID

  // Option B: Try to generate an authorization signature for a test request
  console.log('')
  console.log('Testing authorization signature generation...')

  try {
    const testPayload = {
      method: 'PATCH' as const,
      path: `/v1/wallets/${WALLET_ID}`,
      body: JSON.stringify({ additional_signers: [] }),
    }

    const signature = generateAuthorizationSignature({
      input: testPayload,
      authorizationPrivateKey: authKey,
    })

    console.log('Generated signature successfully!')
    console.log('Signature (first 50 chars):', signature.substring(0, 50) + '...')

    // Now try to make a PATCH request with this signature
    console.log('')
    console.log('Step 5: Attempting to update wallet with auth signature...')

    // First, let's try a minimal update that doesn't change anything
    const patchResponse = await fetch(`https://api.privy.io/v1/wallets/${WALLET_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'privy-app-id': appId,
        'privy-authorization-signature': signature,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Try to clear additional_signers and see what error we get
        // additional_signers: []
      })
    })

    const patchResult = await patchResponse.text()
    console.log('PATCH response status:', patchResponse.status)
    console.log('PATCH response:', patchResult)

    if (patchResponse.ok) {
      console.log('')
      console.log('SUCCESS! Wallet updated.')
    }

  } catch (e: any) {
    console.log('Failed:', e.message)
    console.log(e.toString())
  }

  // Step 5: Check if we can just sign directly now
  console.log('')
  console.log('Step 6: Testing direct signing with authorization signature...')

  try {
    const { PrivyClient } = await import('@privy-io/server-auth')

    const client = new PrivyClient(appId, appSecret, {
      walletApi: { authorizationPrivateKey: authKey }
    })

    // Try to sign a message
    const result = await client.walletApi.solana.signMessage({
      walletId: WALLET_ID,
      chainType: 'solana',
      message: 'Test message from fix-wallet-delegation script',
    })

    console.log('Sign message result:', result)
    console.log('')
    console.log('SUCCESS! Server-side signing is working!')

  } catch (e: any) {
    console.log('Sign message failed:', e.message)

    // Parse the error for more details
    if (e.message.includes('authorization')) {
      console.log('')
      console.log('Authorization error - the wallet needs the authorization key added as a signer.')
      console.log('')
      console.log('SOLUTION OPTIONS:')
      console.log('')
      console.log('Option 1: Add authorization key as additional signer via Privy Dashboard')
      console.log('  1. Go to Privy Dashboard > Wallet infrastructure > Authorization keys')
      console.log('  2. Find or note your authorization key ID')
      console.log('  3. Go to the wallet details and add the key as an additional signer')
      console.log('')
      console.log('Option 2: Re-import the wallet with authorization key ownership')
      console.log('  1. Delete the current wallet from Privy')
      console.log('  2. Re-import with owner: { authorizationKeyId: "<key-id>" }')
      console.log('')
      console.log('Option 3: Use the user delegation flow')
      console.log('  - User must call delegateWallet() from the client SDK')
      console.log('  - This doesnt work in TMA WebView due to modal issues')
    }
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e)
  process.exit(1)
})
