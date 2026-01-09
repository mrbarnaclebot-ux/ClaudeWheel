import crypto from 'crypto'
import { loggers } from '../utils/logger'

// ═══════════════════════════════════════════════════════════════════════════
// ENCRYPTION SERVICE
// AES-256-GCM encryption for secure storage of private keys
// ═══════════════════════════════════════════════════════════════════════════

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 128 bits
const AUTH_TAG_LENGTH = 16 // 128 bits
const KEY_LENGTH = 32 // 256 bits

export interface EncryptedData {
  ciphertext: string // Base64 encoded
  iv: string // Base64 encoded
  authTag: string // Base64 encoded
}

/**
 * Get the master encryption key from environment
 * The key should be a 32-byte (256-bit) value, base64 encoded
 */
function getMasterKey(): Buffer {
  const masterKeyBase64 = process.env.ENCRYPTION_MASTER_KEY

  if (!masterKeyBase64) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY environment variable is required. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    )
  }

  const key = Buffer.from(masterKeyBase64, 'base64')

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_MASTER_KEY must be exactly ${KEY_LENGTH} bytes (256 bits). ` +
      `Got ${key.length} bytes. Generate a proper key with: ` +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
    )
  }

  return key
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 *
 * @param plaintext The string to encrypt (e.g., a private key)
 * @returns Object containing base64-encoded ciphertext, IV, and auth tag
 */
export function encrypt(plaintext: string): EncryptedData {
  const key = getMasterKey()

  // Generate a random IV for each encryption
  const iv = crypto.randomBytes(IV_LENGTH)

  // Create cipher with AES-256-GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  // Encrypt the plaintext
  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  // Get the authentication tag
  const authTag = cipher.getAuthTag()

  return {
    ciphertext: encrypted,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  }
}

/**
 * Decrypt ciphertext using AES-256-GCM
 *
 * @param encryptedData Object containing ciphertext, IV, and auth tag
 * @returns The decrypted plaintext string
 */
export function decrypt(encryptedData: EncryptedData): string {
  const key = getMasterKey()

  // Decode base64 values
  const iv = Buffer.from(encryptedData.iv, 'base64')
  const authTag = Buffer.from(encryptedData.authTag, 'base64')

  // Create decipher
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  // Decrypt the ciphertext
  let decrypted = decipher.update(encryptedData.ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Convenience function to decrypt using separate parameters
 */
export function decryptWithParams(ciphertext: string, iv: string, authTag: string): string {
  return decrypt({ ciphertext, iv, authTag })
}

/**
 * Validate that a private key decrypts correctly and matches expected wallet address
 * This is useful during token registration to verify the key is valid
 */
export async function validateEncryptedKey(
  encryptedData: EncryptedData,
  expectedWalletAddress: string
): Promise<boolean> {
  try {
    const decrypted = decrypt(encryptedData)

    // Import bs58 and Keypair to validate the key
    const bs58 = await import('bs58')
    const { Keypair } = await import('@solana/web3.js')

    // Try to create a keypair from the decrypted private key
    const secretKey = bs58.default.decode(decrypted)
    const keypair = Keypair.fromSecretKey(secretKey)

    // Check if the public key matches the expected address
    return keypair.publicKey.toString() === expectedWalletAddress
  } catch (error) {
    loggers.encryption.error({ error: String(error) }, 'Failed to validate encrypted key')
    return false
  }
}

/**
 * Generate a new master key for first-time setup
 * This should be run once and the result stored in ENCRYPTION_MASTER_KEY env var
 */
export function generateMasterKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64')
}

/**
 * Check if encryption is properly configured
 */
export function isEncryptionConfigured(): boolean {
  try {
    getMasterKey()
    return true
  } catch {
    return false
  }
}

/**
 * Test encryption/decryption roundtrip
 */
export function testEncryption(): boolean {
  try {
    const testData = 'test-encryption-' + Date.now()
    const encrypted = encrypt(testData)
    const decrypted = decrypt(encrypted)
    return decrypted === testData
  } catch (error) {
    loggers.encryption.error({ error: String(error) }, 'Encryption test failed')
    return false
  }
}
