// ═══════════════════════════════════════════════════════════════════════════
// SOLANA CONFIG TESTS
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PublicKey } from '@solana/web3.js'

describe('Solana Configuration', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('getTokenMint', () => {
    it('should return null for placeholder token address', async () => {
      process.env.TOKEN_MINT_ADDRESS = 'PLACEHOLDER_UPDATE_AFTER_TOKEN_LAUNCH'
      const { getTokenMint } = await import('./solana')
      expect(getTokenMint()).toBeNull()
    })

    it('should return null for empty token address', async () => {
      process.env.TOKEN_MINT_ADDRESS = ''
      const { getTokenMint } = await import('./solana')
      expect(getTokenMint()).toBeNull()
    })

    it('should return null for short token address', async () => {
      process.env.TOKEN_MINT_ADDRESS = 'short'
      const { getTokenMint } = await import('./solana')
      expect(getTokenMint()).toBeNull()
    })

    it('should return PublicKey for valid token address', async () => {
      // Use a valid base58 public key (SOL mint)
      process.env.TOKEN_MINT_ADDRESS = 'So11111111111111111111111111111111111111112'
      vi.resetModules()
      const { getTokenMint } = await import('./solana')
      const result = getTokenMint()
      expect(result).toBeInstanceOf(PublicKey)
      expect(result?.toString()).toBe('So11111111111111111111111111111111111111112')
    })
  })

  // Wallet keypair tests removed - all wallets now use Privy delegated signing
  // WHEEL platform token is registered in Prisma with tokenSource='platform'

  describe('getSolPrice', () => {
    it('should return a mock price', async () => {
      const { getSolPrice } = await import('./solana')
      const price = await getSolPrice()
      expect(price).toBeGreaterThan(0)
      expect(typeof price).toBe('number')
    })
  })
})
