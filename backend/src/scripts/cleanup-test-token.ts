/**
 * Cleanup Test Token Script
 *
 * Usage: npx tsx src/scripts/cleanup-test-token.ts <token_mint_address> [--delete] [--sell]
 *
 * This script:
 * 1. Finds the token by mint address in Privy database
 * 2. Disables the flywheel immediately
 * 3. Optionally sells all token balance using Bags SDK (--sell flag)
 * 4. Optionally deletes the token from the system (--delete flag)
 */

import 'dotenv/config'
import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { bagsFmService } from '../services/bags-fm'
import { sendTransactionWithPrivySigning } from '../utils/transaction'
import { getBalance, getTokenBalance } from '../config/solana'
import { env } from '../config/env'
import bs58 from 'bs58'

const TOKEN_MINT = process.argv[2] || 'CicqSaxdtFx5YwrmcZfz95W7tKdbqiU1oNKJU2SjBAGS'
const DELETE_AFTER = process.argv.includes('--delete')
const SELL_TOKENS = process.argv.includes('--sell')
const SOL_MINT = 'So11111111111111111111111111111111111111112'

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function main() {
  console.log('='.repeat(60))
  console.log('TEST TOKEN CLEANUP SCRIPT')
  console.log('='.repeat(60))
  console.log(`\nToken Mint: ${TOKEN_MINT}`)
  console.log(`Sell tokens: ${SELL_TOKENS}`)
  console.log(`Delete after: ${DELETE_AFTER}`)

  if (!isPrismaConfigured()) {
    console.error('ERROR: Prisma not configured')
    process.exit(1)
  }

  const connection = new Connection(env.solanaRpcUrl, 'confirmed')

  // Find the token in database
  console.log('\n1. Finding token in database...')
  const token = await prisma.privyUserToken.findFirst({
    where: { tokenMintAddress: TOKEN_MINT },
    include: {
      devWallet: true,
      opsWallet: true,
      config: true,
      flywheelState: true,
    },
  })

  if (!token) {
    console.error(`Token not found: ${TOKEN_MINT}`)
    process.exit(1)
  }

  console.log(`Found token: ${token.tokenSymbol} (${token.tokenName})`)
  console.log(`Token ID: ${token.id}`)
  console.log(`Owner: ${token.privyUserId}`)
  console.log(`Dev Wallet: ${token.devWallet?.walletAddress}`)
  console.log(`Ops Wallet: ${token.opsWallet?.walletAddress}`)
  console.log(`Flywheel Active: ${token.config?.flywheelActive}`)

  const opsWalletAddress = token.opsWallet?.walletAddress
  if (!opsWalletAddress) {
    console.error('No ops wallet found')
    process.exit(1)
  }

  // Step 1: Disable flywheel immediately
  console.log('\n2. Disabling flywheel...')
  await prisma.privyTokenConfig.update({
    where: { privyTokenId: token.id },
    data: {
      flywheelActive: false,
      marketMakingEnabled: false,
    },
  })
  console.log('Flywheel disabled!')

  // Step 2: Check token balance
  console.log('\n3. Checking token balance...')
  const tokenMintPubkey = new PublicKey(TOKEN_MINT)
  const opsWalletPubkey = new PublicKey(opsWalletAddress)

  const tokenBalance = await getTokenBalance(opsWalletPubkey, tokenMintPubkey)
  const solBalance = await getBalance(opsWalletPubkey)

  console.log(`Token Balance: ${tokenBalance.toLocaleString()}`)
  console.log(`SOL Balance: ${solBalance.toFixed(6)} SOL`)

  if (!SELL_TOKENS) {
    console.log('\n4. Skipping sell (pass --sell flag to sell tokens)')
  } else if (tokenBalance <= 0) {
    console.log('\n4. No tokens to sell!')
  } else {
    // Initialize Bags SDK with API key
    const bagsApiKey = process.env.BAGS_FM_API_KEY
    if (!bagsApiKey) {
      console.error('ERROR: BAGS_FM_API_KEY not set')
      process.exit(1)
    }
    bagsFmService.setApiKey(bagsApiKey)

    // Step 3: Sell all tokens using Bags SDK
    console.log('\n4. Selling all tokens via Bags SDK...')

    let remainingBalance = tokenBalance
    let sellCount = 0
    let consecutiveFailures = 0
    const maxSells = 20
    const maxConsecutiveFailures = 3

    while (remainingBalance > 1 && sellCount < maxSells && consecutiveFailures < maxConsecutiveFailures) {
      // Sell 30% at a time to avoid price impact
      const sellPercent = 30
      let sellAmount = Math.floor(remainingBalance * (sellPercent / 100))

      // Ensure minimum viable amount
      if (sellAmount < 1000) {
        sellAmount = Math.floor(remainingBalance)
      }

      if (sellAmount < 1) break

      console.log(`\nSell #${sellCount + 1}: Selling ${sellAmount.toLocaleString()} tokens (${sellPercent}% of ${remainingBalance.toLocaleString()})...`)

      try {
        // Get quote from Bags SDK
        const quote = await bagsFmService.getTradeQuote(
          TOKEN_MINT,
          SOL_MINT,
          sellAmount,
          'sell',
          500 // 5% slippage
        )

        if (!quote?.rawQuoteResponse) {
          console.error('Failed to get Bags quote')
          consecutiveFailures++
          await sleep(3000)
          continue
        }

        console.log(`Quote received: Output ~${(quote.outputAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL`)

        // Generate swap transaction
        const swapTx = await bagsFmService.generateSwapTransaction(
          opsWalletAddress,
          quote.rawQuoteResponse
        )

        if (!swapTx) {
          console.error('Failed to generate swap transaction')
          consecutiveFailures++
          await sleep(3000)
          continue
        }

        // Deserialize the transaction from bs58
        const txBytes = bs58.decode(swapTx.transaction)
        const versionedTx = VersionedTransaction.deserialize(txBytes)

        // Execute swap
        const result = await sendTransactionWithPrivySigning(
          connection,
          versionedTx,
          opsWalletAddress,
          {
            commitment: 'confirmed',
            logContext: { service: 'cleanup', type: 'sell', tokenSymbol: token.tokenSymbol },
          }
        )

        if (result.success) {
          console.log(`Sell successful! Signature: ${result.signature}`)
          consecutiveFailures = 0

          // Record transaction
          await prisma.privyTransaction.create({
            data: {
              privyTokenId: token.id,
              type: 'sell',
              amount: sellAmount,
              signature: result.signature,
              status: 'confirmed',
              message: 'Cleanup sell - removing test token',
            },
          })

          sellCount++

          // Wait before next sell
          await sleep(3000)

          // Refresh balance
          remainingBalance = await getTokenBalance(opsWalletPubkey, tokenMintPubkey)
          console.log(`Remaining balance: ${remainingBalance.toLocaleString()}`)
        } else {
          console.error(`Sell failed: ${result.error}`)
          consecutiveFailures++
          await sleep(5000)
        }
      } catch (error: any) {
        console.error(`Error during sell: ${error.message}`)
        consecutiveFailures++
        await sleep(5000)
      }
    }

    if (consecutiveFailures >= maxConsecutiveFailures) {
      console.log(`\nStopped after ${maxConsecutiveFailures} consecutive failures`)
    }

    console.log(`\nCompleted ${sellCount} sells`)
  }

  // Final balance check
  console.log('\n5. Final balances:')
  const finalTokenBalance = await getTokenBalance(opsWalletPubkey, tokenMintPubkey)
  const finalSolBalance = await getBalance(opsWalletPubkey)
  console.log(`Token Balance: ${finalTokenBalance.toLocaleString()}`)
  console.log(`SOL Balance: ${finalSolBalance.toFixed(6)} SOL`)

  // Step 4: Delete token if requested
  if (DELETE_AFTER) {
    if (finalTokenBalance > 1000) {
      console.log('\n6. Cannot delete - still has token balance! Sell first with --sell flag.')
    } else {
      console.log('\n6. Deleting token from database...')

      // Delete in order: flywheel state, config, transactions, claims, then token
      await prisma.$transaction([
        prisma.privyFlywheelState.deleteMany({ where: { privyTokenId: token.id } }),
        prisma.privyTokenConfig.deleteMany({ where: { privyTokenId: token.id } }),
        prisma.privyTransaction.deleteMany({ where: { privyTokenId: token.id } }),
        prisma.privyClaimHistory.deleteMany({ where: { privyTokenId: token.id } }),
        prisma.privyUserToken.delete({ where: { id: token.id } }),
      ])

      console.log('Token deleted from database!')
    }
  } else {
    console.log('\n6. Token NOT deleted (pass --delete flag to delete)')
  }

  console.log('\n' + '='.repeat(60))
  console.log('CLEANUP COMPLETE')
  console.log('='.repeat(60))
  console.log('\nNext steps:')
  if (!SELL_TOKENS && finalTokenBalance > 0) {
    console.log(`  npx tsx src/scripts/cleanup-test-token.ts ${TOKEN_MINT} --sell`)
  }
  if (!DELETE_AFTER) {
    console.log(`  npx tsx src/scripts/cleanup-test-token.ts ${TOKEN_MINT} --delete`)
  }
  if (SELL_TOKENS && DELETE_AFTER) {
    console.log(`  npx tsx src/scripts/cleanup-test-token.ts ${TOKEN_MINT} --sell --delete`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
