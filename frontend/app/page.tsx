'use client'

// Force dynamic rendering to prevent SSG issues with Supabase
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import WoodenWheel from './components/WoodenWheel'
import WalletCard from './components/WalletCard'
import TransactionFeed from './components/TransactionFeed'
import FeeStats from './components/FeeStats'
import PriceChart from './components/PriceChart'
import {
  supabase,
  fetchWalletBalances,
  fetchTransactions as fetchTransactionsFromDB,
  fetchFeeStats,
  fetchConfig,
  subscribeToWalletBalances,
  subscribeToTransactions,
  subscribeToFeeStats,
  subscribeToConfig,
  type WalletBalance,
  type Transaction,
  type FeeStats as FeeStatsType,
  type Config,
} from '@/lib/supabase'
import { fetchStatus } from '@/lib/api'

interface WalletData {
  devWallet: {
    address: string
    solBalance: number
    usdValue: number
    lastFee?: number
    lastFeeTime?: Date
  }
  opsWallet: {
    address: string
    solBalance: number
    usdValue: number
    tokenBalance: number
  }
}

interface TransactionDisplay {
  id: string
  type: 'fee' | 'buy' | 'sell' | 'transfer'
  amount: number
  token: string
  timestamp: Date
  status: string
}

const defaultWalletData: WalletData = {
  devWallet: {
    address: '',
    solBalance: 0,
    usdValue: 0,
  },
  opsWallet: {
    address: '',
    solBalance: 0,
    usdValue: 0,
    tokenBalance: 0,
  },
}

const defaultFeeStats = {
  totalCollected: 0,
  todayCollected: 0,
  hourCollected: 0,
  totalChange: 0,
  todayChange: 0,
  hourChange: 0,
}

export default function Dashboard() {
  const [isActive, setIsActive] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [transactions, setTransactions] = useState<TransactionDisplay[]>([])
  const [walletData, setWalletData] = useState<WalletData>(defaultWalletData)
  const [feeStats, setFeeStats] = useState(defaultFeeStats)
  const [tokenMintAddress, setTokenMintAddress] = useState<string>('')
  const [tokenSymbol, setTokenSymbol] = useState<string>('TOKEN')

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      // Fetch status from backend API
      console.log('[Dashboard] Fetching status from backend API...')
      const status = await fetchStatus()
      console.log('[Dashboard] Backend status:', status)
      if (status) {
        setIsActive(status.is_active)
        // Update wallet data from API if available
        if (status.dev_wallet_balance > 0 || status.ops_wallet_balance > 0) {
          setWalletData(prev => ({
            ...prev,
            devWallet: {
              ...prev.devWallet,
              solBalance: status.dev_wallet_balance,
              usdValue: status.dev_wallet_balance * 200, // Approximate USD
            },
            opsWallet: {
              ...prev.opsWallet,
              solBalance: status.ops_wallet_balance,
              usdValue: status.ops_wallet_balance * 200,
            },
          }))
          setFeeStats(prev => ({
            ...prev,
            totalCollected: status.total_fees_collected,
          }))
        }
      } else {
        console.warn('[Dashboard] No status received from backend API')
      }

      // Fetch wallet balances from Supabase
      console.log('[Dashboard] Fetching wallet balances from Supabase...')
      const wallets = await fetchWalletBalances()
      console.log('[Dashboard] Wallet balances:', wallets)
      if (wallets.length > 0) {
        const devWallet = wallets.find(w => w.wallet_type === 'dev')
        const opsWallet = wallets.find(w => w.wallet_type === 'ops')

        setWalletData({
          devWallet: {
            address: devWallet?.address || '',
            solBalance: devWallet?.sol_balance || 0,
            usdValue: devWallet?.usd_value || 0,
          },
          opsWallet: {
            address: opsWallet?.address || '',
            solBalance: opsWallet?.sol_balance || 0,
            usdValue: opsWallet?.usd_value || 0,
            tokenBalance: opsWallet?.token_balance || 0,
          },
        })
      } else {
        console.warn('[Dashboard] No wallet balances found in Supabase')
      }

      // Fetch transactions from Supabase
      console.log('[Dashboard] Fetching transactions from Supabase...')
      const txs = await fetchTransactionsFromDB(20)
      console.log('[Dashboard] Transactions:', txs.length, 'found')
      if (txs.length > 0) {
        setTransactions(txs.map(tx => ({
          id: tx.id,
          type: tx.type === 'fee_collection' ? 'fee' : tx.type as 'buy' | 'sell' | 'transfer',
          amount: tx.amount,
          token: tx.token,
          timestamp: new Date(tx.created_at),
          status: tx.status,
        })))
      } else {
        console.warn('[Dashboard] No transactions found in Supabase')
      }

      // Fetch fee stats from Supabase
      console.log('[Dashboard] Fetching fee stats from Supabase...')
      const stats = await fetchFeeStats()
      console.log('[Dashboard] Fee stats:', stats)
      if (stats) {
        setFeeStats({
          totalCollected: stats.total_collected,
          todayCollected: stats.today_collected,
          hourCollected: stats.hour_collected,
          totalChange: stats.total_change || 0,
          todayChange: stats.today_change || 0,
          hourChange: stats.hour_change || 0,
        })
      } else {
        console.warn('[Dashboard] No fee stats found in Supabase')
      }

      // Fetch config for token mint address and symbol
      console.log('[Dashboard] Fetching config from Supabase...')
      const config = await fetchConfig()
      console.log('[Dashboard] Config:', config)
      if (config) {
        if (config.token_mint_address) {
          setTokenMintAddress(config.token_mint_address)
        } else {
          console.warn('[Dashboard] Config found but token_mint_address is null')
        }
        if (config.token_symbol) {
          setTokenSymbol(config.token_symbol)
        }
        setIsActive(config.flywheel_active)
      } else {
        console.warn('[Dashboard] No config found in Supabase (missing id="main" row)')
      }
    } catch (error) {
      console.error('[Dashboard] Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Set up real-time subscriptions
  useEffect(() => {
    loadData()

    // Subscribe to wallet balance changes
    const walletSub = subscribeToWalletBalances((payload: WalletBalance) => {
      setWalletData(prev => {
        if (payload.wallet_type === 'dev') {
          return {
            ...prev,
            devWallet: {
              ...prev.devWallet,
              address: payload.address,
              solBalance: payload.sol_balance,
              usdValue: payload.usd_value,
            },
          }
        } else {
          return {
            ...prev,
            opsWallet: {
              ...prev.opsWallet,
              address: payload.address,
              solBalance: payload.sol_balance,
              usdValue: payload.usd_value,
              tokenBalance: payload.token_balance,
            },
          }
        }
      })
    })

    // Subscribe to new transactions
    const txSub = subscribeToTransactions((payload: Transaction) => {
      const newTx: TransactionDisplay = {
        id: payload.id,
        type: payload.type === 'fee_collection' ? 'fee' : payload.type as 'buy' | 'sell' | 'transfer',
        amount: payload.amount,
        token: payload.token,
        timestamp: new Date(payload.created_at),
        status: payload.status,
      }
      setTransactions(prev => [newTx, ...prev.slice(0, 19)])
    })

    // Subscribe to fee stats changes
    const feeStatsSub = subscribeToFeeStats((payload: FeeStatsType) => {
      setFeeStats({
        totalCollected: payload.total_collected,
        todayCollected: payload.today_collected,
        hourCollected: payload.hour_collected,
        totalChange: payload.total_change || 0,
        todayChange: payload.today_change || 0,
        hourChange: payload.hour_change || 0,
      })
    })

    // Subscribe to config changes (token address, symbol, etc.)
    const configSub = subscribeToConfig((payload: Config) => {
      if (payload.token_mint_address) {
        setTokenMintAddress(payload.token_mint_address)
      }
      if (payload.token_symbol) {
        setTokenSymbol(payload.token_symbol)
      }
      setIsActive(payload.flywheel_active)
    })

    // Refresh data periodically (every 30 seconds)
    const refreshInterval = setInterval(loadData, 30000)

    return () => {
      supabase.removeChannel(walletSub)
      supabase.removeChannel(txSub)
      supabase.removeChannel(feeStatsSub)
      supabase.removeChannel(configSub)
      clearInterval(refreshInterval)
    }
  }, [loadData])

  return (
    <div className="min-h-screen bg-void">
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 wheel-spin">
                <svg viewBox="0 0 100 100" className="w-full h-full text-wood-light">
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray="70 30"
                  />
                </svg>
              </div>
              <span className="text-wood-accent font-mono text-sm">
                Loading flywheel data...
              </span>
            </div>
          </div>
        )}

        {/* Hero: Wooden Wheel - Centered */}
        <section className="mb-12">
          <WoodenWheel
            devBalance={walletData.devWallet.solBalance}
            opsBalance={walletData.opsWallet.solBalance}
            tokenBalance={walletData.opsWallet.tokenBalance}
            tokenSymbol={tokenSymbol}
          />
        </section>

        {/* Fee Stats Row */}
        <section className="mb-8">
          <FeeStats
            totalCollected={feeStats.totalCollected}
            todayCollected={feeStats.todayCollected}
            hourCollected={feeStats.hourCollected}
            totalChange={feeStats.totalChange}
            todayChange={feeStats.todayChange}
            hourChange={feeStats.hourChange}
          />
        </section>

        {/* Wallet Cards Row */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <WalletCard
            type="dev"
            address={walletData.devWallet.address}
            solBalance={walletData.devWallet.solBalance}
            usdValue={walletData.devWallet.usdValue}
            lastFee={walletData.devWallet.lastFee}
            lastFeeTime={walletData.devWallet.lastFeeTime}
          />
          <WalletCard
            type="ops"
            address={walletData.opsWallet.address}
            solBalance={walletData.opsWallet.solBalance}
            usdValue={walletData.opsWallet.usdValue}
            tokenBalance={walletData.opsWallet.tokenBalance}
            tokenSymbol={tokenSymbol}
          />
        </section>

        {/* Price Chart & Transaction Feed Row */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <PriceChart tokenAddress={tokenMintAddress} />
          <TransactionFeed transactions={transactions} />
        </section>

        {/* External Links */}
        <section className="mb-8">
          <div className="card-glow bg-bg-card p-6">
            <h3 className="text-sm font-mono font-semibold text-text-muted uppercase mb-4">Quick Links</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <a
                href="https://bags.fm/token/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg bg-bg-secondary border border-border-subtle hover:border-accent-primary/30 hover:bg-bg-card-hover transition-all group"
              >
                <span className="text-lg">💰</span>
                <div>
                  <div className="text-sm font-mono text-text-primary group-hover:text-accent-primary transition-colors">Bags.fm</div>
                  <div className="text-xs font-mono text-text-muted">Trade WHEEL</div>
                </div>
              </a>
              <a
                href="https://dexscreener.com/solana/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg bg-bg-secondary border border-border-subtle hover:border-accent-primary/30 hover:bg-bg-card-hover transition-all group"
              >
                <span className="text-lg">📊</span>
                <div>
                  <div className="text-sm font-mono text-text-primary group-hover:text-accent-primary transition-colors">DexScreener</div>
                  <div className="text-xs font-mono text-text-muted">View Charts</div>
                </div>
              </a>
              <a
                href="https://t.me/claude_wheel_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg bg-bg-secondary border border-border-subtle hover:border-accent-primary/30 hover:bg-bg-card-hover transition-all group"
              >
                <span className="text-lg">🤖</span>
                <div>
                  <div className="text-sm font-mono text-text-primary group-hover:text-accent-primary transition-colors">Telegram Bot</div>
                  <div className="text-xs font-mono text-text-muted">Launch Tokens</div>
                </div>
              </a>
              <a
                href="https://x.com/i/communities/2008530158354063511"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg bg-bg-secondary border border-border-subtle hover:border-accent-primary/30 hover:bg-bg-card-hover transition-all group"
              >
                <span className="text-lg">🐦</span>
                <div>
                  <div className="text-sm font-mono text-text-primary group-hover:text-accent-primary transition-colors">Community</div>
                  <div className="text-xs font-mono text-text-muted">Join Us</div>
                </div>
              </a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-6 border-t border-border-subtle">
          <div className="flex flex-col gap-4">
            {/* Contract Address */}
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-text-muted">
              <span className="text-text-muted/60">CA:</span>
              <a
                href="https://solscan.io/token/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent-primary transition-colors"
              >
                8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS
              </a>
              <button
                onClick={() => {
                  navigator.clipboard.writeText('8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS')
                }}
                className="text-text-muted/60 hover:text-accent-primary transition-colors"
                title="Copy CA"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>

            {/* Main Footer Row */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm font-mono text-text-muted">
              <div className="flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt="Claude Wheel"
                  width={20}
                  height={20}
                  className="opacity-70"
                />
                <span>Claude Wheel</span>
                <span className="text-text-muted/50">•</span>
                <span>Autonomous Market Making</span>
              </div>
              <div className="flex items-center gap-4">
                <a
                  href="/docs"
                  className="hover:text-accent-primary transition-colors"
                >
                  Docs
                </a>
                <a
                  href="/privacy"
                  className="hover:text-accent-primary transition-colors"
                >
                  Privacy
                </a>
                <a
                  href="https://github.com/mrbarnaclebot-ux/ClaudeWheel"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent-primary transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  GitHub
                </a>
                <a
                  href="https://x.com/i/communities/2008530158354063511"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-accent-primary transition-colors flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  Community
                </a>
              </div>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
