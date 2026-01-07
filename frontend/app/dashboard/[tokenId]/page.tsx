'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import bs58 from 'bs58'
import { useAuth, AuthGuard } from '../../providers/AuthProvider'
import {
  UserToken,
  UserTokenConfig,
  getUserToken,
  getConfigNonce,
  updateUserTokenConfig,
  fetchUserTokenSellNonce,
  executeUserTokenSell,
} from '@/lib/api'
import { ActivityTerminal } from '../../components/ActivityTerminal'

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT PAGE
// Detailed view and configuration for a single token
// ═══════════════════════════════════════════════════════════════════════════

function TokenManagementContent() {
  const params = useParams()
  const router = useRouter()
  const tokenId = params.tokenId as string

  const { publicKey, signMessage } = useWallet()
  const { refreshTokens } = useAuth()

  const [token, setToken] = useState<UserToken | null>(null)
  const [config, setConfig] = useState<Partial<UserTokenConfig>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSelling, setIsSelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Fetch token data
  const loadToken = useCallback(async () => {
    if (!publicKey) return

    setIsLoading(true)
    try {
      const tokenData = await getUserToken(publicKey.toString(), tokenId)
      if (tokenData) {
        setToken(tokenData)
        if (tokenData.config) {
          setConfig(tokenData.config)
        }
      } else {
        router.push('/dashboard')
      }
    } catch (err) {
      console.error('Failed to load token:', err)
      setError('Failed to load token')
    } finally {
      setIsLoading(false)
    }
  }, [publicKey, tokenId, router])

  useEffect(() => {
    loadToken()
  }, [loadToken])

  // Save config changes
  const saveConfig = async () => {
    if (!publicKey || !signMessage || !token) return

    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Get nonce with config hash
      const nonceData = await getConfigNonce(tokenId, config)
      if (!nonceData) {
        throw new Error('Failed to get config nonce')
      }

      // Sign the message
      const messageBytes = new TextEncoder().encode(nonceData.message)
      const signatureBytes = await signMessage(messageBytes)
      const signature = bs58.encode(signatureBytes)

      // Update config
      await updateUserTokenConfig(
        publicKey.toString(),
        signature,
        nonceData.message,
        tokenId,
        config
      )

      setSuccess('Configuration saved successfully!')
      await loadToken()
      await refreshTokens()
    } catch (err: any) {
      console.error('Failed to save config:', err)
      setError(err.message || 'Failed to save configuration')
    } finally {
      setIsSaving(false)
    }
  }

  // Toggle flywheel - auto-saves for immediate effect
  const toggleFlywheel = async () => {
    if (!publicKey || !signMessage || !token) return

    const newState = !config.flywheel_active
    setConfig(prev => ({ ...prev, flywheel_active: newState }))

    // Auto-save the flywheel toggle for immediate effect
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const configUpdate = { flywheel_active: newState }

      // Get nonce with config hash
      const nonceData = await getConfigNonce(tokenId, configUpdate)
      if (!nonceData) {
        throw new Error('Failed to get config nonce')
      }

      // Sign the message
      const messageBytes = new TextEncoder().encode(nonceData.message)
      const signatureBytes = await signMessage(messageBytes)
      const signature = bs58.encode(signatureBytes)

      // Update config
      await updateUserTokenConfig(
        publicKey.toString(),
        signature,
        nonceData.message,
        tokenId,
        configUpdate
      )

      setSuccess(`Flywheel ${newState ? 'started' : 'paused'} successfully!`)
      await loadToken()
      await refreshTokens()
    } catch (err: any) {
      // Revert the toggle on error
      setConfig(prev => ({ ...prev, flywheel_active: !newState }))
      console.error('Failed to toggle flywheel:', err)
      setError(err.message || 'Failed to toggle flywheel')
    } finally {
      setIsSaving(false)
    }
  }

  // Manual sell handler
  const handleManualSell = async (percentage: 25 | 50 | 100) => {
    if (!publicKey || !signMessage || !token) return

    setIsSelling(true)
    setError(null)
    setSuccess(null)

    try {
      // Get nonce for sell
      const nonceData = await fetchUserTokenSellNonce(publicKey.toString(), tokenId, percentage)
      if (!nonceData) {
        throw new Error('Failed to get sell nonce')
      }

      // Sign the message
      const messageBytes = new TextEncoder().encode(nonceData.message)
      const signatureBytes = await signMessage(messageBytes)
      const signature = bs58.encode(signatureBytes)

      // Execute sell
      const result = await executeUserTokenSell(
        publicKey.toString(),
        tokenId,
        nonceData.message,
        signature,
        percentage
      )

      if (!result.success) {
        throw new Error(result.error || 'Sell failed')
      }

      setSuccess(`Sold ${percentage}% of tokens (${result.amountSold?.toFixed(0) || ''} tokens)`)
      await loadToken()
    } catch (err: any) {
      console.error('Failed to execute sell:', err)
      setError(err.message || 'Failed to execute sell')
    } finally {
      setIsSelling(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading token...</p>
        </div>
      </div>
    )
  }

  if (!token) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-gray-400 hover:text-white">
                ← Back
              </Link>
              <div className="flex items-center gap-3">
                {token.token_image ? (
                  <img src={token.token_image} alt={token.token_symbol} className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
                    {token.token_symbol.charAt(0)}
                  </div>
                )}
                <span className="text-white font-medium">{token.token_name || token.token_symbol}</span>
              </div>
            </div>

            <WalletMultiButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Status Card */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">
                {token.token_name || token.token_symbol}
              </h1>
              <p className="text-gray-400 font-mono text-sm">{token.token_mint_address}</p>
            </div>

            <button
              onClick={toggleFlywheel}
              className={`px-6 py-3 rounded-lg font-medium transition-all ${
                config.flywheel_active
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
              }`}
            >
              {config.flywheel_active ? 'PAUSE' : 'START'} FLYWHEEL
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <p className="text-sm text-gray-400 mb-1">Phase</p>
              <p className="text-lg text-white font-medium capitalize">
                {token.flywheelState?.cycle_phase || 'Buy'}
              </p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <p className="text-sm text-gray-400 mb-1">Buy Count</p>
              <p className="text-lg text-white font-medium">{token.flywheelState?.buy_count || 0}</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <p className="text-sm text-gray-400 mb-1">Sell Count</p>
              <p className="text-lg text-white font-medium">{token.flywheelState?.sell_count || 0}</p>
            </div>
            <div className="p-4 bg-gray-800/50 rounded-lg">
              <p className="text-sm text-gray-400 mb-1">Status</p>
              <p className={`text-lg font-medium ${config.flywheel_active ? 'text-green-400' : 'text-gray-500'}`}>
                {config.flywheel_active ? 'Active' : 'Paused'}
              </p>
            </div>
          </div>
        </div>

        {/* Configuration Sections */}
        <div className="space-y-6">
          {/* Automation Toggles */}
          <ConfigSection title="Automation">
            <div className="space-y-4">
              <ToggleRow
                label="Market Making"
                description="Enable buy/sell operations"
                checked={config.market_making_enabled || false}
                onChange={(v) => setConfig(prev => ({ ...prev, market_making_enabled: v }))}
              />
              <ToggleRow
                label="Auto Claim"
                description="Automatically claim fees from Bags.fm"
                checked={config.auto_claim_enabled || false}
                onChange={(v) => setConfig(prev => ({ ...prev, auto_claim_enabled: v }))}
              />
              <ToggleRow
                label="Use TWAP"
                description="Time-weighted average pricing for large orders"
                checked={config.use_twap || false}
                onChange={(v) => setConfig(prev => ({ ...prev, use_twap: v }))}
              />
            </div>
          </ConfigSection>

          {/* Algorithm Settings */}
          <ConfigSection title="Algorithm">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {['simple', 'smart', 'rebalance'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setConfig(prev => ({ ...prev, algorithm_mode: mode as any }))}
                      className={`px-4 py-3 rounded-lg capitalize transition-all ${
                        config.algorithm_mode === mode
                          ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {config.algorithm_mode === 'simple' && 'Cycles through 5 buys then 5 sells'}
                  {config.algorithm_mode === 'smart' && 'Uses RSI and Bollinger Bands for timing'}
                  {config.algorithm_mode === 'rebalance' && 'Maintains target portfolio allocation'}
                </p>
              </div>

              {config.algorithm_mode === 'rebalance' && (
                <div className="grid grid-cols-2 gap-4">
                  <NumberInput
                    label="Target SOL %"
                    value={config.target_sol_allocation || 30}
                    onChange={(v) => setConfig(prev => ({ ...prev, target_sol_allocation: v }))}
                    min={0}
                    max={100}
                  />
                  <NumberInput
                    label="Target Token %"
                    value={config.target_token_allocation || 70}
                    onChange={(v) => setConfig(prev => ({ ...prev, target_token_allocation: v }))}
                    min={0}
                    max={100}
                  />
                </div>
              )}
            </div>
          </ConfigSection>

          {/* Trading Settings */}
          <ConfigSection title="Trading Parameters">
            <div className="grid grid-cols-2 gap-4">
              <NumberInput
                label="Min Buy (SOL)"
                value={config.min_buy_amount_sol || 0.01}
                onChange={(v) => setConfig(prev => ({ ...prev, min_buy_amount_sol: v }))}
                min={0.001}
                step={0.01}
              />
              <NumberInput
                label="Max Buy (SOL)"
                value={config.max_buy_amount_sol || 0.1}
                onChange={(v) => setConfig(prev => ({ ...prev, max_buy_amount_sol: v }))}
                min={0.01}
                step={0.01}
              />
              <NumberInput
                label="Slippage (bps)"
                value={config.slippage_bps || 300}
                onChange={(v) => setConfig(prev => ({ ...prev, slippage_bps: v }))}
                min={0}
                max={5000}
              />
              <NumberInput
                label="Buy Interval (min)"
                value={config.buy_interval_minutes || 5}
                onChange={(v) => setConfig(prev => ({ ...prev, buy_interval_minutes: v }))}
                min={1}
              />
            </div>
          </ConfigSection>

          {/* Wallet Info */}
          <ConfigSection title="Wallets">
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Dev Wallet</label>
                <p className="font-mono text-sm text-white bg-gray-800 px-4 py-3 rounded-lg">
                  {token.dev_wallet_address}
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Ops Wallet</label>
                <p className="font-mono text-sm text-white bg-gray-800 px-4 py-3 rounded-lg">
                  {token.ops_wallet_address}
                </p>
              </div>
            </div>
          </ConfigSection>

          {/* Manual Sell Section */}
          <ConfigSection title="Manual Sell">
            <p className="text-gray-400 text-sm mb-4">
              Instantly sell a percentage of your token holdings from the ops wallet.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleManualSell(25)}
                disabled={isSelling}
                className="px-6 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg font-medium transition-all disabled:opacity-50"
              >
                {isSelling ? '...' : 'SELL 25%'}
              </button>
              <button
                onClick={() => handleManualSell(50)}
                disabled={isSelling}
                className="px-6 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg font-medium transition-all disabled:opacity-50"
              >
                {isSelling ? '...' : 'SELL 50%'}
              </button>
              <button
                onClick={() => handleManualSell(100)}
                disabled={isSelling}
                className="px-6 py-2 bg-red-600/30 text-red-400 hover:bg-red-600/40 rounded-lg font-medium transition-all disabled:opacity-50"
              >
                {isSelling ? '...' : 'SELL 100%'}
              </button>
            </div>
          </ConfigSection>

          {/* Activity Terminal */}
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-white mb-4">Activity Logs</h2>
            <ActivityTerminal
              walletAddress={publicKey?.toString() || ''}
              tokenId={tokenId}
              tokenSymbol={token.token_symbol}
              autoRefresh={true}
              refreshInterval={15000}
            />
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {success && (
          <div className="mt-6 p-4 bg-green-900/30 border border-green-700/50 rounded-lg">
            <p className="text-green-400">{success}</p>
          </div>
        )}

        {/* Save Button */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={saveConfig}
            disabled={isSaving}
            className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 transition-all"
          >
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </main>
    </div>
  )
}

// Config Section Component
function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
      {children}
    </div>
  )
}

// Toggle Row Component
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-white font-medium">{label}</p>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 rounded-full transition-colors ${
          checked ? 'bg-cyan-500' : 'bg-gray-700'
        }`}
      >
        <div
          className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

// Number Input Component
function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-2">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
      />
    </div>
  )
}

// Wrap with AuthGuard
export default function TokenManagementPage() {
  return (
    <AuthGuard>
      <TokenManagementContent />
    </AuthGuard>
  )
}
