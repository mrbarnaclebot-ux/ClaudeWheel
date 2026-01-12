/**
 * Migration Validation Script
 * Validates that the Prisma migration completed successfully
 *
 * Checks:
 * 1. Database tables exist (PlatformConfig, PlatformFeeStats, BotStatus)
 * 2. WHEEL token is set up with wallets and config
 * 3. Admin role exists
 * 4. Privy service can sign transactions
 * 5. Key services can be imported
 */

import * as dotenv from 'dotenv'
dotenv.config()

import { prisma, isPrismaConfigured, testPrismaConnection } from '../config/prisma'
import { privyService } from '../services/privy.service'

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION RESULT TRACKING
// ═══════════════════════════════════════════════════════════════════════════

interface ValidationResult {
  name: string
  passed: boolean
  message: string
  details?: string
}

const results: ValidationResult[] = []

function pass(name: string, message: string, details?: string) {
  results.push({ name, passed: true, message, details })
}

function fail(name: string, message: string, details?: string) {
  results.push({ name, passed: false, message, details })
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION CHECKS
// ═══════════════════════════════════════════════════════════════════════════

async function validateDatabaseConnection(): Promise<boolean> {
  console.log('\n1. DATABASE CONNECTION')
  console.log('─'.repeat(60))

  if (!isPrismaConfigured()) {
    fail('Database Connection', 'PRIVY_DATABASE_URL not configured')
    console.log('   [FAIL] PRIVY_DATABASE_URL not configured')
    return false
  }

  const connected = await testPrismaConnection()
  if (connected) {
    pass('Database Connection', 'Successfully connected to Prisma database')
    console.log('   [PASS] Successfully connected to Prisma database')
    return true
  } else {
    fail('Database Connection', 'Failed to connect to Prisma database')
    console.log('   [FAIL] Failed to connect to Prisma database')
    return false
  }
}

async function validatePlatformTables(): Promise<void> {
  console.log('\n2. PLATFORM TABLES')
  console.log('─'.repeat(60))

  // Check PlatformConfig
  try {
    const config = await prisma.platformConfig.findUnique({ where: { id: 'main' } })
    if (config) {
      pass('PlatformConfig', 'Record exists', `tokenMintAddress: ${config.tokenMintAddress.slice(0, 8)}...`)
      console.log(`   [PASS] PlatformConfig exists (token: ${config.tokenSymbol})`)
    } else {
      // Try to create default config
      console.log('   [INFO] PlatformConfig not found, checking if table exists...')
      const created = await prisma.platformConfig.create({
        data: {
          id: 'main',
          tokenMintAddress: process.env.TOKEN_MINT_ADDRESS || 'default',
          tokenSymbol: 'WHEEL',
        },
      })
      pass('PlatformConfig', 'Table exists, created default record', `id: ${created.id}`)
      console.log('   [PASS] PlatformConfig table exists, created default record')
    }
  } catch (error) {
    fail('PlatformConfig', 'Table does not exist or query failed', String(error))
    console.log(`   [FAIL] PlatformConfig: ${String(error).slice(0, 80)}`)
  }

  // Check PlatformFeeStats
  try {
    const stats = await prisma.platformFeeStats.findUnique({ where: { id: 'main' } })
    if (stats) {
      pass('PlatformFeeStats', 'Record exists', `totalCollected: ${stats.totalCollected}`)
      console.log(`   [PASS] PlatformFeeStats exists (total: ${stats.totalCollected} SOL)`)
    } else {
      const created = await prisma.platformFeeStats.create({
        data: { id: 'main' },
      })
      pass('PlatformFeeStats', 'Table exists, created default record', `id: ${created.id}`)
      console.log('   [PASS] PlatformFeeStats table exists, created default record')
    }
  } catch (error) {
    fail('PlatformFeeStats', 'Table does not exist or query failed', String(error))
    console.log(`   [FAIL] PlatformFeeStats: ${String(error).slice(0, 80)}`)
  }

  // Check BotStatus
  try {
    const status = await prisma.botStatus.findUnique({ where: { id: 'main' } })
    if (status) {
      pass('BotStatus', 'Record exists', `maintenanceMode: ${status.isMaintenanceMode}`)
      console.log(`   [PASS] BotStatus exists (maintenance: ${status.isMaintenanceMode})`)
    } else {
      const created = await prisma.botStatus.create({
        data: { id: 'main' },
      })
      pass('BotStatus', 'Table exists, created default record', `id: ${created.id}`)
      console.log('   [PASS] BotStatus table exists, created default record')
    }
  } catch (error) {
    fail('BotStatus', 'Table does not exist or query failed', String(error))
    console.log(`   [FAIL] BotStatus: ${String(error).slice(0, 80)}`)
  }
}

async function validateWheelToken(): Promise<void> {
  console.log('\n3. WHEEL TOKEN SETUP')
  console.log('─'.repeat(60))

  try {
    const wheelToken = await prisma.privyUserToken.findFirst({
      where: { tokenSource: 'platform' },
      include: {
        devWallet: true,
        opsWallet: true,
        config: true,
        flywheelState: true,
      },
    })

    if (!wheelToken) {
      fail('WHEEL Token', 'No platform token found (tokenSource: platform)')
      console.log('   [FAIL] No platform token found (tokenSource: platform)')
      console.log('   [INFO] Run setup-wheel-token.ts to create the WHEEL token')
      return
    }

    pass('WHEEL Token', 'Platform token exists', `${wheelToken.tokenSymbol} - ${wheelToken.tokenMintAddress.slice(0, 8)}...`)
    console.log(`   [PASS] WHEEL token exists: ${wheelToken.tokenSymbol}`)

    // Check dev wallet
    if (wheelToken.devWallet) {
      pass('WHEEL Dev Wallet', 'Dev wallet linked', wheelToken.devWallet.walletAddress.slice(0, 12) + '...')
      console.log(`   [PASS] Dev wallet: ${wheelToken.devWallet.walletAddress.slice(0, 12)}...`)
    } else {
      fail('WHEEL Dev Wallet', 'Dev wallet not linked')
      console.log('   [FAIL] Dev wallet not linked')
    }

    // Check ops wallet
    if (wheelToken.opsWallet) {
      pass('WHEEL Ops Wallet', 'Ops wallet linked', wheelToken.opsWallet.walletAddress.slice(0, 12) + '...')
      console.log(`   [PASS] Ops wallet: ${wheelToken.opsWallet.walletAddress.slice(0, 12)}...`)
    } else {
      fail('WHEEL Ops Wallet', 'Ops wallet not linked')
      console.log('   [FAIL] Ops wallet not linked')
    }

    // Check config
    if (wheelToken.config) {
      pass('WHEEL Config', 'Token config exists', `flywheelActive: ${wheelToken.config.flywheelActive}`)
      console.log(`   [PASS] Config exists (flywheel: ${wheelToken.config.flywheelActive})`)
    } else {
      fail('WHEEL Config', 'Token config not created')
      console.log('   [FAIL] Token config not created')
    }

    // Check flywheel state
    if (wheelToken.flywheelState) {
      pass('WHEEL Flywheel State', 'Flywheel state exists', `phase: ${wheelToken.flywheelState.cyclePhase}`)
      console.log(`   [PASS] Flywheel state exists (phase: ${wheelToken.flywheelState.cyclePhase})`)
    } else {
      fail('WHEEL Flywheel State', 'Flywheel state not created')
      console.log('   [FAIL] Flywheel state not created')
    }
  } catch (error) {
    fail('WHEEL Token', 'Query failed', String(error))
    console.log(`   [FAIL] WHEEL token query failed: ${String(error).slice(0, 80)}`)
  }
}

async function validateAdminRole(): Promise<void> {
  console.log('\n4. ADMIN ROLE')
  console.log('─'.repeat(60))

  try {
    const adminCount = await prisma.adminRole.count()

    if (adminCount > 0) {
      pass('Admin Role', `${adminCount} admin(s) configured`)
      console.log(`   [PASS] ${adminCount} admin(s) configured`)
    } else {
      // Check for INITIAL_ADMIN_PRIVY_USER_ID env var
      const initialAdminId = process.env.INITIAL_ADMIN_PRIVY_USER_ID
      if (initialAdminId) {
        fail('Admin Role', 'No admins found but INITIAL_ADMIN_PRIVY_USER_ID is set', `Expected admin: ${initialAdminId}`)
        console.log(`   [FAIL] No admins found (expected: ${initialAdminId})`)
        console.log('   [INFO] Run admin setup to create the initial admin')
      } else {
        pass('Admin Role', 'No admins configured (INITIAL_ADMIN_PRIVY_USER_ID not set)')
        console.log('   [PASS] No admins configured (INITIAL_ADMIN_PRIVY_USER_ID not set)')
      }
    }

    // If initial admin ID is set, verify it exists
    const initialAdminId = process.env.INITIAL_ADMIN_PRIVY_USER_ID
    if (initialAdminId) {
      const admin = await prisma.adminRole.findUnique({
        where: { privyUserId: initialAdminId },
      })
      if (admin) {
        pass('Initial Admin', `Admin exists with role: ${admin.role}`)
        console.log(`   [PASS] Initial admin exists (role: ${admin.role})`)
      } else {
        fail('Initial Admin', 'Initial admin not found in database')
        console.log(`   [FAIL] Initial admin (${initialAdminId}) not found`)
      }
    }
  } catch (error) {
    fail('Admin Role', 'Query failed', String(error))
    console.log(`   [FAIL] Admin role query failed: ${String(error).slice(0, 80)}`)
  }
}

async function validatePrivyService(): Promise<void> {
  console.log('\n5. PRIVY SERVICE')
  console.log('─'.repeat(60))

  // Check if Privy is configured
  const isConfigured = privyService.isConfigured()
  if (isConfigured) {
    pass('Privy Client', 'Privy client is configured')
    console.log('   [PASS] Privy client is configured')
  } else {
    fail('Privy Client', 'Privy client not configured (missing PRIVY_APP_ID/SECRET)')
    console.log('   [FAIL] Privy client not configured')
  }

  // Check if transaction signing is available
  const canSign = privyService.canSignTransactions()
  if (canSign) {
    pass('Privy Signing', 'Transaction signing available (authorization key configured)')
    console.log('   [PASS] Transaction signing available')
  } else {
    fail('Privy Signing', 'Transaction signing not available (missing PRIVY_AUTHORIZATION_KEY)')
    console.log('   [FAIL] Transaction signing not available')
    console.log('   [INFO] Set PRIVY_AUTHORIZATION_KEY for delegated wallet signing')
  }

  // Check database configured
  const dbConfigured = privyService.isDatabaseConfigured()
  if (dbConfigured) {
    pass('Privy Database', 'Database is configured')
    console.log('   [PASS] Database is configured')
  } else {
    fail('Privy Database', 'Database not configured')
    console.log('   [FAIL] Database not configured')
  }
}

async function validateServiceImports(): Promise<void> {
  console.log('\n6. SERVICE IMPORTS')
  console.log('─'.repeat(60))

  const services = [
    { name: 'prisma', path: '../config/prisma' },
    { name: 'privy.service', path: '../services/privy.service' },
  ]

  for (const service of services) {
    try {
      // Services are already imported, so just verify they exist
      if (service.name === 'prisma') {
        if (prisma) {
          pass(service.name, 'Service imported successfully')
          console.log(`   [PASS] ${service.name}`)
        }
      } else if (service.name === 'privy.service') {
        if (privyService) {
          pass(service.name, 'Service imported successfully')
          console.log(`   [PASS] ${service.name}`)
        }
      }
    } catch (error) {
      fail(service.name, 'Import failed', String(error))
      console.log(`   [FAIL] ${service.name}: ${String(error).slice(0, 60)}`)
    }
  }

  // Try to dynamically import additional services
  const dynamicServices = [
    { name: 'bags.service', path: '../services/bags.service' },
    { name: 'multi-user-mm.service', path: '../services/multi-user-mm.service' },
  ]

  for (const service of dynamicServices) {
    try {
      await import(service.path)
      pass(service.name, 'Service imported successfully')
      console.log(`   [PASS] ${service.name}`)
    } catch (error) {
      fail(service.name, 'Import failed', String(error))
      console.log(`   [FAIL] ${service.name}: ${String(error).slice(0, 60)}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function runValidation() {
  console.log('\n' + '='.repeat(60))
  console.log('           MIGRATION VALIDATION REPORT')
  console.log('='.repeat(60))
  console.log(`Date: ${new Date().toISOString()}`)

  // Run all validations
  const dbConnected = await validateDatabaseConnection()

  if (dbConnected) {
    await validatePlatformTables()
    await validateWheelToken()
    await validateAdminRole()
  } else {
    console.log('\n   [SKIP] Skipping database checks - connection failed')
  }

  await validatePrivyService()
  await validateServiceImports()

  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('                      SUMMARY')
  console.log('='.repeat(60))

  const passed = results.filter((r) => r.passed)
  const failed = results.filter((r) => !r.passed)

  console.log(`\n   Passed: ${passed.length}`)
  console.log(`   Failed: ${failed.length}`)
  console.log(`   Total:  ${results.length}`)

  if (failed.length > 0) {
    console.log('\n   FAILED CHECKS:')
    console.log('   ' + '-'.repeat(56))
    for (const result of failed) {
      console.log(`   - ${result.name}: ${result.message}`)
      if (result.details) {
        console.log(`     Details: ${result.details.slice(0, 80)}`)
      }
    }
  }

  console.log('\n' + '='.repeat(60))

  // Disconnect from database
  await prisma.$disconnect()

  // Exit with appropriate code
  if (failed.length > 0) {
    console.log('\n   RESULT: VALIDATION FAILED\n')
    process.exit(1)
  } else {
    console.log('\n   RESULT: ALL CHECKS PASSED\n')
    process.exit(0)
  }
}

runValidation().catch((error) => {
  console.error('\nValidation script failed with error:', error)
  process.exit(1)
})
