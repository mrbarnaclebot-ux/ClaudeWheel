import { PublicKey } from '@solana/web3.js'
import { connection, getBalance, getTokenBalance, getTokenMint, getSolPrice } from '../config/solana'
import type { WalletBalance } from '../types'

// ═══════════════════════════════════════════════════════════════════════════
// WALLET MONITOR SERVICE
// Tracks balances of dev and ops wallets in real-time
// ═══════════════════════════════════════════════════════════════════════════

export class WalletMonitor {
  private devWalletAddress: PublicKey | null = null
  private opsWalletAddress: PublicKey | null = null

  constructor(devAddress?: string, opsAddress?: string) {
    if (devAddress) {
      this.devWalletAddress = new PublicKey(devAddress)
    }
    if (opsAddress) {
      this.opsWalletAddress = new PublicKey(opsAddress)
    }
  }

  async getDevWalletBalance(): Promise<WalletBalance | null> {
    if (!this.devWalletAddress) {
      console.warn('Dev wallet address not configured')
      return null
    }

    try {
      const tokenMint = getTokenMint()
      const [solBalance, tokenBalance, solPrice] = await Promise.all([
        getBalance(this.devWalletAddress),
        tokenMint ? getTokenBalance(this.devWalletAddress, tokenMint) : Promise.resolve(0),
        getSolPrice(),
      ])

      return {
        wallet_type: 'dev',
        address: this.devWalletAddress.toString(),
        sol_balance: solBalance,
        token_balance: tokenBalance,
        usd_value: solBalance * solPrice,
        updated_at: new Date(),
      }
    } catch (error) {
      console.error('Failed to get dev wallet balance:', error)
      return null
    }
  }

  async getOpsWalletBalance(): Promise<WalletBalance | null> {
    if (!this.opsWalletAddress) {
      console.warn('Ops wallet address not configured')
      return null
    }

    try {
      const tokenMint = getTokenMint()
      const [solBalance, tokenBalance, solPrice] = await Promise.all([
        getBalance(this.opsWalletAddress),
        tokenMint ? getTokenBalance(this.opsWalletAddress, tokenMint) : Promise.resolve(0),
        getSolPrice(),
      ])

      return {
        wallet_type: 'ops',
        address: this.opsWalletAddress.toString(),
        sol_balance: solBalance,
        token_balance: tokenBalance,
        usd_value: solBalance * solPrice,
        updated_at: new Date(),
      }
    } catch (error) {
      console.error('Failed to get ops wallet balance:', error)
      return null
    }
  }

  async getAllBalances(): Promise<{
    devWallet: WalletBalance | null
    opsWallet: WalletBalance | null
  }> {
    const [devWallet, opsWallet] = await Promise.all([
      this.getDevWalletBalance(),
      this.getOpsWalletBalance(),
    ])

    return { devWallet, opsWallet }
  }

  // Set wallet addresses dynamically
  setDevWalletAddress(address: string) {
    this.devWalletAddress = new PublicKey(address)
  }

  setOpsWalletAddress(address: string) {
    this.opsWalletAddress = new PublicKey(address)
  }
}

// Singleton instance
export const walletMonitor = new WalletMonitor()
