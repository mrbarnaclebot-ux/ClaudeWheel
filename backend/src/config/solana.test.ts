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

  describe('getDevWallet', () => {
    it('should return null when private key is not configured', async () => {
      process.env.DEV_WALLET_PRIVATE_KEY = ''
      vi.resetModules()
      const { getDevWallet } = await import('./solana')
      expect(getDevWallet()).toBeNull()
    })

    it('should return null for invalid private key', async () => {
      process.env.DEV_WALLET_PRIVATE_KEY = 'invalid-key'
      vi.resetModules()
      const { getDevWallet } = await import('./solana')
      expect(getDevWallet()).toBeNull()
    })
  })

  describe('getOpsWallet', () => {
    it('should return null when private key is not configured', async () => {
      process.env.OPS_WALLET_PRIVATE_KEY = ''
      vi.resetModules()
      const { getOpsWallet } = await import('./solana')
      expect(getOpsWallet()).toBeNull()
    })

    it('should return null for invalid private key', async () => {
      process.env.OPS_WALLET_PRIVATE_KEY = 'invalid-key'
      vi.resetModules()
      const { getOpsWallet } = await import('./solana')
      expect(getOpsWallet()).toBeNull()
    })
  })

  describe('getSolPrice', () => {
    it('should return a mock price', async () => {
      const { getSolPrice } = await import('./solana')
      const price = await getSolPrice()
      expect(price).toBeGreaterThan(0)
      expect(typeof price).toBe('number')
    })
  })
})
