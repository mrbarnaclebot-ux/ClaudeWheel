// ═══════════════════════════════════════════════════════════════════════════
// FEE COLLECTOR SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Keypair, PublicKey } from '@solana/web3.js'
import { FeeCollector } from './fee-collector'

// Mock the solana config module
vi.mock('../config/solana', () => ({
  connection: {
    getBalance: vi.fn(),
  },
  getBalance: vi.fn(),
}))

// Mock @solana/web3.js sendAndConfirmTransaction
vi.mock('@solana/web3.js', async () => {
  const actual = await vi.importActual('@solana/web3.js')
  return {
    ...actual,
    sendAndConfirmTransaction: vi.fn().mockResolvedValue('mock-signature-123'),
  }
})

describe('FeeCollector', () => {
  let feeCollector: FeeCollector

  beforeEach(() => {
    feeCollector = new FeeCollector()
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should create an instance without wallets', () => {
      expect(feeCollector).toBeInstanceOf(FeeCollector)
    })

    it('should have zero total collected initially', () => {
      const stats = feeCollector.getStats()
      expect(stats.totalCollected).toBe(0)
    })

    it('should have null lastCollectionTime initially', () => {
      const stats = feeCollector.getStats()
      expect(stats.lastCollectionTime).toBeNull()
    })
  })

  describe('collectFees', () => {
    it('should return null when wallets not configured', async () => {
      const result = await feeCollector.collectFees()
      expect(result).toBeNull()
    })

    it('should return null when only dev wallet is configured', async () => {
      const devWallet = Keypair.generate()
      feeCollector.setDevWallet(devWallet)

      const result = await feeCollector.collectFees()
      expect(result).toBeNull()
    })

    it('should return null when only ops wallet is configured', async () => {
      const opsAddress = Keypair.generate().publicKey
      feeCollector.setOpsWalletAddress(opsAddress)

      const result = await feeCollector.collectFees()
      expect(result).toBeNull()
    })
  })

  describe('transferToOps', () => {
    it('should return null when wallets not configured', async () => {
      const result = await feeCollector.transferToOps(0.1)
      expect(result).toBeNull()
    })
  })

  describe('setDevWallet', () => {
    it('should set dev wallet', () => {
      const devWallet = Keypair.generate()
      expect(() => {
        feeCollector.setDevWallet(devWallet)
      }).not.toThrow()
    })
  })

  describe('setOpsWalletAddress', () => {
    it('should set ops wallet address', () => {
      const opsAddress = Keypair.generate().publicKey
      expect(() => {
        feeCollector.setOpsWalletAddress(opsAddress)
      }).not.toThrow()
    })
  })

  describe('getStats', () => {
    it('should return stats object', () => {
      const stats = feeCollector.getStats()
      expect(stats).toHaveProperty('lastCollectionTime')
      expect(stats).toHaveProperty('totalCollected')
    })
  })
})
