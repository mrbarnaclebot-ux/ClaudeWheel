// ═══════════════════════════════════════════════════════════════════════════
// MARKET MAKER SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MarketMaker } from './market-maker'

describe('MarketMaker', () => {
  let marketMaker: MarketMaker

  beforeEach(() => {
    marketMaker = new MarketMaker()
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should create an instance without wallet', () => {
      expect(marketMaker).toBeInstanceOf(MarketMaker)
    })

    it('should start with market making disabled by default in test', () => {
      const stats = marketMaker.getStats()
      expect(stats.isEnabled).toBe(false)
    })
  })

  describe('enable/disable', () => {
    it('should enable market making', () => {
      marketMaker.enable()
      expect(marketMaker.getStats().isEnabled).toBe(true)
    })

    it('should disable market making', () => {
      marketMaker.enable()
      marketMaker.disable()
      expect(marketMaker.getStats().isEnabled).toBe(false)
    })
  })

  describe('executeBuy', () => {
    it('should return null when market making is disabled', async () => {
      const result = await marketMaker.executeBuy(0.1)
      expect(result).toBeNull()
    })

    it('should return null when ops wallet is not configured', async () => {
      marketMaker.enable()
      const result = await marketMaker.executeBuy(0.1)
      expect(result).toBeNull()
    })
  })

  describe('executeSell', () => {
    it('should return null when market making is disabled', async () => {
      const result = await marketMaker.executeSell(1000)
      expect(result).toBeNull()
    })

    it('should return null when ops wallet is not configured', async () => {
      marketMaker.enable()
      const result = await marketMaker.executeSell(1000)
      expect(result).toBeNull()
    })
  })

  describe('getJupiterQuote', () => {
    it('should make a fetch request to Jupiter API', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ inAmount: '1000000', outAmount: '500000' }),
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const quote = await marketMaker.getJupiterQuote(
        'So11111111111111111111111111111111111111112',
        'TokenMintAddress123456789012345678901234',
        1000000
      )

      expect(global.fetch).toHaveBeenCalled()
      expect(quote).toEqual({ inAmount: '1000000', outAmount: '500000' })
    })

    it('should return null on fetch failure', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      const quote = await marketMaker.getJupiterQuote(
        'So11111111111111111111111111111111111111112',
        'TokenMintAddress123456789012345678901234',
        1000000
      )

      expect(quote).toBeNull()
    })

    it('should return null on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        statusText: 'Bad Request',
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      const quote = await marketMaker.getJupiterQuote(
        'So11111111111111111111111111111111111111112',
        'TokenMintAddress123456789012345678901234',
        1000000
      )

      expect(quote).toBeNull()
    })
  })

  describe('getStats', () => {
    it('should return stats object', () => {
      const stats = marketMaker.getStats()
      expect(stats).toHaveProperty('isEnabled')
      expect(stats).toHaveProperty('lastOrderTime')
    })

    it('should have null lastOrderTime initially', () => {
      const stats = marketMaker.getStats()
      expect(stats.lastOrderTime).toBeNull()
    })
  })
})
