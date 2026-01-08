// ═══════════════════════════════════════════════════════════════════════════
// WALLET GENERATOR SERVICE
// Generates secure Solana keypairs for dev and ops wallets
// ═══════════════════════════════════════════════════════════════════════════

import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { encrypt, EncryptedData } from './encryption.service'

export interface GeneratedWallet {
  publicKey: string
  privateKey: string // Base58 encoded (will be encrypted before storage)
}

export interface EncryptedWalletPair {
  devWallet: {
    address: string
    encryptedPrivateKey: string
    iv: string
    authTag: string
  }
  opsWallet: {
    address: string
    encryptedPrivateKey: string
    iv: string
    authTag: string
  }
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
 * Generate both dev and ops wallets with encryption
 * Returns encrypted wallet pair ready for database storage
 */
export function generateEncryptedWalletPair(): EncryptedWalletPair {
  // Generate dev wallet
  const devWallet = generateKeypair()
  const devEncrypted = encrypt(devWallet.privateKey)

  // Generate ops wallet
  const opsWallet = generateKeypair()
  const opsEncrypted = encrypt(opsWallet.privateKey)

  return {
    devWallet: {
      address: devWallet.publicKey,
      encryptedPrivateKey: devEncrypted.ciphertext,
      iv: devEncrypted.iv,
      authTag: devEncrypted.authTag,
    },
    opsWallet: {
      address: opsWallet.publicKey,
      encryptedPrivateKey: opsEncrypted.ciphertext,
      iv: opsEncrypted.iv,
      authTag: opsEncrypted.authTag,
    },
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
 * Get keypair from encrypted data
 */
export function getKeypairFromEncrypted(
  encryptedPrivateKey: string,
  iv: string,
  authTag: string
): Keypair {
  const { decrypt } = require('./encryption.service')
  const decrypted = decrypt({ ciphertext: encryptedPrivateKey, iv, authTag })
  const secretKey = bs58.decode(decrypted)
  return Keypair.fromSecretKey(secretKey)
}
