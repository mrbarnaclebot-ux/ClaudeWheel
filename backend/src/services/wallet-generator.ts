// ═══════════════════════════════════════════════════════════════════════════
// WALLET GENERATOR SERVICE
// Generates secure Solana keypairs for dev and ops wallets
// ═══════════════════════════════════════════════════════════════════════════

import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

export interface GeneratedWallet {
  publicKey: string
  privateKey: string // Base58 encoded
}

/**
 * Generate a new Solana keypair
 * Uses crypto-secure random from @solana/web3.js
 */
export function generateKeypair(): GeneratedWallet {
  const keypair = Keypair.generate()

  return {
    publicKey: keypair.publicKey.toString(),
    privateKey: bs58.encode(keypair.secretKey),
  }
}

/**
 * Validate that a wallet address is a valid Solana public key
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    // Check if it's valid base58 and correct length (32 bytes = ~43-44 chars in base58)
    const decoded = bs58.decode(address)
    return decoded.length === 32
  } catch {
    return false
  }
}

/**
 * Validate that a private key is a valid Solana keypair
 * Returns the derived public key if valid, null otherwise
 */
export function validatePrivateKey(privateKeyBase58: string): string | null {
  try {
    const secretKey = bs58.decode(privateKeyBase58)
    const keypair = Keypair.fromSecretKey(secretKey)
    return keypair.publicKey.toString()
  } catch {
    return null
  }
}

/**
 * Get keypair from base58 private key
 * @throws Error if key is invalid
 */
export function getKeypairFromPrivateKey(privateKeyBase58: string): Keypair {
  try {
    const secretKey = bs58.decode(privateKeyBase58)
    return Keypair.fromSecretKey(secretKey)
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error'
    throw new Error(`Invalid private key: ${errorMessage}`)
  }
}

// Legacy function - encryption has been removed (migrated to Privy)
// @deprecated Use Privy delegated signing instead
export function getKeypairFromEncrypted(
  _encryptedPrivateKey: string,
  _iv: string,
  _authTag: string
): Keypair {
  throw new Error('Encryption has been removed. Use Privy delegated signing instead.')
}
