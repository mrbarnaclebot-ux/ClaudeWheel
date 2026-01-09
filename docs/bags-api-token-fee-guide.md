# Bags API: Token Launch & Fee Claiming Guide

## Overview

The Bags API provides comprehensive functionality for launching tokens on the Solana blockchain and managing fee collection. This guide explains how to leverage the API to create tokens, configure fee sharing, and claim accumulated fees.

---

## Core Concepts

### What is the Bags API?

The Bags API is a REST-based service that allows you to:
- **Launch tokens** on Solana with custom metadata and initial configurations
- **Manage fee sharing** between multiple wallet addresses
- **Claim fees** from token operations and transactions
- **Retrieve analytics** about token performance and fee accumulation

### Authentication

All requests (except public analytics endpoints) require authentication via an API key included in the `Authorization` header:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
https://public-api-v2.bags.fm/api/v1/endpoint
```

**Note:** Each user can create up to 10 API keys from [dev.bags.fm](https://dev.bags.fm). Keep all keys secure and never share them publicly.

---

## Token Launch Workflow

### Step 1: Obtain an API Key

1. Visit [dev.bags.fm](https://dev.bags.fm)
2. Sign in to your account
3. Navigate to the **API Keys** section
4. Click **Create New API Key**

Store this key securely—you'll need it for all authenticated requests.

### Step 2: Prepare Token Metadata

Before launching a token, gather the following information:

- **Token Name**: Display name for your token
- **Token Symbol**: Short ticker symbol (e.g., "ABC")
- **Decimals**: Number of decimal places (typically 6 or 9 for Solana)
- **Total Supply**: Maximum number of tokens to create
- **Metadata**: Logo, description, and social links
- **Initial Distribution**: How tokens are allocated at launch

### Step 3: Call the Token Launch Endpoint

The Bags API provides a dedicated endpoint to create tokens on Solana. Your request should include:

- **API Key**: In the `Authorization: Bearer` header
- **Token Metadata**: Name, symbol, decimals, total supply
- **File Uploads**: Images and media files for token branding
- **Initial Configuration**: Fee structure and wallet addresses

**Example Request Structure:**

```bash
curl -X POST 'https://public-api-v2.bags.fm/api/v1/token/launch' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "My Token",
    "symbol": "MYTKN",
    "decimals": 6,
    "total_supply": 1000000,
    "metadata": {
      "logo": "https://example.com/logo.png",
      "description": "Description of your token"
    }
  }'
```

### Step 4: Handle the Response

The API returns a consistent response format:

**Success Response:**
```json
{
  "success": true,
  "response": {
    "token_mint": "ABC123...",
    "transaction_signature": "def456...",
    "created_at": "2025-01-08T12:00:00Z"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

The `token_mint` is your Solana token's unique identifier and will be needed for all subsequent operations.

---

## Fee Sharing Configuration

### Overview

The Bags API allows you to configure custom fee sharing between multiple wallet addresses. This enables you to automatically distribute transaction fees and platform earnings across your team or stakeholders.

### Setting Up Fee Sharing

When launching a token or updating fee configuration, you can specify:

- **Fee Recipients**: Wallet addresses that receive fees
- **Fee Percentages**: Allocation percentages for each recipient (must total 100%)
- **Fee Type**: Transaction fees, platform fees, or both

**Example Fee Configuration:**

```json
{
  "fee_sharing": {
    "enabled": true,
    "recipients": [
      {
        "wallet": "Wallet1Address...",
        "percentage": 50
      },
      {
        "wallet": "Wallet2Address...",
        "percentage": 30
      },
      {
        "wallet": "Wallet3Address...",
        "percentage": 20
      }
    ]
  }
}
```

### Best Practices for Fee Sharing

- Ensure all percentages sum to exactly 100%
- Use Base58-encoded Solana wallet addresses
- Test with small amounts before large-scale deployment
- Keep recipients' wallet addresses up to date
- Document your fee structure for transparency

---

## Fee Claiming

### Understanding Fee Accumulation

As your token operates on Solana, fees accumulate from:
- **Transaction fees**: Charged on token transfers
- **Launch fees**: Initial platform fees
- **Trading fees**: If enabled on DEX integrations
- **Custom fees**: Any fees defined in your token's configuration

### Checking Accumulated Fees

Before claiming fees, you can query your token's fee data:

**Example Request:**
```bash
curl -X GET 'https://public-api-v2.bags.fm/api/v1/token/{token_mint}/fees' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

**Response:**
```json
{
  "success": true,
  "response": {
    "token_mint": "ABC123...",
    "total_fees_accumulated": 5.5,
    "currency": "SOL",
    "unclaimed_fees": 5.5,
    "claimed_fees": 0,
    "last_claim": null
  }
}
```

### Claiming Fees

The fee claiming endpoint generates a transaction that transfers accumulated fees to designated recipient wallets according to the fee sharing configuration.

**Example Request:**
```bash
curl -X POST 'https://public-api-v2.bags.fm/api/v1/token/{token_mint}/claim-fees' \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "claim_amount": 5.5
  }'
```

**Response:**
```json
{
  "success": true,
  "response": {
    "claim_id": "claim_abc123...",
    "transaction": "def456...",
    "amount_claimed": 5.5,
    "distributed_to": [
      {
        "wallet": "Wallet1Address...",
        "amount": 2.75
      },
      {
        "wallet": "Wallet2Address...",
        "amount": 1.65
      },
      {
        "wallet": "Wallet3Address...",
        "amount": 1.1
      }
    ],
    "status": "pending"
  }
}
```

### Fee Claim Workflow

1. **Check Balance**: Query accumulated fees using the `/fees` endpoint
2. **Generate Claim Transaction**: Call the `/claim-fees` endpoint
3. **Review Distribution**: Verify the amount and recipient breakdown
4. **Confirm Transaction**: Sign and submit the transaction to Solana
5. **Verify Completion**: Check transaction status on Solana explorer

---

## Rate Limiting & Best Practices

### Rate Limits

The Bags API enforces a rate limit of **1,000 requests per hour per user**.

- Limits apply across all your API keys
- Check response headers for usage: `X-RateLimit-Remaining` and `X-RateLimit-Reset`
- Implement exponential backoff for failed requests

### Recommended Best Practices

1. **Key Management**
   - Create separate API keys for different environments (dev, staging, production)
   - Rotate keys periodically for security
   - Revoke unused keys immediately
   - Never commit API keys to version control

2. **Error Handling**
   - Always check the `success` field in responses
   - Log error messages for debugging
   - Implement retry logic with exponential backoff
   - Set appropriate timeouts for API requests

3. **Fee Claiming**
   - Monitor accumulated fees regularly (e.g., weekly checks)
   - Claim fees in batches rather than individually
   - Keep detailed records of all claims for accounting
   - Test with small claim amounts first

4. **Token Launch**
   - Validate all metadata before submission
   - Test token creation in a sandbox environment
   - Document your token's initial configuration
   - Notify stakeholders before mainnet launch

---

## Complete Example: Launch Token & Claim Fees

Here's a complete workflow example using Node.js:

```javascript
const API_KEY = 'YOUR_API_KEY';
const BASE_URL = 'https://public-api-v2.bags.fm/api/v1';

// Step 1: Launch Token
async function launchToken() {
  const response = await fetch(`${BASE_URL}/token/launch`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'My Token',
      symbol: 'MYTKN',
      decimals: 6,
      total_supply: 1000000,
      fee_sharing: {
        enabled: true,
        recipients: [
          { wallet: 'WalletA...', percentage: 70 },
          { wallet: 'WalletB...', percentage: 30 }
        ]
      }
    })
  });
  
  const data = await response.json();
  return data.response.token_mint;
}

// Step 2: Check Accumulated Fees
async function checkFees(tokenMint) {
  const response = await fetch(`${BASE_URL}/token/${tokenMint}/fees`, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`
    }
  });
  
  const data = await response.json();
  return data.response.unclaimed_fees;
}

// Step 3: Claim Fees
async function claimFees(tokenMint, amount) {
  const response = await fetch(`${BASE_URL}/token/${tokenMint}/claim-fees`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ claim_amount: amount })
  });
  
  const data = await response.json();
  return data.response;
}

// Execute workflow
(async () => {
  const tokenMint = await launchToken();
  console.log('Token launched:', tokenMint);
  
  const fees = await checkFees(tokenMint);
  console.log('Accumulated fees:', fees);
  
  if (fees > 0) {
    const claim = await claimFees(tokenMint, fees);
    console.log('Fees claimed:', claim);
  }
})();
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **401 Unauthorized** | Verify API key is valid and included in `Authorization: Bearer` header |
| **Rate Limit Exceeded** | Implement backoff strategy; check `X-RateLimit-Reset` header |
| **Invalid Wallet Address** | Ensure addresses are Base58-encoded Solana format |
| **Fee Percentages Don't Sum to 100%** | Recalculate fee distribution to total exactly 100% |
| **Transaction Failed** | Check Solana network status; verify sufficient SOL balance |

### Getting Help

- Review the full API Reference at [docs.bags.fm/api-reference](https://docs.bags.fm/api-reference/introduction)
- Check the Bags Help Center at [support.bags.fm](https://support.bags.fm)
- Visit the Bags Developer Dashboard at [dev.bags.fm](https://dev.bags.fm)

---

## Summary

The Bags API streamlines token creation and fee management on Solana by providing:

✓ **Simple token launches** with configurable metadata  
✓ **Flexible fee sharing** across multiple wallets  
✓ **Transparent fee tracking** with real-time accumulation data  
✓ **Automated fee claiming** with distribution to configured recipients  
✓ **Secure authentication** with API key management  

By following this guide, you can build powerful token applications that automatically manage fees and compensate multiple stakeholders with minimal manual intervention.
