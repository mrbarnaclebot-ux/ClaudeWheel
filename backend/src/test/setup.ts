// ═══════════════════════════════════════════════════════════════════════════
// TEST SETUP
// Configure test environment and mocks
// ═══════════════════════════════════════════════════════════════════════════

import { vi } from 'vitest'

// Mock environment variables for testing
process.env.NODE_ENV = 'test'
process.env.PORT = '3099'
process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com'
process.env.SOLANA_WS_URL = 'wss://api.devnet.solana.com'
process.env.DEV_WALLET_PRIVATE_KEY = ''
process.env.OPS_WALLET_PRIVATE_KEY = ''
process.env.TOKEN_MINT_ADDRESS = 'PLACEHOLDER_UPDATE_AFTER_TOKEN_LAUNCH'
process.env.TOKEN_DECIMALS = '6'
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'test-key'
process.env.FEE_COLLECTION_INTERVAL_MS = '60000'
process.env.MARKET_MAKING_ENABLED = 'false'
process.env.MIN_FEE_THRESHOLD_SOL = '0.01'
process.env.MAX_BUY_AMOUNT_SOL = '0.5'
process.env.MAX_SELL_AMOUNT_TOKENS = '100000'
process.env.JUPITER_API_URL = 'https://quote-api.jup.ag/v6'

// Mock pino logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
  fatal: vi.fn(),
  child: vi.fn(() => mockLogger),
}

const mockPino = Object.assign(vi.fn(() => mockLogger), {
  stdTimeFunctions: {
    isoTime: () => `,"time":"${new Date().toISOString()}"`,
    epochTime: () => `,"time":${Date.now()}`,
    unixTime: () => `,"time":${Math.floor(Date.now() / 1000)}`,
    nullTime: () => '',
  },
})

vi.mock('pino', () => ({
  default: mockPino,
  pino: mockPino,
}))

// Mock fetch globally
global.fetch = vi.fn()
