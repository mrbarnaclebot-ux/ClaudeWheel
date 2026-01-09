// ═══════════════════════════════════════════════════════════════════════════
// STANDARDIZED ERROR TYPES
// Custom error classes for consistent error handling across the application
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base application error with code, status, and context
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
    }
  }
}

/**
 * Validation error for invalid input data
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, context)
    this.name = 'ValidationError'
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      `${resource} not found${id ? `: ${id}` : ''}`,
      'NOT_FOUND',
      404,
      { resource, id }
    )
    this.name = 'NotFoundError'
  }
}

/**
 * Authentication error for invalid credentials or tokens
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required', context?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', 401, context)
    this.name = 'AuthenticationError'
  }
}

/**
 * Authorization error for insufficient permissions
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions', context?: Record<string, unknown>) {
    super(message, 'AUTHORIZATION_ERROR', 403, context)
    this.name = 'AuthorizationError'
  }
}

/**
 * Blockchain/Solana error for transaction failures
 */
export class BlockchainError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'BLOCKCHAIN_ERROR', 500, context)
    this.name = 'BlockchainError'
  }
}

/**
 * External service error (API calls, database, etc.)
 */
export class ExternalServiceError extends AppError {
  constructor(
    service: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(
      `${service}: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      { service, ...context }
    )
    this.name = 'ExternalServiceError'
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'RATE_LIMIT_ERROR', 429, { retryAfter, ...context })
    this.name = 'RateLimitError'
  }
}

/**
 * Configuration error for missing or invalid config
 */
export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIGURATION_ERROR', 500, context)
    this.name = 'ConfigurationError'
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT TYPE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Success result wrapper
 */
export interface SuccessResult<T> {
  success: true
  data: T
}

/**
 * Failure result wrapper
 */
export interface FailureResult {
  success: false
  error: AppError
}

/**
 * Result type for operations that can fail
 * Provides consistent error handling without exceptions
 */
export type Result<T> = SuccessResult<T> | FailureResult

/**
 * Create a success result
 */
export function success<T>(data: T): SuccessResult<T> {
  return { success: true, data }
}

/**
 * Create a failure result
 */
export function failure(error: AppError): FailureResult {
  return { success: false, error }
}

/**
 * Create a failure result from a generic error
 */
export function failureFrom(error: unknown, code: string = 'UNKNOWN_ERROR'): FailureResult {
  if (error instanceof AppError) {
    return { success: false, error }
  }

  const message = error instanceof Error ? error.message : String(error)
  return { success: false, error: new AppError(message, code) }
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * Check if error is a specific error type
 */
export function isErrorCode(error: unknown, code: string): boolean {
  return isAppError(error) && error.code === code
}

/**
 * Check if result is successful
 */
export function isSuccess<T>(result: Result<T>): result is SuccessResult<T> {
  return result.success === true
}

/**
 * Check if result is a failure
 */
export function isFailure<T>(result: Result<T>): result is FailureResult {
  return result.success === false
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * Extract error code from unknown error
 */
export function getErrorCode(error: unknown): string {
  if (isAppError(error)) {
    return error.code
  }
  return 'UNKNOWN_ERROR'
}

/**
 * Wrap a function to return Result<T> instead of throwing
 */
export async function wrapAsync<T>(
  fn: () => Promise<T>,
  errorCode: string = 'UNKNOWN_ERROR'
): Promise<Result<T>> {
  try {
    const data = await fn()
    return success(data)
  } catch (error) {
    return failureFrom(error, errorCode)
  }
}
