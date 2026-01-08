import { PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { createHash } from 'crypto'

// ═══════════════════════════════════════════════════════════════════════════
// WALLET SIGNATURE VERIFICATION
// Verifies that a message was signed by the owner of a Solana wallet
// ═══════════════════════════════════════════════════════════════════════════

export interface SignatureVerificationResult {
  valid: boolean
  error?: string
}

/**
 * Verify a Solana wallet signature
 * @param message - The original message that was signed (as string)
 * @param signature - The base58-encoded signature
 * @param publicKey - The wallet's public key (as string)
 * @returns Verification result with validity and any error message
 */
export function verifySignature(
  message: string,
  signature: string,
  publicKey: string
): SignatureVerificationResult {
  try {
    // Validate public key format
    let pubKeyBytes: Uint8Array
    try {
      const pubKey = new PublicKey(publicKey)
      pubKeyBytes = pubKey.toBytes()
    } catch {
      return { valid: false, error: 'Invalid public key format' }
    }

    // Decode the base58 signature
    let signatureBytes: Uint8Array
    try {
      signatureBytes = bs58.decode(signature)
    } catch {
      return { valid: false, error: 'Invalid signature format (must be base58)' }
    }

    // Verify signature length (ed25519 signatures are 64 bytes)
    if (signatureBytes.length !== 64) {
      return { valid: false, error: 'Invalid signature length' }
    }

    // Encode message to bytes
    const messageBytes = new TextEncoder().encode(message)

    // Verify the signature using nacl
    const isValid = nacl.sign.detached.verify(messageBytes, signatureBytes, pubKeyBytes)

    return { valid: isValid, error: isValid ? undefined : 'Signature verification failed' }
  } catch (error) {
    return { valid: false, error: `Verification error: ${error}` }
  }
}

/**
 * Generate a nonce message for signing
 * This includes a timestamp to prevent replay attacks
 */
export function generateNonceMessage(action: string): string {
  const timestamp = Date.now()
  const nonce = Math.random().toString(36).substring(7)
  return `Claude Flywheel Admin\nAction: ${action}\nTimestamp: ${timestamp}\nNonce: ${nonce}`
}

/**
 * Verify that a timestamp in a message is recent (within maxAgeMs)
 * Also rejects timestamps in the future (with 30s tolerance for clock skew)
 */
export function isMessageRecent(message: string, maxAgeMs: number = 5 * 60 * 1000): boolean {
  const timestampMatch = message.match(/Timestamp: (\d+)/)
  if (!timestampMatch) return false

  const timestamp = parseInt(timestampMatch[1], 10)
  const now = Date.now()
  const clockSkewTolerance = 30 * 1000 // 30 seconds for clock skew

  // Reject timestamps in the future (with small tolerance for clock skew)
  if (timestamp > now + clockSkewTolerance) {
    return false
  }

  // Reject timestamps that are too old
  return now - timestamp < maxAgeMs
}

/**
 * Create a SHA-256 hash of a config object
 * Used to bind the signature to specific config values
 */
export function hashConfig(config: Record<string, unknown>): string {
  // Sort keys for deterministic hashing
  const sortedConfig = JSON.stringify(config, Object.keys(config).sort())
  return createHash('sha256').update(sortedConfig).digest('hex')
}

/**
 * Extract config hash from a signed message
 */
export function extractConfigHash(message: string): string | null {
  const hashMatch = message.match(/ConfigHash: ([a-f0-9]{64})/)
  return hashMatch ? hashMatch[1] : null
}

/**
 * Validate a Solana address format
 * @param address - The address string to validate
 * @returns Object with validity and optional error message
 */
export function isValidSolanaAddress(address: string): { valid: boolean; error?: string } {
  if (!address || typeof address !== 'string') {
    return { valid: false, error: 'Address is required' }
  }

  // Solana addresses are base58 encoded, typically 32-44 characters
  if (address.length < 32 || address.length > 44) {
    return { valid: false, error: 'Invalid address length' }
  }

  // Check for valid base58 characters (no 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/
  if (!base58Regex.test(address)) {
    return { valid: false, error: 'Invalid base58 characters in address' }
  }

  try {
    // Attempt to create a PublicKey - this validates the checksum and format
    new PublicKey(address)
    return { valid: true }
  } catch {
    return { valid: false, error: 'Invalid Solana address format' }
  }
}

/**
 * Generate a nonce message that includes a config hash
 * This cryptographically binds the signature to specific config values
 */
export function generateSecureNonceMessage(action: string, configHash: string): {
  message: string
  timestamp: number
  nonce: string
} {
  const timestamp = Date.now()
  const nonce = Math.random().toString(36).substring(7)
  const message = `Claude Flywheel Admin\nAction: ${action}\nTimestamp: ${timestamp}\nNonce: ${nonce}\nConfigHash: ${configHash}`
  return { message, timestamp, nonce }
}
