'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useAuth, AuthGuard } from '../providers/AuthProvider'
import { UserToken } from '@/lib/api'

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD PAGE
// Main dashboard showing all user's registered tokens
// ═══════════════════════════════════════════════════════════════════════════

function DashboardContent() {
  const router = useRouter()
  const { user, tokens, refreshTokens, logout } = useAuth()
  const { publicKey } = useWallet()

  useEffect(() => {
    refreshTokens()
  }, [refreshTokens])

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-xl font-bold text-white">
                ClaudeWheel
              </Link>
              <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">
                Dashboard
              </span>
            </div>

            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">
                {publicKey?.toString().slice(0, 4)}...{publicKey?.toString().slice(-4)}
              </span>
              <WalletMultiButton />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard
            title="Registered Tokens"
            value={tokens.length.toString()}
            subtitle="Active tokens"
            color="cyan"
          />
          <StatCard
            title="Active Flywheels"
            value={tokens.filter(t => t.config?.flywheel_active).length.toString()}
            subtitle="Running automation"
            color="green"
          />
          <StatCard
            title="Auto-Claim Enabled"
            value={tokens.filter(t => t.config?.auto_claim_enabled).length.toString()}
            subtitle="Fee claiming active"
            color="purple"
          />
        </div>

        {/* Tokens Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Your Tokens</h2>
            <Link
              href="/onboarding"
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all flex items-center gap-2"
            >
              <span>+</span>
              Add Token
            </Link>
          </div>

          {tokens.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tokens.map((token) => (
                <TokenCard key={token.id} token={token} />
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}

// Stat Card Component
function StatCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string
  value: string
  subtitle: string
  color: 'cyan' | 'green' | 'purple'
}) {
  const colorClasses = {
    cyan: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/30',
    green: 'from-green-500/20 to-emerald-500/20 border-green-500/30',
    purple: 'from-purple-500/20 to-pink-500/20 border-purple-500/30',
  }

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-6`}>
      <p className="text-sm text-gray-400 mb-1">{title}</p>
      <p className="text-4xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
  )
}

// Token Card Component
function TokenCard({ token }: { token: UserToken }) {
  const isActive = token.config?.flywheel_active

  return (
    <Link href={`/dashboard/${token.id}`}>
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 hover:border-gray-700 hover:bg-gray-900/70 transition-all cursor-pointer">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {token.token_image ? (
              <img
                src={token.token_image}
                alt={token.token_symbol}
                className="w-10 h-10 rounded-full"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold">
                {token.token_symbol.charAt(0)}
              </div>
            )}
            <div>
              <h3 className="text-white font-medium">{token.token_name || token.token_symbol}</h3>
              <p className="text-gray-400 text-sm">${token.token_symbol}</p>
            </div>
          </div>

          <span
            className={`px-2 py-1 text-xs rounded-full ${
              isActive
                ? 'bg-green-500/20 text-green-400'
                : 'bg-gray-700 text-gray-400'
            }`}
          >
            {isActive ? 'Active' : 'Paused'}
          </span>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Algorithm</span>
            <span className="text-white capitalize">{token.config?.algorithm_mode || 'simple'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Auto Claim</span>
            <span className={token.config?.auto_claim_enabled ? 'text-green-400' : 'text-gray-500'}>
              {token.config?.auto_claim_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Cycle</span>
            <span className="text-white">
              {token.flywheelState?.cycle_phase === 'buy' ? 'Buy Phase' : 'Sell Phase'}
              {' '}({token.flywheelState?.buy_count || 0}/{token.flywheelState?.sell_count || 0})
            </span>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 font-mono truncate">
            {token.token_mint_address}
          </p>
        </div>
      </div>
    </Link>
  )
}

// Empty State Component
function EmptyState() {
  return (
    <div className="text-center py-16 bg-gray-900/30 border border-gray-800 border-dashed rounded-xl">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
        <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
      </div>
      <h3 className="text-white font-medium mb-2">No tokens registered</h3>
      <p className="text-gray-400 mb-6 max-w-sm mx-auto">
        Get started by registering your first Bags.fm token for automated market making.
      </p>
      <Link
        href="/onboarding"
        className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all"
      >
        Register Your First Token
      </Link>
    </div>
  )
}

// Wrap with AuthGuard
export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  )
}
