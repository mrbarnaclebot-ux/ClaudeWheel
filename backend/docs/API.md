# API Documentation

Complete API reference for the ClaudeWheel backend.

## Base URL

```
http://localhost:3000 (development)
https://your-domain.com (production)
```

## Authentication

Most endpoints require wallet-based authentication:

1. Request a nonce: `POST /api/auth/nonce`
2. Sign the nonce message with your wallet
3. Verify signature: `POST /api/auth/verify`
4. Include the JWT in subsequent requests: `Authorization: Bearer <token>`

---

## Public Endpoints

### GET /
Returns API information and available endpoints.

**Response:**
```json
{
  "name": "Claude Flywheel Backend",
  "version": "1.0.0",
  "status": "running",
  "endpoints": { ... }
}
```

### GET /api/status
Returns system status including wallet balances and configuration.

### GET /api/status/health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-08T12:00:00Z"
}
```

---

## Auth Endpoints

### POST /api/auth/nonce
Get a signing nonce for wallet authentication.

**Request Body:**
```json
{
  "walletAddress": "YourSolanaWalletAddress..."
}
```

**Response:**
```json
{
  "nonce": "random-nonce-string",
  "message": "Sign this message to authenticate..."
}
```

### POST /api/auth/verify
Verify wallet signature and get JWT token.

**Request Body:**
```json
{
  "walletAddress": "YourSolanaWalletAddress...",
  "signature": "base58-encoded-signature",
  "message": "The signed message"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt-token",
  "user": {
    "id": "uuid",
    "walletAddress": "...",
    "displayName": null
  }
}
```

### GET /api/auth/user
Get current authenticated user.

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "id": "uuid",
  "walletAddress": "...",
  "displayName": null,
  "createdAt": "2025-01-08T12:00:00Z"
}
```

---

## User Token Endpoints

All require authentication.

### GET /api/user/tokens
List all tokens registered by the authenticated user.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tokenMintAddress": "...",
      "tokenSymbol": "TOKEN",
      "isActive": true,
      "config": { ... },
      "balances": { ... }
    }
  ]
}
```

### POST /api/user/tokens
Register a new token for flywheel automation.

**Request Body:**
```json
{
  "tokenMintAddress": "...",
  "tokenSymbol": "TOKEN",
  "devWalletPrivateKey": "base58-encoded-private-key",
  "opsWalletPrivateKey": "base58-encoded-private-key"
}
```

### GET /api/user/tokens/:tokenId
Get details for a specific token.

### PUT /api/user/tokens/:tokenId/config
Update token flywheel configuration.

**Request Body:**
```json
{
  "flywheelActive": true,
  "marketMakingEnabled": true,
  "minBuyAmountSol": 0.01,
  "maxBuyAmountSol": 0.1,
  "slippageBps": 300
}
```

### GET /api/user/tokens/:tokenId/claimable
Get claimable fees for a token.

**Response:**
```json
{
  "success": true,
  "data": {
    "claimableSol": 0.5,
    "claimableUsd": 75.00
  }
}
```

### POST /api/user/tokens/:tokenId/claim
Claim pending fees.

**Response:**
```json
{
  "success": true,
  "data": {
    "claimedSol": 0.5,
    "userReceivedSol": 0.45,
    "platformFeeSol": 0.05,
    "signature": "tx-signature"
  }
}
```

### GET /api/user/tokens/:tokenId/claims
Get claim history for a token.

### POST /api/user/tokens/:tokenId/sell
Manually trigger a sell operation.

---

## Admin Endpoints

Require wallet signature from authorized admin wallet.

### GET /api/admin/platform-stats
Get platform-wide statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "users": { "total": 100 },
    "tokens": { "active": 50, "suspended": 2 },
    "jobs": {
      "fastClaim": { "running": true },
      "flywheel": { "running": true }
    }
  }
}
```

### POST /api/admin/fast-claim/trigger
Manually trigger a fast claim cycle.

### GET /api/admin/fast-claim/status
Get fast claim job status.

### POST /api/admin/balance-update/trigger
Manually trigger balance update for all tokens.

### GET /api/admin/claim-history
Get all claim history across users.

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50)

### GET /api/admin/pending-refunds
Get list of pending refunds.

### POST /api/admin/refund/:launchId
Execute a refund for a pending launch.

### GET /api/admin/audit-logs
Get platform audit logs.

---

## Bags.fm Endpoints

### GET /api/bags/token/:mint
Get token info from Bags.fm.

### GET /api/bags/fees/:mint
Get claimable fees for a token.

### GET /api/bags/claimable/:wallet
Get claimable fees for a wallet.

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common HTTP status codes:
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/expired token)
- `403` - Forbidden (not authorized for action)
- `404` - Not Found
- `500` - Internal Server Error

---

## Rate Limiting

- Public endpoints: 100 requests/minute
- Authenticated endpoints: 300 requests/minute
- Admin endpoints: 60 requests/minute

Rate limit headers:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
