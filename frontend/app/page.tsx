'use client'

export const dynamic = 'force-dynamic'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import LandingHeader from './components/landing/LandingHeader'
import SpinningLogo from './components/landing/SpinningLogo'
import LiveStatsGrid from './components/landing/LiveStatsGrid'
import WheelTokenCard from './components/landing/WheelTokenCard'
import HowItWorks from './components/landing/HowItWorks'
import QuickActions from './components/landing/QuickActions'
import LandingFooter from './components/landing/LandingFooter'
import { useLiveStats, useSolPrice } from './hooks/useLiveStats'

export default function LandingPage() {
  const { wheel, platform, isLoading } = useLiveStats(30000)
  const { price: solPrice } = useSolPrice(60000)

  const isFlywheelActive = wheel?.flywheel?.isActive ?? false

  return (
    <div className="min-h-screen bg-[#050505]">
      {/* Gradient background effects */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Top gradient */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-cyan-500/[0.07] via-transparent to-transparent blur-3xl" />
        {/* Bottom gradient */}
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-gradient-radial from-violet-500/[0.05] via-transparent to-transparent blur-3xl" />
        {/* Grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
            backgroundSize: '64px 64px',
          }}
        />
      </div>

      {/* Header */}
      <LandingHeader isFlywheelActive={isFlywheelActive} />

      {/* Main content */}
      <main className="relative pt-24">
        {/* Hero Section */}
        <section className="relative px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
              {/* Left: Content */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="flex-1 text-center lg:text-left"
              >
                {/* Badge */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
                  </span>
                  <span className="text-xs font-medium text-neutral-400">
                    {platform?.tokens?.activeFlywheels || 0} Active Flywheels
                  </span>
                </motion.div>

                {/* Headline */}
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1]">
                  Autonomous{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-cyan-200">
                    Market Making
                  </span>
                </h1>

                {/* Subheadline */}
                <p className="text-lg sm:text-xl text-neutral-400 mb-8 max-w-xl mx-auto lg:mx-0">
                  Launch tokens on Bags.fm with automated trading. The flywheel
                  handles market making while you collect fees.
                </p>

                {/* CTAs */}
                <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
                  <a
                    href="https://t.me/ClaudeWheelBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-medium text-black bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all duration-200 hover:shadow-[0_0_30px_rgba(34,211,238,0.4)]"
                  >
                    Launch Token
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </a>
                  <a
                    href="https://bags.fm/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-medium text-white bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all duration-200"
                  >
                    Trade WHEEL
                  </a>
                </div>
              </motion.div>

              {/* Right: Spinning Logo */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="relative"
              >
                <SpinningLogo isActive={isFlywheelActive} size={320} />
              </motion.div>
            </div>
          </div>
        </section>

        {/* Live Stats Section */}
        <section className="relative px-4 sm:px-6 lg:px-8 py-16">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-10"
            >
              <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-2">
                Platform Statistics
              </h2>
              <p className="text-neutral-500">Real-time metrics updated every 30 seconds</p>
            </motion.div>

            <LiveStatsGrid
              activeFlywheels={platform?.tokens?.activeFlywheels || 0}
              totalUsers={platform?.users?.total || 0}
              totalVolume={platform?.volume?.totalSol || 0}
              tokensLaunched={platform?.tokens?.launched || 0}
              feesCollected={platform?.volume?.totalFeesCollected || 0}
              solPrice={solPrice}
              isLoading={isLoading}
            />
          </div>
        </section>

        {/* WHEEL Token Section */}
        {wheel && (
          <section className="relative px-4 sm:px-6 lg:px-8 py-16">
            <div className="max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="text-center mb-10"
              >
                <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-2">
                  WHEEL Token
                </h2>
                <p className="text-neutral-500">Platform token with automated market making</p>
              </motion.div>

              <WheelTokenCard
                tokenMint={wheel.token.mintAddress}
                symbol={wheel.token.symbol}
                devWallet={wheel.wallets.dev}
                opsWallet={wheel.wallets.ops}
                totalFees={wheel.feeStats.totalCollected}
                todayFees={wheel.feeStats.todayCollected}
                isActive={isFlywheelActive}
              />
            </div>
          </section>
        )}

        {/* How It Works Section */}
        <section className="relative px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-5xl mx-auto">
            <HowItWorks />
          </div>
        </section>

        {/* Quick Actions Section */}
        <section className="relative px-4 sm:px-6 lg:px-8 py-16">
          <div className="max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-center mb-10"
            >
              <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-2">
                Get Started
              </h2>
              <p className="text-neutral-500">Everything you need in one place</p>
            </motion.div>

            <QuickActions />
          </div>
        </section>

        {/* Footer */}
        <LandingFooter />
      </main>
    </div>
  )
}
