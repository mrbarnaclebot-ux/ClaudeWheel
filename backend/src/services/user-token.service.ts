import { supabase } from '../config/database'
import { encrypt, decrypt, validateEncryptedKey, EncryptedData } from './encryption.service'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { loggers } from '../utils/logger'

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
  // Trading route: 'bags' (bonding curve), 'jupiter' (graduated), 'auto' (detect)
  trading_route: 'bags' | 'jupiter' | 'auto'
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
  // Failure tracking
  consecutive_failures: number
  last_failure_reason: string | null
  last_failure_at: string | null
  paused_until: string | null
  total_failures: number
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
  trading_route: 'auto',
}

const DEFAULT_FLYWHEEL_STATE: Omit<UserFlywheelState, 'id' | 'user_token_id' | 'updated_at'> = {
  cycle_phase: 'buy',
  buy_count: 0,
  sell_count: 0,
  sell_phase_token_snapshot: 0,
  sell_amount_per_tx: 0,
  last_trade_at: null,
  // Failure tracking
  consecutive_failures: 0,
  last_failure_reason: null,
  last_failure_at: null,
  paused_until: null,
  total_failures: 0,
}

/**
 * Register a new token for a user
 * Encrypts and stores both dev and ops wallet private keys
 */
export async function registerToken(params: RegisterTokenParams): Promise<UserToken | null> {
  if (!supabase) {
    loggers.user.warn('Supabase not configured')
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
      loggers.user.error('Invalid dev wallet private key format')
      throw new Error('Invalid dev wallet private key format. Must be Base58 encoded.')
    }

    // Validate the ops wallet private key and derive the wallet address
    let opsWalletAddress: string
    try {
      const secretKey = bs58.decode(params.opsWalletPrivateKey)
      const keypair = Keypair.fromSecretKey(secretKey)
      opsWalletAddress = keypair.publicKey.toString()
    } catch (error) {
      loggers.user.error('Invalid ops wallet private key format')
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
        dev_encryption_iv: encryptedDevKey.iv,
        dev_encryption_auth_tag: encryptedDevKey.authTag,
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
      loggers.user.error({ error: tokenError.message }, 'Failed to register token')
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
      loggers.user.error({ error: configError.message, tokenId: userToken.id }, 'Failed to create token config')
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
      loggers.user.error({ error: stateError.message, tokenId: userToken.id }, 'Failed to create flywheel state')
      // Clean up token and config if state creation fails
      await supabase.from('user_token_config').delete().eq('user_token_id', userToken.id)
      await supabase.from('user_tokens').delete().eq('id', userToken.id)
      throw new Error('Failed to create flywheel state')
    }

    // Note: Fee stats are tracked via user_claim_history table
    // Aggregates can be computed from claim history when needed

    loggers.user.info({ tokenSymbol: params.tokenSymbol, userId: params.userId }, 'Registered token')

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
    loggers.user.error({ error: String(error) }, 'Token registration failed')
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
    loggers.user.error({ error: error.message, userId }, 'Failed to get user tokens')
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
      loggers.user.error({ error: error.message, userTokenId }, 'Failed to get user token')
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
      loggers.user.error({ error: error.message, userId, tokenMintAddress }, 'Failed to get user token by mint')
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
    .select('dev_wallet_private_key_encrypted, dev_encryption_iv, dev_encryption_auth_tag')
    .eq('id', userTokenId)
    .single()

  if (error) {
    loggers.user.error({ error: error.message, userTokenId }, 'Failed to get encrypted key')
    return null
  }

  try {
    const decryptedKey = decrypt({
      ciphertext: data.dev_wallet_private_key_encrypted,
      iv: data.dev_encryption_iv,
      authTag: data.dev_encryption_auth_tag,
    })

    const secretKey = bs58.decode(decryptedKey)
    return Keypair.fromSecretKey(secretKey)
  } catch (error) {
    loggers.user.error({ error: String(error), userTokenId }, 'Failed to decrypt dev wallet')
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
    loggers.user.error({ error: error.message, userTokenId }, 'Failed to get encrypted ops key')
    return null
  }

  // Check if ops wallet key exists
  if (!data.ops_wallet_private_key_encrypted) {
    loggers.user.warn({ userTokenId }, 'Ops wallet private key not configured for token')
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
    loggers.user.error({ error: String(error), userTokenId }, 'Failed to decrypt ops wallet')
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
      loggers.user.error({ error: error.message, userTokenId }, 'Failed to get token config')
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
    loggers.user.error({ error: error.message, userTokenId }, 'Failed to update token config')
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
      loggers.user.error({ error: error.message, userTokenId }, 'Failed to get flywheel state')
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
    consecutive_failures: Number(data.consecutive_failures) || 0,
    total_failures: Number(data.total_failures) || 0,
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
    loggers.user.error({ error: error.message, userTokenId }, 'Failed to update flywheel state')
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
    loggers.user.error({ error: error.message }, 'Failed to get active user tokens')
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
    loggers.user.error({ error: error.message }, 'Failed to get tokens for auto-claim')
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
    loggers.user.error({ error: error.message }, 'Failed to get tokens for flywheel')
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
    loggers.user.error({ error: error.message, userTokenId }, 'Failed to deactivate token')
    return false
  }

  loggers.user.info({ userTokenId }, 'Deactivated token')
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
    loggers.user.error({ error: error.message, userTokenId, isGraduated }, 'Failed to update graduation status')
    return false
  }

  return true
}

/**
 * Check if a token exists but is suspended (is_active = false)
 * Returns the suspended token data if found, null otherwise
 */
export async function getSuspendedTokenByMint(tokenMintAddress: string): Promise<{
  id: string
  token_symbol: string
  token_name: string | null
  dev_wallet_address: string
  ops_wallet_address: string
  telegram_user_id: string | null
  user_id: string | null
} | null> {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase
    .from('user_tokens')
    .select('id, token_symbol, token_name, dev_wallet_address, ops_wallet_address, telegram_user_id, user_id')
    .eq('token_mint_address', tokenMintAddress)
    .eq('is_active', false)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      loggers.user.error({ error: error.message, tokenMintAddress }, 'Failed to check for suspended token')
    }
    return null
  }

  return data
}

/**
 * Verify that provided private keys match the stored encrypted keys for a suspended token
 * This is used to verify ownership before reactivating a suspended token
 *
 * @param userTokenId The ID of the suspended token
 * @param devPrivateKey The dev wallet private key (base58)
 * @param opsPrivateKey The ops wallet private key (base58)
 * @returns Object with verification result and any error message
 */
export async function verifySuspendedTokenOwnership(
  userTokenId: string,
  devPrivateKey: string,
  opsPrivateKey: string
): Promise<{ verified: boolean; error?: string }> {
  if (!supabase) {
    return { verified: false, error: 'Database not configured' }
  }

  try {
    // Get the encrypted keys and wallet addresses from the suspended token
    const { data, error } = await supabase
      .from('user_tokens')
      .select(`
        dev_wallet_address,
        dev_wallet_private_key_encrypted,
        dev_encryption_iv,
        dev_encryption_auth_tag,
        ops_wallet_address,
        ops_wallet_private_key_encrypted,
        ops_encryption_iv,
        ops_encryption_auth_tag
      `)
      .eq('id', userTokenId)
      .eq('is_active', false)
      .single()

    if (error || !data) {
      return { verified: false, error: 'Token not found or not suspended' }
    }

    // Validate dev private key format and derive address
    let providedDevAddress: string
    try {
      const secretKey = bs58.decode(devPrivateKey)
      const keypair = Keypair.fromSecretKey(secretKey)
      providedDevAddress = keypair.publicKey.toString()
    } catch {
      return { verified: false, error: 'Invalid dev wallet private key format' }
    }

    // Check if provided dev key derives to the stored dev wallet address
    if (providedDevAddress !== data.dev_wallet_address) {
      return {
        verified: false,
        error: 'Dev wallet private key does not match the registered dev wallet address'
      }
    }

    // Validate ops private key format and derive address
    let providedOpsAddress: string
    try {
      const secretKey = bs58.decode(opsPrivateKey)
      const keypair = Keypair.fromSecretKey(secretKey)
      providedOpsAddress = keypair.publicKey.toString()
    } catch {
      return { verified: false, error: 'Invalid ops wallet private key format' }
    }

    // Check if provided ops key derives to the stored ops wallet address
    if (providedOpsAddress !== data.ops_wallet_address) {
      return {
        verified: false,
        error: 'Ops wallet private key does not match the registered ops wallet address'
      }
    }

    // Both keys verified - the user has proven ownership
    loggers.user.info({ userTokenId }, 'Ownership verified for suspended token')
    return { verified: true }
  } catch (error) {
    loggers.user.error({ error: String(error), userTokenId }, 'Error verifying suspended token ownership')
    return { verified: false, error: 'Verification failed due to an internal error' }
  }
}

/**
 * Reactivate a suspended token after ownership verification
 * Updates the encrypted keys with the newly provided ones (in case encryption changed)
 * and sets is_active to true
 *
 * @param userTokenId The ID of the suspended token
 * @param devPrivateKey The dev wallet private key (base58)
 * @param opsPrivateKey The ops wallet private key (base58)
 * @param newTelegramUserId Optional new telegram user ID (if reactivating from a different account)
 * @returns The reactivated token or null on failure
 */
export async function reactivateSuspendedToken(
  userTokenId: string,
  devPrivateKey: string,
  opsPrivateKey: string,
  newTelegramUserId?: string
): Promise<UserToken | null> {
  if (!supabase) {
    return null
  }

  try {
    // First verify ownership
    const verification = await verifySuspendedTokenOwnership(userTokenId, devPrivateKey, opsPrivateKey)
    if (!verification.verified) {
      loggers.user.error({ userTokenId, error: verification.error }, 'Reactivation failed - ownership not verified')
      return null
    }

    // Re-encrypt the keys with current encryption (in case master key changed)
    const encryptedDevKey = encrypt(devPrivateKey)
    const encryptedOpsKey = encrypt(opsPrivateKey)

    // Build update object
    const updateData: Record<string, unknown> = {
      is_active: true,
      dev_wallet_private_key_encrypted: encryptedDevKey.ciphertext,
      dev_encryption_iv: encryptedDevKey.iv,
      dev_encryption_auth_tag: encryptedDevKey.authTag,
      ops_wallet_private_key_encrypted: encryptedOpsKey.ciphertext,
      ops_encryption_iv: encryptedOpsKey.iv,
      ops_encryption_auth_tag: encryptedOpsKey.authTag,
    }

    // Update telegram_user_id if provided
    if (newTelegramUserId) {
      updateData.telegram_user_id = newTelegramUserId
    }

    // Reactivate the token with fresh encrypted keys
    const { data, error } = await supabase
      .from('user_tokens')
      .update(updateData)
      .eq('id', userTokenId)
      .select('id, user_id, token_mint_address, token_symbol, token_name, token_image, token_decimals, dev_wallet_address, ops_wallet_address, is_active, is_graduated, created_at, updated_at')
      .single()

    if (error) {
      loggers.user.error({ error: error.message, userTokenId }, 'Failed to reactivate token')
      return null
    }

    // Re-enable default config settings
    await supabase
      .from('user_token_config')
      .update({
        flywheel_active: false, // Start with flywheel off for safety
        auto_claim_enabled: true,
      })
      .eq('user_token_id', userTokenId)

    // Reset flywheel state
    await supabase
      .from('user_flywheel_state')
      .update({
        cycle_phase: 'buy',
        buy_count: 0,
        sell_count: 0,
        sell_phase_token_snapshot: 0,
        sell_amount_per_tx: 0,
      })
      .eq('user_token_id', userTokenId)

    loggers.user.info({ userTokenId }, 'Reactivated suspended token')
    return data as UserToken
  } catch (error) {
    loggers.user.error({ error: String(error), userTokenId }, 'Token reactivation failed')
    return null
  }
}
