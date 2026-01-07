'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import bs58 from 'bs58'
import { useAuth } from '../providers/AuthProvider'
import { registerUserToken, fetchBagsTokenInfo, RegisterTokenParams } from '@/lib/api'

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING PAGE
// Multi-step flow for registering a new token
// ═══════════════════════════════════════════════════════════════════════════

type Step = 'welcome' | 'token' | 'dev-wallet' | 'ops-wallet' | 'review'

interface TokenData {
  tokenMintAddress: string
  tokenSymbol: string
  tokenName: string
  tokenImage: string
  tokenDecimals: number
  devWalletPrivateKey: string
  opsWalletPrivateKey: string
}

export default function OnboardingPage() {
  const router = useRouter()
  const { publicKey, signMessage, connected } = useWallet()
  const { user, login, isAuthenticated, refreshTokens } = useAuth()

  const [step, setStep] = useState<Step>('welcome')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tokenData, setTokenData] = useState<TokenData>({
    tokenMintAddress: '',
    tokenSymbol: '',
    tokenName: '',
    tokenImage: '',
    tokenDecimals: 9,
    devWalletPrivateKey: '',
    opsWalletPrivateKey: '',
  })

  // Fetch token info when mint address changes
  const fetchTokenInfo = async () => {
    if (!tokenData.tokenMintAddress || tokenData.tokenMintAddress.length < 32) return

    setIsLoading(true)
    try {
      const info = await fetchBagsTokenInfo(tokenData.tokenMintAddress)
      if (info) {
        setTokenData(prev => ({
          ...prev,
          tokenSymbol: info.tokenSymbol || prev.tokenSymbol,
          tokenName: info.tokenName || prev.tokenName,
          tokenImage: info.tokenImage || prev.tokenImage,
        }))
      }
    } catch (err) {
      console.error('Failed to fetch token info:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle form submission
  const handleSubmit = async () => {
    if (!publicKey || !signMessage) {
      setError('Wallet not connected')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      // Create message to sign
      const timestamp = Date.now()
      const message = `ClaudeWheel Token Registration

Action: register_token
Token: ${tokenData.tokenSymbol}
Timestamp: ${timestamp}

This signature authorizes the registration of your token for automated market making.`

      // Sign the message
      const messageBytes = new TextEncoder().encode(message)
      const signatureBytes = await signMessage(messageBytes)
      const signature = bs58.encode(signatureBytes)

      // Register the token
      const params: RegisterTokenParams = {
        tokenMintAddress: tokenData.tokenMintAddress,
        tokenSymbol: tokenData.tokenSymbol,
        tokenName: tokenData.tokenName || undefined,
        tokenImage: tokenData.tokenImage || undefined,
        tokenDecimals: tokenData.tokenDecimals,
        devWalletPrivateKey: tokenData.devWalletPrivateKey,
        opsWalletPrivateKey: tokenData.opsWalletPrivateKey,
      }

      await registerUserToken(
        publicKey.toString(),
        signature,
        message,
        params
      )

      // Refresh tokens and redirect to dashboard
      await refreshTokens()
      router.push('/dashboard')
    } catch (err: any) {
      console.error('Registration failed:', err)
      setError(err.message || 'Failed to register token')
    } finally {
      setIsLoading(false)
    }
  }

  // Steps navigation
  const nextStep = () => {
    const steps: Step[] = ['welcome', 'token', 'dev-wallet', 'ops-wallet', 'review']
    const currentIndex = steps.indexOf(step)
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1])
      setError(null)
    }
  }

  const prevStep = () => {
    const steps: Step[] = ['welcome', 'token', 'dev-wallet', 'ops-wallet', 'review']
    const currentIndex = steps.indexOf(step)
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1])
      setError(null)
    }
  }

  // Validate current step
  const canProceed = () => {
    switch (step) {
      case 'welcome':
        return isAuthenticated
      case 'token':
        return tokenData.tokenMintAddress.length >= 32 && tokenData.tokenSymbol.length > 0
      case 'dev-wallet':
        return tokenData.devWalletPrivateKey.length > 0
      case 'ops-wallet':
        return tokenData.opsWalletPrivateKey.length > 0
      default:
        return true
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
            <span>Step {['welcome', 'token', 'dev-wallet', 'ops-wallet', 'review'].indexOf(step) + 1} of 5</span>
            <span>{step.replace('-', ' ').toUpperCase()}</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-300"
              style={{ width: `${((['welcome', 'token', 'dev-wallet', 'ops-wallet', 'review'].indexOf(step) + 1) / 5) * 100}%` }}
            />
          </div>
        </div>

        {/* Card */}
        <div className="bg-gray-900/50 backdrop-blur-lg border border-gray-800 rounded-2xl p-8">
          {/* Welcome Step */}
          {step === 'welcome' && (
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white mb-4">
                Welcome to ClaudeWheel
              </h1>
              <p className="text-gray-400 mb-8">
                Automate fee claiming and market making for your Bags.fm token.
                Connect your wallet to get started.
              </p>

              <div className="space-y-4">
                <div className="flex justify-center">
                  <WalletMultiButton />
                </div>

                {connected && !isAuthenticated && (
                  <button
                    onClick={login}
                    className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-lg hover:from-cyan-400 hover:to-blue-500 transition-all"
                  >
                    Sign In to Continue
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Token Step */}
          {step === 'token' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">Token Information</h2>
              <p className="text-gray-400 mb-6">
                Enter your token's mint address. We'll fetch the details automatically.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Token Mint Address
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tokenData.tokenMintAddress}
                      onChange={(e) => setTokenData(prev => ({ ...prev, tokenMintAddress: e.target.value }))}
                      placeholder="Enter token mint address..."
                      className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                    />
                    <button
                      onClick={fetchTokenInfo}
                      disabled={isLoading || tokenData.tokenMintAddress.length < 32}
                      className="px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-colors"
                    >
                      {isLoading ? '...' : 'Fetch'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Token Symbol
                    </label>
                    <input
                      type="text"
                      value={tokenData.tokenSymbol}
                      onChange={(e) => setTokenData(prev => ({ ...prev, tokenSymbol: e.target.value }))}
                      placeholder="e.g., WHEEL"
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Decimals
                    </label>
                    <input
                      type="number"
                      value={tokenData.tokenDecimals}
                      onChange={(e) => setTokenData(prev => ({ ...prev, tokenDecimals: parseInt(e.target.value) || 9 }))}
                      min={0}
                      max={18}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {tokenData.tokenName && (
                  <div className="p-4 bg-gray-800/50 rounded-lg flex items-center gap-4">
                    {tokenData.tokenImage && (
                      <img src={tokenData.tokenImage} alt={tokenData.tokenSymbol} className="w-12 h-12 rounded-full" />
                    )}
                    <div>
                      <p className="text-white font-medium">{tokenData.tokenName}</p>
                      <p className="text-gray-400 text-sm">${tokenData.tokenSymbol}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dev Wallet Step */}
          {step === 'dev-wallet' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">Dev Wallet</h2>
              <p className="text-gray-400 mb-6">
                Enter your dev wallet private key. This is required for automated fee claiming.
              </p>

              <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4 mb-6">
                <div className="flex gap-3">
                  <div className="text-yellow-500 text-xl">⚠️</div>
                  <div className="text-sm text-yellow-300">
                    <p className="font-medium mb-1">Security Notice</p>
                    <p className="text-yellow-300/80">
                      Your private key will be encrypted using AES-256-GCM encryption before storage.
                      Only ClaudeWheel's backend can decrypt it for signing claim transactions.
                      Never share your private key with anyone else.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Dev Wallet Private Key (Base58)
                </label>
                <textarea
                  value={tokenData.devWalletPrivateKey}
                  onChange={(e) => setTokenData(prev => ({ ...prev, devWalletPrivateKey: e.target.value.trim() }))}
                  placeholder="Enter your Base58 encoded private key..."
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 font-mono text-sm"
                />
                <p className="text-sm text-gray-500 mt-2">
                  This is the wallet that receives fees from Bags.fm. We'll claim fees and transfer them to your ops wallet.
                </p>
              </div>
            </div>
          )}

          {/* Ops Wallet Step */}
          {step === 'ops-wallet' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">Operations Wallet</h2>
              <p className="text-gray-400 mb-6">
                Enter your operations wallet private key. This wallet will execute automated market making trades.
              </p>

              <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4 mb-6">
                <div className="flex gap-3">
                  <div className="text-yellow-500 text-xl">⚠️</div>
                  <div className="text-sm text-yellow-300">
                    <p className="font-medium mb-1">Security Notice</p>
                    <p className="text-yellow-300/80">
                      Your private key will be encrypted using AES-256-GCM encryption before storage.
                      This wallet will be used for automated buy/sell trades. Use a dedicated trading wallet,
                      not your main wallet with significant holdings.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Ops Wallet Private Key (Base58)
                </label>
                <textarea
                  value={tokenData.opsWalletPrivateKey}
                  onChange={(e) => setTokenData(prev => ({ ...prev, opsWalletPrivateKey: e.target.value.trim() }))}
                  placeholder="Enter your Base58 encoded private key..."
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 font-mono text-sm"
                />
                <p className="text-sm text-gray-500 mt-2">
                  This wallet executes automated buy/sell operations. Fund it with SOL for trading and transaction fees.
                </p>
              </div>

              <div className="mt-6 p-4 bg-gray-800/50 rounded-lg">
                <h3 className="text-white font-medium mb-2">Recommended Setup</h3>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• Create a NEW dedicated wallet for ops (not your main wallet)</li>
                  <li>• Fund it with SOL for trading and transaction fees</li>
                  <li>• Only keep funds you're willing to trade with</li>
                  <li>• Never use a wallet with significant holdings</li>
                </ul>
              </div>
            </div>
          )}

          {/* Review Step */}
          {step === 'review' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-4">Review & Confirm</h2>
              <p className="text-gray-400 mb-6">
                Please review your configuration before proceeding.
              </p>

              <div className="space-y-4">
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h3 className="text-sm text-gray-400 mb-2">Token</h3>
                  <div className="flex items-center gap-3">
                    {tokenData.tokenImage && (
                      <img src={tokenData.tokenImage} alt={tokenData.tokenSymbol} className="w-10 h-10 rounded-full" />
                    )}
                    <div>
                      <p className="text-white font-medium">{tokenData.tokenName || tokenData.tokenSymbol}</p>
                      <p className="text-gray-400 text-sm font-mono">{tokenData.tokenMintAddress.slice(0, 16)}...</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h3 className="text-sm text-gray-400 mb-2">Dev Wallet</h3>
                  <p className="text-white font-mono text-sm">
                    {tokenData.devWalletPrivateKey.slice(0, 8)}...{tokenData.devWalletPrivateKey.slice(-8)}
                  </p>
                </div>

                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h3 className="text-sm text-gray-400 mb-2">Ops Wallet (Trading)</h3>
                  <p className="text-white font-mono text-sm">
                    {tokenData.opsWalletPrivateKey.slice(0, 8)}...{tokenData.opsWalletPrivateKey.slice(-8)}
                  </p>
                </div>
              </div>

              <div className="mt-6 p-4 bg-cyan-900/30 border border-cyan-700/50 rounded-lg">
                <p className="text-sm text-cyan-300">
                  By proceeding, you authorize ClaudeWheel to:
                </p>
                <ul className="text-sm text-cyan-300/80 mt-2 space-y-1">
                  <li>• Claim fees from your dev wallet periodically</li>
                  <li>• Transfer claimed fees to your ops wallet</li>
                  <li>• Execute market making trades (when enabled)</li>
                </ul>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mt-6 p-4 bg-red-900/30 border border-red-700/50 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8">
            {step !== 'welcome' && (
              <button
                onClick={prevStep}
                className="px-6 py-3 text-gray-400 hover:text-white transition-colors"
              >
                Back
              </button>
            )}

            {step === 'welcome' && <div />}

            {step !== 'review' ? (
              <button
                onClick={nextStep}
                disabled={!canProceed()}
                className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-lg hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Continue
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-400 hover:to-emerald-500 disabled:opacity-50 transition-all"
              >
                {isLoading ? 'Registering...' : 'Register Token'}
              </button>
            )}
          </div>
        </div>

        {/* Skip link */}
        <div className="text-center mt-6">
          <a href="/dashboard" className="text-gray-500 hover:text-gray-400 text-sm">
            Already registered? Go to dashboard →
          </a>
        </div>
      </div>
    </div>
  )
}
