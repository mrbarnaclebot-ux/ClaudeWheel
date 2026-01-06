# Bags.FM API - Complete Trading Guide

## Overview

The Bags API allows you to programmatically buy and sell tokens on the Solana blockchain. This guide covers how the buy/sell mechanism works and provides a complete script to get started with token trading.

**Base URL:** `https://public-api-v2.bags.fm/api/v1/`

---

## API Authentication

All API requests require authentication using your API key.

### Get Your API Key

1. Visit [dev.bags.fm](https://dev.bags.fm)
2. Sign in to your account
3. Navigate to the API Keys section
4. Create a new API key (max 10 keys per user)

### Authentication Methods

**Using `x-api-key` Header (Simple):**
```bash
curl -H 'x-api-key: YOUR_API_KEY' \
  https://public-api-v2.bags.fm/api/v1/endpoint
```

**Using Bearer Token (Recommended for SDK):**
```bash
curl -H 'Authorization: Bearer YOUR_API_KEY' \
  https://public-api-v2.bags.fm/api/v1/endpoint
```

**JavaScript/TypeScript:**
```javascript
const response = await fetch('https://public-api-v2.bags.fm/api/v1/endpoint', {
  headers: {
    'x-api-key': 'YOUR_API_KEY'
  }
});
```

---

## How Buy/Sell Works

### Trading Flow

The Bags API uses a **Quote → Transaction → Sign → Send** workflow for executing trades:

1. **Get Trade Quote** - Request price and route information for your swap
2. **Review Quote Details** - Examine the quote response (price, slippage, route)
3. **Create Swap Transaction** - Generate an unsigned Solana transaction
4. **Sign Transaction** - Use your private key to sign the transaction
5. **Send Transaction** - Broadcast to Solana network and confirm

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Input Mint** | The token you want to sell (swap FROM) |
| **Output Mint** | The token you want to buy (swap TO) |
| **Slippage** | Maximum acceptable price difference from quote to execution |
| **Price Impact** | The percentage change in price due to the swap size |
| **Route Plan** | Path through different DEXs and liquidity pools |
| **Lamports** | Smallest unit of SOL; 1 SOL = 1,000,000 lamports |

---

## API Endpoints for Trading

### 1. Get Trade Quote

**Endpoint:** `POST /trade/quote`

Get a price quote and route information for a potential swap.

**Request Parameters:**

```json
{
  "inputMint": "PublicKey",           // Token to sell (Base58 encoded)
  "outputMint": "PublicKey",          // Token to buy (Base58 encoded)
  "amount": number,                   // Amount in smallest token units
  "slippageMode": "auto" | "manual",  // Auto or manual slippage calculation
  "slippageBps": number               // Required if slippageMode is "manual"
}
```

**Response:**

```json
{
  "requestId": "string",
  "inAmount": "string",              // Input amount
  "outAmount": "string",             // Expected output amount
  "minOutAmount": "string",          // Minimum output (with slippage)
  "priceImpactPct": "string",        // Percentage price impact
  "slippageBps": number,             // Slippage in basis points
  "routePlan": [
    {
      "venue": "string",             // DEX name (e.g., "Jupiter")
      "inAmount": "string",
      "outAmount": "string",
      "inputMint": "string",
      "outputMint": "string"
    }
  ],
  "platformFee": {                   // Optional
    "amount": "string",
    "feeBps": number,
    "feeAccount": "string"
  }
}
```

### 2. Create Swap Transaction

**Endpoint:** `POST /trade/swap`

Generate an unsigned Solana transaction ready to be signed.

**Request Parameters:**

```json
{
  "quoteResponse": {},               // Quote response from step 1
  "userPublicKey": "PublicKey"       // Your wallet's public key (Base58)
}
```

**Response:**

```json
{
  "transaction": "string",           // Base64-encoded VersionedTransaction
  "computeUnitLimit": number,        // Compute units needed
  "lastValidBlockHeight": number,    // Block height deadline
  "prioritizationFeeLamports": number // Fee in lamports for prioritization
}
```

---

## Rate Limits

- **Limit:** 1,000 requests per hour per user
- **Scope:** Applied across all API keys
- **Headers to Monitor:**
  - `X-RateLimit-Remaining` - Requests left in current hour
  - `X-RateLimit-Reset` - Unix timestamp when limit resets

**Best Practice:** Implement exponential backoff for failed requests.

---

## Complete TypeScript Trading Script

### Prerequisites

```bash
# Create a new Node.js project
npm init -y

# Install dependencies
npm install dotenv @bagsfm/bags-sdk @solana/web3.js bs58
npm install -D typescript @types/node ts-node

# Initialize TypeScript
npx tsc --init
```

### Setup Environment

Create a `.env` file in your project root:

```env
BAGS_API_KEY=your_api_key_here
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
PRIVATE_KEY=your_base58_encoded_private_key_here
```

**⚠️ Security Warning:** Never commit your `.env` file or private key to version control!

### Complete Trading Script

Save as `trade-tokens.ts`:

```typescript
import dotenv from "dotenv";
dotenv.config({ quiet: true });

import { BagsSDK, signAndSendTransaction } from "@bagsfm/bags-sdk";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import bs58 from "bs58";

// ============================================================================
// CONFIGURATION
// ============================================================================

const BAGS_API_KEY = process.env.BAGS_API_KEY;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!BAGS_API_KEY || !SOLANA_RPC_URL || !PRIVATE_KEY) {
  throw new Error("Missing required environment variables: BAGS_API_KEY, SOLANA_RPC_URL, PRIVATE_KEY");
}

const connection = new Connection(SOLANA_RPC_URL);
const sdk = new BagsSDK(BAGS_API_KEY, connection, "processed");

// ============================================================================
// MAIN TRADING FUNCTION
// ============================================================================

/**
 * Execute a token swap (buy/sell)
 * @param inputMint - Token mint address to sell
 * @param outputMint - Token mint address to buy
 * @param amount - Amount in smallest token units
 * @param slippageMode - "auto" or "manual" slippage calculation
 * @param slippageBps - Basis points for slippage (only for manual mode)
 */
async function executeSwap(
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number,
  slippageMode: "auto" | "manual" = "auto",
  slippageBps?: number
) {
  try {
    if (!PRIVATE_KEY) {
      throw new Error("PRIVATE_KEY is not set");
    }

    const keypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
    const commitment = sdk.state.getCommitment();

    // ========================================================================
    // STEP 1: GET TRADE QUOTE
    // ========================================================================
    console.log("💱 Getting trade quote...");
    console.log(`  Input Mint: ${inputMint.toBase58()}`);
    console.log(`  Output Mint: ${outputMint.toBase58()}`);
    console.log(`  Amount: ${amount}`);
    console.log(`  Slippage Mode: ${slippageMode}`);

    const quote = await sdk.trade.getQuote({
      inputMint: inputMint,
      outputMint: outputMint,
      amount: amount,
      slippageMode: slippageMode,
      slippageBps: slippageBps,
    });

    // ========================================================================
    // STEP 2: DISPLAY QUOTE DETAILS
    // ========================================================================
    console.log("\n📊 Quote Details:");
    console.log(`  Request ID: ${quote.requestId}`);
    console.log(`  Input Amount: ${quote.inAmount}`);
    console.log(`  Output Amount: ${quote.outAmount}`);
    console.log(`  Min Output Amount (with slippage): ${quote.minOutAmount}`);
    console.log(`  Price Impact: ${quote.priceImpactPct}%`);
    console.log(`  Slippage Tolerance: ${(quote.slippageBps / 100).toFixed(2)}%`);
    console.log(`  Route Legs: ${quote.routePlan.length}`);

    // Display route plan
    if (quote.routePlan.length > 0) {
      console.log("\n🛣️ Route Plan:");
      quote.routePlan.forEach((leg, index) => {
        console.log(`  Leg ${index + 1}:`);
        console.log(`    Venue: ${leg.venue}`);
        console.log(`    Input: ${leg.inAmount} ${leg.inputMint}`);
        console.log(`    Output: ${leg.outAmount} ${leg.outputMint}`);
      });
    }

    // Display platform fee if present
    if (quote.platformFee) {
      console.log("\n💰 Platform Fee:");
      console.log(`  Amount: ${quote.platformFee.amount}`);
      console.log(`  Fee BPS: ${quote.platformFee.feeBps}`);
      console.log(`  Fee Account: ${quote.platformFee.feeAccount}`);
    }

    // ========================================================================
    // STEP 3: CREATE SWAP TRANSACTION
    // ========================================================================
    console.log("\n🎯 Creating swap transaction...");

    const swapResult = await sdk.trade.createSwapTransaction({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey,
    });

    console.log(`  Compute Unit Limit: ${swapResult.computeUnitLimit}`);
    console.log(`  Prioritization Fee: ${swapResult.prioritizationFeeLamports} lamports`);
    console.log(`  Valid Until Block: ${swapResult.lastValidBlockHeight}`);

    // ========================================================================
    // STEP 4: SIGN AND SEND TRANSACTION
    // ========================================================================
    console.log("\n🔑 Signing and sending swap transaction...");

    const signature = await signAndSendTransaction(
      connection,
      commitment,
      swapResult.transaction,
      keypair
    );

    // ========================================================================
    // SUCCESS
    // ========================================================================
    console.log("\n✅ Swap executed successfully!");
    console.log(`  Transaction Signature: ${signature}`);
    console.log(`  View on Solana Explorer: https://solscan.io/tx/${signature}`);

    return {
      signature,
      quote,
      swapResult,
    };
  } catch (error) {
    console.error("\n❌ Swap execution failed:");
    if (error instanceof Error) {
      console.error(`  Error: ${error.message}`);
      console.error(`  Stack: ${error.stack}`);
    } else {
      console.error(`  Error: ${error}`);
    }
    throw error;
  }
}

// ============================================================================
// UTILITY FUNCTION: GET QUOTE ONLY (WITHOUT EXECUTING SWAP)
// ============================================================================

/**
 * Get a trade quote without executing a swap
 */
async function getQuoteOnly(
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number
) {
  try {
    console.log("📊 Fetching quote only (no swap execution)...");

    const quote = await sdk.trade.getQuote({
      inputMint: inputMint,
      outputMint: outputMint,
      amount: amount,
      slippageMode: "auto",
    });

    console.log(`  Expected Output: ${quote.outAmount}`);
    console.log(`  Min Output (with slippage): ${quote.minOutAmount}`);
    console.log(`  Price Impact: ${quote.priceImpactPct}%`);
    console.log(`  Slippage: ${(quote.slippageBps / 100).toFixed(2)}%`);

    return quote;
  } catch (error) {
    console.error("❌ Quote fetch failed:", error);
    throw error;
  }
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

async function main() {
  try {
    // ====================================================================
    // EXAMPLE 1: GET QUOTE ONLY (SAFE TO TEST)
    // ====================================================================
    console.log("=== EXAMPLE 1: Get Quote Only ===\n");

    // Replace with actual token mint addresses
    // Example: SOL to USDC
    const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
    const USDC_MINT = new PublicKey("EPjFWaJPgqEtQQjL9PjJoe6SWUSwXCqc2PiFmWeJ2opS");

    // Get quote for 0.1 SOL (100,000,000 lamports)
    const quote = await getQuoteOnly(SOL_MINT, USDC_MINT, 100_000_000);

    // ====================================================================
    // EXAMPLE 2: EXECUTE SWAP WITH AUTO SLIPPAGE
    // ====================================================================
    console.log("\n=== EXAMPLE 2: Execute Swap (Auto Slippage) ===\n");

    // UNCOMMENT TO EXECUTE (only after verifying quote above!)
    // const result = await executeSwap(SOL_MINT, USDC_MINT, 100_000_000, "auto");

    // ====================================================================
    // EXAMPLE 3: EXECUTE SWAP WITH MANUAL SLIPPAGE
    // ====================================================================
    console.log("\n=== EXAMPLE 3: Execute Swap (Manual Slippage) ===\n");

    // 1% slippage = 100 basis points
    // UNCOMMENT TO EXECUTE
    // const result = await executeSwap(SOL_MINT, USDC_MINT, 100_000_000, "manual", 100);

    console.log("\n✨ Examples completed. Uncomment execute lines to run actual swaps.");
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

// Run the script
main();
```

### Run the Script

```bash
# Dry run (get quote only)
npx ts-node trade-tokens.ts

# Execute swap (after uncommenting the executeSwap() calls)
# npx ts-node trade-tokens.ts
```

---

## Understanding Slippage

### What is Slippage?

Slippage is the difference between the expected and actual execution price when trading. It occurs because of:
- Market volatility
- Pool liquidity changes
- Transaction delays

### Slippage Modes

| Mode | Usage | When to Use |
|------|-------|------------|
| **Auto** | SDK automatically calculates slippage | Recommended for most use cases; hands-off |
| **Manual** | You specify exact slippage in basis points | Full control; for automated strategies |

### Slippage Basis Points (BPS)

| BPS | Percentage | Example |
|-----|-----------|---------|
| 50 | 0.5% | Conservative, slow trading |
| 100 | 1.0% | Standard for most trades |
| 500 | 5.0% | Volatile market conditions |
| 1000 | 10.0% | High slippage tolerance |
| 10000 | 100.0% | No limit (not recommended) |

**Manual Slippage Example:**
```typescript
// 1% slippage tolerance
const quote = await sdk.trade.getQuote({
  inputMint: SOL_MINT,
  outputMint: USDC_MINT,
  amount: 100_000_000,
  slippageMode: "manual",
  slippageBps: 100,  // 1%
});
```

---

## Common Token Mint Addresses (Solana Mainnet)

| Token | Symbol | Mint Address |
|-------|--------|-------------|
| Solana | SOL | `So11111111111111111111111111111111111111112` |
| USDC | USDC | `EPjFWaJPgqEtQQjL9PjJoe6SWUSwXCqc2PiFmWeJ2opS` |
| Wrapped USDT | USDT | `Es9vMFrzaCERmJfqV3E5K3dDGYMKoNmhQV6To7ZLa1Wy` |
| Magic Eden | ME | `MangoCzJ36AjZyKwVj3VnYU4GTonjfVEnJmvvWaxLac` |

---

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| Invalid mint address | Malformed Base58 | Verify mint is 44-character Base58 string |
| No route available | Token pair illiquid | Try different token pairs |
| Slippage exceeded | Price moved too much | Increase slippage tolerance or retry |
| Insufficient SOL | Not enough for fees | Add SOL to wallet (typically 0.005 SOL) |
| Rate limited | Too many requests | Implement exponential backoff retry logic |
| Invalid private key | Wrong format or encoding | Export from Phantom/Backpack as Base58 |

### Example Error Handling

```typescript
async function safeSwap(
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number,
  maxRetries = 3
) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}...`);
      return await executeSwap(inputMint, outputMint, amount);
    } catch (error) {
      lastError = error;
      const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
      console.warn(
        `Attempt ${attempt} failed. Retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
```

---

## Advanced Usage

### Splitting Large Trades

For large trades, consider splitting into smaller trades to reduce price impact:

```typescript
async function executeLargeTrade(
  inputMint: PublicKey,
  outputMint: PublicKey,
  totalAmount: number,
  numSplits: number = 5
) {
  const amountPerTrade = Math.floor(totalAmount / numSplits);
  const results = [];

  for (let i = 0; i < numSplits; i++) {
    console.log(`\nExecuting trade ${i + 1}/${numSplits}...`);
    const result = await executeSwap(inputMint, outputMint, amountPerTrade);
    results.push(result);

    // Add delay between trades to avoid rate limiting
    if (i < numSplits - 1) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return results;
}
```

### Implementing a Price Alert

```typescript
async function priceAlert(
  inputMint: PublicKey,
  outputMint: PublicKey,
  amount: number,
  targetPrice: number,
  checkIntervalMs: number = 5000
) {
  console.log(`Monitoring price (target: ${targetPrice})...`);

  while (true) {
    try {
      const quote = await getQuoteOnly(inputMint, outputMint, amount);
      const currentPrice = parseFloat(quote.outAmount) / amount;

      console.log(`Current price: ${currentPrice.toFixed(8)}`);

      if (currentPrice >= targetPrice) {
        console.log(`🎯 Price alert! Current: ${currentPrice}, Target: ${targetPrice}`);
        return currentPrice;
      }

      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    } catch (error) {
      console.error("Price check failed:", error);
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }
  }
}
```

---

## Security Best Practices

1. **Never commit credentials:** Use `.env` files and `.gitignore`
2. **Rotate API keys:** Regularly create new keys and revoke old ones
3. **Use read-only keys when possible:** For analytics, use non-trading keys
4. **Implement rate limiting:** Don't hammer the API
5. **Verify amounts:** Always check quote details before signing
6. **Use hardware wallets:** For production, consider hardware wallet signing
7. **Monitor transactions:** Track all swap transactions for audit purposes
8. **Test on devnet:** Use Solana devnet before mainnet trading

---

## Testing on Devnet

To test without real funds:

```bash
# Change RPC URL in .env
SOLANA_RPC_URL=https://api.devnet.solana.com

# Get devnet SOL from faucet
solana airdrop 2 YOUR_WALLET_ADDRESS -u devnet
```

---

## Additional Resources

- **Bags Developer Portal:** https://dev.bags.fm
- **Full API Documentation:** https://docs.bags.fm
- **Solana Web3.js Docs:** https://solana-labs.github.io/solana-web3.js/
- **Solscan Explorer:** https://solscan.io
- **Phantom Wallet:** https://phantom.app

---

## Support

- **API Issues:** Contact Bags support via dev.bags.fm
- **SDK Questions:** Check @bagsfm/bags-sdk npm package documentation
- **Community:** Join Bags Discord for community support
