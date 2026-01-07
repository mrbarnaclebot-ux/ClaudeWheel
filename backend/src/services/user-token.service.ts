import { supabase } from '../config/database'
import { encrypt, decrypt, validateEncryptedKey, EncryptedData } from './encryption.service'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

// ═══════════════════════════════════════════════════════════════════════════
// USER TOKEN SERVICE
// Handles token registration with encrypted dev wallet keys
// ═══════════════════════════════════════════════════════════════════════════

export interface UserToken {
  id: string
  user_id: string
  token_mint_address: string
  token_symbol: string
  token_name: string | null
  token_image: string | null
  token_decimals: number
  dev_wallet_address: string
  ops_wallet_address: string
  is_active: boolean
  is_graduated: boolean
  created_at: string
  updated_at: string
}

export interface UserTokenConfig {
  id: string
  user_token_id: string
  flywheel_active: boolean
  market_making_enabled: boolean
  auto_claim_enabled: boolean
  fee_threshold_sol: number
  min_buy_amount_sol: number
  max_buy_amount_sol: number
  max_sell_amount_tokens: number
  buy_interval_minutes: number
  slippage_bps: number
  algorithm_mode: 'simple' | 'smart' | 'rebalance'
  target_sol_allocation: number
  target_token_allocation: number
  rebalance_threshold: number
  use_twap: boolean
  twap_threshold_usd: number
  updated_at: string
}

export interface UserFlywheelState {
  id: string
  user_token_id: string
  cycle_phase: 'buy' | 'sell'
  buy_count: number
  sell_count: number
  sell_phase_token_snapshot: number
  sell_amount_per_tx: number
  last_trade_at: string | null
  updated_at: string
}

export interface RegisterTokenParams {
  userId: string
  tokenMintAddress: string
  tokenSymbol: string
  tokenName?: string
  tokenImage?: string
  tokenDecimals: number
  devWalletPrivateKey: string // Base58 encoded
  opsWalletPrivateKey: string // Base58 encoded - for automated market making
}

const DEFAULT_CONFIG: Omit<UserTokenConfig, 'id' | 'user_token_id' | 'updated_at'> = {
  flywheel_active: false,
  market_making_enabled: false,
  auto_claim_enabled: true,
  fee_threshold_sol: 0.01,
  min_buy_amount_sol: 0.01,
  max_buy_amount_sol: 0.1,
  max_sell_amount_tokens: 1000000,
  buy_interval_minutes: 5,
  slippage_bps: 300,
  algorithm_mode: 'simple',
  target_sol_allocation: 30,
  target_token_allocation: 70,
  rebalance_threshold: 10,
  use_twap: true,
  twap_threshold_usd: 50,
}

const DEFAULT_FLYWHEEL_STATE: Omit<UserFlywheelState, 'id' | 'user_token_id' | 'updated_at'> = {
  cycle_phase: 'buy',
  buy_count: 0,
  sell_count: 0,
  sell_phase_token_snapshot: 0,
  sell_amount_per_tx: 0,
  last_trade_at: null,
}

/**
 * Register a new token for a user
 * Encrypts and stores both dev and ops wallet private keys
 */
export async function registerToken(params: RegisterTokenParams): Promise<UserToken | null> {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured')
    return null
  }

  try {
    // Validate the dev wallet private key and derive the wallet address
    let devWalletAddress: string
    try {
      const secretKey = bs58.decode(params.devWalletPrivateKey)
      const keypair = Keypair.fromSecretKey(secretKey)
      devWalletAddress = keypair.publicKey.toString()
    } catch (error) {
      console.error('❌ Invalid dev wallet private key format')
      throw new Error('Invalid dev wallet private key format. Must be Base58 encoded.')
    }

    // Validate the ops wallet private key and derive the wallet address
    let opsWalletAddress: string
    try {
      const secretKey = bs58.decode(params.opsWalletPrivateKey)
      const keypair = Keypair.fromSecretKey(secretKey)
      opsWalletAddress = keypair.publicKey.toString()
    } catch (error) {
      console.error('❌ Invalid ops wallet private key format')
      throw new Error('Invalid ops wallet private key format. Must be Base58 encoded.')
    }

    // Encrypt the dev wallet private key
    const encryptedDevKey = encrypt(params.devWalletPrivateKey)

    // Encrypt the ops wallet private key
    const encryptedOpsKey = encrypt(params.opsWalletPrivateKey)

    // Check if user already has this token registered
    const existing = await getUserTokenByMint(params.userId, params.tokenMintAddress)
    if (existing) {
      throw new Error('Token already registered for this user')
    }

    // Insert the user token with both encrypted keys
    const { data: tokenData, error: tokenError } = await supabase
      .from('user_tokens')
      .insert([{
        user_id: params.userId,
        token_mint_address: params.tokenMintAddress,
        token_symbol: params.tokenSymbol,
        token_name: params.tokenName || null,
        token_image: params.tokenImage || null,
        token_decimals: params.tokenDecimals,
        dev_wallet_address: devWalletAddress,
        dev_wallet_private_key_encrypted: encryptedDevKey.ciphertext,
        encryption_iv: encryptedDevKey.iv,
        encryption_auth_tag: encryptedDevKey.authTag,
        ops_wallet_address: opsWalletAddress,
        ops_wallet_private_key_encrypted: encryptedOpsKey.ciphertext,
        ops_encryption_iv: encryptedOpsKey.iv,
        ops_encryption_auth_tag: encryptedOpsKey.authTag,
        is_active: true,
        is_graduated: false,
      }])
      .select()
      .single()

    if (tokenError) {
      console.error('❌ Failed to register token:', tokenError)
      throw new Error('Failed to register token: ' + tokenError.message)
    }

    const userToken = tokenData as UserToken & {
      dev_wallet_private_key_encrypted: string
      encryption_iv: string
      encryption_auth_tag: string
    }

    // Create default config for the token
    const { error: configError } = await supabase
      .from('user_token_config')
      .insert([{
        user_token_id: userToken.id,
        ...DEFAULT_CONFIG,
      }])

    if (configError) {
      console.error('❌ Failed to create token config:', configError)
      // Clean up the token if config creation fails
      await supabase.from('user_tokens').delete().eq('id', userToken.id)
      throw new Error('Failed to create token configuration')
    }

    // Create default flywheel state
    const { error: stateError } = await supabase
      .from('user_flywheel_state')
      .insert([{
        user_token_id: userToken.id,
        ...DEFAULT_FLYWHEEL_STATE,
      }])

    if (stateError) {
      console.error('⚠️ Failed to create flywheel state:', stateError)
      // Non-critical, continue
    }

    // Create default fee stats
    const { error: feeStatsError } = await supabase
      .from('user_fee_stats')
      .insert([{
        user_token_id: userToken.id,
        total_claimed_sol: 0,
        total_claimed_usd: 0,
        total_claims_count: 0,
      }])

    if (feeStatsError) {
      console.error('⚠️ Failed to create fee stats:', feeStatsError)
      // Non-critical, continue
    }

    console.log(`✅ Registered token ${params.tokenSymbol} for user ${params.userId}`)

    // Return without sensitive data
    return {
      id: userToken.id,
      user_id: userToken.user_id,
      token_mint_address: userToken.token_mint_address,
      token_symbol: userToken.token_symbol,
      token_name: userToken.token_name,
      token_image: userToken.token_image,
      token_decimals: userToken.token_decimals,
      dev_wallet_address: userToken.dev_wallet_address,
      ops_wallet_address: userToken.ops_wallet_address,
      is_active: userToken.is_active,
      is_graduated: userToken.is_graduated,
      created_at: userToken.created_at,
      updated_at: userToken.updated_at,
    }
  } catch (error) {
    console.error('❌ Token registration failed:', error)
    throw error
  }
}

/**
 * Get all tokens for a user
 */
export async function getUserTokens(userId: string): Promise<UserToken[]> {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('user_tokens')
    .select('id, user_id, token_mint_address, token_symbol, token_name, token_image, token_decimals, dev_wallet_address, ops_wallet_address, is_active, is_graduated, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Failed to get user tokens:', error)
    return []
  }

  return data as UserToken[]
}

/**
 * Get a specific user token by ID
 */
export async function getUserToken(userTokenId: string): Promise<UserToken | null> {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('user_tokens')
    .select('id, user_id, token_mint_address, token_symbol, token_name, token_image, token_decimals, dev_wallet_address, ops_wallet_address, is_active, is_graduated, created_at, updated_at')
    .eq('id', userTokenId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('❌ Failed to get user token:', error)
    }
    return null
  }

  return data as UserToken
}

/**
 * Get user token by mint address
 */
export async function getUserTokenByMint(userId: string, tokenMintAddress: string): Promise<UserToken | null> {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('user_tokens')
    .select('id, user_id, token_mint_address, token_symbol, token_name, token_image, token_decimals, dev_wallet_address, ops_wallet_address, is_active, is_graduated, created_at, updated_at')
    .eq('user_id', userId)
    .eq('token_mint_address', tokenMintAddress)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('❌ Failed to get user token by mint:', error)
    }
    return null
  }

  return data as UserToken
}

/**
 * Get decrypted dev wallet keypair for operations
 * SECURITY: Only call this when actively signing transactions (e.g., claiming fees)
 */
export async function getDecryptedDevWallet(userTokenId: string): Promise<Keypair | null> {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('user_tokens')
    .select('dev_wallet_private_key_encrypted, encryption_iv, encryption_auth_tag')
    .eq('id', userTokenId)
    .single()

  if (error) {
    console.error('❌ Failed to get encrypted key:', error)
    return null
  }

  try {
    const decryptedKey = decrypt({
      ciphertext: data.dev_wallet_private_key_encrypted,
      iv: data.encryption_iv,
      authTag: data.encryption_auth_tag,
    })

    const secretKey = bs58.decode(decryptedKey)
    return Keypair.fromSecretKey(secretKey)
  } catch (error) {
    console.error('❌ Failed to decrypt dev wallet:', error)
    return null
  }
}

/**
 * Get decrypted ops wallet keypair for market making trades
 * SECURITY: Only call this when actively signing transactions (e.g., buy/sell trades)
 */
export async function getDecryptedOpsWallet(userTokenId: string): Promise<Keypair | null> {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('user_tokens')
    .select('ops_wallet_private_key_encrypted, ops_encryption_iv, ops_encryption_auth_tag')
    .eq('id', userTokenId)
    .single()

  if (error) {
    console.error('❌ Failed to get encrypted ops key:', error)
    return null
  }

  // Check if ops wallet key exists
  if (!data.ops_wallet_private_key_encrypted) {
    console.warn('⚠️ Ops wallet private key not configured for token:', userTokenId)
    return null
  }

  try {
    const decryptedKey = decrypt({
      ciphertext: data.ops_wallet_private_key_encrypted,
      iv: data.ops_encryption_iv,
      authTag: data.ops_encryption_auth_tag,
    })

    const secretKey = bs58.decode(decryptedKey)
    return Keypair.fromSecretKey(secretKey)
  } catch (error) {
    console.error('❌ Failed to decrypt ops wallet:', error)
    return null
  }
}

/**
 * Get token config
 */
export async function getTokenConfig(userTokenId: string): Promise<UserTokenConfig | null> {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('user_token_config')
    .select('*')
    .eq('user_token_id', userTokenId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('❌ Failed to get token config:', error)
    }
    return null
  }

  return data as UserTokenConfig
}

/**
 * Update token config
 */
export async function updateTokenConfig(
  userTokenId: string,
  updates: Partial<Omit<UserTokenConfig, 'id' | 'user_token_id' | 'updated_at'>>
): Promise<UserTokenConfig | null> {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('user_token_config')
    .update(updates)
    .eq('user_token_id', userTokenId)
    .select()
    .single()

  if (error) {
    console.error('❌ Failed to update token config:', error)
    return null
  }

  return data as UserTokenConfig
}

/**
 * Get flywheel state for a token
 */
export async function getFlywheelState(userTokenId: string): Promise<UserFlywheelState | null> {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('user_flywheel_state')
    .select('*')
    .eq('user_token_id', userTokenId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('❌ Failed to get flywheel state:', error)
    }
    return null
  }

  // Convert numeric strings to numbers
  return {
    ...data,
    buy_count: Number(data.buy_count) || 0,
    sell_count: Number(data.sell_count) || 0,
    sell_phase_token_snapshot: Number(data.sell_phase_token_snapshot) || 0,
    sell_amount_per_tx: Number(data.sell_amount_per_tx) || 0,
  } as UserFlywheelState
}

/**
 * Update flywheel state
 */
export async function updateFlywheelState(
  userTokenId: string,
  updates: Partial<Omit<UserFlywheelState, 'id' | 'user_token_id' | 'updated_at'>>
): Promise<boolean> {
  if (!supabase) {
    return false
  }

  const { error } = await supabase
    .from('user_flywheel_state')
    .update(updates)
    .eq('user_token_id', userTokenId)

  if (error) {
    console.error('❌ Failed to update flywheel state:', error)
    return false
  }

  return true
}

/**
 * Get all active user tokens (for batch operations like claiming)
 */
export async function getAllActiveUserTokens(): Promise<(UserToken & { config: UserTokenConfig })[]> {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('user_tokens')
    .select(`
      id, user_id, token_mint_address, token_symbol, token_name, token_image,
      token_decimals, dev_wallet_address, ops_wallet_address, is_active, is_graduated,
      created_at, updated_at,
      user_token_config (*)
    `)
    .eq('is_active', true)

  if (error) {
    console.error('❌ Failed to get active user tokens:', error)
    return []
  }

  return data.map(item => ({
    ...item,
    config: item.user_token_config as unknown as UserTokenConfig,
  })) as (UserToken & { config: UserTokenConfig })[]
}

/**
 * Get active tokens with auto-claim enabled
 */
export async function getTokensForAutoClaim(): Promise<UserToken[]> {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('user_tokens')
    .select(`
      id, user_id, token_mint_address, token_symbol, token_name, token_image,
      token_decimals, dev_wallet_address, ops_wallet_address, is_active, is_graduated,
      created_at, updated_at,
      user_token_config!inner (auto_claim_enabled)
    `)
    .eq('is_active', true)
    .eq('user_token_config.auto_claim_enabled', true)

  if (error) {
    console.error('❌ Failed to get tokens for auto-claim:', error)
    return []
  }

  return data as UserToken[]
}

/**
 * Get active tokens with flywheel enabled
 */
export async function getTokensForFlywheel(): Promise<(UserToken & { config: UserTokenConfig })[]> {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('user_tokens')
    .select(`
      id, user_id, token_mint_address, token_symbol, token_name, token_image,
      token_decimals, dev_wallet_address, ops_wallet_address, is_active, is_graduated,
      created_at, updated_at,
      user_token_config!inner (*)
    `)
    .eq('is_active', true)
    .eq('user_token_config.flywheel_active', true)

  if (error) {
    console.error('❌ Failed to get tokens for flywheel:', error)
    return []
  }

  return data.map(item => ({
    ...item,
    config: item.user_token_config as unknown as UserTokenConfig,
  })) as (UserToken & { config: UserTokenConfig })[]
}

/**
 * Deactivate a user token (soft delete)
 */
export async function deactivateToken(userTokenId: string): Promise<boolean> {
  if (!supabase) {
    return false
  }

  // First disable all automation
  await updateTokenConfig(userTokenId, {
    flywheel_active: false,
    market_making_enabled: false,
    auto_claim_enabled: false,
  })

  // Then mark as inactive
  const { error } = await supabase
    .from('user_tokens')
    .update({ is_active: false })
    .eq('id', userTokenId)

  if (error) {
    console.error('❌ Failed to deactivate token:', error)
    return false
  }

  console.log(`✅ Deactivated token ${userTokenId}`)
  return true
}

/**
 * Update token graduation status
 */
export async function updateGraduationStatus(userTokenId: string, isGraduated: boolean): Promise<boolean> {
  if (!supabase) {
    return false
  }

  const { error } = await supabase
    .from('user_tokens')
    .update({ is_graduated: isGraduated })
    .eq('id', userTokenId)

  if (error) {
    console.error('❌ Failed to update graduation status:', error)
    return false
  }

  return true
}
