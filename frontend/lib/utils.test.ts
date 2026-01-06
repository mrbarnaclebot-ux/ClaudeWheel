// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS TESTS
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cn,
  formatSOL,
  formatUSD,
  formatNumber,
  shortenAddress,
  formatTimeAgo,
  formatTimestamp,
  PLACEHOLDER_CA,
  mockWalletData,
  mockTransactions,
  mockFeeStats,
} from './utils'

describe('cn (className utility)', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('should handle undefined/null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })
})

describe('formatSOL', () => {
  it('should format SOL with 2-6 decimal places', () => {
    expect(formatSOL(1.5)).toBe('1.50')
    expect(formatSOL(0.123456)).toBe('0.123456')
    expect(formatSOL(1000)).toBe('1,000.00')
  })

  it('should handle zero', () => {
    expect(formatSOL(0)).toBe('0.00')
  })

  it('should format large numbers with commas', () => {
    expect(formatSOL(1234567.89)).toBe('1,234,567.89')
  })
})

describe('formatUSD', () => {
  it('should format as USD currency', () => {
    expect(formatUSD(100)).toBe('$100.00')
    expect(formatUSD(1234.56)).toBe('$1,234.56')
  })

  it('should handle zero', () => {
    expect(formatUSD(0)).toBe('$0.00')
  })

  it('should handle large numbers', () => {
    expect(formatUSD(1000000)).toBe('$1,000,000.00')
  })
})

describe('formatNumber', () => {
  it('should format millions with M suffix', () => {
    expect(formatNumber(1000000)).toBe('1.00M')
    expect(formatNumber(2500000)).toBe('2.50M')
  })

  it('should format thousands with K suffix', () => {
    expect(formatNumber(1000)).toBe('1.00K')
    expect(formatNumber(45000)).toBe('45.00K')
  })

  it('should format small numbers with 2 decimal places', () => {
    expect(formatNumber(123.456)).toBe('123.46')
    expect(formatNumber(0.5)).toBe('0.50')
  })
})

describe('shortenAddress', () => {
  it('should shorten address with default chars', () => {
    const address = 'ABCDEFGHIJ1234567890KLMNOPQRSTUV'
    expect(shortenAddress(address)).toBe('ABCD...STUV')
  })

  it('should shorten address with custom chars', () => {
    const address = 'ABCDEFGHIJ1234567890KLMNOPQRSTUV'
    expect(shortenAddress(address, 6)).toBe('ABCDEF...QRSTUV')
  })

  it('should return empty string for empty input', () => {
    expect(shortenAddress('')).toBe('')
  })

  it('should handle undefined/null gracefully', () => {
    expect(shortenAddress(undefined as any)).toBe('')
    expect(shortenAddress(null as any)).toBe('')
  })
})

describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should format seconds ago', () => {
    const date = new Date('2024-01-01T11:59:30Z') // 30 seconds ago
    expect(formatTimeAgo(date)).toBe('30s ago')
  })

  it('should format minutes ago', () => {
    const date = new Date('2024-01-01T11:55:00Z') // 5 minutes ago
    expect(formatTimeAgo(date)).toBe('5m ago')
  })

  it('should format hours ago', () => {
    const date = new Date('2024-01-01T09:00:00Z') // 3 hours ago
    expect(formatTimeAgo(date)).toBe('3h ago')
  })

  it('should format days ago', () => {
    const date = new Date('2023-12-30T12:00:00Z') // 2 days ago
    expect(formatTimeAgo(date)).toBe('2d ago')
  })
})

describe('formatTimestamp', () => {
  it('should format timestamp in 24-hour format', () => {
    const date = new Date('2024-01-01T14:30:45Z')
    const result = formatTimestamp(date)
    // Result depends on timezone, so just check format
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})

describe('Constants and Mock Data', () => {
  it('should have PLACEHOLDER_CA defined', () => {
    expect(PLACEHOLDER_CA).toBe('UPDATE_AFTER_TOKEN_LAUNCH')
  })

  it('should have mockWalletData defined', () => {
    expect(mockWalletData).toBeDefined()
    expect(mockWalletData.devWallet).toBeDefined()
    expect(mockWalletData.opsWallet).toBeDefined()
    expect(mockWalletData.devWallet.solBalance).toBeGreaterThan(0)
    expect(mockWalletData.opsWallet.tokenBalance).toBeGreaterThan(0)
  })

  it('should have mockTransactions defined', () => {
    expect(mockTransactions).toBeDefined()
    expect(mockTransactions.length).toBeGreaterThan(0)
    expect(mockTransactions[0]).toHaveProperty('type')
    expect(mockTransactions[0]).toHaveProperty('amount')
  })

  it('should have mockFeeStats defined', () => {
    expect(mockFeeStats).toBeDefined()
    expect(mockFeeStats.totalCollected).toBeGreaterThan(0)
    expect(mockFeeStats.todayCollected).toBeGreaterThan(0)
  })
})
