// ═══════════════════════════════════════════════════════════════════════════
// ENV CONFIG TESTS
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest'
import { env } from './env'

describe('Environment Configuration', () => {
  it('should load port from environment', () => {
    expect(env.port).toBeDefined()
    expect(typeof env.port).toBe('number')
  })

  it('should load Solana RPC URL', () => {
    expect(env.solanaRpcUrl).toBeDefined()
    expect(env.solanaRpcUrl).toContain('solana.com')
  })

  it('should load fee collection interval', () => {
    expect(env.feeCollectionIntervalMs).toBeDefined()
    expect(env.feeCollectionIntervalMs).toBeGreaterThan(0)
  })

  it('should load market making settings', () => {
    expect(typeof env.marketMakingEnabled).toBe('boolean')
    expect(env.minFeeThresholdSol).toBeGreaterThan(0)
    expect(env.maxBuyAmountSol).toBeGreaterThan(0)
    expect(env.maxSellAmountTokens).toBeGreaterThan(0)
  })

  it('should load token decimals', () => {
    expect(env.tokenDecimals).toBeDefined()
    expect(env.tokenDecimals).toBe(6)
  })
})
