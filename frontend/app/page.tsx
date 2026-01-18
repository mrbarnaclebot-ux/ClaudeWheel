'use client'

// Force dynamic rendering to prevent SSG issues with Supabase
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import WheelHero from './components/WheelHero'
import WheelStats from './components/WheelStats'
import PlatformStats from './components/PlatformStats'
import PriceChart from './components/PriceChart'
import {
  Wallet,
  BarChart3,
  Bot,
  Users,
  ArrowUpRight,
} from './admin/_components/shared/Icons'

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
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                className="relative rounded-2xl bg-bg-card/40 border border-border-subtle p-6 backdrop-blur-md overflow-hidden"
              >
                {/* Subtle gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-wood-light/5 via-transparent to-accent-cyan/5 pointer-events-none" />

                <h3 className="relative text-xs font-mono font-semibold text-text-muted uppercase tracking-widest mb-6 flex items-center gap-2">
                  <span className="w-8 h-px bg-gradient-to-r from-wood-light/50 to-transparent" />
                  Quick Links
                  <span className="w-8 h-px bg-gradient-to-l from-wood-light/50 to-transparent" />
                </h3>

                <div className="relative grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Bags.fm */}
                  <motion.a
                    href="https://bags.fm/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS"
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-3 p-4 rounded-xl bg-bg-secondary/60 border border-border-subtle hover:border-wood-light/40 hover:bg-bg-card/80 transition-all duration-300 group backdrop-blur-sm"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-wood-medium/30 to-wood-dark/20 flex items-center justify-center group-hover:from-wood-medium/50 group-hover:to-wood-dark/30 transition-all duration-300 shadow-lg shadow-wood-dark/20">
                      <Wallet className="w-5 h-5 text-wood-light" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-mono font-medium text-text-primary group-hover:text-wood-light transition-colors flex items-center gap-1">
                        Bags.fm
                        <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                      </div>
                      <div className="text-xs font-mono text-text-muted">Trade WHEEL</div>
                    </div>
                  </motion.a>

                  {/* DexScreener */}
                  <motion.a
                    href="https://dexscreener.com/solana/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS"
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-3 p-4 rounded-xl bg-bg-secondary/60 border border-border-subtle hover:border-copper/40 hover:bg-bg-card/80 transition-all duration-300 group backdrop-blur-sm"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-copper/30 to-bronze/20 flex items-center justify-center group-hover:from-copper/50 group-hover:to-bronze/30 transition-all duration-300 shadow-lg shadow-copper/20">
                      <BarChart3 className="w-5 h-5 text-copper-light" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-mono font-medium text-text-primary group-hover:text-copper-light transition-colors flex items-center gap-1">
                        DexScreener
                        <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                      </div>
                      <div className="text-xs font-mono text-text-muted">View Charts</div>
                    </div>
                  </motion.a>

                  {/* Telegram Bot */}
                  <motion.a
                    href="https://t.me/ClaudeWheelBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-3 p-4 rounded-xl bg-bg-secondary/60 border border-border-subtle hover:border-accent-cyan/40 hover:bg-bg-card/80 transition-all duration-300 group backdrop-blur-sm"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent-cyan/30 to-accent-cyan/10 flex items-center justify-center group-hover:from-accent-cyan/50 group-hover:to-accent-cyan/20 transition-all duration-300 shadow-lg shadow-accent-cyan/20">
                      <Bot className="w-5 h-5 text-accent-cyan" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-mono font-medium text-text-primary group-hover:text-accent-cyan transition-colors flex items-center gap-1">
                        Telegram Bot
                        <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                      </div>
                      <div className="text-xs font-mono text-text-muted">Launch Tokens</div>
                    </div>
                  </motion.a>

                  {/* Community */}
                  <motion.a
                    href="https://x.com/i/communities/2008530158354063511"
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-center gap-3 p-4 rounded-xl bg-bg-secondary/60 border border-border-subtle hover:border-success/40 hover:bg-bg-card/80 transition-all duration-300 group backdrop-blur-sm"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-success/30 to-success/10 flex items-center justify-center group-hover:from-success/50 group-hover:to-success/20 transition-all duration-300 shadow-lg shadow-success/20">
                      <Users className="w-5 h-5 text-success" strokeWidth={1.75} />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-mono font-medium text-text-primary group-hover:text-success transition-colors flex items-center gap-1">
                        Community
                        <ArrowUpRight className="w-3 h-3 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                      </div>
                      <div className="text-xs font-mono text-text-muted">Join Us</div>
                    </div>
                  </motion.a>
                </div>
              </motion.div>
            </section>

            {/* Footer */}
            <motion.footer
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="relative py-10 mt-4"
            >
              {/* Top border with gradient */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border-accent/50 to-transparent" />

              <div className="flex flex-col md:flex-row items-center justify-between gap-8 text-sm font-mono text-text-muted">
                {/* Brand section */}
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-wood-light/20 blur-xl rounded-full" />
                    <Image
                      src="/logo.png"
                      alt="Claude Wheel"
                      width={32}
                      height={32}
                      className="relative opacity-90 hover:opacity-100 transition-opacity"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-display text-lg tracking-wide">
                      CLAUDE <span className="text-wood-light">WHEEL</span>
                    </span>
                    <span className="text-xs tracking-wider text-text-muted/60">Autonomous Market Making</span>
                  </div>
                </div>

                {/* Navigation links */}
                <div className="flex items-center gap-8">
                  <a
                    href="/docs"
                    className="relative hover:text-wood-light transition-colors group"
                  >
                    <span>Docs</span>
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-wood-light group-hover:w-full transition-all duration-300" />
                  </a>
                  <a
                    href="/privacy"
                    className="relative hover:text-wood-light transition-colors group"
                  >
                    <span>Privacy</span>
                    <span className="absolute -bottom-1 left-0 w-0 h-px bg-wood-light group-hover:w-full transition-all duration-300" />
                  </a>

                  {/* Separator */}
                  <div className="h-4 w-px bg-border-subtle/50" />

                  {/* Social links */}
                  <a
                    href="https://github.com/mrbarnaclebot-ux/ClaudeWheel"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-bg-card/50 hover:text-wood-light transition-all duration-300 group"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    <span className="hidden sm:inline">GitHub</span>
                  </a>
                  <a
                    href="https://x.com/i/communities/2008530158354063511"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-bg-card/50 hover:text-wood-light transition-all duration-300 group"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <span className="hidden sm:inline">Community</span>
                  </a>
                </div>
              </div>

              {/* Copyright */}
              <div className="mt-8 pt-6 border-t border-border-subtle/30 text-center">
                <p className="text-xs text-text-muted/50 font-mono">
                  Built with Claude Code
                </p>
              </div>
            </motion.footer>
          </>
        )}
      </main>
    </div>
  )
}
