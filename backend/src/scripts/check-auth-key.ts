/**
 * Script to analyze existing authorization key and test signing
 */
import { env } from '../config/env'
import { PrivyClient, generateAuthorizationSignature } from '@privy-io/server-auth'

async function main() {
  console.log('=== Analyzing Authorization Key ===')
  console.log('')

  const appId = env.privyAppId
  const appSecret = env.privyAppSecret
  const authKey = env.privyAuthorizationKey

  if (!appId || !appSecret || !authKey) {
    console.log('ERROR: Privy credentials not set')
    return
  }

  // Parse the authorization key format
  console.log('Auth key format:')
  if (authKey.startsWith('wallet-auth:')) {
    const keyData = authKey.substring('wallet-auth:'.length)
    console.log('  Prefix: wallet-auth')
    console.log('  Key data (first 50 chars):', keyData.substring(0, 50) + '...')
    console.log('  Key data length:', keyData.length)

    // Try to decode the base64 key
    try {
      const decoded = Buffer.from(keyData, 'base64')
      console.log('  Decoded key length:', decoded.length)
      console.log('  First bytes (hex):', decoded.slice(0, 20).toString('hex'))
    } catch (e) {
      console.log('  Failed to decode as base64')
    }
  } else {
    console.log('  Unknown format')
    console.log('  First 50 chars:', authKey.substring(0, 50) + '...')
  }

  console.log('')
  console.log('=== Testing Privy SDK Signing ===')

  // Initialize client with the key
  const client = new PrivyClient(appId, appSecret, {
    walletApi: { authorizationPrivateKey: authKey }
  })

  // Try to generate an authorization signature for a test request
  try {
    const testPayload = {
      method: 'GET',
      path: '/v1/wallets/mpjfo8z9xe1ms2csul1rg4z1',
      body: null,
    }

    const signature = generateAuthorizationSignature({
      input: testPayload,
      authorizationPrivateKey: authKey,
    })

    console.log('Generated signature:', signature.substring(0, 50) + '...')
    console.log('Signature length:', signature.length)
  } catch (e: any) {
    console.log('Failed to generate signature:', e.message)
  }

  console.log('')
  console.log('=== Trying to Sign Transaction with SDK ===')

  // Let's try to use the SDK directly to sign
  const walletAddress = '2qaYB64KpD1yNbmgVSytCBcSpF2hJUd2fmXpa7P5cF7f'

  try {
    // Create a simple test message
    const result = await client.walletApi.solana.signMessage({
      address: walletAddress,
      chainType: 'solana',
      message: 'Test message',
    })

    console.log('Sign message result:', result)
  } catch (e: any) {
    console.log('Sign message failed:', e.message)
    console.log('Full error:', e.toString())
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e)
  process.exit(1)
})
