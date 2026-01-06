import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js'
import { connection, getBalance } from '../config/solana'
import { env } from '../config/env'
import type { Transaction as TxRecord } from '../types'

// ═══════════════════════════════════════════════════════════════════════════
// FEE COLLECTOR SERVICE
// Collects fees from dev wallet and transfers to ops wallet
// ═══════════════════════════════════════════════════════════════════════════

export class FeeCollector {
  private devWallet: Keypair | null = null
  private opsWalletAddress: PublicKey | null = null
  private lastCollectionTime: Date | null = null
  private totalCollected: number = 0

  constructor(devWallet?: Keypair, opsWalletAddress?: PublicKey) {
    this.devWallet = devWallet || null
    this.opsWalletAddress = opsWalletAddress || null
  }

  setDevWallet(wallet: Keypair) {
    this.devWallet = wallet
  }

  setOpsWalletAddress(address: PublicKey) {
    this.opsWalletAddress = address
  }

  async collectFees(): Promise<TxRecord | null> {
    if (!this.devWallet || !this.opsWalletAddress) {
      console.warn('⚠️ Wallets not configured for fee collection')
      return null
    }

    try {
      // Get current dev wallet balance
      const devBalance = await getBalance(this.devWallet.publicKey)
      console.log(`📊 Dev wallet balance: ${devBalance.toFixed(6)} SOL`)

      // Check if balance exceeds threshold
      // Keep some SOL for transaction fees (0.01 SOL buffer)
      const transferAmount = devBalance - 0.01

      if (transferAmount < env.minFeeThresholdSol) {
        console.log(`ℹ️ Balance below threshold (${env.minFeeThresholdSol} SOL), skipping collection`)
        return null
      }

      console.log(`💸 Collecting ${transferAmount.toFixed(6)} SOL from dev wallet...`)

      // Create transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.devWallet.publicKey,
          toPubkey: this.opsWalletAddress,
          lamports: Math.floor(transferAmount * LAMPORTS_PER_SOL),
        })
      )

      // Send and confirm transaction
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [this.devWallet],
        { commitment: 'confirmed' }
      )

      console.log(`✅ Fee collection successful! Signature: ${signature}`)

      // Update stats
      this.lastCollectionTime = new Date()
      this.totalCollected += transferAmount

      // Return transaction record
      const txRecord: TxRecord = {
        id: signature,
        type: 'fee_collection',
        amount: transferAmount,
        token: 'SOL',
        signature,
        status: 'confirmed',
        created_at: new Date(),
      }

      return txRecord
    } catch (error) {
      console.error('❌ Fee collection failed:', error)
      return null
    }
  }

  async transferToOps(amount: number): Promise<TxRecord | null> {
    if (!this.devWallet || !this.opsWalletAddress) {
      console.warn('⚠️ Wallets not configured for transfer')
      return null
    }

    try {
      console.log(`📤 Transferring ${amount.toFixed(6)} SOL to ops wallet...`)

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.devWallet.publicKey,
          toPubkey: this.opsWalletAddress,
          lamports: Math.floor(amount * LAMPORTS_PER_SOL),
        })
      )

      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [this.devWallet],
        { commitment: 'confirmed' }
      )

      console.log(`✅ Transfer successful! Signature: ${signature}`)

      const txRecord: TxRecord = {
        id: signature,
        type: 'transfer',
        amount,
        token: 'SOL',
        signature,
        status: 'confirmed',
        created_at: new Date(),
      }

      return txRecord
    } catch (error) {
      console.error('❌ Transfer failed:', error)
      return null
    }
  }

  getStats() {
    return {
      lastCollectionTime: this.lastCollectionTime,
      totalCollected: this.totalCollected,
    }
  }
}

// Singleton instance
export const feeCollector = new FeeCollector()
