import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

// ═══════════════════════════════════════════════════════════════════════════
// ENVIRONMENT SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

const envSchema = z.object({
  // Server
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Solana
  SOLANA_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SOLANA_WS_URL: z.string().default('wss://api.mainnet-beta.solana.com'),

  // Wallets
  DEV_WALLET_PRIVATE_KEY: z.string().optional(),
  DEV_WALLET_ADDRESS: z.string().optional(), // Public key for admin authorization
  OPS_WALLET_PRIVATE_KEY: z.string().optional(),

  // Token
  TOKEN_MINT_ADDRESS: z.string().default('8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'),
  TOKEN_SYMBOL: z.string().default('TOKEN'),
  TOKEN_DECIMALS: z.string().default('6'),

  // Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),

  // Automation
  FEE_COLLECTION_INTERVAL_MS: z.string().default('60000'),
  MARKET_MAKING_ENABLED: z.string().default('true'),
  MIN_FEE_THRESHOLD_SOL: z.string().default('0.01'),
  DEV_WALLET_MIN_RESERVE_SOL: z.string().default('0.03'), // Keep this much SOL for claiming fees
  MAX_BUY_AMOUNT_SOL: z.string().default('0.5'),
  MAX_SELL_AMOUNT_TOKENS: z.string().default('100000'),
  PLATFORM_FEE_PERCENTAGE: z.string().default('10'), // Platform fee % taken from user claims
  PLATFORM_FEE_WALLET: z.string().optional(), // Wallet to receive platform fees

  // Jupiter
  JUPITER_API_URL: z.string().url().default('https://quote-api.jup.ag/v6'),

  // Bags.fm
  BAGS_FM_API_KEY: z.string().optional(),

  // Telegram Bot
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
})

// ═══════════════════════════════════════════════════════════════════════════
// PARSE AND EXPORT
// ═══════════════════════════════════════════════════════════════════════════

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.format())
  process.exit(1)
}

export const env = {
  // Server
  port: parseInt(parsed.data.PORT, 10),
  nodeEnv: parsed.data.NODE_ENV,
  isDev: parsed.data.NODE_ENV === 'development',
  isProd: parsed.data.NODE_ENV === 'production',

  // Solana
  solanaRpcUrl: parsed.data.SOLANA_RPC_URL,
  solanaWsUrl: parsed.data.SOLANA_WS_URL,

  // Wallets
  devWalletPrivateKey: parsed.data.DEV_WALLET_PRIVATE_KEY,
  devWalletAddress: parsed.data.DEV_WALLET_ADDRESS, // Public key for admin authorization
  opsWalletPrivateKey: parsed.data.OPS_WALLET_PRIVATE_KEY,

  // Token
  tokenMintAddress: parsed.data.TOKEN_MINT_ADDRESS,
  tokenSymbol: parsed.data.TOKEN_SYMBOL,
  tokenDecimals: parseInt(parsed.data.TOKEN_DECIMALS, 10),

  // Supabase
  supabaseUrl: parsed.data.SUPABASE_URL,
  supabaseServiceKey: parsed.data.SUPABASE_SERVICE_KEY,

  // Automation
  feeCollectionIntervalMs: parseInt(parsed.data.FEE_COLLECTION_INTERVAL_MS, 10),
  marketMakingEnabled: parsed.data.MARKET_MAKING_ENABLED === 'true',
  minFeeThresholdSol: parseFloat(parsed.data.MIN_FEE_THRESHOLD_SOL),
  devWalletMinReserveSol: parseFloat(parsed.data.DEV_WALLET_MIN_RESERVE_SOL),
  maxBuyAmountSol: parseFloat(parsed.data.MAX_BUY_AMOUNT_SOL),
  maxSellAmountTokens: parseFloat(parsed.data.MAX_SELL_AMOUNT_TOKENS),
  platformFeePercentage: parseFloat(parsed.data.PLATFORM_FEE_PERCENTAGE),
  platformFeeWallet: parsed.data.PLATFORM_FEE_WALLET,

  // Jupiter
  jupiterApiUrl: parsed.data.JUPITER_API_URL,

  // Bags.fm
  bagsFmApiKey: parsed.data.BAGS_FM_API_KEY,

  // Telegram Bot
  telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
  telegramWebhookUrl: parsed.data.TELEGRAM_WEBHOOK_URL,
}

export type Env = typeof env
