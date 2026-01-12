/**
 * Script to get the signer ID (authorization key ID) from Privy
 *
 * The signer ID is needed for the new useSigners API
 */
import { env } from '../config/env'

const WALLET_ID = 'mpjfo8z9xe1ms2csul1rg4z1'

async function main() {
  console.log('=== Get Signer ID ===')
  console.log('')

  const appId = env.privyAppId
  const appSecret = env.privyAppSecret

  if (!appId || !appSecret) {
    console.log('ERROR: Privy credentials not set')
    return
  }

  const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString('base64')

  // Try to get wallet info which might show the owner/signer details
  console.log('Getting wallet info...')

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
      console.log('')
      console.log('Owner ID (this might be the signer ID):', wallet.owner_id)
      console.log('Additional signers:', wallet.additional_signers)
    } else {
      console.log('Get wallet response:', walletResponse.status, await walletResponse.text())
    }
  } catch (e: any) {
    console.log('Failed to get wallet:', e.message)
  }

  // Try listing signers/authorization keys
  console.log('')
  console.log('Trying to list authorization keys...')

  const endpoints = [
    '/v1/authorization_keys',
    '/v1/signers',
    '/v1/apps/authorization_keys',
    '/v1/key_quorums',
  ]

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`https://api.privy.io${endpoint}`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'privy-app-id': appId,
        }
      })

      console.log(`${endpoint}: ${response.status}`)
      if (response.ok) {
        const data = await response.json()
        console.log('Data:', JSON.stringify(data, null, 2))
      }
    } catch (e: any) {
      console.log(`${endpoint}: Error - ${e.message}`)
    }
  }

  console.log('')
  console.log('=== Instructions ===')
  console.log('')
  console.log('To get the Signer ID:')
  console.log('1. Go to Privy Dashboard: https://dashboard.privy.io/')
  console.log('2. Navigate to: Wallet infrastructure > Authorization keys')
  console.log('3. Find your authorization key and copy its ID')
  console.log('4. Add to TMA .env: NEXT_PUBLIC_PRIVY_SIGNER_ID=<id>')
  console.log('')
  console.log('If no authorization key exists:')
  console.log('1. Click "Create new key" in the dashboard')
  console.log('2. Save the private key securely (this is your PRIVY_AUTHORIZATION_KEY)')
  console.log('3. Copy the ID and add to TMA .env')
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e)
  process.exit(1)
})
