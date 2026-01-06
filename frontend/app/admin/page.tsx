'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'

// Dev wallet address - only this wallet can access admin
const DEV_WALLET_ADDRESS = process.env.NEXT_PUBLIC_DEV_WALLET_ADDRESS || ''

interface Config {
  token_mint_address: string
  token_symbol: string
  token_decimals: number
  market_making_enabled: boolean
}

export default function AdminPage() {
  const { publicKey, connected } = useWallet()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [config, setConfig] = useState<Config>({
    token_mint_address: '',
    token_symbol: 'CLAUDE',
    token_decimals: 6,
    market_making_enabled: false,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Check authorization
  useEffect(() => {
    if (connected && publicKey) {
      const walletAddress = publicKey.toString()
      const authorized = walletAddress === DEV_WALLET_ADDRESS
      setIsAuthorized(authorized)

      if (authorized) {
        loadConfig()
      }
    } else {
      setIsAuthorized(false)
    }
  }, [connected, publicKey])

  // Load config from Supabase
  async function loadConfig() {
    try {
      const { data, error } = await supabase
        .from('config')
        .select('*')
        .eq('id', 'main')
        .single()

      if (data) {
        setConfig({
          token_mint_address: data.token_mint_address || '',
          token_symbol: data.token_symbol || 'CLAUDE',
          token_decimals: data.token_decimals || 6,
          market_making_enabled: data.market_making_enabled || false,
        })
      }
    } catch (error) {
      console.log('Config not found, using defaults')
    }
  }

  // Save config to Supabase
  async function saveConfig() {
    if (!isAuthorized) return

    setIsSaving(true)
    setMessage(null)

    try {
      const { error } = await supabase
        .from('config')
        .upsert({
          id: 'main',
          ...config,
          updated_at: new Date().toISOString(),
        })

      if (error) throw error

      setMessage({ type: 'success', text: 'Configuration saved successfully!' })
    } catch (error: any) {
      console.error('Failed to save config:', error)
      setMessage({ type: 'error', text: error.message || 'Failed to save configuration' })
    } finally {
      setIsSaving(false)
    }
  }

  // Not connected state
  if (!connected) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-glow bg-bg-card p-8 max-w-md w-full text-center"
        >
          <div className="text-accent-primary text-4xl mb-4">🔐</div>
          <h1 className="font-display text-2xl font-bold text-text-primary mb-2">
            Admin Panel
          </h1>
          <p className="text-text-secondary mb-6 font-mono text-sm">
            Connect your Dev Wallet to access the admin panel
          </p>
          <div className="flex justify-center">
            <WalletMultiButton className="!bg-accent-primary hover:!bg-accent-secondary !text-bg-void !font-mono !rounded-lg" />
          </div>
        </motion.div>
      </div>
    )
  }

  // Connected but not authorized
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-void flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-glow bg-bg-card p-8 max-w-md w-full text-center"
        >
          <div className="text-error text-4xl mb-4">⛔</div>
          <h1 className="font-display text-2xl font-bold text-text-primary mb-2">
            Access Denied
          </h1>
          <p className="text-text-secondary mb-4 font-mono text-sm">
            Only the Dev Wallet can access this panel.
          </p>
          <p className="text-text-muted font-mono text-xs mb-6 break-all">
            Connected: {publicKey?.toString()}
          </p>
          <div className="flex justify-center">
            <WalletMultiButton className="!bg-bg-secondary hover:!bg-bg-card-hover !text-text-primary !font-mono !rounded-lg !border !border-border-subtle" />
          </div>
        </motion.div>
      </div>
    )
  }

  // Authorized - show admin panel
  return (
    <div className="min-h-screen bg-void p-4 md:p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2">
              <span className="text-accent-primary">◈</span>
              Admin Panel
            </h1>
            <p className="text-text-muted font-mono text-sm mt-1">
              Claude Flywheel Configuration
            </p>
          </div>
          <WalletMultiButton className="!bg-success/20 !text-success !font-mono !rounded-lg !border !border-success/30 !text-sm" />
        </div>

        {/* Authorization badge */}
        <div className="mt-4 flex items-center gap-2">
          <span className="badge badge-success">AUTHORIZED</span>
          <span className="text-text-muted font-mono text-xs">
            {publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-8)}
          </span>
        </div>
      </motion.div>

      {/* Config Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="max-w-2xl mx-auto"
      >
        <div className="card-glow bg-bg-card p-6">
          <h2 className="font-display text-lg font-semibold text-text-primary mb-6 flex items-center gap-2">
            <span className="text-accent-primary">◎</span>
            Token Configuration
          </h2>

          {/* Token Mint Address */}
          <div className="mb-6">
            <label className="block text-text-secondary font-mono text-sm mb-2">
              Token Mint Address (Contract Address)
            </label>
            <input
              type="text"
              value={config.token_mint_address}
              onChange={(e) => setConfig({ ...config, token_mint_address: e.target.value })}
              placeholder="Enter your token mint address after PumpFun launch"
              className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors"
            />
            <p className="text-text-muted font-mono text-xs mt-2">
              Get this from PumpFun after launching your token
            </p>
          </div>

          {/* Token Symbol */}
          <div className="mb-6">
            <label className="block text-text-secondary font-mono text-sm mb-2">
              Token Symbol
            </label>
            <input
              type="text"
              value={config.token_symbol}
              onChange={(e) => setConfig({ ...config, token_symbol: e.target.value.toUpperCase() })}
              placeholder="CLAUDE"
              maxLength={10}
              className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors"
            />
          </div>

          {/* Token Decimals */}
          <div className="mb-6">
            <label className="block text-text-secondary font-mono text-sm mb-2">
              Token Decimals
            </label>
            <input
              type="number"
              value={config.token_decimals}
              onChange={(e) => setConfig({ ...config, token_decimals: parseInt(e.target.value) || 6 })}
              min={0}
              max={18}
              className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
            />
            <p className="text-text-muted font-mono text-xs mt-2">
              Usually 6 for PumpFun tokens
            </p>
          </div>

          {/* Market Making Toggle */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-text-secondary font-mono text-sm">
                  Market Making
                </label>
                <p className="text-text-muted font-mono text-xs mt-1">
                  Enable automated buy/sell operations
                </p>
              </div>
              <button
                onClick={() => setConfig({ ...config, market_making_enabled: !config.market_making_enabled })}
                className={`relative w-14 h-7 rounded-full transition-colors ${
                  config.market_making_enabled ? 'bg-success' : 'bg-bg-secondary'
                }`}
              >
                <span
                  className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                    config.market_making_enabled ? 'left-8' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Message */}
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mb-6 p-4 rounded-lg font-mono text-sm ${
                message.type === 'success'
                  ? 'bg-success/20 text-success border border-success/30'
                  : 'bg-error/20 text-error border border-error/30'
              }`}
            >
              {message.text}
            </motion.div>
          )}

          {/* Save Button */}
          <button
            onClick={saveConfig}
            disabled={isSaving}
            className="w-full btn btn-primary py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </span>
            ) : (
              'Save Configuration'
            )}
          </button>
        </div>

        {/* Back to Dashboard */}
        <div className="mt-6 text-center">
          <a
            href="/"
            className="text-text-muted hover:text-accent-primary font-mono text-sm transition-colors"
          >
            ← Back to Dashboard
          </a>
        </div>
      </motion.div>
    </div>
  )
}
