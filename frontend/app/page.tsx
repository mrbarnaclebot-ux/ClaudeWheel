'use client'

// Force dynamic rendering to prevent SSG issues with Supabase
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import WheelHero from './components/WheelHero'
import WheelStats from './components/WheelStats'
import PlatformStats from './components/PlatformStats'
import PriceChart from './components/PriceChart'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

// WHEEL token status response type
interface WheelStatusResponse {
  success: boolean
  data?: {
    token: {
      mintAddress: string
      symbol: string
      decimals: number
    }
    wallets: {
      dev: {
        address: string
        solBalance: number
        tokenBalance: number
      }
      ops: {
        address: string
        solBalance: number
        tokenBalance: number
      }
    }
    feeStats: {
      totalCollected: number
      todayCollected: number
      hourCollected: number
    }
    flywheel: {
      isActive: boolean
      wheelJobRunning: boolean
      multiUserJobRunning: boolean
      lastRunAt: string | null
    }
    transactionsCount: number
  }
  error?: string
}

// Platform stats response type
interface PlatformStatsResponse {
  success: boolean
  data?: {
    tokens: {
      launched: number
      registered: number
      mmOnly: number
      total: number
      activeFlywheels: number
    }
    users: {
      total: number
    }
    volume: {
      totalSol: number
      totalFeesCollected: number
    }
  }
  error?: string
}

interface WalletData {
  devWallet: {
    address: string
    solBalance: number
    tokenBalance: number
  }
  opsWallet: {
    address: string
    solBalance: number
    tokenBalance: number
  }
}

const defaultWalletData: WalletData = {
  devWallet: {
    address: '',
    solBalance: 0,
    tokenBalance: 0,
  },
  opsWallet: {
    address: '',
    solBalance: 0,
    tokenBalance: 0,
  },
}

const defaultFeeStats = {
  totalCollected: 0,
  todayCollected: 0,
  hourCollected: 0,
}

const defaultPlatformStats = {
  tokensLaunched: 0,
  tokensRegistered: 0,
  tokensMmOnly: 0,
  activeFlywheels: 0,
  totalUsers: 0,
  totalVolume: 0,
  totalFees: 0,
}

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true)
  const [walletData, setWalletData] = useState<WalletData>(defaultWalletData)
  const [feeStats, setFeeStats] = useState(defaultFeeStats)
  const [tokenMintAddress, setTokenMintAddress] = useState<string>('')
  const [tokenSymbol, setTokenSymbol] = useState<string>('WHEEL')
  const [platformStats, setPlatformStats] = useState(defaultPlatformStats)

  // Load initial data from both endpoints
  const loadData = useCallback(async () => {
    try {
      // Fetch WHEEL status and platform stats in parallel
      const [wheelResponse, statsResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/api/status/wheel`),
        fetch(`${API_BASE_URL}/api/status/platform-stats`),
      ])

      const wheelJson: WheelStatusResponse = await wheelResponse.json()
      const statsJson: PlatformStatsResponse = await statsResponse.json()

      // Process WHEEL status
      if (wheelJson.success && wheelJson.data) {
        const { token, wallets, feeStats: fees } = wheelJson.data

        setTokenMintAddress(token.mintAddress)
        setTokenSymbol(token.symbol)

        setWalletData({
          devWallet: {
            address: wallets.dev.address,
            solBalance: wallets.dev.solBalance,
            tokenBalance: wallets.dev.tokenBalance,
          },
          opsWallet: {
            address: wallets.ops.address,
            solBalance: wallets.ops.solBalance,
            tokenBalance: wallets.ops.tokenBalance,
          },
        })

        setFeeStats({
          totalCollected: fees.totalCollected,
          todayCollected: fees.todayCollected,
          hourCollected: fees.hourCollected,
        })
      }

      // Process platform stats
      if (statsJson.success && statsJson.data) {
        const { tokens, users, volume } = statsJson.data

        setPlatformStats({
          tokensLaunched: tokens.launched,
          tokensRegistered: tokens.registered,
          tokensMmOnly: tokens.mmOnly,
          activeFlywheels: tokens.activeFlywheels,
          totalUsers: users.total,
          totalVolume: volume.totalSol,
          totalFees: volume.totalFeesCollected,
        })
      }
    } catch (error) {
      console.error('[Dashboard] Failed to load data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Load data on mount and poll for updates
  useEffect(() => {
    loadData()
    const refreshInterval = setInterval(loadData, 30000)
    return () => clearInterval(refreshInterval)
  }, [loadData])

  return (
    <div className="min-h-screen bg-void">
      {/* Subtle background texture */}
      <div className="fixed inset-0 -z-10 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-wood-dark/20 via-transparent to-transparent" />
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 animate-spin">
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
              <span className="text-wood-accent font-mono text-sm tracking-wider">
                Loading flywheel data...
              </span>
            </div>
          </div>
        )}

        {!isLoading && (
          <>
            {/* Hero Section: Wheel */}
            <section className="mb-8">
              <WheelHero tokenMintAddress={tokenMintAddress} />
            </section>

            {/* WHEEL Token Stats: Wallets + Fees */}
            <section className="mb-12">
              <WheelStats
                devWallet={walletData.devWallet}
                opsWallet={walletData.opsWallet}
                tokenSymbol={tokenSymbol}
                totalFeesCollected={feeStats.totalCollected}
                todayFeesCollected={feeStats.todayCollected}
              />
            </section>

            {/* Platform Statistics */}
            <section className="mb-12">
              <PlatformStats
                tokensLaunched={platformStats.tokensLaunched}
                tokensRegistered={platformStats.tokensRegistered}
                tokensMmOnly={platformStats.tokensMmOnly}
                activeFlywheels={platformStats.activeFlywheels}
                totalUsers={platformStats.totalUsers}
                totalVolume={platformStats.totalVolume}
                totalFees={platformStats.totalFees}
              />
            </section>

            {/* Price Chart - Full width */}
            <section className="mb-12">
              <PriceChart tokenAddress={tokenMintAddress} />
            </section>

            {/* Quick Links */}
            <section className="mb-12">
              <div className="rounded-2xl bg-bg-card/50 border border-border-subtle p-6 backdrop-blur-sm">
                <h3 className="text-xs font-mono font-semibold text-text-muted uppercase tracking-widest mb-6">
                  Quick Links
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <a
                    href="https://bags.fm/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 rounded-xl bg-bg-secondary/50 border border-border-subtle hover:border-wood-light/30 hover:bg-bg-card transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-wood-medium/20 flex items-center justify-center group-hover:bg-wood-medium/30 transition-colors">
                      <span className="text-xl">💰</span>
                    </div>
                    <div>
                      <div className="text-sm font-mono font-medium text-text-primary group-hover:text-wood-light transition-colors">Bags.fm</div>
                      <div className="text-xs font-mono text-text-muted">Trade WHEEL</div>
                    </div>
                  </a>
                  <a
                    href="https://dexscreener.com/solana/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 rounded-xl bg-bg-secondary/50 border border-border-subtle hover:border-wood-light/30 hover:bg-bg-card transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-copper/20 flex items-center justify-center group-hover:bg-copper/30 transition-colors">
                      <span className="text-xl">📊</span>
                    </div>
                    <div>
                      <div className="text-sm font-mono font-medium text-text-primary group-hover:text-copper-light transition-colors">DexScreener</div>
                      <div className="text-xs font-mono text-text-muted">View Charts</div>
                    </div>
                  </a>
                  <a
                    href="https://t.me/ClaudeWheelBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 rounded-xl bg-bg-secondary/50 border border-border-subtle hover:border-accent-cyan/30 hover:bg-bg-card transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-accent-cyan/20 flex items-center justify-center group-hover:bg-accent-cyan/30 transition-colors">
                      <span className="text-xl">🤖</span>
                    </div>
                    <div>
                      <div className="text-sm font-mono font-medium text-text-primary group-hover:text-accent-cyan transition-colors">Telegram Bot</div>
                      <div className="text-xs font-mono text-text-muted">Launch Tokens</div>
                    </div>
                  </a>
                  <a
                    href="https://x.com/i/communities/2008530158354063511"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 rounded-xl bg-bg-secondary/50 border border-border-subtle hover:border-success/30 hover:bg-bg-card transition-all duration-300 group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center group-hover:bg-success/30 transition-colors">
                      <span className="text-xl">🐦</span>
                    </div>
                    <div>
                      <div className="text-sm font-mono font-medium text-text-primary group-hover:text-success transition-colors">Community</div>
                      <div className="text-xs font-mono text-text-muted">Join Us</div>
                    </div>
                  </a>
                </div>
              </div>
            </section>

            {/* Footer */}
            <footer className="py-8 border-t border-border-subtle/50">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-sm font-mono text-text-muted">
                <div className="flex items-center gap-3">
                  <Image
                    src="/logo.png"
                    alt="Claude Wheel"
                    width={24}
                    height={24}
                    className="opacity-80"
                  />
                  <span className="font-display text-lg tracking-wide">
                    CLAUDE <span className="text-wood-light">WHEEL</span>
                  </span>
                  <span className="text-text-muted/30">|</span>
                  <span className="text-xs tracking-wider">Autonomous Market Making</span>
                </div>
                <div className="flex items-center gap-6">
                  <a href="/docs" className="hover:text-wood-light transition-colors">
                    Docs
                  </a>
                  <a href="/privacy" className="hover:text-wood-light transition-colors">
                    Privacy
                  </a>
                  <a
                    href="https://github.com/mrbarnaclebot-ux/ClaudeWheel"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-wood-light transition-colors flex items-center gap-1.5"
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
                    className="hover:text-wood-light transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    Community
                  </a>
                </div>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  )
}
