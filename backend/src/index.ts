import express from 'express'
import cors from 'cors'
import { env } from './config/env'
import { getDevWallet, getOpsWallet } from './config/solana'
import { feeCollector } from './services/fee-collector'
import { marketMaker } from './services/market-maker'
import { walletMonitor } from './services/wallet-monitor'
import { startFlywheelJob } from './jobs/flywheel.job'
import statusRoutes from './routes/status.routes'

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
