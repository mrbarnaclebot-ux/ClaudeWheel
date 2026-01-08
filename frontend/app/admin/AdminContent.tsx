'use client'

import { useState, useEffect, useCallback, ClipboardEvent } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { fetchTokenMetadata, isValidSolanaAddress } from '@/lib/token-metadata'
import {
  fetchAdminNonce,
  updateConfigWithSignature,
  fetchSystemStatus,
  fetchLogs,
  fetchBagsDashboard,
  fetchManualSellNonce,
  executeManualSell,
  fetchAdminAuthNonce,
  fetchAdminTokens,
  fetchPlatformStats,
  verifyAdminToken,
  suspendAdminToken,
  unsuspendAdminToken,
  updateAdminTokenLimits,
  bulkSuspendAllTokens,
  bulkUnsuspendAllTokens,
  fetchPlatformSettings,
  updatePlatformSettings,
  triggerFlywheelCycle,
  triggerFastClaim,
  triggerBalanceUpdate,
  fetchOrphanedLaunches,
  migrateOrphanedLaunches,
  previewTokenRefund,
  stopFlywheelAndRefund,
  type SystemStatus,
  type LogEntry,
  type BagsDashboardData,
  type AdminToken,
  type PlatformStats,
  type PlatformSettings,
  type OrphanedLaunch,
  type RefundPreview,
  type StopAndRefundResult,
} from '@/lib/api'
import bs58 from 'bs58'

// Dev wallet address - only this wallet can access admin
const DEV_WALLET_ADDRESS = process.env.NEXT_PUBLIC_DEV_WALLET_ADDRESS || ''

interface Config {
  token_mint_address: string
  token_symbol: string
  token_decimals: number
  flywheel_active: boolean
  market_making_enabled: boolean
  fee_collection_enabled: boolean
  ops_wallet_address: string
  // Fee collection settings
  fee_threshold_sol: number
  fee_percentage: number
  // Market making settings
  min_buy_amount_sol: number
  max_buy_amount_sol: number
  buy_interval_minutes: number
  slippage_bps: number
  // Advanced algorithm settings
  algorithm_mode: 'simple' | 'smart' | 'rebalance'
  target_sol_allocation: number
  target_token_allocation: number
  rebalance_threshold: number
  use_twap: boolean
  twap_threshold_usd: number
}

const defaultConfig: Config = {
  token_mint_address: '',
  token_symbol: 'CLAUDE',
  token_decimals: 6,
  flywheel_active: false,
  market_making_enabled: false,
  fee_collection_enabled: true,
  ops_wallet_address: '',
  fee_threshold_sol: 0.1,
  fee_percentage: 100,
  min_buy_amount_sol: 0.01,
  max_buy_amount_sol: 0.1,
  buy_interval_minutes: 60,
  slippage_bps: 500,
  algorithm_mode: 'simple',
  target_sol_allocation: 30,
  target_token_allocation: 70,
  rebalance_threshold: 10,
  use_twap: true,
  twap_threshold_usd: 50,
}

export default function AdminContent() {
  const { publicKey, connected, signMessage } = useWallet()
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [config, setConfig] = useState<Config>(defaultConfig)
  const [isSaving, setIsSaving] = useState(false)
  const [isFetchingMetadata, setIsFetchingMetadata] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [showLogs, setShowLogs] = useState(false)
  const [bagsData, setBagsData] = useState<BagsDashboardData | null>(null)
  const [isLoadingBags, setIsLoadingBags] = useState(false)
  const [showBagsPanel, setShowBagsPanel] = useState(true)
  const [isSelling, setIsSelling] = useState(false)
  const [sellMessage, setSellMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Token management state
  const [showTokenManagement, setShowTokenManagement] = useState(true)
  const [adminTokens, setAdminTokens] = useState<AdminToken[]>([])
  const [platformStats, setPlatformStats] = useState<PlatformStats | null>(null)
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [adminAuthSignature, setAdminAuthSignature] = useState<string | null>(null)
  const [adminAuthMessage, setAdminAuthMessage] = useState<string | null>(null)
  const [tokenFilter, setTokenFilter] = useState<'all' | 'active' | 'suspended'>('all')
  const [suspendModal, setSuspendModal] = useState<{ tokenId: string; symbol: string } | null>(null)
  const [suspendReason, setSuspendReason] = useState('')

  // Platform settings state
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null)
  const [editedSettings, setEditedSettings] = useState<Partial<PlatformSettings>>({})
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Bulk actions state
  const [bulkSuspendModal, setBulkSuspendModal] = useState(false)
  const [bulkSuspendReason, setBulkSuspendReason] = useState('')
  const [isBulkSuspending, setIsBulkSuspending] = useState(false)
  const [isBulkUnsuspending, setIsBulkUnsuspending] = useState(false)

  // Job triggers state
  const [isTriggering, setIsTriggering] = useState<string | null>(null)
  const [jobMessage, setJobMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Orphaned launches state
  const [orphanedLaunches, setOrphanedLaunches] = useState<OrphanedLaunch[]>([])
  const [isMigrating, setIsMigrating] = useState(false)
  const [showOrphanedLaunches, setShowOrphanedLaunches] = useState(false)

  // Stop and refund state
  const [refundModal, setRefundModal] = useState<{ tokenId: string; symbol: string } | null>(null)
  const [refundPreview, setRefundPreview] = useState<RefundPreview | null>(null)
  const [isLoadingRefundPreview, setIsLoadingRefundPreview] = useState(false)
  const [refundAddress, setRefundAddress] = useState('')
  const [isRefunding, setIsRefunding] = useState(false)
  const [refundResult, setRefundResult] = useState<StopAndRefundResult | null>(null)

  // Load system status when authorized
  const loadSystemStatus = useCallback(async () => {
    setIsLoadingStatus(true)
    try {
      const [status, recentLogs] = await Promise.all([
        fetchSystemStatus(),
        fetchLogs(100)
      ])
      if (status) setSystemStatus(status)
      if (recentLogs) setLogs(recentLogs)
    } catch (error) {
      console.error('Failed to load system status:', error)
    } finally {
      setIsLoadingStatus(false)
    }
  }, [])

  // Load Bags.fm data
  const loadBagsData = useCallback(async (tokenMint?: string, wallet?: string) => {
    setIsLoadingBags(true)
    try {
      const data = await fetchBagsDashboard(tokenMint, wallet)
      if (data) setBagsData(data)
    } catch (error) {
      console.error('Failed to load Bags.fm data:', error)
    } finally {
      setIsLoadingBags(false)
    }
  }, [])

  // Fetch token metadata when address changes
  const handleFetchMetadata = useCallback(async (address: string) => {
    if (!address || !isValidSolanaAddress(address)) {
      return
    }

    setIsFetchingMetadata(true)
    setMessage(null)

    try {
      const metadata = await fetchTokenMetadata(address)
      if (metadata) {
        setConfig(prev => ({
          ...prev,
          token_symbol: metadata.symbol || prev.token_symbol,
          token_decimals: metadata.decimals ?? prev.token_decimals,
        }))
        setMessage({ type: 'success', text: `Found token: ${metadata.name} (${metadata.symbol})` })
      } else {
        setMessage({ type: 'error', text: 'Could not find token metadata. Please enter symbol manually.' })
      }
    } catch (error: any) {
      console.error('Failed to fetch metadata:', error)
      setMessage({ type: 'error', text: 'Failed to fetch token metadata. Please enter symbol manually.' })
    } finally {
      setIsFetchingMetadata(false)
    }
  }, [])

  // Handle paste event for token address
  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData('text').trim()
    setConfig(prev => ({ ...prev, token_mint_address: pastedText }))
  }, [])

  // Authenticate admin and load tokens
  const authenticateAndLoadTokens = useCallback(async () => {
    if (!publicKey || !signMessage) return

    setIsLoadingTokens(true)
    try {
      // Get auth nonce
      const nonceData = await fetchAdminAuthNonce()
      if (!nonceData) {
        console.error('Failed to get admin auth nonce')
        return
      }

      // Sign the message
      const messageBytes = new TextEncoder().encode(nonceData.message)
      const signatureBytes = await signMessage(messageBytes)
      const signature = bs58.encode(signatureBytes)

      // Store auth credentials for subsequent requests
      setAdminAuthSignature(signature)
      setAdminAuthMessage(nonceData.message)

      // Fetch tokens and stats
      const [tokensData, stats] = await Promise.all([
        fetchAdminTokens(publicKey.toString(), signature, nonceData.message, {
          status: tokenFilter === 'all' ? undefined : tokenFilter,
        }),
        fetchPlatformStats(publicKey.toString(), signature, nonceData.message),
      ])

      if (tokensData) setAdminTokens(tokensData.tokens)
      if (stats) setPlatformStats(stats)
    } catch (error) {
      console.error('Failed to load admin tokens:', error)
    } finally {
      setIsLoadingTokens(false)
    }
  }, [publicKey, signMessage, tokenFilter])

  // Reload tokens with existing auth
  const reloadTokens = useCallback(async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return

    setIsLoadingTokens(true)
    try {
      const tokensData = await fetchAdminTokens(
        publicKey.toString(),
        adminAuthSignature,
        adminAuthMessage,
        { status: tokenFilter === 'all' ? undefined : tokenFilter }
      )
      if (tokensData) setAdminTokens(tokensData.tokens)
    } catch (error) {
      console.error('Failed to reload tokens:', error)
    } finally {
      setIsLoadingTokens(false)
    }
  }, [publicKey, adminAuthSignature, adminAuthMessage, tokenFilter])

  // Handle verify token
  const handleVerifyToken = async (tokenId: string) => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return

    const success = await verifyAdminToken(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      tokenId
    )
    if (success) {
      reloadTokens()
    }
  }

  // Handle suspend token
  const handleSuspendToken = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage || !suspendModal) return
    if (!suspendReason.trim()) return

    const success = await suspendAdminToken(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      suspendModal.tokenId,
      suspendReason
    )
    if (success) {
      setSuspendModal(null)
      setSuspendReason('')
      reloadTokens()
    }
  }

  // Handle unsuspend token
  const handleUnsuspendToken = async (tokenId: string) => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return

    const success = await unsuspendAdminToken(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      tokenId
    )
    if (success) {
      reloadTokens()
    }
  }

  // Load platform settings
  const loadPlatformSettings = useCallback(async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return

    const settings = await fetchPlatformSettings(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage
    )
    if (settings) {
      setPlatformSettings(settings)
      setEditedSettings(settings)
    }
  }, [publicKey, adminAuthSignature, adminAuthMessage])

  // Save platform settings
  const handleSaveSettings = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return

    setIsSavingSettings(true)
    setSettingsMessage(null)

    const result = await updatePlatformSettings(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      editedSettings
    )

    if (result.success) {
      setSettingsMessage({ type: 'success', text: result.message || 'Settings updated successfully!' })
      loadPlatformSettings()
    } else {
      setSettingsMessage({ type: 'error', text: 'Failed to update settings' })
    }

    setIsSavingSettings(false)
  }

  // Handle bulk suspend all tokens
  const handleBulkSuspend = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return
    if (!bulkSuspendReason.trim()) return

    setIsBulkSuspending(true)

    const result = await bulkSuspendAllTokens(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      bulkSuspendReason
    )

    if (result) {
      setBulkSuspendModal(false)
      setBulkSuspendReason('')
      reloadTokens()
      // Refresh platform stats
      const stats = await fetchPlatformStats(publicKey.toString(), adminAuthSignature, adminAuthMessage)
      if (stats) setPlatformStats(stats)
    }

    setIsBulkSuspending(false)
  }

  // Handle bulk unsuspend all tokens
  const handleBulkUnsuspend = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return

    setIsBulkUnsuspending(true)

    const result = await bulkUnsuspendAllTokens(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage
    )

    if (result) {
      reloadTokens()
      // Refresh platform stats
      const stats = await fetchPlatformStats(publicKey.toString(), adminAuthSignature, adminAuthMessage)
      if (stats) setPlatformStats(stats)
    }

    setIsBulkUnsuspending(false)
  }

  // Job trigger handlers
  const handleTriggerJob = async (jobType: 'flywheel' | 'fast-claim' | 'balance-update') => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) {
      setJobMessage({ type: 'error', text: 'Please authenticate first' })
      return
    }

    setIsTriggering(jobType)
    setJobMessage(null)

    let result: { success: boolean; message?: string; error?: string }

    switch (jobType) {
      case 'flywheel':
        result = await triggerFlywheelCycle(publicKey.toString(), adminAuthSignature, adminAuthMessage)
        break
      case 'fast-claim':
        result = await triggerFastClaim(publicKey.toString(), adminAuthSignature, adminAuthMessage)
        break
      case 'balance-update':
        result = await triggerBalanceUpdate(publicKey.toString(), adminAuthSignature, adminAuthMessage)
        break
    }

    if (result.success) {
      setJobMessage({ type: 'success', text: result.message || `${jobType} triggered successfully` })
    } else {
      setJobMessage({ type: 'error', text: result.error || 'Failed to trigger job' })
    }

    setIsTriggering(null)
  }

  // Orphaned launches handlers
  const loadOrphanedLaunches = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return

    const result = await fetchOrphanedLaunches(publicKey.toString(), adminAuthSignature, adminAuthMessage)
    if (result) {
      setOrphanedLaunches(result.launches)
    }
  }

  const handleMigrateOrphaned = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return

    setIsMigrating(true)
    const result = await migrateOrphanedLaunches(publicKey.toString(), adminAuthSignature, adminAuthMessage)

    if (result.success) {
      setJobMessage({ type: 'success', text: result.message || `Migrated ${result.migrated} launches` })
      loadOrphanedLaunches()
      reloadTokens()
    } else {
      setJobMessage({ type: 'error', text: result.error || 'Migration failed' })
    }

    setIsMigrating(false)
  }

  // Stop and refund handlers
  const openRefundModal = async (tokenId: string, symbol: string) => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage) return

    setRefundModal({ tokenId, symbol })
    setRefundPreview(null)
    setRefundAddress('')
    setRefundResult(null)
    setIsLoadingRefundPreview(true)

    const preview = await previewTokenRefund(publicKey.toString(), adminAuthSignature, adminAuthMessage, tokenId)
    if (preview) {
      setRefundPreview(preview)
      if (preview.suggestedRefundAddress) {
        setRefundAddress(preview.suggestedRefundAddress)
      }
    }

    setIsLoadingRefundPreview(false)
  }

  const handleStopAndRefund = async () => {
    if (!publicKey || !adminAuthSignature || !adminAuthMessage || !refundModal) return

    setIsRefunding(true)
    setRefundResult(null)

    const result = await stopFlywheelAndRefund(
      publicKey.toString(),
      adminAuthSignature,
      adminAuthMessage,
      refundModal.tokenId,
      refundAddress || undefined
    )

    setRefundResult(result)

    if (result.success && result.refundExecuted) {
      reloadTokens()
    }

    setIsRefunding(false)
  }

  // Check authorization
  useEffect(() => {
    if (connected && publicKey) {
      const walletAddress = publicKey.toString()
      const authorized = walletAddress === DEV_WALLET_ADDRESS
      setIsAuthorized(authorized)

      if (authorized) {
        loadConfig()
        loadSystemStatus()
        // Load Bags.fm data with wallet address
        loadBagsData(undefined, walletAddress)
      }
    } else {
      setIsAuthorized(false)
    }
  }, [connected, publicKey, loadSystemStatus, loadBagsData])

  // Auto-refresh system status and logs every 10 seconds when authorized
  useEffect(() => {
    if (!isAuthorized) return

    const interval = setInterval(() => {
      loadSystemStatus()
    }, 10000)

    return () => clearInterval(interval)
  }, [isAuthorized, loadSystemStatus])

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
          token_decimals: data.token_decimals ?? 6,
          flywheel_active: data.flywheel_active ?? false,
          market_making_enabled: data.market_making_enabled ?? false,
          fee_collection_enabled: data.fee_collection_enabled ?? true,
          ops_wallet_address: data.ops_wallet_address || '',
          fee_threshold_sol: data.fee_threshold_sol ?? 0.1,
          fee_percentage: data.fee_percentage ?? 100,
          min_buy_amount_sol: data.min_buy_amount_sol ?? 0.01,
          max_buy_amount_sol: data.max_buy_amount_sol ?? 0.1,
          buy_interval_minutes: data.buy_interval_minutes ?? 60,
          slippage_bps: data.slippage_bps ?? 500,
          algorithm_mode: data.algorithm_mode ?? 'simple',
          target_sol_allocation: data.target_sol_allocation ?? 30,
          target_token_allocation: data.target_token_allocation ?? 70,
          rebalance_threshold: data.rebalance_threshold ?? 10,
          use_twap: data.use_twap ?? true,
          twap_threshold_usd: data.twap_threshold_usd ?? 50,
        })
      }
    } catch (error) {
      console.log('Config not found, using defaults')
    }
  }

  // Save config using wallet signature verification
  async function saveConfig() {
    if (!isAuthorized || !publicKey || !signMessage) return

    setIsSaving(true)
    setMessage(null)

    try {
      // Step 1: Get a nonce message from the backend (includes hash of config)
      // This binds the signature to the specific config values being saved
      const nonceData = await fetchAdminNonce(config)
      if (!nonceData) {
        throw new Error('Failed to get nonce from server')
      }

      // Step 2: Sign the message with the wallet
      // The message includes a hash of the config, preventing replay attacks with different values
      const messageBytes = new TextEncoder().encode(nonceData.message)
      const signatureBytes = await signMessage(messageBytes)
      const signature = bs58.encode(signatureBytes)

      // Step 3: Send signed config update to backend
      // Backend verifies the config hash in the signed message matches the submitted config
      const result = await updateConfigWithSignature(
        nonceData.message,
        signature,
        publicKey.toString(),
        config
      )

      if (!result.success) {
        throw new Error(result.error || 'Failed to save configuration')
      }

      // Show enhanced feedback with reload status
      const reloadMsg = result.configReloadTriggered
        ? ' Changes will apply on the next flywheel cycle.'
        : ''
      setMessage({ type: 'success', text: `Configuration saved successfully!${reloadMsg}` })
    } catch (error: any) {
      console.error('Failed to save config:', error)
      // Handle user rejection of signature
      if (error.message?.includes('User rejected')) {
        setMessage({ type: 'error', text: 'Signature rejected. Please approve the signature to save.' })
      } else {
        setMessage({ type: 'error', text: error.message || 'Failed to save configuration' })
      }
    } finally {
      setIsSaving(false)
    }
  }

  // Execute manual sell
  async function handleManualSell(percentage: 25 | 50 | 100) {
    if (!isAuthorized || !publicKey || !signMessage) return

    setIsSelling(true)
    setSellMessage(null)

    try {
      // Step 1: Get a nonce message from the backend
      const nonceData = await fetchManualSellNonce(percentage)
      if (!nonceData) {
        throw new Error('Failed to get nonce from server')
      }

      // Step 2: Sign the message with the wallet
      const messageBytes = new TextEncoder().encode(nonceData.message)
      const signatureBytes = await signMessage(messageBytes)
      const signature = bs58.encode(signatureBytes)

      // Step 3: Execute the sell
      const result = await executeManualSell(
        nonceData.message,
        signature,
        publicKey.toString(),
        percentage
      )

      if (!result.success) {
        throw new Error(result.error || 'Failed to execute sell')
      }

      setSellMessage({
        type: 'success',
        text: `${result.message} - TX: ${result.transaction?.signature?.slice(0, 8)}...`
      })

      // Refresh balances after sell
      loadBagsData(config.token_mint_address, publicKey.toString())
    } catch (error: any) {
      console.error('Failed to execute manual sell:', error)
      if (error.message?.includes('User rejected')) {
        setSellMessage({ type: 'error', text: 'Signature rejected. Please approve to sell.' })
      } else {
        setSellMessage({ type: 'error', text: error.message || 'Failed to execute sell' })
      }
    } finally {
      setIsSelling(false)
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
        className="max-w-3xl mx-auto mb-8"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-text-primary flex items-center gap-2">
              <span className="text-accent-primary">◈</span>
              Admin Panel
            </h1>
            <p className="text-text-muted font-mono text-sm mt-1">
              Claude Wheel Configuration
            </p>
          </div>
          <WalletMultiButton className="!bg-success/20 !text-success !font-mono !rounded-lg !border !border-success/30 !text-sm" />
        </div>

        {/* Authorization badge and quick links */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="badge badge-success">AUTHORIZED</span>
            <span className="text-text-muted font-mono text-xs">
              {publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-8)}
            </span>
          </div>
          <a
            href="/admin/telegram"
            className="flex items-center gap-2 px-3 py-1 text-xs font-mono bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg hover:bg-accent-primary/30 transition-colors"
          >
            <span>📱</span>
            Telegram Launches
          </a>
        </div>
      </motion.div>

      {/* System Status Terminals */}
      <div className="max-w-3xl mx-auto mb-8 space-y-4">
        {/* Connection Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card-glow bg-bg-card p-4"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
              <span className="text-accent-primary">◈</span>
              System Status
            </h2>
            <button
              onClick={loadSystemStatus}
              disabled={isLoadingStatus}
              className="px-3 py-1 text-xs font-mono bg-bg-secondary hover:bg-bg-card-hover border border-border-subtle rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoadingStatus ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* Connection Checks */}
          <div className="bg-bg-secondary rounded-lg p-3 font-mono text-xs">
            <div className="text-text-muted mb-2">$ system status --check-connections</div>
            {systemStatus?.checks.map((check, i) => (
              <div key={i} className="flex items-center gap-2 py-1">
                <span className={`w-2 h-2 rounded-full ${
                  check.status === 'connected' ? 'bg-success' :
                  check.status === 'disconnected' ? 'bg-error' : 'bg-warning'
                }`} />
                <span className={`font-semibold ${
                  check.status === 'connected' ? 'text-success' :
                  check.status === 'disconnected' ? 'text-error' : 'text-warning'
                }`}>
                  [{check.status.toUpperCase()}]
                </span>
                <span className="text-text-primary">{check.name}</span>
                <span className="text-text-muted">- {check.message}</span>
                {check.latency !== undefined && (
                  <span className="text-text-muted">({check.latency}ms)</span>
                )}
              </div>
            ))}
            {!systemStatus && !isLoadingStatus && (
              <div className="text-error">Unable to connect to backend API</div>
            )}
            {isLoadingStatus && !systemStatus && (
              <div className="text-text-muted animate-pulse">Checking connections...</div>
            )}
          </div>

          {/* Environment Info */}
          {systemStatus?.environment && (
            <div className="mt-4 bg-bg-secondary rounded-lg p-3 font-mono text-xs">
              <div className="text-text-muted mb-2">$ env --show-config</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-text-primary">
                <div><span className="text-accent-primary">NODE_ENV:</span> {systemStatus.environment.nodeEnv}</div>
                <div><span className="text-accent-primary">PORT:</span> {systemStatus.environment.port}</div>
                <div className="col-span-2 truncate"><span className="text-accent-primary">SOLANA_RPC:</span> {systemStatus.environment.solanaRpcUrl}</div>
                <div><span className="text-accent-primary">MARKET_MAKING:</span> {systemStatus.environment.marketMakingEnabled ? 'enabled' : 'disabled'}</div>
                <div><span className="text-accent-primary">MAX_BUY:</span> {systemStatus.environment.maxBuyAmountSol} SOL</div>
              </div>
            </div>
          )}

          {/* Memory & Uptime */}
          {systemStatus && (
            <div className="mt-4 flex gap-4 text-xs font-mono">
              <div className="bg-bg-secondary rounded-lg px-3 py-2">
                <span className="text-text-muted">Uptime:</span>{' '}
                <span className="text-success">{Math.floor(systemStatus.uptime / 3600)}h {Math.floor((systemStatus.uptime % 3600) / 60)}m</span>
              </div>
              <div className="bg-bg-secondary rounded-lg px-3 py-2">
                <span className="text-text-muted">Memory:</span>{' '}
                <span className="text-accent-primary">{systemStatus.memory.heapUsed}MB / {systemStatus.memory.heapTotal}MB</span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Backend Logs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-glow bg-bg-card p-4"
        >
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full flex items-center justify-between"
          >
            <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
              <span className="text-accent-primary">◈</span>
              Backend Logs
              {logs.length > 0 && (
                <span className="text-xs font-mono text-text-muted">({logs.length})</span>
              )}
            </h2>
            <span className="text-text-muted text-sm">{showLogs ? '▼' : '▶'}</span>
          </button>

          {showLogs && (
            <div className="mt-4 bg-bg-secondary rounded-lg p-3 font-mono text-xs max-h-80 overflow-y-auto">
              <div className="text-text-muted mb-2">$ tail -f /var/log/flywheel.log</div>
              {logs.length === 0 ? (
                <div className="text-text-muted">No logs available</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`py-0.5 ${
                    log.level === 'error' ? 'text-error' :
                    log.level === 'warn' ? 'text-warning' : 'text-text-primary'
                  }`}>
                    <span className="text-text-muted">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                    <span className={`font-semibold ${
                      log.level === 'error' ? 'text-error' :
                      log.level === 'warn' ? 'text-warning' : 'text-accent-primary'
                    }`}>{log.level.toUpperCase()}</span>{' '}
                    {log.message}
                  </div>
                ))
              )}
            </div>
          )}
        </motion.div>

        {/* Bags.fm Integration Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card-glow bg-bg-card p-4"
        >
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowBagsPanel(!showBagsPanel)}
              className="flex items-center gap-2"
            >
              <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
                <span className="text-accent-primary">◈</span>
                Bags.fm Integration
              </h2>
              <span className="text-text-muted text-sm">{showBagsPanel ? '▼' : '▶'}</span>
            </button>
            <button
              onClick={() => loadBagsData(config.token_mint_address, publicKey?.toString())}
              disabled={isLoadingBags}
              className="px-3 py-1 text-xs font-mono bg-bg-secondary hover:bg-bg-card-hover border border-border-subtle rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoadingBags ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {showBagsPanel && (
            <div className="space-y-4">
              {/* Token Info */}
              {bagsData?.tokenInfo ? (
                <div className="bg-bg-secondary rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    {bagsData.tokenInfo.tokenImage && (
                      <img
                        src={bagsData.tokenInfo.tokenImage}
                        alt={bagsData.tokenInfo.tokenSymbol || config.token_symbol}
                        className="w-16 h-16 rounded-lg"
                      />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-display font-bold text-text-primary">
                          {bagsData.tokenInfo.tokenName || config.token_symbol || 'Token'}
                        </h3>
                        <span className="text-text-muted font-mono text-sm">
                          ${bagsData.tokenInfo.tokenSymbol || config.token_symbol}
                        </span>
                        {bagsData.tokenInfo.isGraduated ? (
                          <span className="badge badge-success text-xs">GRADUATED</span>
                        ) : (
                          <span className="badge badge-warning text-xs">BONDING</span>
                        )}
                      </div>

                      {/* Bonding Curve Progress */}
                      {!bagsData.tokenInfo.isGraduated && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs font-mono mb-1">
                            <span className="text-text-muted">Bonding Curve</span>
                            <span className="text-accent-primary">
                              {bagsData.tokenInfo.bondingCurveProgress > 0
                                ? `${(bagsData.tokenInfo.bondingCurveProgress * 100).toFixed(1)}%`
                                : 'Active'}
                            </span>
                          </div>
                          {bagsData.tokenInfo.bondingCurveProgress > 0 ? (
                            <div className="h-2 bg-bg-card rounded-full overflow-hidden">
                              <div
                                className="h-full bg-accent-primary transition-all"
                                style={{ width: `${bagsData.tokenInfo.bondingCurveProgress * 100}%` }}
                              />
                            </div>
                          ) : (
                            <div className="h-2 bg-bg-card rounded-full overflow-hidden">
                              <div className="h-full bg-accent-primary/50 animate-pulse" style={{ width: '30%' }} />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Stats Grid */}
                      <div className="grid grid-cols-3 gap-4 mt-3 text-xs font-mono">
                        <div>
                          <span className="text-text-muted block">Market Cap</span>
                          <span className="text-text-primary font-semibold">
                            {bagsData.tokenInfo.marketCap > 0
                              ? `$${bagsData.tokenInfo.marketCap.toLocaleString()}`
                              : <span className="text-text-muted">--</span>}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-muted block">24h Volume</span>
                          <span className="text-text-primary font-semibold">
                            {bagsData.tokenInfo.volume24h > 0
                              ? `$${bagsData.tokenInfo.volume24h.toLocaleString()}`
                              : <span className="text-text-muted">--</span>}
                          </span>
                        </div>
                        <div>
                          <span className="text-text-muted block">Holders</span>
                          <span className="text-text-primary font-semibold">
                            {bagsData.tokenInfo.holders > 0
                              ? bagsData.tokenInfo.holders.toLocaleString()
                              : <span className="text-text-muted">--</span>}
                          </span>
                        </div>
                      </div>
                      {/* API Note */}
                      {bagsData.tokenInfo.marketCap === 0 && bagsData.tokenInfo.holders === 0 && (
                        <p className="text-text-muted font-mono text-xs mt-3 italic">
                          Note: Token stats not available from Bags.fm API. Trading is working via bonding curve.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-bg-secondary rounded-lg p-4">
                  <p className="text-text-muted font-mono text-sm">
                    {isLoadingBags ? 'Loading token info...' : 'No token info available. Configure token mint address and click Refresh.'}
                  </p>
                </div>
              )}

              {/* Fees Section */}
              <div className="grid grid-cols-2 gap-4">
                {/* Lifetime Fees */}
                <div className="bg-bg-secondary rounded-lg p-4">
                  <h4 className="text-text-muted font-mono text-xs mb-2">LIFETIME FEES COLLECTED</h4>
                  {bagsData?.lifetimeFees && bagsData.lifetimeFees.creatorFeesCollected > 0 ? (
                    <>
                      <div className="text-2xl font-display font-bold text-success">
                        {bagsData.lifetimeFees.creatorFeesCollected.toFixed(4)} SOL
                      </div>
                      <div className="text-text-muted font-mono text-sm">
                        ≈ ${bagsData.lifetimeFees.creatorFeesCollectedUsd.toFixed(2)}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-display font-bold text-success">
                        0.0000 SOL
                      </div>
                      <div className="text-text-muted font-mono text-sm">
                        ≈ $0.00
                      </div>
                    </>
                  )}
                </div>

                {/* Claim Stats */}
                <div className="bg-bg-secondary rounded-lg p-4">
                  <h4 className="text-text-muted font-mono text-xs mb-2">CLAIM STATISTICS</h4>
                  {bagsData?.claimStats ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div>
                          <span className="text-text-muted block">Total Claimed</span>
                          <span className="text-success font-semibold">
                            {bagsData.claimStats.totalClaimed.toFixed(4)} SOL
                          </span>
                        </div>
                        <div>
                          <span className="text-text-muted block">Pending</span>
                          <span className="text-warning font-semibold">
                            {bagsData.claimStats.pendingClaims.toFixed(4)} SOL
                          </span>
                        </div>
                      </div>
                      {bagsData.claimStats.lastClaimTime && (
                        <div className="text-text-muted font-mono text-xs mt-2">
                          Last claim: {new Date(bagsData.claimStats.lastClaimTime).toLocaleString()}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-text-muted block">Total Claimed</span>
                        <span className="text-success font-semibold">0.0000 SOL</span>
                      </div>
                      <div>
                        <span className="text-text-muted block">Pending</span>
                        <span className="text-warning font-semibold">0.0000 SOL</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Claimable Positions */}
              {bagsData?.claimablePositions && bagsData.claimablePositions.length > 0 && (
                <div className="bg-bg-secondary rounded-lg p-4">
                  <h4 className="text-text-muted font-mono text-xs mb-3">CLAIMABLE POSITIONS</h4>
                  <div className="space-y-2">
                    {bagsData.claimablePositions.map((position, i) => (
                      <div key={i} className="flex items-center justify-between bg-bg-card rounded-lg p-3">
                        <div>
                          <span className="font-mono text-sm text-text-primary">
                            ${position.tokenSymbol}
                          </span>
                          <span className="text-text-muted font-mono text-xs ml-2">
                            {position.tokenMint.slice(0, 8)}...
                          </span>
                        </div>
                        <div className="text-right">
                          <div className="text-success font-mono font-semibold">
                            {position.claimableAmount.toFixed(4)} SOL
                          </div>
                          <div className="text-text-muted font-mono text-xs">
                            ≈ ${position.claimableAmountUsd.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-text-muted font-mono text-xs mt-3">
                    Visit bags.fm to claim your fees
                  </p>
                </div>
              )}

              {/* Quick Link */}
              <div className="flex items-center justify-between bg-bg-secondary rounded-lg p-3">
                <span className="text-text-muted font-mono text-sm">Launch tokens & claim fees on Bags.fm</span>
                <a
                  href="https://bags.fm"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg font-mono text-sm hover:bg-accent-primary/30 transition-colors"
                >
                  Open Bags.fm →
                </a>
              </div>
            </div>
          )}
        </motion.div>

        {/* Token Management Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card-glow bg-bg-card p-4"
        >
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowTokenManagement(!showTokenManagement)}
          >
            <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
              <span className="text-accent-primary">◈</span>
              Token Management
              {platformStats && (
                <span className="text-xs font-mono text-text-muted">
                  ({platformStats.tokens.total} tokens, {platformStats.tokens.activeFlywheels} active)
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {!adminAuthSignature ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    authenticateAndLoadTokens()
                  }}
                  disabled={isLoadingTokens}
                  className="px-3 py-1 text-xs font-mono bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg hover:bg-accent-primary/30 transition-colors disabled:opacity-50"
                >
                  {isLoadingTokens ? 'Authenticating...' : 'Load Tokens'}
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    reloadTokens()
                  }}
                  disabled={isLoadingTokens}
                  className="px-3 py-1 text-xs font-mono bg-bg-secondary hover:bg-bg-card-hover border border-border-subtle rounded-lg transition-colors disabled:opacity-50"
                >
                  {isLoadingTokens ? 'Loading...' : 'Refresh'}
                </button>
              )}
              <span className="text-text-muted">{showTokenManagement ? '▼' : '▶'}</span>
            </div>
          </div>

          {showTokenManagement && adminAuthSignature && (
            <div className="mt-4">
              {/* Platform Stats */}
              {platformStats && (
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="bg-bg-secondary rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-text-primary">{platformStats.users.total}</div>
                    <div className="text-xs text-text-muted font-mono">Users</div>
                  </div>
                  <div className="bg-bg-secondary rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-success">{platformStats.tokens.active}</div>
                    <div className="text-xs text-text-muted font-mono">Active</div>
                  </div>
                  <div className="bg-bg-secondary rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-error">{platformStats.tokens.suspended}</div>
                    <div className="text-xs text-text-muted font-mono">Suspended</div>
                  </div>
                  <div className="bg-bg-secondary rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-accent-primary">{platformStats.tokens.activeFlywheels}</div>
                    <div className="text-xs text-text-muted font-mono">Flywheels</div>
                  </div>
                </div>
              )}

              {/* Filter Tabs and Bulk Actions */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                  {(['all', 'active', 'suspended'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => {
                        setTokenFilter(filter)
                        reloadTokens()
                      }}
                      className={`px-3 py-1 text-xs font-mono rounded-lg border transition-colors ${
                        tokenFilter === filter
                          ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/30'
                          : 'bg-bg-secondary text-text-muted border-border-subtle hover:bg-bg-card-hover'
                      }`}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Bulk Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setBulkSuspendModal(true)}
                    disabled={isBulkSuspending || adminTokens.length === 0}
                    className="px-3 py-1 text-xs font-mono bg-error/20 text-error border border-error/30 rounded-lg hover:bg-error/30 transition-colors disabled:opacity-50"
                  >
                    {isBulkSuspending ? 'Suspending...' : 'Suspend All'}
                  </button>
                  <button
                    onClick={handleBulkUnsuspend}
                    disabled={isBulkUnsuspending || (platformStats?.tokens.suspended ?? 0) === 0}
                    className="px-3 py-1 text-xs font-mono bg-success/20 text-success border border-success/30 rounded-lg hover:bg-success/30 transition-colors disabled:opacity-50"
                  >
                    {isBulkUnsuspending ? 'Unsuspending...' : 'Unsuspend All'}
                  </button>
                </div>
              </div>

              {/* Tokens List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {adminTokens.length === 0 && !isLoadingTokens && (
                  <div className="text-center text-text-muted font-mono py-8">
                    No tokens found
                  </div>
                )}
                {adminTokens.map((token) => (
                  <div
                    key={token.id}
                    className={`bg-bg-secondary rounded-lg p-3 border ${
                      token.isSuspended
                        ? 'border-error/30'
                        : token.isVerified
                        ? 'border-success/30'
                        : 'border-border-subtle'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {token.tokenImage ? (
                          <img src={token.tokenImage} alt={token.tokenSymbol} className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center text-accent-primary font-bold text-sm">
                            {token.tokenSymbol.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-text-primary">{token.tokenSymbol}</span>
                            {token.isVerified && <span className="text-success text-xs">✓ Verified</span>}
                            {token.isSuspended && <span className="text-error text-xs">⚠ Suspended</span>}
                          </div>
                          <div className="text-xs text-text-muted font-mono">
                            User: {token.userWallet.slice(0, 6)}...{token.userWallet.slice(-4)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Risk Badge */}
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          token.riskLevel === 'high' ? 'bg-error/20 text-error' :
                          token.riskLevel === 'medium' ? 'bg-warning/20 text-warning' :
                          'bg-success/20 text-success'
                        }`}>
                          {token.riskLevel}
                        </span>

                        {/* Flywheel Status */}
                        {token.config?.flywheel_active && (
                          <span className="px-2 py-0.5 text-xs bg-accent-primary/20 text-accent-primary rounded-full">
                            Flywheel Active
                          </span>
                        )}

                        {/* Actions */}
                        {!token.isVerified && !token.isSuspended && (
                          <button
                            onClick={() => handleVerifyToken(token.id)}
                            className="px-2 py-1 text-xs bg-success/20 text-success border border-success/30 rounded hover:bg-success/30 transition-colors"
                          >
                            Verify
                          </button>
                        )}
                        {!token.isSuspended ? (
                          <button
                            onClick={() => setSuspendModal({ tokenId: token.id, symbol: token.tokenSymbol })}
                            className="px-2 py-1 text-xs bg-error/20 text-error border border-error/30 rounded hover:bg-error/30 transition-colors"
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUnsuspendToken(token.id)}
                            className="px-2 py-1 text-xs bg-success/20 text-success border border-success/30 rounded hover:bg-success/30 transition-colors"
                          >
                            Unsuspend
                          </button>
                        )}

                        {/* Stop & Refund - For test launches */}
                        <button
                          onClick={() => openRefundModal(token.id, token.tokenSymbol)}
                          className="px-2 py-1 text-xs bg-warning/20 text-warning border border-warning/30 rounded hover:bg-warning/30 transition-colors"
                          title="Stop flywheel and refund remaining SOL to original funder"
                        >
                          Stop & Refund
                        </button>
                      </div>
                    </div>

                    {/* Token Details (collapsed) */}
                    <div className="mt-2 pt-2 border-t border-border-subtle grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-text-muted">Daily Limit:</span>{' '}
                        <span className="text-text-primary">{token.dailyTradeLimitSol} SOL</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Max Position:</span>{' '}
                        <span className="text-text-primary">{token.maxPositionSizeSol} SOL</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Created:</span>{' '}
                        <span className="text-text-primary">{new Date(token.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Suspend Reason if suspended */}
                    {token.isSuspended && token.suspendReason && (
                      <div className="mt-2 p-2 bg-error/10 rounded text-xs text-error">
                        Reason: {token.suspendReason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Suspend Modal */}
        {suspendModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-bg-card border border-border-subtle rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-text-primary mb-4">
                Suspend {suspendModal.symbol}
              </h3>
              <p className="text-text-muted text-sm mb-4">
                This will immediately stop all automation for this token. The user will be notified.
              </p>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Enter suspension reason..."
                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-error mb-4 h-24"
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setSuspendModal(null)
                    setSuspendReason('')
                  }}
                  className="px-4 py-2 text-sm font-mono bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSuspendToken}
                  disabled={!suspendReason.trim()}
                  className="px-4 py-2 text-sm font-mono bg-error/20 text-error border border-error/30 rounded-lg hover:bg-error/30 transition-colors disabled:opacity-50"
                >
                  Suspend Token
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Suspend Modal */}
        {bulkSuspendModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-bg-card border border-border-subtle rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-error mb-4">
                Suspend All User Tokens
              </h3>
              <p className="text-text-muted text-sm mb-2">
                This will immediately suspend <strong>ALL</strong> user tokens except the platform token (8JLGQ7...BAGS).
              </p>
              <p className="text-warning text-xs mb-4 p-2 bg-warning/10 rounded">
                All automation will stop for suspended tokens. Users will be notified.
              </p>
              <textarea
                value={bulkSuspendReason}
                onChange={(e) => setBulkSuspendReason(e.target.value)}
                placeholder="Enter suspension reason (e.g., Platform maintenance)..."
                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-error mb-4 h-24"
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setBulkSuspendModal(false)
                    setBulkSuspendReason('')
                  }}
                  className="px-4 py-2 text-sm font-mono bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkSuspend}
                  disabled={!bulkSuspendReason.trim() || isBulkSuspending}
                  className="px-4 py-2 text-sm font-mono bg-error/20 text-error border border-error/30 rounded-lg hover:bg-error/30 transition-colors disabled:opacity-50"
                >
                  {isBulkSuspending ? 'Suspending...' : 'Suspend All Tokens'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Stop & Refund Modal */}
        {refundModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-bg-card border border-border-subtle rounded-xl p-6 max-w-lg w-full mx-4">
              <h3 className="text-lg font-semibold text-warning mb-4">
                Stop & Refund: {refundModal.symbol}
              </h3>

              {isLoadingRefundPreview ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary mx-auto"></div>
                  <p className="text-text-muted mt-4 font-mono text-sm">Loading wallet balances...</p>
                </div>
              ) : refundPreview ? (
                <div className="space-y-4">
                  <p className="text-text-muted text-sm">
                    This will stop the flywheel and refund remaining SOL from both wallets to the original funder.
                  </p>

                  {/* Wallet Balances */}
                  <div className="bg-bg-secondary rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-text-muted text-sm">Dev Wallet</span>
                        <p className="font-mono text-xs text-text-muted truncate max-w-[200px]">
                          {refundPreview.wallets.dev.address}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-text-primary font-mono">
                          {refundPreview.wallets.dev.balance.toFixed(6)} SOL
                        </span>
                        <p className="text-success text-xs font-mono">
                          Refundable: {refundPreview.wallets.dev.refundable.toFixed(6)} SOL
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-text-muted text-sm">Ops Wallet</span>
                        <p className="font-mono text-xs text-text-muted truncate max-w-[200px]">
                          {refundPreview.wallets.ops.address}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-text-primary font-mono">
                          {refundPreview.wallets.ops.balance.toFixed(6)} SOL
                        </span>
                        <p className="text-success text-xs font-mono">
                          Refundable: {refundPreview.wallets.ops.refundable.toFixed(6)} SOL
                        </p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-border-subtle flex justify-between items-center">
                      <span className="text-text-primary font-semibold">Total Refundable</span>
                      <span className="text-success font-mono font-semibold">
                        {refundPreview.totalRefundable.toFixed(6)} SOL
                      </span>
                    </div>
                  </div>

                  {/* Refund Address Input */}
                  <div>
                    <label className="block text-text-secondary font-mono text-sm mb-2">
                      Refund Address {refundPreview.suggestedRefundAddress && '(auto-detected from original funder)'}
                    </label>
                    <input
                      type="text"
                      value={refundAddress}
                      onChange={(e) => setRefundAddress(e.target.value)}
                      placeholder="Solana wallet address to receive refund"
                      className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-warning"
                    />
                  </div>

                  {/* Result Message */}
                  {refundResult && (
                    <div className={`p-3 rounded-lg text-sm font-mono ${
                      refundResult.success
                        ? 'bg-success/10 text-success border border-success/30'
                        : 'bg-error/10 text-error border border-error/30'
                    }`}>
                      {refundResult.success ? (
                        <>
                          <p>{refundResult.message}</p>
                          {refundResult.results?.map((r, i) => (
                            <p key={i} className="mt-1 text-xs">
                              {r.walletType.toUpperCase()}: {r.refundAmount.toFixed(6)} SOL
                              {r.signature && ` - ${r.signature.slice(0, 8)}...`}
                            </p>
                          ))}
                        </>
                      ) : (
                        <p>{refundResult.error}</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-error text-sm">Failed to load wallet information.</p>
              )}

              <div className="flex gap-3 justify-end mt-6">
                <button
                  onClick={() => {
                    setRefundModal(null)
                    setRefundPreview(null)
                    setRefundAddress('')
                    setRefundResult(null)
                  }}
                  className="px-4 py-2 text-sm font-mono bg-bg-secondary text-text-muted border border-border-subtle rounded-lg hover:bg-bg-card-hover transition-colors"
                >
                  {refundResult?.success ? 'Close' : 'Cancel'}
                </button>
                {!refundResult?.success && (
                  <button
                    onClick={handleStopAndRefund}
                    disabled={isRefunding || !refundPreview || refundPreview.totalRefundable <= 0}
                    className="px-4 py-2 text-sm font-mono bg-warning/20 text-warning border border-warning/30 rounded-lg hover:bg-warning/30 transition-colors disabled:opacity-50"
                  >
                    {isRefunding ? 'Processing...' : 'Stop Flywheel & Refund'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Platform Settings Panel */}
        {adminAuthSignature && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="card-glow bg-bg-card p-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
                <span className="text-accent-primary">◈</span>
                Platform Settings
              </h2>
              <button
                onClick={loadPlatformSettings}
                disabled={!adminAuthSignature}
                className="px-3 py-1 text-xs font-mono bg-bg-secondary hover:bg-bg-card-hover border border-border-subtle rounded-lg transition-colors disabled:opacity-50"
              >
                {platformSettings ? 'Refresh' : 'Load Settings'}
              </button>
            </div>

            {platformSettings && (
              <div className="space-y-4">
                {/* Job Settings */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-text-muted font-mono text-xs mb-2">
                      Claim Interval (minutes)
                    </label>
                    <input
                      type="number"
                      value={editedSettings.claimJobIntervalMinutes ?? platformSettings.claimJobIntervalMinutes}
                      onChange={(e) => setEditedSettings(prev => ({
                        ...prev,
                        claimJobIntervalMinutes: parseInt(e.target.value) || 60
                      }))}
                      min={1}
                      max={1440}
                      className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
                    />
                    <p className="text-text-muted font-mono text-xs mt-1">
                      How often to run claims
                    </p>
                  </div>
                  <div>
                    <label className="block text-text-muted font-mono text-xs mb-2">
                      Flywheel Interval (minutes)
                    </label>
                    <input
                      type="number"
                      value={editedSettings.flywheelIntervalMinutes ?? platformSettings.flywheelIntervalMinutes}
                      onChange={(e) => setEditedSettings(prev => ({
                        ...prev,
                        flywheelIntervalMinutes: parseInt(e.target.value) || 1
                      }))}
                      min={1}
                      max={60}
                      className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
                    />
                    <p className="text-text-muted font-mono text-xs mt-1">
                      How often to run flywheel
                    </p>
                  </div>
                  <div>
                    <label className="block text-text-muted font-mono text-xs mb-2">
                      Max Trades/Minute
                    </label>
                    <input
                      type="number"
                      value={editedSettings.maxTradesPerMinute ?? platformSettings.maxTradesPerMinute}
                      onChange={(e) => setEditedSettings(prev => ({
                        ...prev,
                        maxTradesPerMinute: parseInt(e.target.value) || 30
                      }))}
                      min={1}
                      max={100}
                      className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-3 py-2 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
                    />
                    <p className="text-text-muted font-mono text-xs mt-1">
                      Global rate limit
                    </p>
                  </div>
                </div>

                {/* Current Job Status */}
                <div className="grid grid-cols-2 gap-4 p-3 bg-bg-secondary rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${platformSettings.claimJobEnabled ? 'bg-success' : 'bg-error'}`} />
                    <span className="font-mono text-xs text-text-muted">
                      Claim Job: {platformSettings.claimJobEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${platformSettings.flywheelJobEnabled ? 'bg-success' : 'bg-error'}`} />
                    <span className="font-mono text-xs text-text-muted">
                      Flywheel Job: {platformSettings.flywheelJobEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>

                {/* Settings Message */}
                {settingsMessage && (
                  <div className={`p-3 rounded-lg font-mono text-sm ${
                    settingsMessage.type === 'success'
                      ? 'bg-success/20 text-success border border-success/30'
                      : 'bg-error/20 text-error border border-error/30'
                  }`}>
                    {settingsMessage.text}
                  </div>
                )}

                {/* Save Button */}
                <button
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                  className="w-full px-4 py-2 text-sm font-mono bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg hover:bg-accent-primary/30 transition-colors disabled:opacity-50"
                >
                  {isSavingSettings ? 'Saving...' : 'Save Platform Settings'}
                </button>
              </div>
            )}

            {!platformSettings && adminAuthSignature && (
              <p className="text-text-muted font-mono text-sm text-center py-4">
                Click "Load Settings" to view and edit platform configuration
              </p>
            )}
          </motion.div>
        )}

        {/* Job Controls Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card-glow bg-bg-card p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
              <span className="text-accent-primary">▶</span>
              Job Controls
            </h2>
          </div>

          <p className="text-text-muted font-mono text-sm mb-4">
            Manually trigger background jobs for testing or debugging.
          </p>

          <div className="flex flex-wrap gap-3 mb-4">
            <button
              onClick={() => handleTriggerJob('flywheel')}
              disabled={isTriggering !== null || !adminAuthSignature}
              className="px-4 py-2 text-sm font-mono bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg hover:bg-accent-primary/30 transition-colors disabled:opacity-50"
            >
              {isTriggering === 'flywheel' ? 'Triggering...' : 'Trigger Flywheel'}
            </button>
            <button
              onClick={() => handleTriggerJob('fast-claim')}
              disabled={isTriggering !== null || !adminAuthSignature}
              className="px-4 py-2 text-sm font-mono bg-success/20 text-success border border-success/30 rounded-lg hover:bg-success/30 transition-colors disabled:opacity-50"
            >
              {isTriggering === 'fast-claim' ? 'Triggering...' : 'Trigger Fast Claim'}
            </button>
            <button
              onClick={() => handleTriggerJob('balance-update')}
              disabled={isTriggering !== null || !adminAuthSignature}
              className="px-4 py-2 text-sm font-mono bg-warning/20 text-warning border border-warning/30 rounded-lg hover:bg-warning/30 transition-colors disabled:opacity-50"
            >
              {isTriggering === 'balance-update' ? 'Triggering...' : 'Trigger Balance Update'}
            </button>
          </div>

          {jobMessage && (
            <div className={`text-sm font-mono p-3 rounded-lg ${
              jobMessage.type === 'success'
                ? 'bg-success/10 text-success border border-success/30'
                : 'bg-error/10 text-error border border-error/30'
            }`}>
              {jobMessage.text}
            </div>
          )}
        </motion.div>

        {/* Orphaned Launches Panel */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card-glow bg-bg-card p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
              <span className="text-warning">⚠</span>
              Orphaned Launches Recovery
            </h2>
            <button
              onClick={() => {
                setShowOrphanedLaunches(!showOrphanedLaunches)
                if (!showOrphanedLaunches && adminAuthSignature) {
                  loadOrphanedLaunches()
                }
              }}
              className="text-text-muted hover:text-text-primary transition-colors"
            >
              {showOrphanedLaunches ? '▼' : '▶'}
            </button>
          </div>

          <p className="text-text-muted font-mono text-sm mb-4">
            Recover completed token launches that weren&apos;t properly registered in the database.
          </p>

          {showOrphanedLaunches && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <button
                  onClick={loadOrphanedLaunches}
                  disabled={!adminAuthSignature}
                  className="px-4 py-2 text-sm font-mono bg-bg-secondary text-text-secondary border border-border-subtle rounded-lg hover:bg-bg-primary transition-colors disabled:opacity-50"
                >
                  Refresh List
                </button>
                <button
                  onClick={handleMigrateOrphaned}
                  disabled={isMigrating || !adminAuthSignature || orphanedLaunches.length === 0}
                  className="px-4 py-2 text-sm font-mono bg-success/20 text-success border border-success/30 rounded-lg hover:bg-success/30 transition-colors disabled:opacity-50"
                >
                  {isMigrating ? 'Migrating...' : `Migrate All (${orphanedLaunches.length})`}
                </button>
              </div>

              {orphanedLaunches.length > 0 ? (
                <div className="bg-bg-secondary rounded-lg border border-border-subtle overflow-hidden">
                  <table className="w-full text-sm font-mono">
                    <thead className="bg-bg-primary text-text-muted">
                      <tr>
                        <th className="text-left px-4 py-2">Token</th>
                        <th className="text-left px-4 py-2">Mint Address</th>
                        <th className="text-left px-4 py-2">User</th>
                        <th className="text-left px-4 py-2">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orphanedLaunches.map((launch) => (
                        <tr key={launch.id} className="border-t border-border-subtle">
                          <td className="px-4 py-2 text-text-primary">
                            {launch.token_name} ({launch.token_symbol})
                          </td>
                          <td className="px-4 py-2 text-text-muted">
                            {launch.token_mint_address?.slice(0, 8)}...
                          </td>
                          <td className="px-4 py-2 text-text-muted">
                            @{launch.telegram_users?.telegram_username || 'Unknown'}
                          </td>
                          <td className="px-4 py-2 text-text-muted">
                            {new Date(launch.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-text-muted font-mono text-sm text-center py-4 bg-bg-secondary rounded-lg">
                  No orphaned launches found. All launches are properly registered.
                </p>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* Config Forms */}
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Master Flywheel Toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className={`card-glow p-6 ${config.flywheel_active ? 'bg-success/10 border-success/30' : 'bg-bg-card'}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-4 h-4 rounded-full ${config.flywheel_active ? 'bg-success animate-pulse' : 'bg-text-muted'}`} />
              <div>
                <h2 className="font-display text-xl font-bold text-text-primary">
                  Flywheel Status
                </h2>
                <p className="text-text-muted font-mono text-sm mt-1">
                  {config.flywheel_active ? 'System is running' : 'System is paused'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setConfig({ ...config, flywheel_active: !config.flywheel_active })}
              className={`px-6 py-3 rounded-lg font-mono font-semibold transition-all ${
                config.flywheel_active
                  ? 'bg-error/20 text-error border border-error/30 hover:bg-error/30'
                  : 'bg-success/20 text-success border border-success/30 hover:bg-success/30'
              }`}
            >
              {config.flywheel_active ? 'PAUSE' : 'START'}
            </button>
          </div>
          {!config.flywheel_active && (
            <p className="text-text-muted font-mono text-xs mt-4 p-3 bg-bg-secondary rounded-lg">
              When paused, fee collection and market making operations are disabled.
            </p>
          )}
        </motion.div>

        {/* Token Configuration */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-glow bg-bg-card p-6"
        >
          <h2 className="font-display text-lg font-semibold text-text-primary mb-6 flex items-center gap-2">
            <span className="text-accent-primary">◎</span>
            Token Configuration
          </h2>

          {/* Token Mint Address */}
          <div className="mb-6">
            <label className="block text-text-secondary font-mono text-sm mb-2">
              Token Mint Address (Contract Address)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.token_mint_address}
                onChange={(e) => setConfig(prev => ({ ...prev, token_mint_address: e.target.value }))}
                onPaste={handlePaste}
                placeholder="Paste your token mint address here"
                className="flex-1 bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors"
              />
              <button
                type="button"
                onClick={() => handleFetchMetadata(config.token_mint_address)}
                disabled={isFetchingMetadata || !config.token_mint_address || !isValidSolanaAddress(config.token_mint_address)}
                className="px-4 py-3 bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg font-mono text-sm hover:bg-accent-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
              >
                {isFetchingMetadata ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Fetching...
                  </span>
                ) : (
                  'Fetch Info'
                )}
              </button>
            </div>
            <p className="text-text-muted font-mono text-xs mt-2">
              Enter CA and click "Fetch Info" to auto-fill token symbol and decimals
            </p>
          </div>

          {/* Token Symbol & Decimals Row */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-text-secondary font-mono text-sm mb-2">
                Token Symbol
              </label>
              <input
                type="text"
                value={config.token_symbol}
                onChange={(e) => setConfig({ ...config, token_symbol: e.target.value.toUpperCase() })}
                placeholder="CLAUDE"
                maxLength={10}
                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-text-secondary font-mono text-sm mb-2">
                Token Decimals
              </label>
              <input
                type="number"
                value={config.token_decimals}
                onChange={(e) => setConfig({ ...config, token_decimals: parseInt(e.target.value) || 6 })}
                min={0}
                max={18}
                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
              />
            </div>
          </div>
        </motion.div>

        {/* Wallet Configuration */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card-glow bg-bg-card p-6"
        >
          <h2 className="font-display text-lg font-semibold text-text-primary mb-6 flex items-center gap-2">
            <span className="text-accent-primary">◎</span>
            Wallet Configuration
          </h2>

          {/* Dev Wallet (Read Only) */}
          <div className="mb-6">
            <label className="block text-text-secondary font-mono text-sm mb-2">
              Dev Wallet Address (Creator Fee Receiver)
            </label>
            <div className="w-full bg-bg-secondary/50 border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-muted">
              {DEV_WALLET_ADDRESS || 'Not configured in environment'}
            </div>
            <p className="text-text-muted font-mono text-xs mt-2">
              Set via NEXT_PUBLIC_DEV_WALLET_ADDRESS environment variable
            </p>
          </div>

          {/* Ops Wallet */}
          <div className="mb-6">
            <label className="block text-text-secondary font-mono text-sm mb-2">
              Ops Wallet Address (Market Making Wallet)
            </label>
            <input
              type="text"
              value={config.ops_wallet_address}
              onChange={(e) => setConfig({ ...config, ops_wallet_address: e.target.value })}
              onPaste={(e) => {
                e.preventDefault()
                const pastedText = e.clipboardData.getData('text').trim()
                setConfig(prev => ({ ...prev, ops_wallet_address: pastedText }))
              }}
              placeholder="Enter ops wallet address"
              className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-primary transition-colors"
            />
            <p className="text-text-muted font-mono text-xs mt-2">
              Wallet that receives transferred SOL and executes buys
            </p>
          </div>
        </motion.div>

        {/* Fee Collection Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card-glow bg-bg-card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
              <span className="text-accent-primary">◎</span>
              Fee Collection
            </h2>
            <button
              onClick={() => setConfig({ ...config, fee_collection_enabled: !config.fee_collection_enabled })}
              className={`relative w-14 h-7 rounded-full transition-colors ${
                config.fee_collection_enabled ? 'bg-success' : 'bg-bg-secondary'
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                  config.fee_collection_enabled ? 'left-8' : 'left-1'
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-text-secondary font-mono text-sm mb-2">
                Fee Threshold (SOL)
              </label>
              <input
                type="number"
                value={config.fee_threshold_sol}
                onChange={(e) => setConfig({ ...config, fee_threshold_sol: parseFloat(e.target.value) || 0.1 })}
                step="0.01"
                min={0}
                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
              />
              <p className="text-text-muted font-mono text-xs mt-2">
                Min balance before collecting
              </p>
            </div>
            <div>
              <label className="block text-text-secondary font-mono text-sm mb-2">
                Transfer Percentage (%)
              </label>
              <input
                type="number"
                value={config.fee_percentage}
                onChange={(e) => setConfig({ ...config, fee_percentage: Math.min(100, Math.max(0, parseInt(e.target.value) || 100)) })}
                min={0}
                max={100}
                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
              />
              <p className="text-text-muted font-mono text-xs mt-2">
                % of fees to transfer to ops
              </p>
            </div>
          </div>
        </motion.div>

        {/* Market Making Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card-glow bg-bg-card p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-lg font-semibold text-text-primary flex items-center gap-2">
              <span className="text-accent-primary">◎</span>
              Market Making
            </h2>
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

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-text-secondary font-mono text-sm mb-2">
                Min Buy Amount (SOL)
              </label>
              <input
                type="number"
                value={config.min_buy_amount_sol}
                onChange={(e) => setConfig({ ...config, min_buy_amount_sol: parseFloat(e.target.value) || 0.01 })}
                step="0.001"
                min={0}
                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-text-secondary font-mono text-sm mb-2">
                Max Buy Amount (SOL)
              </label>
              <input
                type="number"
                value={config.max_buy_amount_sol}
                onChange={(e) => setConfig({ ...config, max_buy_amount_sol: parseFloat(e.target.value) || 0.1 })}
                step="0.01"
                min={0}
                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-text-secondary font-mono text-sm mb-2">
                Buy Interval (minutes)
              </label>
              <input
                type="number"
                value={config.buy_interval_minutes}
                onChange={(e) => setConfig({ ...config, buy_interval_minutes: parseInt(e.target.value) || 60 })}
                min={1}
                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
              />
              <p className="text-text-muted font-mono text-xs mt-2">
                Time between buy operations
              </p>
            </div>
            <div>
              <label className="block text-text-secondary font-mono text-sm mb-2">
                Slippage Tolerance (bps)
              </label>
              <input
                type="number"
                value={config.slippage_bps}
                onChange={(e) => setConfig({ ...config, slippage_bps: parseInt(e.target.value) || 500 })}
                min={1}
                max={5000}
                className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
              />
              <p className="text-text-muted font-mono text-xs mt-2">
                500 bps = 5% slippage
              </p>
            </div>
          </div>
        </motion.div>

        {/* Manual Trading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.27 }}
          className="card-glow bg-bg-card p-6"
        >
          <h2 className="font-display text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <span className="text-accent-primary">◎</span>
            Manual Trading
          </h2>

          <p className="text-text-muted font-mono text-sm mb-4">
            Manually sell tokens from the Ops Wallet. Requires wallet signature.
          </p>

          {/* Sell Buttons */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {([25, 50, 100] as const).map((pct) => (
              <button
                key={pct}
                onClick={() => handleManualSell(pct)}
                disabled={isSelling}
                className={`
                  p-4 rounded-lg font-mono font-semibold border transition-all
                  ${isSelling
                    ? 'bg-bg-secondary text-text-muted border-border-subtle cursor-not-allowed opacity-50'
                    : 'bg-error/10 text-error border-error/30 hover:bg-error/20 hover:border-error/50'
                  }
                `}
              >
                {isSelling ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </span>
                ) : (
                  <>
                    <div className="text-lg">SELL {pct}%</div>
                    <div className="text-xs mt-1 opacity-70">of tokens</div>
                  </>
                )}
              </button>
            ))}
          </div>

          {/* Sell Message */}
          {sellMessage && (
            <div className={`p-3 rounded-lg font-mono text-sm ${
              sellMessage.type === 'success'
                ? 'bg-success/20 text-success border border-success/30'
                : 'bg-error/20 text-error border border-error/30'
            }`}>
              {sellMessage.text}
            </div>
          )}

          <p className="text-text-muted font-mono text-xs mt-4 p-3 bg-bg-secondary rounded-lg">
            Warning: Manual sells bypass the algorithm's market analysis. Use with caution.
          </p>
        </motion.div>

        {/* Advanced Algorithm Settings */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card-glow bg-bg-card p-6"
        >
          <h2 className="font-display text-lg font-semibold text-text-primary mb-6 flex items-center gap-2">
            <span className="text-accent-primary">◎</span>
            Algorithm Settings
          </h2>

          {/* Algorithm Mode Selector */}
          <div className="mb-6">
            <label className="block text-text-secondary font-mono text-sm mb-2">
              Algorithm Mode
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['simple', 'smart', 'rebalance'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setConfig({ ...config, algorithm_mode: mode })}
                  className={`p-3 rounded-lg font-mono text-sm border transition-all ${
                    config.algorithm_mode === mode
                      ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/50'
                      : 'bg-bg-secondary text-text-secondary border-border-subtle hover:border-text-muted'
                  }`}
                >
                  <div className="font-semibold capitalize">{mode}</div>
                  <div className="text-xs mt-1 text-text-muted">
                    {mode === 'simple' && 'Basic threshold'}
                    {mode === 'smart' && 'RSI + trends'}
                    {mode === 'rebalance' && 'Portfolio balance'}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-text-muted font-mono text-xs mt-2">
              {config.algorithm_mode === 'simple' && 'Simple: Buys when SOL balance exceeds threshold, basic percentage trades'}
              {config.algorithm_mode === 'smart' && 'Smart: Uses price trend analysis, RSI, and confidence scoring'}
              {config.algorithm_mode === 'rebalance' && 'Rebalance: Maintains target SOL/token allocation percentages'}
            </p>
          </div>

          {/* Portfolio Allocation (for rebalance mode) */}
          {config.algorithm_mode === 'rebalance' && (
            <div className="mb-6 p-4 bg-bg-secondary/50 rounded-lg border border-border-subtle">
              <h3 className="font-mono text-sm font-semibold text-text-primary mb-4">Target Allocation</h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-text-secondary font-mono text-sm mb-2">
                    SOL Allocation (%)
                  </label>
                  <input
                    type="number"
                    value={config.target_sol_allocation}
                    onChange={(e) => {
                      const solPct = Math.min(100, Math.max(0, parseInt(e.target.value) || 30))
                      setConfig({ ...config, target_sol_allocation: solPct, target_token_allocation: 100 - solPct })
                    }}
                    min={0}
                    max={100}
                    className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-text-secondary font-mono text-sm mb-2">
                    Token Allocation (%)
                  </label>
                  <input
                    type="number"
                    value={config.target_token_allocation}
                    onChange={(e) => {
                      const tokenPct = Math.min(100, Math.max(0, parseInt(e.target.value) || 70))
                      setConfig({ ...config, target_token_allocation: tokenPct, target_sol_allocation: 100 - tokenPct })
                    }}
                    min={0}
                    max={100}
                    className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-text-secondary font-mono text-sm mb-2">
                  Rebalance Threshold (%)
                </label>
                <input
                  type="number"
                  value={config.rebalance_threshold}
                  onChange={(e) => setConfig({ ...config, rebalance_threshold: parseInt(e.target.value) || 10 })}
                  min={1}
                  max={50}
                  className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
                />
                <p className="text-text-muted font-mono text-xs mt-2">
                  Triggers rebalance when allocation deviates by this %
                </p>
              </div>
            </div>
          )}

          {/* TWAP Settings */}
          <div className="p-4 bg-bg-secondary/50 rounded-lg border border-border-subtle">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-mono text-sm font-semibold text-text-primary">TWAP Execution</h3>
                <p className="text-text-muted font-mono text-xs mt-1">
                  Split large orders over time to reduce price impact
                </p>
              </div>
              <button
                onClick={() => setConfig({ ...config, use_twap: !config.use_twap })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  config.use_twap ? 'bg-success' : 'bg-bg-card'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    config.use_twap ? 'left-6' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            {config.use_twap && (
              <div>
                <label className="block text-text-secondary font-mono text-sm mb-2">
                  TWAP Threshold (USD)
                </label>
                <input
                  type="number"
                  value={config.twap_threshold_usd}
                  onChange={(e) => setConfig({ ...config, twap_threshold_usd: parseFloat(e.target.value) || 50 })}
                  min={1}
                  className="w-full bg-bg-secondary border border-border-subtle rounded-lg px-4 py-3 font-mono text-sm text-text-primary focus:outline-none focus:border-accent-primary transition-colors"
                />
                <p className="text-text-muted font-mono text-xs mt-2">
                  Orders above this value will use TWAP execution
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Message */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-lg font-mono text-sm ${
              message.type === 'success'
                ? 'bg-success/20 text-success border border-success/30'
                : 'bg-error/20 text-error border border-error/30'
            }`}
          >
            {message.text}
          </motion.div>
        )}

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={saveConfig}
            disabled={isSaving}
            className="w-full btn btn-primary py-4 text-base disabled:opacity-50 disabled:cursor-not-allowed"
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
              'Save All Configuration'
            )}
          </button>
        </motion.div>

        {/* Back to Dashboard */}
        <div className="text-center pb-8">
          <a
            href="/"
            className="text-text-muted hover:text-accent-primary font-mono text-sm transition-colors"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
