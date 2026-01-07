import express from 'express'
import cors from 'cors'
import { env } from './config/env'
import { getDevWallet, getOpsWallet } from './config/solana'
import { feeCollector } from './services/fee-collector'
import { marketMaker } from './services/market-maker'
import { walletMonitor } from './services/wallet-monitor'
import { startFlywheelJob } from './jobs/flywheel.job'
import statusRoutes from './routes/status.routes'
import adminRoutes from './routes/admin.routes'
import bagsRoutes from './routes/bags.routes'
import authRoutes from './routes/auth.routes'
import userTokenRoutes from './routes/user-token.routes'
import { bagsFmService } from './services/bags-fm'
import { isEncryptionConfigured } from './services/encryption.service'

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE FLYWHEEL BACKEND
// Autonomous Market Making Engine
// ═══════════════════════════════════════════════════════════════════════════

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api/status', statusRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/bags', bagsRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/user', userTokenRoutes)

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Claude Flywheel Backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      status: '/api/status',
      wallets: '/api/status/wallets',
      transactions: '/api/status/transactions',
      health: '/api/status/health',
      admin: {
        config: '/api/admin/config (POST - requires signature)',
        nonce: '/api/admin/nonce (GET)',
      },
      bags: {
        token: '/api/bags/token/:mint',
        fees: '/api/bags/fees/:mint',
        claimable: '/api/bags/claimable/:wallet',
        claimStats: '/api/bags/claim-stats/:wallet',
        dashboard: '/api/bags/dashboard',
      },
      auth: {
        nonce: '/api/auth/nonce (POST)',
        verify: '/api/auth/verify (POST)',
        user: '/api/auth/user (GET)',
      },
      user: {
        tokens: '/api/user/tokens (GET/POST)',
        token: '/api/user/tokens/:tokenId (GET/DELETE)',
        config: '/api/user/tokens/:tokenId/config (GET/PUT)',
      },
    },
  })
})

// Initialize services
async function initializeServices() {
  console.log('\n═══════════════════════════════════════════════════════════')
  console.log('   CLAUDE FLYWHEEL - AUTONOMOUS MARKET MAKING ENGINE')
  console.log('═══════════════════════════════════════════════════════════\n')

  // Load wallets
  const devWallet = getDevWallet()
  const opsWallet = getOpsWallet()

  if (devWallet) {
    console.log(`✅ Dev wallet loaded: ${devWallet.publicKey.toString().slice(0, 8)}...`)
    feeCollector.setDevWallet(devWallet)
    walletMonitor.setDevWalletAddress(devWallet.publicKey.toString())
  } else {
    console.log('⚠️ Dev wallet not configured (running in demo mode)')
  }

  if (opsWallet) {
    console.log(`✅ Ops wallet loaded: ${opsWallet.publicKey.toString().slice(0, 8)}...`)
    marketMaker.setOpsWallet(opsWallet)
    walletMonitor.setOpsWalletAddress(opsWallet.publicKey.toString())

    // Set ops wallet as destination for fee collector
    feeCollector.setOpsWalletAddress(opsWallet.publicKey)
  } else {
    console.log('⚠️ Ops wallet not configured (running in demo mode)')
  }

  // Initialize Bags.fm API key if configured
  if (env.bagsFmApiKey) {
    bagsFmService.setApiKey(env.bagsFmApiKey)
    console.log('✅ Bags.fm API key configured')
  } else {
    console.log('⚠️ Bags.fm API key not set (BAGS_FM_API_KEY)')
  }

  // Check encryption configuration for multi-user support
  if (isEncryptionConfigured()) {
    console.log('✅ Encryption configured (multi-user mode available)')
  } else {
    console.log('⚠️ Encryption not configured - set ENCRYPTION_MASTER_KEY for multi-user mode')
  }

  // Log configuration
  console.log('\n📋 Configuration:')
  console.log(`   RPC: ${env.solanaRpcUrl.slice(0, 30)}...`)
  const tokenDisplay = env.tokenMintAddress === 'PLACEHOLDER_UPDATE_AFTER_TOKEN_LAUNCH'
    ? '⚠️ Not configured (update via admin panel)'
    : `${env.tokenMintAddress.slice(0, 8)}...`
  console.log(`   Token: ${tokenDisplay}`)
  console.log(`   Fee interval: ${env.feeCollectionIntervalMs / 1000}s`)
  console.log(`   Market making: ${env.marketMakingEnabled ? 'enabled' : 'disabled'}`)
  console.log(`   Min fee threshold: ${env.minFeeThresholdSol} SOL`)

  // Start automation if wallets are configured
  if (devWallet && opsWallet) {
    console.log('\n🚀 Starting flywheel automation...')
    startFlywheelJob()
  } else {
    console.log('\n⚠️ Automation disabled - configure wallets to enable')
  }
}

// Start server
const server = app.listen(env.port, async () => {
  console.log(`\n🌐 Server running on http://localhost:${env.port}`)
  await initializeServices()
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})
