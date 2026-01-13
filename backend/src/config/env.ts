import { z } from 'zod'
import dotenv from 'dotenv'
import { loggers } from '../utils/logger'

dotenv.config()

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

const envSchema = z.object({
  // Server
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),

  // Solana
  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SOLANA_WS_URL: z.string().default('wss://api.mainnet-beta.solana.com'),
  HELIUS_API_KEY: z.string().optional(),

  // Wallets
  DEV_WALLET_ADDRESS: z.string().optional(), // Public key for admin authorization

  // Token
  TOKEN_MINT_ADDRESS: z.string().default('8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'),
  TOKEN_SYMBOL: z.string().default('TOKEN'),
  TOKEN_DECIMALS: z.string().default('6'),

  // Automation
  FEE_COLLECTION_INTERVAL_MS: z.string().default('60000'),
  MARKET_MAKING_ENABLED: z.string().default('true'),
  MIN_FEE_THRESHOLD_SOL: z.string().default('0.01'),
  DEV_WALLET_MIN_RESERVE_SOL: z.string().default('0.03'), // Keep this much SOL for claiming fees
  MAX_BUY_AMOUNT_SOL: z.string().default('0.5'),
  MAX_SELL_AMOUNT_TOKENS: z.string().default('100000'),
  PLATFORM_FEE_PERCENTAGE: z.string().default('10'), // Platform fee % taken from user claims
  PLATFORM_FEE_WALLET: z.string().optional(), // Wallet to receive platform fees

  // Job Enable Flags
  FAST_CLAIM_JOB_ENABLED: z.string().default('true'),
  MULTI_USER_FLYWHEEL_ENABLED: z.string().default('true'),
  DEPOSIT_MONITOR_ENABLED: z.string().default('true'),
  BALANCE_UPDATE_JOB_ENABLED: z.string().default('true'),

  // Fast Claim Job
  FAST_CLAIM_INTERVAL_SECONDS: z.string().default('30'),
  FAST_CLAIM_THRESHOLD_SOL: z.string().default('0.15'),

  // Multi-User Flywheel Job
  MULTI_USER_FLYWHEEL_INTERVAL_MINUTES: z.string().default('1'),
  MAX_TRADES_PER_MINUTE: z.string().default('30'),

  // Balance Update Job
  BALANCE_UPDATE_BATCH_SIZE: z.string().default('50'),
  BALANCE_FETCH_DELAY_MS: z.string().default('100'),
  BALANCE_SNAPSHOT_INTERVAL: z.string().default('12'),

  // Jupiter
  JUPITER_API_URL: z.string().url().default('https://quote-api.jup.ag/v6'),

  // Bags.fm
  BAGS_FM_API_KEY: z.string().optional(),

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  TELEGRAM_ADMIN_ID: z.string().optional(), // Admin's Telegram user ID for admin commands

  // Privy
  PRIVY_APP_ID: z.string().optional(),
  PRIVY_APP_SECRET: z.string().optional(),
  PRIVY_AUTHORIZATION_KEY: z.string().optional(), // Authorization key for signing transactions
  TMA_URL: z.string().url().optional(), // Telegram Mini App URL
  INITIAL_ADMIN_PRIVY_USER_ID: z.string().optional(), // Initial super admin Privy user ID
  PLATFORM_PRIVY_USER_ID: z.string().default('platform-wheel-user'), // Platform user for WHEEL token

  // WebSocket
  WS_HEARTBEAT_INTERVAL_MS: z.string().default('30000'), // WebSocket heartbeat interval in ms

  // Pinata (IPFS Image Storage)
  PINATA_JWT: z.string().optional(),
  PINATA_GATEWAY_URL: z.string().url().optional(),

  // Discord Error Reporting
  DISCORD_ERROR_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_ERROR_RATE_LIMIT_SECONDS: z.string().default('60'), // Min seconds between same error
  DISCORD_ERROR_ENABLED: z.string().default('true'),
})

// ═══════════════════════════════════════════════════════════════════════════
// PARSE AND EXPORT
// ═══════════════════════════════════════════════════════════════════════════

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  loggers.server.error({ errors: parsed.error.format() }, 'Invalid environment variables')
  process.exit(1)
}

export const env = {
  // Server
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,
  isDev: parsed.data.NODE_ENV === 'development',
  isProd: parsed.data.NODE_ENV === 'production',
  logLevel: parsed.data.LOG_LEVEL,

  // Solana
  solanaRpcUrl: parsed.data.SOLANA_RPC_URL,
  solanaWsUrl: parsed.data.SOLANA_WS_URL,
  heliusApiKey: parsed.data.HELIUS_API_KEY,

  // Wallets
  devWalletAddress: parsed.data.DEV_WALLET_ADDRESS, // Public key for admin authorization

  // Token
  tokenMintAddress: parsed.data.TOKEN_MINT_ADDRESS,
  tokenSymbol: parsed.data.TOKEN_SYMBOL,
  tokenDecimals: parseInt(parsed.data.TOKEN_DECIMALS, 10),

  // Automation
  feeCollectionIntervalMs: parseInt(parsed.data.FEE_COLLECTION_INTERVAL_MS, 10),
  marketMakingEnabled: parsed.data.MARKET_MAKING_ENABLED === 'true',
  minFeeThresholdSol: parseFloat(parsed.data.MIN_FEE_THRESHOLD_SOL),
  devWalletMinReserveSol: parseFloat(parsed.data.DEV_WALLET_MIN_RESERVE_SOL),
  maxBuyAmountSol: parseFloat(parsed.data.MAX_BUY_AMOUNT_SOL),
  maxSellAmountTokens: parseFloat(parsed.data.MAX_SELL_AMOUNT_TOKENS),
  platformFeePercentage: parseFloat(parsed.data.PLATFORM_FEE_PERCENTAGE),
  platformFeeWallet: parsed.data.PLATFORM_FEE_WALLET,

  // Job Enable Flags
  fastClaimJobEnabled: parsed.data.FAST_CLAIM_JOB_ENABLED !== 'false',
  multiUserFlywheelEnabled: parsed.data.MULTI_USER_FLYWHEEL_ENABLED !== 'false',
  depositMonitorEnabled: parsed.data.DEPOSIT_MONITOR_ENABLED !== 'false',
  balanceUpdateJobEnabled: parsed.data.BALANCE_UPDATE_JOB_ENABLED !== 'false',

  // Fast Claim Job
  fastClaimIntervalSeconds: parseInt(parsed.data.FAST_CLAIM_INTERVAL_SECONDS, 10),
  fastClaimThresholdSol: parseFloat(parsed.data.FAST_CLAIM_THRESHOLD_SOL),

  // Multi-User Flywheel Job
  flywheelIntervalMinutes: parseInt(parsed.data.MULTI_USER_FLYWHEEL_INTERVAL_MINUTES, 10),
  maxTradesPerMinute: parseInt(parsed.data.MAX_TRADES_PER_MINUTE, 10),

  // Balance Update Job
  balanceUpdateBatchSize: parseInt(parsed.data.BALANCE_UPDATE_BATCH_SIZE, 10),
  balanceFetchDelayMs: parseInt(parsed.data.BALANCE_FETCH_DELAY_MS, 10),
  balanceSnapshotInterval: parseInt(parsed.data.BALANCE_SNAPSHOT_INTERVAL, 10),

  // Jupiter
  jupiterApiUrl: parsed.data.JUPITER_API_URL,

  // Bags.fm
  bagsFmApiKey: parsed.data.BAGS_FM_API_KEY,

  // Telegram Bot
  telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
  telegramWebhookUrl: parsed.data.TELEGRAM_WEBHOOK_URL,
  telegramAdminId: parsed.data.TELEGRAM_ADMIN_ID ? parseInt(parsed.data.TELEGRAM_ADMIN_ID, 10) : undefined,

  // Privy
  privyAppId: parsed.data.PRIVY_APP_ID,
  privyAppSecret: parsed.data.PRIVY_APP_SECRET,
  privyAuthorizationKey: parsed.data.PRIVY_AUTHORIZATION_KEY,
  tmaUrl: parsed.data.TMA_URL,

  // Pinata (IPFS Image Storage)
  pinataJwt: parsed.data.PINATA_JWT,
  pinataGatewayUrl: parsed.data.PINATA_GATEWAY_URL,

  // Discord Error Reporting
  discordErrorWebhookUrl: parsed.data.DISCORD_ERROR_WEBHOOK_URL,
  discordErrorRateLimitSeconds: parseInt(parsed.data.DISCORD_ERROR_RATE_LIMIT_SECONDS, 10),
  discordErrorEnabled: parsed.data.DISCORD_ERROR_ENABLED !== 'false',
}

export type Env = typeof env
