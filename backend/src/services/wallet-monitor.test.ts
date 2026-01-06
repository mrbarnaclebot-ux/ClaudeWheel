// ═══════════════════════════════════════════════════════════════════════════
// WALLET MONITOR SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Keypair } from '@solana/web3.js'
import { WalletMonitor } from './wallet-monitor'

// Mock the solana config module
vi.mock('../config/solana', () => ({
  connection: {},
  getBalance: vi.fn().mockResolvedValue(1.5),
  getTokenBalance: vi.fn().mockResolvedValue(1000),
  getTokenMint: vi.fn().mockReturnValue(null),
  getSolPrice: vi.fn().mockResolvedValue(200),
}))

// Generate valid test addresses
const TEST_DEV_ADDRESS = Keypair.generate().publicKey.toString()
const TEST_OPS_ADDRESS = Keypair.generate().publicKey.toString()

describe('WalletMonitor', () => {
  let walletMonitor: WalletMonitor

  beforeEach(() => {
    walletMonitor = new WalletMonitor()
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should create an instance without addresses', () => {
      expect(walletMonitor).toBeInstanceOf(WalletMonitor)
    })

    it('should create an instance with addresses', () => {
      const monitor = new WalletMonitor(TEST_DEV_ADDRESS, TEST_OPS_ADDRESS)
      expect(monitor).toBeInstanceOf(WalletMonitor)
    })
  })

  describe('getDevWalletBalance', () => {
    it('should return null when dev wallet not configured', async () => {
      const result = await walletMonitor.getDevWalletBalance()
      expect(result).toBeNull()
    })

    it('should return wallet balance when configured', async () => {
      walletMonitor.setDevWalletAddress(TEST_DEV_ADDRESS)
      const result = await walletMonitor.getDevWalletBalance()

      expect(result).not.toBeNull()
      expect(result?.wallet_type).toBe('dev')
      expect(result?.sol_balance).toBe(1.5)
      expect(result?.usd_value).toBe(300) // 1.5 SOL * $200
    })
  })

  describe('getOpsWalletBalance', () => {
    it('should return null when ops wallet not configured', async () => {
      const result = await walletMonitor.getOpsWalletBalance()
      expect(result).toBeNull()
    })

    it('should return wallet balance when configured', async () => {
      walletMonitor.setOpsWalletAddress(TEST_OPS_ADDRESS)
      const result = await walletMonitor.getOpsWalletBalance()

      expect(result).not.toBeNull()
      expect(result?.wallet_type).toBe('ops')
      expect(result?.sol_balance).toBe(1.5)
    })
  })

  describe('getAllBalances', () => {
    it('should return both wallet balances', async () => {
      walletMonitor.setDevWalletAddress(TEST_DEV_ADDRESS)
      walletMonitor.setOpsWalletAddress(TEST_OPS_ADDRESS)

      const result = await walletMonitor.getAllBalances()

      expect(result.devWallet).not.toBeNull()
      expect(result.opsWallet).not.toBeNull()
    })

    it('should return nulls when wallets not configured', async () => {
      const result = await walletMonitor.getAllBalances()

      expect(result.devWallet).toBeNull()
      expect(result.opsWallet).toBeNull()
    })
  })

  describe('setDevWalletAddress', () => {
    it('should set dev wallet address', () => {
      expect(() => {
        walletMonitor.setDevWalletAddress(TEST_DEV_ADDRESS)
      }).not.toThrow()
    })
  })

  describe('setOpsWalletAddress', () => {
    it('should set ops wallet address', () => {
      expect(() => {
        walletMonitor.setOpsWalletAddress(TEST_OPS_ADDRESS)
      }).not.toThrow()
    })
  })
})
