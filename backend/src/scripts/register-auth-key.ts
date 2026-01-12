/**
 * Script to register authorization key with Privy and add it as wallet signer
 *
 * Steps:
 * 1. Extract public key from our private key
 * 2. Register the public key with Privy API to get a signer_id
 * 3. Add the signer_id to the wallet's additional_signers
 */
import { env } from '../config/env'
import * as crypto from 'crypto'

const WALLET_ID = 'mpjfo8z9xe1ms2csul1rg4z1' // WHEEL dev wallet ID

async function main() {
  console.log('=== Register Authorization Key ===')
  console.log('')

  const appId = env.privyAppId
  const appSecret = env.privyAppSecret
  const authKey = env.privyAuthorizationKey

  if (!appId || !appSecret || !authKey) {
    console.log('ERROR: Privy credentials not set')
    return
  }

  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64')

  // Parse the authorization key
  if (!authKey.startsWith('wallet-auth:')) {
    console.log('ERROR: Invalid authorization key format')
    return
  }

  const keyData = authKey.substring('wallet-auth:'.length)
  const derBuffer = Buffer.from(keyData, 'base64')

  console.log('Authorization key parsed:')
  console.log('  DER length:', derBuffer.length, 'bytes')
  console.log('')

  // Extract public key from the private key DER
  // The DER format for EC private key is PKCS#8 or SEC1
  try {
    // Create a key object from the DER
    const privateKey = crypto.createPrivateKey({
      key: derBuffer,
      format: 'der',
      type: 'pkcs8',
    })

    // Export the public key in DER format
    const publicKeyDer = crypto.createPublicKey(privateKey).export({
      format: 'der',
      type: 'spki',
    })

    const publicKeyBase64 = publicKeyDer.toString('base64')

    console.log('Public key extracted:')
    console.log('  DER length:', publicKeyDer.length, 'bytes')
    console.log('  Base64:', publicKeyBase64.substring(0, 60) + '...')
    console.log('')

    // Step 1: Register the public key with Privy
    console.log('Step 1: Registering authorization key with Privy...')

    const registerResponse = await fetch('https://api.privy.io/v1/authorization_keys', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'privy-app-id': appId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        public_key: publicKeyBase64,
        name: 'ClaudeWheel Server Key',
      })
    })

    const registerResult = await registerResponse.text()
    console.log('Register response status:', registerResponse.status)
    console.log('Register response:', registerResult)

    if (registerResponse.status === 201 || registerResponse.status === 200) {
      const keyInfo = JSON.parse(registerResult)
      const signerId = keyInfo.id

      console.log('')
      console.log('Authorization key registered!')
      console.log('Key ID (signer_id):', signerId)
      console.log('')

      // Step 2: Add the key as an additional signer to the wallet
      console.log('Step 2: Adding key as additional signer to wallet...')

      // For this request, we need to sign with the authorization key
      // The privy-authorization-signature header is required
      // Let's try using the SDK approach instead

      const updateResponse = await fetch(`https://api.privy.io/v1/wallets/${WALLET_ID}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'privy-app-id': appId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          additional_signers: [{ signer_id: signerId }]
        })
      })

      const updateResult = await updateResponse.text()
      console.log('Update response status:', updateResponse.status)
      console.log('Update response:', updateResult)

      if (updateResponse.ok) {
        console.log('')
        console.log('SUCCESS! Authorization key added as additional signer.')
        console.log('')
        console.log('Now testing signing...')

        // Test signing
        const { PrivyClient } = await import('@privy-io/server-auth')
        const client = new PrivyClient(appId, appSecret, {
          walletApi: { authorizationPrivateKey: authKey }
        })

        const result = await client.walletApi.solana.signMessage({
          walletId: WALLET_ID,
          chainType: 'solana',
          message: 'Test message after adding signer',
        })

        console.log('Sign message succeeded:', result)
      } else {
        console.log('')
        console.log('Failed to add additional signer.')

        // The PATCH requires an authorization signature from the current owner
        if (updateResponse.status === 401 || updateResponse.status === 403) {
          console.log('')
          console.log('The wallet owner must authorize adding the signer.')
          console.log('Since the wallet is user-owned, the user must do this from the client.')
          console.log('')
          console.log('Alternative: Re-import the wallet with authorization key ownership.')
        }
      }

    } else if (registerResponse.status === 409) {
      // Key already exists
      console.log('')
      console.log('Authorization key already registered. Checking existing keys...')

      // Try to list keys to find the ID
      const listResponse = await fetch('https://api.privy.io/v1/apps/authorization_keys', {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'privy-app-id': appId,
        }
      })

      if (listResponse.ok) {
        const keys = await listResponse.json()
        console.log('Existing keys:', JSON.stringify(keys, null, 2))
      }
    } else {
      console.log('')
      console.log('Failed to register key.')
    }

  } catch (e: any) {
    console.log('Failed to process key:', e.message)
    console.log(e.stack)
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e)
  process.exit(1)
})
