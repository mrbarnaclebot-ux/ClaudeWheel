'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import Header from './components/Header'
import FlywheelAnimation from './components/FlywheelAnimation'
import WalletCard from './components/WalletCard'
import TokenInfo from './components/TokenInfo'
import TransactionFeed from './components/TransactionFeed'
import FeeStats from './components/FeeStats'
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
import { PLACEHOLDER_CA } from '@/lib/utils'

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
  const [tokenMintAddress, setTokenMintAddress] = useState<string>(PLACEHOLDER_CA)
  const [tokenSymbol, setTokenSymbol] = useState<string>('TOKEN')

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      // Fetch status from backend API
      const status = await fetchStatus()
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
      }

      // Fetch wallet balances from Supabase
      const wallets = await fetchWalletBalances()
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
      }

      // Fetch transactions from Supabase
      const txs = await fetchTransactionsFromDB(20)
      if (txs.length > 0) {
        setTransactions(txs.map(tx => ({
          id: tx.id,
          type: tx.type === 'fee_collection' ? 'fee' : tx.type as 'buy' | 'sell' | 'transfer',
          amount: tx.amount,
          token: tx.token,
          timestamp: new Date(tx.created_at),
          status: tx.status,
        })))
      }

      // Fetch fee stats from Supabase
      const stats = await fetchFeeStats()
      if (stats) {
        setFeeStats({
          totalCollected: stats.total_collected,
          todayCollected: stats.today_collected,
          hourCollected: stats.hour_collected,
          totalChange: stats.total_change || 0,
          todayChange: stats.today_change || 0,
          hourChange: stats.hour_change || 0,
        })
      }

      // Fetch config for token mint address and symbol
      const config = await fetchConfig()
      if (config) {
        if (config.token_mint_address) {
          setTokenMintAddress(config.token_mint_address)
        }
        if (config.token_symbol) {
          setTokenSymbol(config.token_symbol)
        }
        setIsActive(config.flywheel_active)
      }
    } catch (error) {
      console.error('Failed to load data:', error)
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
      {/* Header */}
      <Header isActive={isActive} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-accent-primary font-mono">
              Loading flywheel data...
            </div>
          </div>
        )}

        {/* Hero: Flywheel Animation */}
        <section className="mb-8">
          <FlywheelAnimation
            devBalance={walletData.devWallet.solBalance}
            opsBalance={walletData.opsWallet.solBalance}
            tokenBalance={walletData.opsWallet.tokenBalance}
            isActive={isActive}
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
            address={walletData.devWallet.address || '2qaYB64KpD1yNbmgVSytCBcSpF2hJUd2fmXpa7P5cF7f'}
            solBalance={walletData.devWallet.solBalance}
            usdValue={walletData.devWallet.usdValue}
            lastFee={walletData.devWallet.lastFee}
            lastFeeTime={walletData.devWallet.lastFeeTime}
          />
          <WalletCard
            type="ops"
            address={walletData.opsWallet.address || '4eWyYcydT1uJyJkZbVzqNhFPwQMRmLrGxYbBWn3WHpnL'}
            solBalance={walletData.opsWallet.solBalance}
            usdValue={walletData.opsWallet.usdValue}
            tokenBalance={walletData.opsWallet.tokenBalance}
          />
        </section>

        {/* Token Info & Transaction Feed Row */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TokenInfo contractAddress={tokenMintAddress} tokenSymbol={tokenSymbol} />
          <TransactionFeed transactions={transactions} />
        </section>

        {/* Footer */}
        <footer className="mt-12 py-6 border-t border-border-subtle">
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
              <span className="text-text-muted">•</span>
              <span>Autonomous Market Making</span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="#"
                className="hover:text-accent-primary transition-colors"
              >
                Docs
              </a>
              <a
                href="#"
                className="hover:text-accent-primary transition-colors"
              >
                Twitter
              </a>
              <a
                href="#"
                className="hover:text-accent-primary transition-colors"
              >
                Discord
              </a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}
