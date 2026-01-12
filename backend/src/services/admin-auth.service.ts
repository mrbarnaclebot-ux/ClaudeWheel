import { Request, Response, NextFunction } from 'express'
import { prisma, isPrismaConfigured } from '../config/prisma'
import { privyService } from './privy.service'
import { loggers } from '../utils/logger'

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN AUTH SERVICE
// Handles Privy-based admin authentication and role-based access control
// Part of Supabase to Render migration (Section 8 of migration.md)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type AdminRoleType = 'super_admin' | 'admin' | 'viewer'

export interface AdminRole {
  id: string
  privyUserId: string
  role: AdminRoleType
  permissions: string[]
  createdAt: Date
  updatedAt: Date
}

// Extend Request type with admin info
export interface AdminRequest extends Request {
  privyUserId?: string
  adminRole?: AdminRoleType
  adminPermissions?: string[]
}

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Admin permission definitions
 * - super_admin: All permissions (wildcard)
 * - admin: Can view, trigger jobs, and update configuration
 * - viewer: Read-only access
 */
const ADMIN_PERMISSIONS: Record<AdminRoleType, string[]> = {
  super_admin: ['*'],
  admin: ['view', 'trigger_jobs', 'update_config'],
  viewer: ['view'],
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN AUTH SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class AdminAuthService {
  /**
   * Check if a user has any admin role
   */
  async isAdmin(privyUserId: string): Promise<boolean> {
    if (!isPrismaConfigured()) {
      loggers.auth.error('Prisma not configured')
      return false
    }

    try {
      // Note: AdminRole model must be added to Prisma schema per migration.md Section 3.1
      const adminRole = await (prisma as any).adminRole?.findUnique({
        where: { privyUserId },
      })
      return !!adminRole
    } catch (error) {
      loggers.auth.error({ error: String(error), privyUserId }, 'Failed to check admin status')
      return false
    }
  }

  /**
   * Get user's admin role
   */
  async getRole(privyUserId: string): Promise<AdminRole | null> {
    if (!isPrismaConfigured()) {
      loggers.auth.error('Prisma not configured')
      return null
    }

    try {
      // Note: AdminRole model must be added to Prisma schema per migration.md Section 3.1
      const adminRole = await (prisma as any).adminRole?.findUnique({
        where: { privyUserId },
      })

      if (!adminRole) return null

      return {
        id: adminRole.id,
        privyUserId: adminRole.privyUserId,
        role: adminRole.role as AdminRoleType,
        permissions: Array.isArray(adminRole.permissions) ? adminRole.permissions : [],
        createdAt: adminRole.createdAt,
        updatedAt: adminRole.updatedAt,
      }
    } catch (error) {
      loggers.auth.error({ error: String(error), privyUserId }, 'Failed to get admin role')
      return null
    }
  }

  /**
   * Check if user has a specific permission
   * Super admins have all permissions (wildcard)
   */
  async hasPermission(privyUserId: string, permission: string): Promise<boolean> {
    const role = await this.getRole(privyUserId)
    if (!role) return false

    const rolePermissions = ADMIN_PERMISSIONS[role.role] || []

    // Super admin has wildcard permission
    if (rolePermissions.includes('*')) return true

    // Check specific permission
    return rolePermissions.includes(permission)
  }

  /**
   * Require a specific role, throw error if user doesn't have it
   */
  async requireRole(privyUserId: string, requiredRole: AdminRoleType): Promise<void> {
    const role = await this.getRole(privyUserId)

    if (!role) {
      throw new Error('User is not an admin')
    }

    // Define role hierarchy: super_admin > admin > viewer
    const roleHierarchy: Record<AdminRoleType, number> = {
      super_admin: 3,
      admin: 2,
      viewer: 1,
    }

    if (roleHierarchy[role.role] < roleHierarchy[requiredRole]) {
      throw new Error(`Insufficient permissions. Required role: ${requiredRole}, user role: ${role.role}`)
    }
  }

  /**
   * Add admin role to a user
   */
  async addAdmin(privyUserId: string, role: AdminRoleType): Promise<AdminRole> {
    if (!isPrismaConfigured()) {
      throw new Error('Prisma not configured')
    }

    try {
      // Note: AdminRole model must be added to Prisma schema per migration.md Section 3.1
      const adminRole = await (prisma as any).adminRole?.create({
        data: {
          privyUserId,
          role,
          permissions: ADMIN_PERMISSIONS[role] || [],
        },
      })

      loggers.auth.info({ privyUserId, role }, 'Added admin role')

      return {
        id: adminRole.id,
        privyUserId: adminRole.privyUserId,
        role: adminRole.role as AdminRoleType,
        permissions: Array.isArray(adminRole.permissions) ? adminRole.permissions : [],
        createdAt: adminRole.createdAt,
        updatedAt: adminRole.updatedAt,
      }
    } catch (error) {
      loggers.auth.error({ error: String(error), privyUserId, role }, 'Failed to add admin role')
      throw new Error(`Failed to add admin role: ${error}`)
    }
  }

  /**
   * Remove admin role from a user
   */
  async removeAdmin(privyUserId: string): Promise<void> {
    if (!isPrismaConfigured()) {
      throw new Error('Prisma not configured')
    }

    try {
      // Note: AdminRole model must be added to Prisma schema per migration.md Section 3.1
      await (prisma as any).adminRole?.delete({
        where: { privyUserId },
      })

      loggers.auth.info({ privyUserId }, 'Removed admin role')
    } catch (error) {
      loggers.auth.error({ error: String(error), privyUserId }, 'Failed to remove admin role')
      throw new Error(`Failed to remove admin role: ${error}`)
    }
  }

  /**
   * Update admin role
   */
  async updateRole(privyUserId: string, newRole: AdminRoleType): Promise<AdminRole> {
    if (!isPrismaConfigured()) {
      throw new Error('Prisma not configured')
    }

    try {
      // Note: AdminRole model must be added to Prisma schema per migration.md Section 3.1
      const adminRole = await (prisma as any).adminRole?.update({
        where: { privyUserId },
        data: {
          role: newRole,
          permissions: ADMIN_PERMISSIONS[newRole] || [],
        },
      })

      loggers.auth.info({ privyUserId, newRole }, 'Updated admin role')

      return {
        id: adminRole.id,
        privyUserId: adminRole.privyUserId,
        role: adminRole.role as AdminRoleType,
        permissions: Array.isArray(adminRole.permissions) ? adminRole.permissions : [],
        createdAt: adminRole.createdAt,
        updatedAt: adminRole.updatedAt,
      }
    } catch (error) {
      loggers.auth.error({ error: String(error), privyUserId, newRole }, 'Failed to update admin role')
      throw new Error(`Failed to update admin role: ${error}`)
    }
  }

  /**
   * List all admins
   */
  async listAdmins(): Promise<AdminRole[]> {
    if (!isPrismaConfigured()) {
      throw new Error('Prisma not configured')
    }

    try {
      // Note: AdminRole model must be added to Prisma schema per migration.md Section 3.1
      const admins = await (prisma as any).adminRole?.findMany({
        orderBy: { createdAt: 'asc' },
      })

      return (admins || []).map((admin: any) => ({
        id: admin.id,
        privyUserId: admin.privyUserId,
        role: admin.role as AdminRoleType,
        permissions: Array.isArray(admin.permissions) ? admin.permissions : [],
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
      }))
    } catch (error) {
      loggers.auth.error({ error: String(error) }, 'Failed to list admins')
      throw new Error(`Failed to list admins: ${error}`)
    }
  }

  /**
   * Get permission list for a role
   */
  getPermissionsForRole(role: AdminRoleType): string[] {
    return ADMIN_PERMISSIONS[role] || []
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const adminAuthService = new AdminAuthService()

// ═══════════════════════════════════════════════════════════════════════════
// EXPRESS MIDDLEWARE FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Middleware to verify Privy JWT and check admin role
 * Attaches privyUserId, adminRole, and adminPermissions to request
 */
export async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    // Check if Privy is configured
    if (!privyService.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Privy is not configured',
      })
    }

    // Extract Bearer token
    const authHeader = req.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing auth token. Expected: Authorization: Bearer <token>',
      })
    }

    const token = authHeader.substring(7)

    // Verify Privy JWT
    const { valid, userId } = await privyService.verifyAuthToken(token)
    if (!valid || !userId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired auth token',
      })
    }

    // Check admin role
    const adminRole = await adminAuthService.getRole(userId)
    if (!adminRole) {
      loggers.auth.warn({ privyUserId: userId }, 'Non-admin attempted to access admin endpoint')
      return res.status(403).json({
        success: false,
        error: 'Not authorized. Admin role required.',
      })
    }

    // Attach admin info to request
    req.privyUserId = userId
    req.adminRole = adminRole.role
    req.adminPermissions = ADMIN_PERMISSIONS[adminRole.role] || []

    loggers.auth.debug({ privyUserId: userId, role: adminRole.role }, 'Admin authenticated')
    next()
  } catch (error) {
    loggers.auth.error({ error: String(error) }, 'Admin auth middleware error')
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
    })
  }
}

/**
 * Middleware factory to check specific permission
 * Must be used after requireAdmin middleware
 */
export function requirePermission(permission: string) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    const permissions = req.adminPermissions || []

    // Super admin has wildcard permission
    if (permissions.includes('*')) {
      return next()
    }

    // Check specific permission
    if (!permissions.includes(permission)) {
      loggers.auth.warn(
        { privyUserId: req.privyUserId, requiredPermission: permission, userPermissions: permissions },
        'Insufficient permissions'
      )
      return res.status(403).json({
        success: false,
        error: `Insufficient permissions. Required: ${permission}`,
      })
    }

    next()
  }
}

/**
 * Middleware factory to require specific role or higher
 * Must be used after requireAdmin middleware
 */
export function requireRole(role: AdminRoleType) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    const userRole = req.adminRole

    if (!userRole) {
      return res.status(403).json({
        success: false,
        error: 'Admin role required',
      })
    }

    // Define role hierarchy: super_admin > admin > viewer
    const roleHierarchy: Record<AdminRoleType, number> = {
      super_admin: 3,
      admin: 2,
      viewer: 1,
    }

    if (roleHierarchy[userRole] < roleHierarchy[role]) {
      loggers.auth.warn(
        { privyUserId: req.privyUserId, requiredRole: role, userRole },
        'Insufficient role'
      )
      return res.status(403).json({
        success: false,
        error: `Insufficient role. Required: ${role}, your role: ${userRole}`,
      })
    }

    next()
  }
}
