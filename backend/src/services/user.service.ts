import { supabase } from '../config/database'
import crypto from 'crypto'

// ═══════════════════════════════════════════════════════════════════════════
// USER SERVICE
// Handles user registration, authentication, and management
// ═══════════════════════════════════════════════════════════════════════════

export interface User {
  id: string
  wallet_address: string
  display_name: string | null
  email: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AuthNonce {
  nonce: string
  message: string
  timestamp: number
  expiresAt: number
}

// In-memory nonce storage (expires after 5 minutes)
const pendingNonces = new Map<string, AuthNonce>()
const NONCE_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Generate a nonce message for wallet signature verification
 */
export function generateAuthNonce(walletAddress: string): AuthNonce {
  const nonce = crypto.randomBytes(32).toString('hex')
  const timestamp = Date.now()
  const expiresAt = timestamp + NONCE_EXPIRY_MS

  const message = `ClaudeWheel Authentication

Sign this message to verify wallet ownership.

Wallet: ${walletAddress}
Nonce: ${nonce}
Timestamp: ${timestamp}

This signature will not trigger any blockchain transaction or cost any gas fees.`

  const authNonce: AuthNonce = {
    nonce,
    message,
    timestamp,
    expiresAt,
  }

  // Store nonce for verification
  pendingNonces.set(walletAddress.toLowerCase(), authNonce)

  // Clean up expired nonces periodically
  cleanupExpiredNonces()

  return authNonce
}

/**
 * Verify a signed nonce and return the nonce data if valid
 */
export function verifyNonce(walletAddress: string): AuthNonce | null {
  const normalizedAddress = walletAddress.toLowerCase()
  const authNonce = pendingNonces.get(normalizedAddress)

  if (!authNonce) {
    return null
  }

  // Check if expired
  if (Date.now() > authNonce.expiresAt) {
    pendingNonces.delete(normalizedAddress)
    return null
  }

  return authNonce
}

/**
 * Consume a nonce after successful verification
 */
export function consumeNonce(walletAddress: string): void {
  pendingNonces.delete(walletAddress.toLowerCase())
}

/**
 * Clean up expired nonces
 */
function cleanupExpiredNonces(): void {
  const now = Date.now()
  for (const [address, nonce] of pendingNonces.entries()) {
    if (now > nonce.expiresAt) {
      pendingNonces.delete(address)
    }
  }
}

/**
 * Create a new user or return existing user
 */
export async function createOrGetUser(walletAddress: string): Promise<User | null> {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured - cannot create user')
    return null
  }

  // First, try to get existing user
  const existingUser = await getUserByWallet(walletAddress)
  if (existingUser) {
    return existingUser
  }

  // Create new user
  const { data, error } = await supabase
    .from('users')
    .insert([{
      wallet_address: walletAddress,
      is_active: true,
    }])
    .select()
    .single()

  if (error) {
    console.error('❌ Failed to create user:', error)
    return null
  }

  console.log(`✅ Created new user: ${walletAddress}`)
  return data as User
}

/**
 * Get user by wallet address
 */
export async function getUserByWallet(walletAddress: string): Promise<User | null> {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured')
    return null
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') { // Not found error
      console.error('❌ Failed to get user:', error)
    }
    return null
  }

  return data as User
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<User | null> {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured')
    return null
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('❌ Failed to get user by ID:', error)
    }
    return null
  }

  return data as User
}

/**
 * Update user profile
 */
export async function updateUser(
  userId: string,
  updates: Partial<Pick<User, 'display_name' | 'email' | 'is_active'>>
): Promise<User | null> {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured')
    return null
  }

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    console.error('❌ Failed to update user:', error)
    return null
  }

  return data as User
}

/**
 * Deactivate a user (soft delete)
 */
export async function deactivateUser(userId: string): Promise<boolean> {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured')
    return false
  }

  const { error } = await supabase
    .from('users')
    .update({ is_active: false })
    .eq('id', userId)

  if (error) {
    console.error('❌ Failed to deactivate user:', error)
    return false
  }

  return true
}

/**
 * Get all active users (for batch operations)
 */
export async function getAllActiveUsers(): Promise<User[]> {
  if (!supabase) {
    console.warn('⚠️ Supabase not configured')
    return []
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true)

  if (error) {
    console.error('❌ Failed to get active users:', error)
    return []
  }

  return data as User[]
}

/**
 * Get user count
 */
export async function getUserCount(): Promise<number> {
  if (!supabase) {
    return 0
  }

  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  if (error) {
    console.error('❌ Failed to count users:', error)
    return 0
  }

  return count || 0
}
