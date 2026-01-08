// ═══════════════════════════════════════════════════════════════════════════
// BALANCE MONITOR SERVICE
// Tracks and caches wallet balances for all user tokens in Supabase
// Fetches balances from Solana blockchain and claimable fees from Bags.fm
// ═══════════════════════════════════════════════════════════════════════════

import { PublicKey } from '@solana/web3.js'
import { supabase } from '../config/database'
import { getConnection, getBalance, getTokenBalance, getSolPrice } from '../config/solana'
import { bagsFmService } from './bags-fm'
import { getTokensForAutoClaim } from './user-token.service'

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface UserWalletBalance {
  id: string
  user_token_id: string
  dev_sol_balance: number
  dev_token_balance: number
  dev_usd_value: number
  ops_sol_balance: number
  ops_token_balance: number
  ops_usd_value: number
  claimable_fees_sol: number
  claimable_fees_usd: number
  sol_price_usd: number
  last_updated_at: string
  update_count: number
}

export interface BalanceUpdateResult {
  userTokenId: string
  tokenSymbol: string
  success: boolean
  devSol: number
  devToken: number
  opsSol: number
  opsToken: number
  claimableFees: number
  error?: string
}

export interface BatchBalanceUpdateResult {
  totalTokens: number
  successCount: number
  failedCount: number
  totalDevSol: number
  totalOpsSol: number
  totalClaimableFees: number
  results: BalanceUpdateResult[]
  startedAt: string
  completedAt: string
  durationMs: number
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// Max tokens to update per batch (to avoid rate limits)
const MAX_TOKENS_PER_BATCH = parseInt(process.env.BALANCE_UPDATE_BATCH_SIZE || '50', 10)

// Delay between balance fetches (ms) to avoid Solana RPC rate limits
const FETCH_DELAY_MS = parseInt(process.env.BALANCE_FETCH_DELAY_MS || '100', 10)

// Save history snapshot every N updates (0 = disabled)
const SNAPSHOT_INTERVAL = parseInt(process.env.BALANCE_SNAPSHOT_INTERVAL || '12', 10) // Every 12 updates (~1 hour if running every 5 min)

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class BalanceMonitorService {
  private isRunning = false
  private lastRunAt: Date | null = null
  private updateCount = 0

  /**
   * Update balances for all active tokens
   */
  async updateAllBalances(): Promise<BatchBalanceUpdateResult> {
    if (this.isRunning) {
      console.log('⚠️ Balance update already in progress, skipping')
      return this.emptyResult()
    }

    this.isRunning = true
    const startedAt = new Date()
    const results: BalanceUpdateResult[] = []

    console.log('\n💰 BALANCE UPDATE CYCLE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    try {
      // Get all active tokens
      const tokens = await this.getAllActiveTokens()

      if (tokens.length === 0) {
        console.log('   No active tokens to update')
        return this.emptyResult()
      }

      const tokensToProcess = tokens.slice(0, MAX_TOKENS_PER_BATCH)
      console.log(`   Processing ${tokensToProcess.length}/${tokens.length} tokens`)

      // Get current SOL price once for all updates
      const solPrice = await getSolPrice()
      console.log(`   SOL Price: $${solPrice.toFixed(2)}`)

      // Group tokens by dev wallet to batch claimable position checks
      const walletToTokens = this.groupByDevWallet(tokensToProcess)
      const claimableByWallet = await this.batchGetClaimablePositions(Object.keys(walletToTokens))

      // Update each token's balances
      for (const token of tokensToProcess) {
        try {
          const result = await this.updateTokenBalance(token, solPrice, claimableByWallet)
          results.push(result)

          if (result.success) {
            console.log(`   ✓ ${token.token_symbol}: dev=${result.devSol.toFixed(4)} SOL, ops=${result.opsSol.toFixed(4)} SOL, claimable=${result.claimableFees.toFixed(4)} SOL`)
          } else {
            console.log(`   ✗ ${token.token_symbol}: ${result.error}`)
          }

          // Small delay to avoid RPC rate limits
          await this.sleep(FETCH_DELAY_MS)
        } catch (error: any) {
          results.push({
            userTokenId: token.id,
            tokenSymbol: token.token_symbol,
            success: false,
            devSol: 0,
            devToken: 0,
            opsSol: 0,
            opsToken: 0,
            claimableFees: 0,
            error: error.message,
          })
        }
      }

      this.updateCount++

      // Save snapshots periodically
      if (SNAPSHOT_INTERVAL > 0 && this.updateCount % SNAPSHOT_INTERVAL === 0) {
        await this.saveBalanceSnapshots(tokensToProcess.map(t => t.id))
        console.log(`   📸 Saved balance snapshots for ${tokensToProcess.length} tokens`)
      }

    } catch (error: any) {
      console.error(`   ❌ Balance update error: ${error.message}`)
    } finally {
      this.isRunning = false
      this.lastRunAt = new Date()
    }

    const completedAt = new Date()
    const successful = results.filter(r => r.success)
    const totalDevSol = successful.reduce((sum, r) => sum + r.devSol, 0)
    const totalOpsSol = successful.reduce((sum, r) => sum + r.opsSol, 0)
    const totalClaimable = successful.reduce((sum, r) => sum + r.claimableFees, 0)

    console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`   Updated: ${successful.length}/${results.length} | Total Dev: ${totalDevSol.toFixed(4)} SOL | Total Ops: ${totalOpsSol.toFixed(4)} SOL | Claimable: ${totalClaimable.toFixed(4)} SOL`)
    console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

    return {
      totalTokens: results.length,
      successCount: successful.length,
      failedCount: results.length - successful.length,
      totalDevSol,
      totalOpsSol,
      totalClaimableFees: totalClaimable,
      results,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
    }
  }

  /**
   * Update balance for a single token
   */
  async updateSingleTokenBalance(userTokenId: string): Promise<BalanceUpdateResult | null> {
    if (!supabase) return null

    // Get token info
    const { data: token } = await supabase
      .from('user_tokens')
      .select('id, token_symbol, token_mint_address, token_decimals, dev_wallet_address, ops_wallet_address')
      .eq('id', userTokenId)
      .eq('is_active', true)
      .single()

    if (!token) {
      return null
    }

    const solPrice = await getSolPrice()

    // Get claimable positions for this wallet
    const positions = await bagsFmService.getClaimablePositions(token.dev_wallet_address)
    const claimableByWallet: Record<string, any[]> = {
      [token.dev_wallet_address]: positions || [],
    }

    return this.updateTokenBalance(token, solPrice, claimableByWallet)
  }

  /**
   * Update balance for a single token (internal)
   */
  private async updateTokenBalance(
    token: any,
    solPrice: number,
    claimableByWallet: Record<string, any[]>
  ): Promise<BalanceUpdateResult> {
    const baseResult = {
      userTokenId: token.id,
      tokenSymbol: token.token_symbol,
    }

    try {
      const tokenMint = token.token_mint_address ? new PublicKey(token.token_mint_address) : null
      const devWallet = new PublicKey(token.dev_wallet_address)
      const opsWallet = new PublicKey(token.ops_wallet_address)

      // Fetch balances from Solana
      const [devSol, devToken, opsSol, opsToken] = await Promise.all([
        getBalance(devWallet),
        tokenMint ? getTokenBalance(devWallet, tokenMint) : Promise.resolve(0),
        getBalance(opsWallet),
        tokenMint ? getTokenBalance(opsWallet, tokenMint) : Promise.resolve(0),
      ])

      // Get claimable fees from pre-fetched data
      const walletPositions = claimableByWallet[token.dev_wallet_address] || []
      const tokenPosition = walletPositions.find((p: any) => p.tokenMint === token.token_mint_address)
      const claimableFees = tokenPosition?.claimableAmount || 0

      // Update database
      await this.upsertBalance(
        token.id,
        devSol,
        devToken,
        opsSol,
        opsToken,
        claimableFees,
        solPrice
      )

      return {
        ...baseResult,
        success: true,
        devSol,
        devToken,
        opsSol,
        opsToken,
        claimableFees,
      }
    } catch (error: any) {
      return {
        ...baseResult,
        success: false,
        devSol: 0,
        devToken: 0,
        opsSol: 0,
        opsToken: 0,
        claimableFees: 0,
        error: error.message,
      }
    }
  }

  /**
   * Get all active tokens from database
   */
  private async getAllActiveTokens(): Promise<any[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('user_tokens')
      .select('id, token_symbol, token_mint_address, token_decimals, dev_wallet_address, ops_wallet_address')
      .eq('is_active', true)
      .eq('is_suspended', false)

    if (error) {
      console.error('Error fetching active tokens:', error)
      return []
    }

    return data || []
  }

  /**
   * Group tokens by dev wallet address
   */
  private groupByDevWallet(tokens: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {}
    for (const token of tokens) {
      const wallet = token.dev_wallet_address
      if (!grouped[wallet]) {
        grouped[wallet] = []
      }
      grouped[wallet].push(token)
    }
    return grouped
  }

  /**
   * Batch fetch claimable positions for multiple wallets
   */
  private async batchGetClaimablePositions(walletAddresses: string[]): Promise<Record<string, any[]>> {
    const result: Record<string, any[]> = {}

    // Fetch in parallel with some batching
    const BATCH_SIZE = 10
    for (let i = 0; i < walletAddresses.length; i += BATCH_SIZE) {
      const batch = walletAddresses.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.allSettled(
        batch.map(async (wallet) => {
          const positions = await bagsFmService.getClaimablePositions(wallet)
          return { wallet, positions: positions || [] }
        })
      )

      for (const res of batchResults) {
        if (res.status === 'fulfilled') {
          result[res.value.wallet] = res.value.positions
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < walletAddresses.length) {
        await this.sleep(200)
      }
    }

    return result
  }

  /**
   * Upsert balance record in database
   */
  private async upsertBalance(
    userTokenId: string,
    devSol: number,
    devToken: number,
    opsSol: number,
    opsToken: number,
    claimableFees: number,
    solPrice: number
  ): Promise<void> {
    if (!supabase) return

    // Try using the RPC function first (more efficient)
    const { error: rpcError } = await supabase.rpc('upsert_wallet_balance', {
      p_user_token_id: userTokenId,
      p_dev_sol: devSol,
      p_dev_token: devToken,
      p_ops_sol: opsSol,
      p_ops_token: opsToken,
      p_claimable_fees: claimableFees,
      p_sol_price: solPrice,
    })

    if (rpcError) {
      // Fall back to direct upsert if RPC fails (function may not exist)
      const devUsd = devSol * solPrice
      const opsUsd = opsSol * solPrice
      const claimableUsd = claimableFees * solPrice

      await supabase
        .from('user_wallet_balances')
        .upsert({
          user_token_id: userTokenId,
          dev_sol_balance: devSol,
          dev_token_balance: devToken,
          dev_usd_value: devUsd,
          ops_sol_balance: opsSol,
          ops_token_balance: opsToken,
          ops_usd_value: opsUsd,
          claimable_fees_sol: claimableFees,
          claimable_fees_usd: claimableUsd,
          sol_price_usd: solPrice,
          last_updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_token_id',
        })
    }
  }

  /**
   * Save balance snapshots for history
   */
  private async saveBalanceSnapshots(userTokenIds: string[]): Promise<void> {
    if (!supabase || userTokenIds.length === 0) return

    try {
      // Try using RPC function
      for (const id of userTokenIds) {
        await supabase.rpc('save_balance_snapshot', { p_user_token_id: id })
      }
    } catch {
      // Fallback: insert directly
      const { data: currentBalances } = await supabase
        .from('user_wallet_balances')
        .select('*')
        .in('user_token_id', userTokenIds)

      if (currentBalances && currentBalances.length > 0) {
        const snapshots = currentBalances.map((b: any) => ({
          user_token_id: b.user_token_id,
          dev_sol_balance: b.dev_sol_balance,
          dev_token_balance: b.dev_token_balance,
          ops_sol_balance: b.ops_sol_balance,
          ops_token_balance: b.ops_token_balance,
          claimable_fees_sol: b.claimable_fees_sol,
          sol_price_usd: b.sol_price_usd,
          snapshot_at: new Date().toISOString(),
        }))

        await supabase.from('user_wallet_balance_history').insert(snapshots)
      }
    }
  }

  /**
   * Get cached balance for a token
   */
  async getTokenBalance(userTokenId: string): Promise<UserWalletBalance | null> {
    if (!supabase) return null

    const { data, error } = await supabase
      .from('user_wallet_balances')
      .select('*')
      .eq('user_token_id', userTokenId)
      .single()

    if (error || !data) return null

    return data as UserWalletBalance
  }

  /**
   * Get balances for multiple tokens
   */
  async getTokenBalances(userTokenIds: string[]): Promise<UserWalletBalance[]> {
    if (!supabase || userTokenIds.length === 0) return []

    const { data, error } = await supabase
      .from('user_wallet_balances')
      .select('*')
      .in('user_token_id', userTokenIds)

    if (error || !data) return []

    return data as UserWalletBalance[]
  }

  /**
   * Get balance history for a token
   */
  async getTokenBalanceHistory(
    userTokenId: string,
    limit: number = 100
  ): Promise<any[]> {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('user_wallet_balance_history')
      .select('*')
      .eq('user_token_id', userTokenId)
      .order('snapshot_at', { ascending: false })
      .limit(limit)

    if (error || !data) return []

    return data
  }

  /**
   * Get aggregated balance stats for all user tokens
   */
  async getAggregatedStats(): Promise<{
    totalDevSol: number
    totalOpsSol: number
    totalClaimableFees: number
    totalUsdValue: number
    tokenCount: number
  }> {
    if (!supabase) {
      return {
        totalDevSol: 0,
        totalOpsSol: 0,
        totalClaimableFees: 0,
        totalUsdValue: 0,
        tokenCount: 0,
      }
    }

    const { data, error } = await supabase
      .from('user_wallet_balances')
      .select('dev_sol_balance, ops_sol_balance, claimable_fees_sol, dev_usd_value, ops_usd_value')

    if (error || !data) {
      return {
        totalDevSol: 0,
        totalOpsSol: 0,
        totalClaimableFees: 0,
        totalUsdValue: 0,
        tokenCount: 0,
      }
    }

    return {
      totalDevSol: data.reduce((sum, b) => sum + (b.dev_sol_balance || 0), 0),
      totalOpsSol: data.reduce((sum, b) => sum + (b.ops_sol_balance || 0), 0),
      totalClaimableFees: data.reduce((sum, b) => sum + (b.claimable_fees_sol || 0), 0),
      totalUsdValue: data.reduce((sum, b) => sum + (b.dev_usd_value || 0) + (b.ops_usd_value || 0), 0),
      tokenCount: data.length,
    }
  }

  private emptyResult(): BatchBalanceUpdateResult {
    return {
      totalTokens: 0,
      successCount: 0,
      failedCount: 0,
      totalDevSol: 0,
      totalOpsSol: 0,
      totalClaimableFees: 0,
      results: [],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 0,
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATUS METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  getStatus(): {
    isRunning: boolean
    lastRunAt: Date | null
    updateCount: number
  } {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      updateCount: this.updateCount,
    }
  }

  isJobRunning(): boolean {
    return this.isRunning
  }

  getLastRunAt(): Date | null {
    return this.lastRunAt
  }
}

export const balanceMonitorService = new BalanceMonitorService()
