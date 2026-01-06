'use client'

import { useState, useEffect } from 'react'
import Header from './components/Header'
import FlywheelAnimation from './components/FlywheelAnimation'
import WalletCard from './components/WalletCard'
import TokenInfo from './components/TokenInfo'
import TransactionFeed from './components/TransactionFeed'
import FeeStats from './components/FeeStats'
import { mockWalletData, mockTransactions, mockFeeStats, PLACEHOLDER_CA } from '@/lib/utils'

export default function Dashboard() {
  const [isActive, setIsActive] = useState(true)
  const [transactions, setTransactions] = useState(mockTransactions)
  const [walletData, setWalletData] = useState(mockWalletData)
  const [feeStats, setFeeStats] = useState(mockFeeStats)

  // Simulate live updates (will be replaced with Supabase real-time later)
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate new transaction
      const types = ['fee', 'buy', 'sell', 'transfer'] as const
      const randomType = types[Math.floor(Math.random() * types.length)]

      const newTx = {
        id: Date.now().toString(),
        type: randomType,
        amount: randomType === 'fee'
          ? Math.random() * 0.05
          : randomType === 'transfer'
            ? Math.random() * 1
            : Math.random() * 100000,
        token: randomType === 'fee' || randomType === 'transfer' ? 'SOL' : 'CLAUDE',
        timestamp: new Date(),
        status: 'confirmed',
      }

      setTransactions(prev => [newTx, ...prev.slice(0, 19)])

      // Update wallet balances slightly
      setWalletData(prev => ({
        ...prev,
        devWallet: {
          ...prev.devWallet,
          solBalance: prev.devWallet.solBalance + (Math.random() * 0.01),
          lastFee: newTx.type === 'fee' ? newTx.amount : prev.devWallet.lastFee,
          lastFeeTime: newTx.type === 'fee' ? new Date() : prev.devWallet.lastFeeTime,
        },
        opsWallet: {
          ...prev.opsWallet,
          solBalance: prev.opsWallet.solBalance + (Math.random() * 0.02 - 0.01),
          tokenBalance: prev.opsWallet.tokenBalance + (Math.random() * 10000 - 5000),
        },
      }))

      // Update fee stats
      setFeeStats(prev => ({
        ...prev,
        hourCollected: prev.hourCollected + (Math.random() * 0.01),
        todayCollected: prev.todayCollected + (Math.random() * 0.01),
        totalCollected: prev.totalCollected + (Math.random() * 0.01),
      }))
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-void">
      {/* Header */}
      <Header isActive={isActive} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
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
            address="DEVwa11etXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            solBalance={walletData.devWallet.solBalance}
            usdValue={walletData.devWallet.usdValue}
            lastFee={walletData.devWallet.lastFee}
            lastFeeTime={walletData.devWallet.lastFeeTime}
          />
          <WalletCard
            type="ops"
            address="OPSwa11etXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            solBalance={walletData.opsWallet.solBalance}
            usdValue={walletData.opsWallet.usdValue}
            tokenBalance={walletData.opsWallet.tokenBalance}
          />
        </section>

        {/* Token Info & Transaction Feed Row */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TokenInfo contractAddress={PLACEHOLDER_CA} />
          <TransactionFeed transactions={transactions} />
        </section>

        {/* Footer */}
        <footer className="mt-12 py-6 border-t border-border-subtle">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm font-mono text-text-muted">
            <div className="flex items-center gap-2">
              <span className="text-accent-primary">◈</span>
              <span>Claude Flywheel</span>
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
