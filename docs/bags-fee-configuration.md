# Bags API: Fee Configuration Guide for Token Launches

> Complete guide to configuring fees when launching Solana tokens via the Bags API, including fee sharing, basis points allocation, partner configurations, and priority fees.

## Table of Contents

1. [Overview](#overview)
2. [Fee Structure Basics](#fee-structure-basics)
3. [Understanding Basis Points (BPS)](#understanding-basis-points-bps)
4. [Fee Share Configuration](#fee-share-configuration)
5. [Token Launch Flow with Fees](#token-launch-flow-with-fees)
6. [Fee Claimer Setup](#fee-claimer-setup)
7. [Partner Configuration](#partner-configuration)
8. [Priority Fees & Tips](#priority-fees--tips)
9. [Lookup Tables for Large Fee Groups](#lookup-tables-for-large-fee-groups)
10. [API Parameters & Examples](#api-parameters--examples)
11. [Common Fee Configurations](#common-fee-configurations)
12. [Error Handling](#error-handling)

---

## Overview

When launching a token using the Bags API, you must configure how fees are distributed. The fee configuration system uses **basis points (BPS)** to precisely allocate fees between multiple receivers. Token Launch v2 requires an explicit **fee share configuration** that must be created before the token launch transaction.

**Key Principle**: All fees must be explicitly allocated. The creator cannot receive fees "by default"—fees must be programmatically assigned to wallets using the fee share configuration.

---

## Fee Structure Basics

### What Are Fees?

When a token is launched and traded on the Solana blockchain, various fees accrue:

- **Network transaction fees**: Paid to Solana validators (~5,000 lamports per transaction)
- **Protocol fees**: Generated from token trading volume
- **Trading fees**: Collected when users buy/sell tokens

### Who Receives Fees?

Fees can be distributed to:

1. **Creator Wallet**: The wallet that launched the token (you)
2. **Fee Claimers**: Additional wallets that receive a share of fees
3. **Partners**: Special partner configurations that receive a percentage (default 25% / 2,500 BPS)
4. **Network Providers**: Optional tips sent to MEV providers (Jito, Astral, bloXroute)

### Fee Distribution Timeline

```
Token Launched
    ↓
Trading occurs (buy/sell activity)
    ↓
Fees accumulate in fee share configuration
    ↓
Fee earners claim their accrued fees
    ↓
SOL transferred to respective wallets
    ↓
Claiming requires ~0.002 SOL network fee
```

---

## Understanding Basis Points (BPS)

**Basis Points** is a financial unit where 1% = 100 BPS and 100% = 10,000 BPS.

### Conversion Chart

| Percentage | Basis Points (BPS) | Calculation |
|------------|-------------------|------------|
| 1% | 100 | percentage × 100 |
| 5% | 500 | percentage × 100 |
| 10% | 1,000 | percentage × 100 |
| 25% | 2,500 | percentage × 100 |
| 50% | 5,000 | percentage × 100 |
| 100% | 10,000 | percentage × 100 |

### BPS Calculation Formula

```
BPS Value = (Percentage / 100) × 10,000

Example: If you want 35% of fees
BPS = (35 / 100) × 10,000 = 3,500 BPS
```

### Critical Rule: BPS Must Sum to 10,000

**The total BPS across all fee receivers must equal exactly 10,000 (100%).**

```
Example Valid Distribution:
Creator: 4,000 BPS (40%)
Fee Claimer 1: 3,000 BPS (30%)
Fee Claimer 2: 3,000 BPS (30%)
Total: 4,000 + 3,000 + 3,000 = 10,000 ✅

Example INVALID Distribution:
Creator: 5,000 BPS (50%)
Fee Claimer 1: 3,000 BPS (30%)
Fee Claimer 2: 2,000 BPS (20%)
Total: 5,000 + 3,000 + 2,000 = 10,000 ❌ (exceeds maximum)

Invalid because Total = 10,000 but should equal exactly 10,000
```

### Why This Matters

- **Incomplete allocation**: If total < 10,000, the API will reject the configuration
- **Overallocation**: If total > 10,000, the API will reject the configuration
- **Precision**: BPS must be whole numbers (no decimals)

---

## Fee Share Configuration

### What is Fee Share Configuration?

Fee share configuration is a **Solana Program-Derived Address (PDA)** that stores the rules for distributing fees from token trading volume. It acts as a "smart contract" that automatically directs fees to designated wallets.

### Creation Process

Before launching a token, you must:

1. Create metadata (token name, symbol, image)
2. **Create fee share configuration** with fee claimer allocations
3. Get token creation transaction
4. Sign and broadcast

### Fee Share Configuration Parameters

```typescript
{
  // Required: The wallet paying for transaction fees
  payer: PublicKey;

  // Required: The token being launched (token mint)
  baseMint: PublicKey;

  // Required: Array of fee receiver wallets
  claimersArray: PublicKey[];

  // Required: Array of BPS amounts for each claimer (must sum to 10,000)
  basisPointsArray: number[];

  // Optional: Partner wallet for fee sharing
  partner?: PublicKey;

  // Optional: Partner config PDA (if using partner)
  partnerConfig?: PublicKey;

  // Optional: Lookup tables (needed if > 15 fee claimers)
  additionalLookupTables?: PublicKey[];

  // Optional: MEV tip wallet
  tipWallet?: PublicKey;

  // Optional: MEV tip amount in lamports
  tipLamports?: number;
}
```

### REST API Endpoint

```bash
POST /fee-share/config
```

### Example Request (cURL)

```bash
curl --request POST \
  --url https://public-api-v2.bags.fm/api/v1/fee-share/config \
  --header 'Content-Type: application/json' \
  --header 'x-api-key: YOUR_API_KEY' \
  --data '{
    "payer": "YOUR_WALLET_ADDRESS",
    "baseMint": "TOKEN_MINT_ADDRESS",
    "claimersArray": [
      "CREATOR_WALLET_ADDRESS",
      "FEE_CLAIMER_1_ADDRESS",
      "FEE_CLAIMER_2_ADDRESS"
    ],
    "basisPointsArray": [4000, 3000, 3000],
    "tipWallet": "JITO_WALLET_ADDRESS",
    "tipLamports": 15000
  }'
```

### Response Structure

```json
{
  "success": true,
  "response": {
    "needsCreation": true,
    "feeShareAuthority": "AUTHORITY_ADDRESS",
    "meteoraConfigKey": "CONFIG_KEY_ADDRESS",
    "transactions": [
      {
        "blockhash": {
          "blockhash": "HASH_VALUE",
          "lastValidBlockHeight": 12345678
        },
        "transaction": "BASE64_ENCODED_TRANSACTION"
      }
    ],
    "bundles": []
  }
}
```

---

## Token Launch Flow with Fees

### Complete Flow Diagram

```
1. Create Token Metadata
   ├─ Name, symbol, description
   ├─ Upload image/logo
   └─ Returns: metadata IPFS URL

2. Create Fee Share Configuration
   ├─ Define fee claimers array
   ├─ Define BPS allocation array
   ├─ Sign & broadcast fee config transaction
   └─ Returns: Fee share config key (PDA)

3. Get Token Launch Transaction
   ├─ Input: metadata URL + config key
   ├─ Optional: Initial buy amount in lamports
   └─ Returns: Unsigned token launch transaction

4. Sign & Broadcast
   ├─ Sign transaction with creator keypair
   ├─ Send to network
   └─ Returns: Transaction signature

5. Token is Live
   ├─ Fee configuration active
   ├─ Fees accrue with each trade
   └─ Claimers can withdraw fees
```

### Step-by-Step Implementation (TypeScript)

```typescript
import { PublicKey, Keypair, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js';
import { BagsSDK } from '@bagsfm/bags-sdk';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

const BAGS_API_KEY = process.env.BAGS_API_KEY;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const connection = new Connection(SOLANA_RPC_URL);
const sdk = new BagsSDK(BAGS_API_KEY, connection, 'processed');
const keypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));

// STEP 1: Create Metadata
const tokenInfo = await sdk.tokenLaunch.createTokenInfoAndMetadata({
  imageUrl: 'https://example.com/token-logo.png',
  name: 'My Token',
  symbol: 'MYTKN',
  description: 'Token with fee sharing',
  website: 'https://mytoken.com',
  twitter: 'https://twitter.com/mytoken',
});

const tokenMint = new PublicKey(tokenInfo.tokenMint);
console.log('Token Mint:', tokenMint.toString());

// STEP 2: Build Fee Claimers Array
// Important: Creator must always be explicitly included in the array
const feeClaimers = [
  {
    user: keypair.publicKey,          // Creator wallet
    userBps: 4000                      // Creator gets 40%
  },
  {
    user: new PublicKey('CLAIMER_1_ADDRESS'),
    userBps: 3000                      // Claimer 1 gets 30%
  },
  {
    user: new PublicKey('CLAIMER_2_ADDRESS'),
    userBps: 3000                      // Claimer 2 gets 30%
  }
];

// Verify total BPS
const totalBps = feeClaimers.reduce((sum, claimer) => sum + claimer.userBps, 0);
if (totalBps !== 10000) {
  throw new Error(`Total BPS must equal 10,000. Got: ${totalBps}`);
}

// STEP 3: Create Fee Share Configuration
const configResult = await sdk.config.createBagsFeeShareConfig({
  payer: keypair.publicKey,
  baseMint: tokenMint,
  feeClaimers: feeClaimers,
});

console.log('Fee Config Key:', configResult.meteoraConfigKey.toString());

// Sign and send config creation transactions
for (const tx of configResult.transactions || []) {
  await signAndSendTransaction(connection, 'processed', tx, keypair);
}

// STEP 4: Get Token Launch Transaction
const launchTx = await sdk.tokenLaunch.createLaunchTransaction({
  metadataUrl: tokenInfo.tokenMetadata,
  tokenMint: tokenMint,
  launchWallet: keypair.publicKey,
  initialBuyLamports: 0.01 * LAMPORTS_PER_SOL,
  configKey: configResult.meteoraConfigKey,
});

// STEP 5: Sign and Broadcast
const signature = await signAndSendTransaction(connection, 'processed', launchTx, keypair);
console.log('Token Launched! Signature:', signature);
```

---

## Fee Claimer Setup

### Supported Social Platforms

Fee claimers are identified using their social media profiles. Supported platforms are:

- `twitter` - Twitter/X username
- `discord` - Discord username
- `github` - GitHub username
- `kick` - Kick username

### Looking Up Fee Claimer Wallet

To distribute fees to a user via their social profile:

```typescript
// 1. Get user's wallet address from their social profile
const feeClaimerResult = await sdk.state.getLaunchWalletV2(
  'username',        // Username on the platform (e.g., 'john_doe')
  'twitter'          // Platform (twitter, discord, github, kick)
);

const feeClaimerWallet = feeClaimerResult.wallet;
console.log('Fee Claimer Wallet:', feeClaimerWallet.toString());

// 2. Add to fee claimers array
feeClaimers.push({
  user: feeClaimerWallet,
  userBps: 2000                    // This user receives 20%
});
```

### Maximum Fee Claimers

- **Up to 15 fee claimers**: No lookup tables required
- **16-100 fee claimers**: Lookup tables required (handled automatically by SDK)
- **Over 100 fee claimers**: Not supported

### Important Rules

1. **Creator must be explicit**: Always include the creator in the fee claimers array with their BPS
2. **Creator must be in array**: Even if creator receives 0%, they must be explicitly listed with 0 BPS
3. **Platform validation**: Ensure usernames are valid on their respective platforms

---

## Partner Configuration

### What is Partner Configuration?

Partner configuration allows a **partner** to receive a share of fees from all tokens launched via their API key. This is useful for:

- Building token launch platforms
- Earning revenue share on tokens launched through your service
- Collecting fees from multiple token launches

### Default Partner Fee Share

By default, a partner key receives **25% (2,500 BPS)** of the fees generated. Custom percentages can be configured upon request.

### Creating a Partner Key

#### Method 1: Via Dashboard

1. Go to https://dev.bags.fm
2. Sign in with your account
3. Click "Create Partner Key" button
4. Confirm creation
5. Copy your **Partner Config PDA** from the table

#### Method 2: Via SDK

```typescript
import { BagsSDK, deriveBagsFeeShareV2PartnerConfigPda } from '@bagsfm/bags-sdk';
import { PublicKey, Keypair, Connection } from '@solana/web3.js';

const sdk = new BagsSDK(API_KEY, connection, 'processed');
const partnerWallet = new PublicKey('YOUR_WALLET_ADDRESS');

// Check if partner config already exists
try {
  const existingConfig = await sdk.partner.getPartnerConfig(partnerWallet);
  console.log('Partner config already exists:', existingConfig);
} catch (error) {
  // Partner config doesn't exist, create it
  const { transaction, blockhash } = await sdk.partner.getPartnerConfigCreationTransaction(
    partnerWallet
  );
  
  // Sign and send
  const signature = await signAndSendTransaction(connection, 'processed', transaction, keypair);
  console.log('Partner key created:', signature);
}

// Get your partner config PDA
const partnerConfigPda = deriveBagsFeeShareV2PartnerConfigPda(partnerWallet);
console.log('Partner Config PDA:', partnerConfigPda.toString());
```

### Using Partner Configuration in Token Launches

Once you have a partner config, include it when creating fee share configurations:

```typescript
const configResult = await sdk.config.createBagsFeeShareConfig({
  payer: keypair.publicKey,
  baseMint: tokenMint,
  feeClaimers: feeClaimers,
  partner: partnerWallet,              // Partner wallet address
  partnerConfig: partnerConfigPda,     // Partner config PDA
});
```

### Partner Fee Distribution Example

If a token is launched with a partner configuration:

- **Partner receives**: 25% (2,500 BPS) - taken from total fees
- **Remaining 75%**: Distributed among other fee claimers

Example with 10,000 BPS total:

```
Original allocation:
- Creator: 5,000 BPS (50%)
- Claimer 1: 5,000 BPS (50%)

With partner (25% = 2,500 BPS):
- Partner: 2,500 BPS (25%) - automatically taken
- Creator: 3,750 BPS (37.5%) - reduced
- Claimer 1: 3,750 BPS (37.5%) - reduced
Total: 10,000 BPS ✅
```

---

## Priority Fees & Tips

### Overview

Priority fees and tips are optional additional payments to MEV (Maximum Extractable Value) providers and network validators to prioritize your transaction. These are **separate from trading fees**.

### Supported Endpoints

Priority fees and tips can be added to:

- `POST /token-launch/create-launch-transaction`
- `POST /fee-share/config`

### Parameters

```typescript
{
  // ... other parameters ...

  // Base58 encoded Solana public key of tip recipient
  tipWallet: string;

  // Tip amount in lamports (smallest SOL unit)
  tipLamports: number;
}
```

### How Tips Work

When you include `tipWallet` and `tipLamports`:

1. API appends a tip transfer instruction as the final transaction instruction
2. Priority fee settings (`setComputeUnitLimit` and `setComputeUnitPrice`) are always included
3. The **payer wallet funds both network fees AND the tip**
4. Transaction is prioritized by the network

### Recommended MEV Providers

```typescript
// Jito MEV Providers
export const JITO_WALLETS = {
  primary: '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  secondary: 'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  tertiary: 'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  // ... more Jito wallets
};

// Astral MEV Providers
export const ASTRAL_WALLETS = {
  primary: 'astrazznxsGUhWShqgNtAdfrzP2G83DzcWVJDxwV9bF',
  secondary: 'astra4uejePWneqNaJKuFFA8oonqCE1sqF6b45kDMZm',
  tertiary: 'astra9xWY93QyfG6yM8zwsKsRodscjQ2uU2HKNL5prk',
  // ... more Astral wallets
};

// bloXroute MEV Providers
export const BLOXROUTE_WALLETS = {
  primary: 'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY',
  secondary: '95cfoy472fcQHaw4tPGBTKpn6ZQnfEPfBgDQx6gcRmRg',
  // ... more bloXroute wallets
};
```

### Tip Amount Guidelines

```typescript
// Jito provides recommended fees API
const recommendedFees = await sdk.solana.getJitoRecentFees();

// Use 95th percentile for competitive priority
const tipLamports = Math.floor(recommendedFees.landed_tips_95th_percentile * LAMPORTS_PER_SOL);

// Typical range: 0.001 - 0.02 SOL
// 0.001 SOL = 1,000,000 lamports
// 0.01 SOL = 10,000,000 lamports
// 0.02 SOL = 20,000,000 lamports
```

### Example with Priority Fee

```typescript
const JITO_WALLET = '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5';
const TIP_AMOUNT = 0.015 * LAMPORTS_PER_SOL; // 15,000 lamports

const configResult = await sdk.config.createBagsFeeShareConfig({
  payer: keypair.publicKey,
  baseMint: tokenMint,
  feeClaimers: feeClaimers,
  tipWallet: JITO_WALLET,
  tipLamports: TIP_AMOUNT,
});
```

### Important Tip Rules

- **Tipping is optional**: No tip is included by default
- **Payer funds all**: The payer wallet must have sufficient SOL for network fees + tip amount
- **No allowlist**: You can tip any valid Solana public key (not restricted to providers)
- **Validation**: Ensure `tipWallet` is valid and tip amount is positive

---

## Lookup Tables for Large Fee Groups

### When Are Lookup Tables Needed?

Lookup tables are required when you have **more than 15 fee claimers** in a single fee share configuration. This is a Solana blockchain limitation on transaction size.

### Automatic Lookup Table Creation

The SDK handles lookup table creation automatically:

```typescript
const feeClaimers = [
  // ... 50 different fee claimers ...
];

const configResult = await sdk.config.createBagsFeeShareConfig({
  payer: keypair.publicKey,
  baseMint: tokenMint,
  feeClaimers: feeClaimers,  // More than 15 claimers triggers LUT creation
});

// SDK automatically:
// 1. Creates lookup tables
// 2. Extends them with claimer addresses
// 3. Includes them in the fee share config
```

### Manual Lookup Table Creation

If you need fine-grained control:

```typescript
// Get LUT creation transactions
const lutResult = await sdk.config.getConfigCreationLookupTableTransactions({
  payer: keypair.publicKey,
  baseMint: tokenMint,
  feeClaimers: largeFeeClaimer Array,
});

// Execute LUT creation transaction
await signAndSendTransaction(
  connection,
  commitment,
  lutResult.creationTransaction,
  keypair
);

// Wait for one slot (required before extending)
await waitForSlotsToPass(connection, commitment, 1);

// Execute all LUT extend transactions
for (const extendTx of lutResult.extendTransactions) {
  await signAndSendTransaction(connection, commitment, extendTx, keypair);
}

// Now use LUT addresses in fee share config
const configResult = await sdk.config.createBagsFeeShareConfig({
  payer: keypair.publicKey,
  baseMint: tokenMint,
  feeClaimers: feeClaimers,
  additionalLookupTables: lutResult.lutAddresses,
});
```

### Lookup Table Limits

- **Maximum fee claimers**: 100 (including creator)
- **Claimers per LUT**: ~15-20 depending on configuration
- **LUT Creation Time**: Usually 1-2 slots

---

## API Parameters & Examples

### Fee Share Configuration Endpoint

```
POST /fee-share/config
```

### Full Parameter Reference

| Parameter | Type | Required | Description |
|-----------|------|----------|------------|
| `payer` | PublicKey | Yes | Wallet paying transaction fees |
| `baseMint` | PublicKey | Yes | Token mint address being launched |
| `claimersArray` | PublicKey[] | Yes | Array of fee receiver wallets |
| `basisPointsArray` | number[] | Yes | Array of BPS for each claimer (must sum to 10,000) |
| `partner` | PublicKey | No | Partner wallet for fee sharing |
| `partnerConfig` | PublicKey | No | Partner config PDA (required if `partner` provided) |
| `additionalLookupTables` | PublicKey[] | No | Lookup table addresses (needed if > 15 claimers) |
| `tipWallet` | PublicKey | No | MEV tip recipient wallet |
| `tipLamports` | number | No | MEV tip amount in lamports |

### Example 1: Simple Creator-Only Fee

```typescript
const feeClaimers = [
  {
    user: creatorWallet,
    userBps: 10000  // Creator gets 100%
  }
];

const configResult = await sdk.config.createBagsFeeShareConfig({
  payer: creatorWallet,
  baseMint: tokenMint,
  feeClaimers: feeClaimers,
});
```

### Example 2: Creator + 2 Fee Claimers

```typescript
const feeClaimers = [
  {
    user: creatorWallet,
    userBps: 6000   // Creator: 60%
  },
  {
    user: claimer1Wallet,
    userBps: 2000   // Claimer 1: 20%
  },
  {
    user: claimer2Wallet,
    userBps: 2000   // Claimer 2: 20%
  }
];

const configResult = await sdk.config.createBagsFeeShareConfig({
  payer: creatorWallet,
  baseMint: tokenMint,
  feeClaimers: feeClaimers,
});
```

### Example 3: With Partner Configuration

```typescript
import { deriveBagsFeeShareV2PartnerConfigPda } from '@bagsfm/bags-sdk';

const partnerWallet = new PublicKey('PARTNER_WALLET_ADDRESS');
const partnerConfigPda = deriveBagsFeeShareV2PartnerConfigPda(partnerWallet);

const feeClaimers = [
  {
    user: creatorWallet,
    userBps: 5000   // Creator: 50%
  },
  {
    user: claimer1Wallet,
    userBps: 5000   // Claimer 1: 50%
  }
];

const configResult = await sdk.config.createBagsFeeShareConfig({
  payer: creatorWallet,
  baseMint: tokenMint,
  feeClaimers: feeClaimers,
  partner: partnerWallet,
  partnerConfig: partnerConfigPda,
});
```

### Example 4: With Priority Fee

```typescript
const JITO_WALLET = '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5';

const feeClaimers = [
  {
    user: creatorWallet,
    userBps: 10000
  }
];

const configResult = await sdk.config.createBagsFeeShareConfig({
  payer: creatorWallet,
  baseMint: tokenMint,
  feeClaimers: feeClaimers,
  tipWallet: JITO_WALLET,
  tipLamports: 15_000_000,  // 0.015 SOL
});
```

---

## Common Fee Configurations

### Configuration 1: Solo Creator (No Fee Sharing)

**Use Case**: You want to keep 100% of fees

```typescript
const feeClaimers = [
  { user: creatorWallet, userBps: 10000 }
];
```

| Wallet | BPS | Percentage |
|--------|-----|-----------|
| Creator | 10,000 | 100% |
| **Total** | **10,000** | **100%** |

### Configuration 2: Creator + Platform Partner

**Use Case**: Revenue sharing with a platform (default 25% partner share)

```typescript
const feeClaimers = [
  { user: creatorWallet, userBps: 7500 },    // Creator: 75%
  // Platform partner: 25% (automatic from partner config)
];
```

| Entity | BPS | Percentage |
|--------|-----|-----------|
| Creator | 7,500 | 75% |
| Partner | 2,500 | 25% |
| **Total** | **10,000** | **100%** |

### Configuration 3: Creator + Multiple Influencers

**Use Case**: Sharing fees with content creators

```typescript
const feeClaimers = [
  { user: creatorWallet, userBps: 5000 },        // Creator: 50%
  { user: influencer1Wallet, userBps: 2500 },    // Influencer 1: 25%
  { user: influencer2Wallet, userBps: 2500 },    // Influencer 2: 25%
];
```

| Entity | BPS | Percentage |
|--------|-----|-----------|
| Creator | 5,000 | 50% |
| Influencer 1 | 2,500 | 25% |
| Influencer 2 | 2,500 | 25% |
| **Total** | **10,000** | **100%** |

### Configuration 4: Complex Multi-Tier Distribution

**Use Case**: Creator + Development team + Marketing + Investors

```typescript
const feeClaimers = [
  { user: creatorWallet, userBps: 3000 },        // Creator: 30%
  { user: devTeamWallet, userBps: 3000 },        // Dev team: 30%
  { user: marketingWallet, userBps: 2000 },      // Marketing: 20%
  { user: investor1Wallet, userBps: 1000 },      // Investor 1: 10%
  { user: investor2Wallet, userBps: 1000 },      // Investor 2: 10%
];
```

| Entity | BPS | Percentage |
|--------|-----|-----------|
| Creator | 3,000 | 30% |
| Dev Team | 3,000 | 30% |
| Marketing | 2,000 | 20% |
| Investor 1 | 1,000 | 10% |
| Investor 2 | 1,000 | 10% |
| **Total** | **10,000** | **100%** |

---

## Error Handling

### Common Errors & Solutions

#### Error 1: BPS Sum Mismatch

**Error Message**: `"Total BPS must equal 10000"`

**Cause**: Fee allocations don't sum to exactly 10,000

**Solution**:
```typescript
// ❌ Wrong
const feeClaimers = [
  { user: wallet1, userBps: 5000 },
  { user: wallet2, userBps: 4000 }  // Total = 9,000
];

// ✅ Correct
const feeClaimers = [
  { user: wallet1, userBps: 5000 },
  { user: wallet2, userBps: 5000 }  // Total = 10,000
];

// Verify before sending
const totalBps = feeClaimers.reduce((sum, c) => sum + c.userBps, 0);
console.assert(totalBps === 10000, 'BPS must equal 10,000');
```

#### Error 2: Creator Not Explicit

**Error Message**: `"Creator must be explicitly included in fee claimers"`

**Cause**: Creator wallet not in fee claimers array

**Solution**:
```typescript
// ❌ Wrong
const feeClaimers = [
  { user: wallet1, userBps: 5000 },
  { user: wallet2, userBps: 5000 }
  // Creator missing!
];

// ✅ Correct
const feeClaimers = [
  { user: creatorWallet, userBps: 5000 },  // Creator always included
  { user: wallet1, userBps: 2500 },
  { user: wallet2, userBps: 2500 }
];
```

#### Error 3: Invalid Wallet Address

**Error Message**: `"Invalid public key"`

**Cause**: Malformed wallet address

**Solution**:
```typescript
// ❌ Wrong
const feeClaimers = [
  { user: 'not-a-valid-address', userBps: 10000 }
];

// ✅ Correct
import { PublicKey } from '@solana/web3.js';
const feeClaimers = [
  { user: new PublicKey('11111111111111111111111111111111'), userBps: 10000 }
];

// Validate addresses
try {
  new PublicKey(addressString);
  console.log('Valid address');
} catch (error) {
  console.error('Invalid address:', error);
}
```

#### Error 4: Too Many Fee Claimers Without Lookup Tables

**Error Message**: `"Transaction too large"` or `"Program error"`

**Cause**: More than 15 claimers without lookup tables

**Solution**:
```typescript
// SDK automatically handles this, but if manual:
const lutResult = await sdk.config.getConfigCreationLookupTableTransactions({
  payer: creatorWallet,
  baseMint: tokenMint,
  feeClaimers: largeFeeClaimer Array,
});

// Execute LUT creation first
// Then use additionalLookupTables parameter
```

#### Error 5: Insufficient SOL for Transaction Fees

**Error Message**: `"Insufficient balance"`

**Cause**: Payer wallet doesn't have enough SOL

**Solution**:
```typescript
// Check balance before proceeding
const balance = await connection.getBalance(payerWallet);
const requiredLamports = 1_000_000;  // ~0.001 SOL

if (balance < requiredLamports) {
  console.error('Insufficient SOL balance');
  // Transfer SOL to payer wallet
}
```

#### Error 6: Partner Config Not Found

**Error Message**: `"Partner config not found"`

**Cause**: Partner config PDA doesn't exist

**Solution**:
```typescript
// Create partner config first
const partnerConfigCreation = await sdk.partner.getPartnerConfigCreationTransaction(
  partnerWallet
);

await signAndSendTransaction(
  connection,
  commitment,
  partnerConfigCreation.transaction,
  keypair
);

// Wait a few blocks
await new Promise(resolve => setTimeout(resolve, 2000));

// Then use in fee share config
```

### Logging & Debugging

```typescript
// Enable detailed logging
console.log('Fee Claimers:');
feeClaimers.forEach((claimer, i) => {
  console.log(`  [${i}] ${claimer.user.toString()}: ${claimer.userBps} BPS (${claimer.userBps / 100}%)`);
});

// Validate before sending
const totalBps = feeClaimers.reduce((sum, c) => sum + c.userBps, 0);
console.log(`Total BPS: ${totalBps} (should be 10,000)`);

// Check payer balance
const balance = await connection.getBalance(payerWallet);
console.log(`Payer balance: ${balance / LAMPORTS_PER_SOL} SOL`);

// Log API request
console.log('Creating fee config with:', {
  payer: payerWallet.toString(),
  baseMint: tokenMint.toString(),
  claimers: feeClaimers.length,
  totalBps: totalBps
});
```

---

## Best Practices

### 1. Always Include Creator Explicitly

```typescript
// ✅ Good - Creator always in array
const feeClaimers = [
  { user: creatorWallet, userBps: 7000 },
  { user: partnerWallet, userBps: 3000 }
];
```

### 2. Validate BPS Before Submission

```typescript
function validateFeeClaimer(feeClaimers) {
  const total = feeClaimers.reduce((sum, c) => sum + c.userBps, 0);
  if (total !== 10000) {
    throw new Error(`Invalid total BPS: ${total}, expected 10000`);
  }
  return true;
}
```

### 3. Handle Lookup Tables for Large Groups

```typescript
// Let SDK handle automatically
if (feeClaimers.length > 15) {
  console.log('Using lookup tables for fee config...');
}
```

### 4. Set Reasonable Tips

```typescript
// Get recommended tip from Jito
const recommendedTip = await sdk.solana.getJitoRecentFees();
const tipLamports = Math.floor(recommendedTip.landed_tips_95th_percentile * LAMPORTS_PER_SOL);
```

### 5. Test on Devnet First

```typescript
// Test on devnet before mainnet
const connection = new Connection('https://api.devnet.solana.com');
const sdk = new BagsSDK(BAGS_API_KEY, connection, 'processed');
```

---

## Fees vs. Network Costs

### Important Distinction

| Type | Purpose | Recipient | Amount |
|------|---------|-----------|---------|
| **Transaction Fee** | Network inclusion | Solana validators | ~5,000 lamports |
| **Trading Fee** | Protocol revenue | Fee claimers | Varies per trade |
| **Priority Fee/Tip** | Transaction prioritization | MEV providers | Optional, 0.001-0.02 SOL |

### Total Cost Example

```
Token Launch:
├─ Transaction fee: 5,000 lamports (~0.000005 SOL)
├─ Fee config transaction: 5,000 lamports
├─ Optional MEV tip: 15,000,000 lamports (0.015 SOL)
└─ Total: ~0.015 SOL

Claiming Fees Later:
├─ Transaction fee: 5,000 lamports (~0.000005 SOL)
└─ Total: ~0.000005 SOL
```

---

## Conclusion

Properly configuring fees is critical to token launches on Bags. Remember:

1. **BPS must sum to 10,000** - No exceptions
2. **Creator must be explicit** - Always include in array
3. **Use lookup tables for 15+ claimers** - SDK handles automatically
4. **Tips are optional** - Add for transaction priority
5. **Verify before submission** - Validate all parameters

For additional help, visit https://support.bags.fm/ or https://docs.bags.fm/