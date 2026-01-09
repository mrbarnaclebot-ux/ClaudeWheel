# Telegram Bot Guide: Launching Bags Tokens

> A complete guide to building a Telegram bot that integrates with the Bags API to launch Solana tokens with proper authentication, validation, and error handling.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Setting Up Your Bot](#setting-up-your-bot)
5. [Bags API Integration](#bags-api-integration)
6. [Token Launch Workflow](#token-launch-workflow)
7. [Command Implementation](#command-implementation)
8. [Error Handling & Rate Limits](#error-handling--rate-limits)
9. [Security Best Practices](#security-best-practices)
10. [Example Code](#example-code)
11. [Testing & Deployment](#testing--deployment)

---

## Overview

This guide covers building a Telegram bot that enables users to launch Solana tokens directly through the Bags API (`https://public-api-v2.bags.fm/api/v1/`). The bot will:

- Authenticate with the Bags API using API keys
- Collect token parameters from Telegram users
- Validate inputs before submission
- Handle rate limiting and errors gracefully
- Provide real-time feedback on token creation status

**Key Integration Points:**
- Telegram Bot API (using `node-telegram-bot-api` or `python-telegram-bot`)
- Bags API v2 endpoints
- User input validation
- State management for multi-step workflows

---

## Prerequisites

### Required Accounts & Keys

1. **Telegram Bot Token**
   - Create via [@BotFather](https://t.me/botfather) on Telegram
   - Follow prompts to register your bot
   - Save your `BOT_TOKEN` securely

2. **Bags API Key**
   - Visit [dev.bags.fm](https://dev.bags.fm) and sign in
   - Create a new API key in the API Keys section
   - You can create up to 10 keys per account
   - Save your `BAGS_API_KEY` securely

3. **Environment Setup**
   - Node.js 16+ or Python 3.8+
   - `curl` or HTTP client library (axios, requests)
   - Secure .env file for credentials

### Knowledge Requirements

- Basic understanding of Telegram Bot API
- Familiarity with REST APIs and HTTP requests
- Understanding of Solana token parameters
- JSON data handling

---

## Architecture

### Flow Diagram

```
User Command (/launch)
         ↓
Telegram Bot receives message
         ↓
Collect Token Parameters (multi-step)
         ↓
User confirms details
         ↓
Validate all parameters locally
         ↓
Send to Bags API with x-api-key header
         ↓
Bags API processes token creation
         ↓
Return transaction/token details to user
         ↓
Store launch history (optional)
```

### Component Breakdown

| Component | Purpose |
|-----------|---------|
| **Telegram Bot** | User interface, command parsing, conversation flow |
| **Parameter Collector** | Multi-step form to gather token details |
| **Validator** | Local validation before API submission |
| **API Client** | HTTP requests to Bags API with auth headers |
| **Error Handler** | Catches and responds to API/network errors |
| **Rate Limiter** | Tracks usage against 1,000 req/hour limit |
| **State Manager** | Tracks user conversations and pending operations |

---

## Setting Up Your Bot

### 1. Environment Configuration

Create a `.env` file (never commit to version control):

```env
# .env
BOT_TOKEN=your_telegram_bot_token_here
BAGS_API_KEY=your_bags_api_key_here
BAGS_API_BASE_URL=https://public-api-v2.bags.fm/api/v1
NODE_ENV=development
LOG_LEVEL=info
```

### 2. Initialize Project (Node.js)

```bash
npm init -y
npm install node-telegram-bot-api axios dotenv
npm install --save-dev nodemon
```

### 3. Initialize Project (Python)

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install python-telegram-bot requests python-dotenv
```

### 4. Project Structure

```
telegram-bags-bot/
├── .env                    # Credentials (DO NOT COMMIT)
├── .env.example            # Template for .env
├── .gitignore              # Exclude sensitive files
├── package.json            # Node.js config
├── bot.js                  # Main bot file
├── lib/
│   ├── bags-client.js      # Bags API wrapper
│   ├── validator.js        # Input validation
│   ├── state-manager.js    # User session tracking
│   └── rate-limiter.js     # Rate limit tracking
├── commands/
│   ├── launch.js           # Token launch command
│   ├── cancel.js           # Cancel pending launch
│   └── status.js           # Check launch status
└── logs/                   # Application logs
```

---

## Bags API Integration

### API Authentication

**All Bags API requests require the `x-api-key` header:**

```javascript
// Node.js example
const bagsAPIKey = process.env.BAGS_API_KEY;
const headers = {
  'x-api-key': bagsAPIKey,
  'Content-Type': 'application/json'
};
```

```python
# Python example
import os

bags_api_key = os.getenv('BAGS_API_KEY')
headers = {
    'x-api-key': bags_api_key,
    'Content-Type': 'application/json'
}
```

### Key API Parameters

When launching a token via Bags API, prepare these core parameters:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | ✅ Yes | Token name (e.g., "My Token") |
| `symbol` | string | ✅ Yes | Token ticker (e.g., "MYT") |
| `decimals` | number | ✅ Yes | Token decimals (typically 6-9) |
| `initialSupply` | number | ✅ Yes | Total supply to mint |
| `image` | string/file | ⭕ Optional | Token logo image URL or upload |
| `description` | string | ⭕ Optional | Token description |
| `website` | string | ⭕ Optional | Project website URL |
| `twitter` | string | ⭕ Optional | Twitter handle |
| `discord` | string | ⭕ Optional | Discord server invite |

**Refer to the [Bags Token Launch Workflow documentation](https://docs.bags.fm/principles/token-launch-workflow) for complete endpoint specifications.**

### Rate Limiting Headers

Monitor these response headers to stay within limits:

```javascript
// Check rate limits in response headers
const xRateLimitRemaining = response.headers['x-ratelimit-remaining'];
const xRateLimitReset = response.headers['x-ratelimit-reset'];

console.log(`Requests remaining: ${xRateLimitRemaining}`);
console.log(`Reset time: ${new Date(xRateLimitReset * 1000).toISOString()}`);
```

**Rate Limit Policy:**
- **1,000 requests per hour** per user
- Limits apply **across all API keys** for your account
- Implement exponential backoff for retries

---

## Token Launch Workflow

### Step-by-Step User Flow

#### Step 1: User Initiates Launch
```
/launch
↓
Bot: "Welcome! Let's launch your token. What's the token name?"
```

#### Step 2: Collect Required Parameters
```
Bot asks in sequence:
1. Token Name
2. Token Symbol (ticker)
3. Decimals
4. Initial Supply
5. Token Logo (URL)
6. Description
7. Website
8. Twitter
9. Discord
```

#### Step 3: Review & Confirm
```
Bot displays summary:
- Token: My Token (MYT)
- Supply: 1,000,000
- Logo: [image preview]
- Website: https://example.com
- Twitter: @mytokenproject

"Confirm? (Yes/No)"
```

#### Step 4: Submit to API
```
On confirmation:
- Send to Bags API with all parameters
- Display transaction hash
- Provide token address
- Save to launch history
```

---

## Command Implementation

### /launch Command - Multi-Step Form

```javascript
// Node.js implementation
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const bagsClient = require('./lib/bags-client');
const validator = require('./lib/validator');
const stateManager = require('./lib/state-manager');

// Start the launch flow
bot.onText(/\/launch/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // Initialize user state
  stateManager.initializeUser(userId, {
    step: 'token_name',
    data: {}
  });

  bot.sendMessage(chatId, 
    '🚀 **Token Launch Wizard**\n\n' +
    'Let\'s create your Solana token!\n\n' +
    'Step 1/9: What\'s your token name?\n' +
    '_(e.g., "My Amazing Token")_',
    { parse_mode: 'Markdown' }
  );
});

// Handle all message responses (multi-step form)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // Skip bot commands
  if (text.startsWith('/')) return;

  const userState = stateManager.getUser(userId);
  if (!userState) return;

  const { step, data } = userState;

  try {
    switch (step) {
      case 'token_name':
        // Validate token name
        if (!validator.validateTokenName(text)) {
          return bot.sendMessage(chatId, 
            '❌ Invalid token name. Use 2-50 characters (letters, numbers, spaces).'
          );
        }
        data.name = text;
        stateManager.updateUser(userId, { step: 'token_symbol', data });
        return bot.sendMessage(chatId, 
          'Step 2/9: What\'s your token symbol/ticker?\n' +
          '_(e.g., "MYT")_\n\n' +
          '**Tip:** Symbols are typically 1-10 characters',
          { parse_mode: 'Markdown' }
        );

      case 'token_symbol':
        if (!validator.validateSymbol(text)) {
          return bot.sendMessage(chatId, 
            '❌ Invalid symbol. Use 1-10 uppercase letters only.'
          );
        }
        data.symbol = text.toUpperCase();
        stateManager.updateUser(userId, { step: 'decimals', data });
        return bot.sendMessage(chatId, 
          'Step 3/9: How many decimals? (typically 6-9)\n' +
          '_(e.g., "6")_',
          { parse_mode: 'Markdown' }
        );

      case 'decimals':
        const decimals = parseInt(text);
        if (!validator.validateDecimals(decimals)) {
          return bot.sendMessage(chatId, 
            '❌ Decimals must be a number between 0-18.'
          );
        }
        data.decimals = decimals;
        stateManager.updateUser(userId, { step: 'supply', data });
        return bot.sendMessage(chatId, 
          'Step 4/9: What\'s your initial supply?\n' +
          '_(e.g., "1000000")_\n\n' +
          '**Tip:** This is the total amount to mint',
          { parse_mode: 'Markdown' }
        );

      case 'supply':
        const supply = parseFloat(text);
        if (!validator.validateSupply(supply)) {
          return bot.sendMessage(chatId, 
            '❌ Supply must be a positive number.'
          );
        }
        data.initialSupply = supply;
        stateManager.updateUser(userId, { step: 'logo_url', data });
        return bot.sendMessage(chatId, 
          'Step 5/9: Token logo URL (optional)\n' +
          '_(paste image URL or reply "skip")_',
          { parse_mode: 'Markdown' }
        );

      case 'logo_url':
        if (text.toLowerCase() !== 'skip') {
          if (!validator.validateImageUrl(text)) {
            return bot.sendMessage(chatId, 
              '❌ Invalid image URL. Use "skip" or provide a valid URL.'
            );
          }
          data.image = text;
        }
        stateManager.updateUser(userId, { step: 'description', data });
        return bot.sendMessage(chatId, 
          'Step 6/9: Token description (optional)\n' +
          '_(or reply "skip")_',
          { parse_mode: 'Markdown' }
        );

      case 'description':
        if (text.toLowerCase() !== 'skip') {
          if (text.length > 500) {
            return bot.sendMessage(chatId, 
              '❌ Description too long (max 500 characters).'
            );
          }
          data.description = text;
        }
        stateManager.updateUser(userId, { step: 'website', data });
        return bot.sendMessage(chatId, 
          'Step 7/9: Website URL (optional)\n' +
          '_(or reply "skip")_',
          { parse_mode: 'Markdown' }
        );

      case 'website':
        if (text.toLowerCase() !== 'skip') {
          if (!validator.validateUrl(text)) {
            return bot.sendMessage(chatId, 
              '❌ Invalid URL. Use "skip" or provide a valid URL.'
            );
          }
          data.website = text;
        }
        stateManager.updateUser(userId, { step: 'twitter', data });
        return bot.sendMessage(chatId, 
          'Step 8/9: Twitter handle (optional)\n' +
          '_(e.g., "@mytokenproject" or "skip")_',
          { parse_mode: 'Markdown' }
        );

      case 'twitter':
        if (text.toLowerCase() !== 'skip') {
          if (!validator.validateTwitterHandle(text)) {
            return bot.sendMessage(chatId, 
              '❌ Invalid Twitter handle.'
            );
          }
          data.twitter = text.replace('@', '');
        }
        stateManager.updateUser(userId, { step: 'discord', data });
        return bot.sendMessage(chatId, 
          'Step 9/9: Discord server invite (optional)\n' +
          '_(e.g., "https://discord.gg/abc123" or "skip")_',
          { parse_mode: 'Markdown' }
        );

      case 'discord':
        if (text.toLowerCase() !== 'skip') {
          if (!validator.validateDiscordUrl(text)) {
            return bot.sendMessage(chatId, 
              '❌ Invalid Discord URL.'
            );
          }
          data.discord = text;
        }
        // Move to review step
        stateManager.updateUser(userId, { step: 'review', data });
        
        // Display review
        const summary = formatReview(data);
        const opts = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Launch Token', callback_data: 'confirm_launch' },
                { text: '❌ Cancel', callback_data: 'cancel_launch' }
              ]
            ]
          },
          parse_mode: 'Markdown'
        };
        
        return bot.sendMessage(chatId, summary, opts);
    }
  } catch (error) {
    console.error('Error in message handler:', error);
    bot.sendMessage(chatId, 
      '❌ An error occurred. Please try again.'
    );
    stateManager.clearUser(userId);
  }
});

// Handle confirmation buttons
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  try {
    if (data === 'confirm_launch') {
      await bot.answerCallbackQuery(query.id);
      const userState = stateManager.getUser(userId);
      
      if (!userState || userState.step !== 'review') {
        return bot.sendMessage(chatId, 
          '❌ Session expired. Please start over with /launch'
        );
      }

      // Send to Bags API
      await launchToken(chatId, userId, userState.data);
      stateManager.clearUser(userId);

    } else if (data === 'cancel_launch') {
      await bot.answerCallbackQuery(query.id);
      bot.sendMessage(chatId, '❌ Token launch cancelled.');
      stateManager.clearUser(userId);
    }
  } catch (error) {
    console.error('Error in callback:', error);
    bot.sendMessage(chatId, 
      '❌ An error occurred: ' + error.message
    );
  }
});

// Helper function to format review
function formatReview(tokenData) {
  const symbol = tokenData.symbol || '?';
  const supply = tokenData.initialSupply || '?';
  const decimals = tokenData.decimals || '?';
  
  return `🔍 **Review Your Token**\n\n` +
    `**Name:** ${tokenData.name}\n` +
    `**Symbol:** ${symbol}\n` +
    `**Supply:** ${supply}\n` +
    `**Decimals:** ${decimals}\n` +
    `${tokenData.website ? `**Website:** ${tokenData.website}\n` : ''}` +
    `${tokenData.twitter ? `**Twitter:** @${tokenData.twitter}\n` : ''}` +
    `${tokenData.discord ? `**Discord:** ${tokenData.discord}\n` : ''}` +
    `\n✅ Ready to launch?`;
}

// Main function to call Bags API
async function launchToken(chatId, userId, tokenData) {
  const processingMsg = await bot.sendMessage(chatId, 
    '⏳ Launching token on Bags... Please wait.'
  );

  try {
    // Call Bags API
    const response = await bagsClient.launchToken(tokenData);
    
    // Success response
    bot.editMessageText(
      `✅ **Token Launched Successfully!**\n\n` +
      `**Token Address:** \`${response.tokenAddress}\`\n` +
      `**Transaction:** \`${response.txHash}\`\n` +
      `**Explorer:** [View on Solscan](https://solscan.io/token/${response.tokenAddress})\n\n` +
      `Your token ${tokenData.symbol} is now live on Solana!`,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'Markdown'
      }
    );

    // Log successful launch
    console.log(`[${userId}] Token ${tokenData.symbol} launched:`, response);

  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    
    bot.editMessageText(
      `❌ **Launch Failed**\n\n` +
      `Error: ${errorMsg}`,
      {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: 'Markdown'
      }
    );

    console.error(`[${userId}] Launch failed:`, error.response?.data || error);
  }
}

console.log('Bot running...');
```

---

## Error Handling & Rate Limits

### Rate Limit Tracking

```javascript
// lib/rate-limiter.js
class RateLimiter {
  constructor(maxRequests = 1000, windowMs = 3600000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs; // 1 hour
    this.requests = new Map();
  }

  canMakeRequest(userId) {
    const now = Date.now();
    if (!this.requests.has(userId)) {
      this.requests.set(userId, []);
    }

    const userRequests = this.requests.get(userId);
    // Remove old requests outside the window
    const recentRequests = userRequests.filter(
      time => now - time < this.windowMs
    );

    if (recentRequests.length >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(recentRequests[0] + this.windowMs)
      };
    }

    recentRequests.push(now);
    this.requests.set(userId, recentRequests);

    return {
      allowed: true,
      remaining: this.maxRequests - recentRequests.length,
      resetTime: null
    };
  }
}

module.exports = new RateLimiter();
```

### Error Handling Wrapper

```javascript
// lib/bags-client.js
const axios = require('axios');
const rateLimiter = require('./rate-limiter');

class BagsClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = process.env.BAGS_API_BASE_URL;
  }

  async launchToken(tokenData) {
    // Check rate limit
    const rateLimitCheck = rateLimiter.canMakeRequest(tokenData.userId);
    if (!rateLimitCheck.allowed) {
      throw new Error(
        `Rate limit exceeded. Reset at ${rateLimitCheck.resetTime.toISOString()}`
      );
    }

    try {
      const response = await axios.post(
        `${this.baseURL}/tokens/launch`,
        tokenData,
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      // Check response headers for rate limit info
      console.log('Rate limit remaining:', response.headers['x-ratelimit-remaining']);
      console.log('Rate limit reset:', response.headers['x-ratelimit-reset']);

      return response.data;

    } catch (error) {
      // Handle specific error cases
      if (error.response?.status === 429) {
        throw new Error('Too many requests. Please try again later.');
      } else if (error.response?.status === 401) {
        throw new Error('API key invalid or expired.');
      } else if (error.response?.status === 400) {
        throw new Error(`Invalid parameters: ${error.response.data.message}`);
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to Bags API. Please try again.');
      }
      throw error;
    }
  }
}

module.exports = new BagsClient(process.env.BAGS_API_KEY);
```

### Common Error Scenarios

| Error Code | Meaning | Solution |
|-----------|---------|----------|
| `400` | Bad Request - Invalid parameters | Validate all token data before sending |
| `401` | Unauthorized - Invalid API key | Check `BAGS_API_KEY` in `.env` |
| `429` | Rate limited - Too many requests | Implement exponential backoff, wait for reset |
| `500` | Server error | Retry with exponential backoff |
| `ECONNREFUSED` | Network error | Check internet, verify API URL |

---

## Security Best Practices

### 1. Environment Variables
```bash
# ✅ GOOD
export BAGS_API_KEY="sk_live_xxxxx"
source .env

# ❌ BAD - Never hardcode secrets
const apiKey = "sk_live_xxxxx";
```

### 2. API Key Management
```javascript
// ✅ GOOD - Rotate keys regularly
// 1. Create new key on dev.bags.fm
// 2. Update .env with new key
// 3. Test thoroughly
// 4. Revoke old key

// ❌ BAD - Using same key forever
// Risk: If key is exposed, attacker can use it indefinitely
```

### 3. Input Validation
```javascript
// ✅ GOOD - Validate before API call
if (!validator.validateTokenName(userInput)) {
  throw new Error('Invalid token name');
}

// ❌ BAD - Send raw user input
const response = await api.launchToken(userInput);
```

### 4. Error Messages
```javascript
// ✅ GOOD - Generic error to user, detailed error in logs
bot.sendMessage(chatId, '❌ Token launch failed.');
console.error('API Error:', error.response.data);

// ❌ BAD - Expose sensitive details to user
bot.sendMessage(chatId, 
  '❌ API key invalid: ' + error.message
);
```

### 5. Rate Limiting
```javascript
// ✅ GOOD - Implement server-side rate limiting
if (requests > 1000 / 3600) {
  return res.status(429).json({ error: 'Too many requests' });
}

// ❌ BAD - No rate limiting
// Attacker could overwhelm your API key
```

### 6. Logging & Monitoring
```javascript
// ✅ GOOD - Log important events
console.log(`[${timestamp}] User ${userId} launched token ${symbol}`);

// ❌ BAD - Log sensitive data
console.log('API Response:', JSON.stringify(response));
```

---

## Example Code

### Python Implementation

```python
# bot.py
import os
import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, MessageHandler, filters,
    ConversationHandler, CallbackQueryHandler, ContextTypes
)
import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Conversation states
TOKEN_NAME, TOKEN_SYMBOL, DECIMALS, SUPPLY, LOGO, DESCRIPTION, WEBSITE, TWITTER, DISCORD, REVIEW = range(10)

class BagsTokenLauncher:
    def __init__(self):
        self.api_key = os.getenv('BAGS_API_KEY')
        self.api_url = os.getenv('BAGS_API_BASE_URL')
        self.headers = {
            'x-api-key': self.api_key,
            'Content-Type': 'application/json'
        }
        self.user_data = {}

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Start the token launch flow"""
        user_id = update.effective_user.id
        self.user_data[user_id] = {}
        
        await update.message.reply_text(
            "🚀 **Token Launch Wizard**\n\n"
            "Let's create your Solana token!\n\n"
            "Step 1/9: What's your token name?\n"
            "_(e.g., \"My Amazing Token\")_",
            parse_mode='Markdown'
        )
        return TOKEN_NAME

    async def get_token_name(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Get token name"""
        user_id = update.effective_user.id
        name = update.message.text
        
        if len(name) < 2 or len(name) > 50:
            await update.message.reply_text(
                "❌ Invalid token name. Use 2-50 characters."
            )
            return TOKEN_NAME
        
        self.user_data[user_id]['name'] = name
        await update.message.reply_text(
            "Step 2/9: What's your token symbol/ticker?\n"
            "_(e.g., \"MYT\")_",
            parse_mode='Markdown'
        )
        return TOKEN_SYMBOL

    async def get_token_symbol(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Get token symbol"""
        user_id = update.effective_user.id
        symbol = update.message.text.upper()
        
        if not (1 <= len(symbol) <= 10) or not symbol.isalpha():
            await update.message.reply_text(
                "❌ Invalid symbol. Use 1-10 uppercase letters."
            )
            return TOKEN_SYMBOL
        
        self.user_data[user_id]['symbol'] = symbol
        await update.message.reply_text(
            "Step 3/9: How many decimals? (typically 6-9)\n"
            "_(e.g., \"6\")_",
            parse_mode='Markdown'
        )
        return DECIMALS

    async def get_decimals(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Get decimals"""
        user_id = update.effective_user.id
        try:
            decimals = int(update.message.text)
            if not (0 <= decimals <= 18):
                raise ValueError()
        except ValueError:
            await update.message.reply_text(
                "❌ Decimals must be a number between 0-18."
            )
            return DECIMALS
        
        self.user_data[user_id]['decimals'] = decimals
        await update.message.reply_text(
            "Step 4/9: What's your initial supply?\n"
            "_(e.g., \"1000000\")_",
            parse_mode='Markdown'
        )
        return SUPPLY

    async def get_supply(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Get initial supply"""
        user_id = update.effective_user.id
        try:
            supply = float(update.message.text)
            if supply <= 0:
                raise ValueError()
        except ValueError:
            await update.message.reply_text(
                "❌ Supply must be a positive number."
            )
            return SUPPLY
        
        self.user_data[user_id]['initialSupply'] = supply
        await update.message.reply_text(
            "Step 5/9: Token logo URL (optional)\n"
            "_(paste image URL or reply \"skip\")_",
            parse_mode='Markdown'
        )
        return LOGO

    # ... (similar methods for remaining steps)

    async def review(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Review token details"""
        user_id = update.effective_user.id
        data = self.user_data[user_id]
        
        summary = (
            f"🔍 **Review Your Token**\n\n"
            f"**Name:** {data.get('name')}\n"
            f"**Symbol:** {data.get('symbol')}\n"
            f"**Supply:** {data.get('initialSupply')}\n"
            f"**Decimals:** {data.get('decimals')}\n"
        )
        
        keyboard = [
            [
                InlineKeyboardButton("✅ Launch Token", callback_data="confirm"),
                InlineKeyboardButton("❌ Cancel", callback_data="cancel")
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(
            summary,
            reply_markup=reply_markup,
            parse_mode='Markdown'
        )
        return REVIEW

    async def confirm_launch(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """Confirm and launch token"""
        query = update.callback_query
        await query.answer()
        user_id = query.from_user.id
        
        processing_msg = await query.edit_message_text(
            text="⏳ Launching token on Bags... Please wait."
        )
        
        try:
            data = self.user_data[user_id]
            response = requests.post(
                f"{self.api_url}/tokens/launch",
                json=data,
                headers=self.headers,
                timeout=30
            )
            response.raise_for_status()
            
            result = response.json()
            await query.edit_message_text(
                text=(
                    f"✅ **Token Launched Successfully!**\n\n"
                    f"**Token Address:** `{result['tokenAddress']}`\n"
                    f"**Transaction:** `{result['txHash']}`\n\n"
                    f"Your token is now live on Solana!"
                ),
                parse_mode='Markdown'
            )
            
            logger.info(f"Token {data['symbol']} launched by {user_id}")
            del self.user_data[user_id]
            
        except requests.exceptions.RequestException as e:
            error_msg = str(e)
            if hasattr(e.response, 'json'):
                error_msg = e.response.json().get('message', error_msg)
            
            await query.edit_message_text(
                text=f"❌ **Launch Failed**\n\nError: {error_msg}",
                parse_mode='Markdown'
            )
            logger.error(f"Launch failed for {user_id}: {error_msg}")

def main():
    """Start the bot"""
    app = Application.builder().token(os.getenv('BOT_TOKEN')).build()
    launcher = BagsTokenLauncher()
    
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler('launch', launcher.start)],
        states={
            TOKEN_NAME: [MessageHandler(filters.TEXT, launcher.get_token_name)],
            TOKEN_SYMBOL: [MessageHandler(filters.TEXT, launcher.get_token_symbol)],
            DECIMALS: [MessageHandler(filters.TEXT, launcher.get_decimals)],
            SUPPLY: [MessageHandler(filters.TEXT, launcher.get_supply)],
            LOGO: [MessageHandler(filters.TEXT, launcher.get_logo)],
            DESCRIPTION: [MessageHandler(filters.TEXT, launcher.get_description)],
            WEBSITE: [MessageHandler(filters.TEXT, launcher.get_website)],
            TWITTER: [MessageHandler(filters.TEXT, launcher.get_twitter)],
            DISCORD: [MessageHandler(filters.TEXT, launcher.get_discord)],
            REVIEW: [CallbackQueryHandler(launcher.confirm_launch)],
        },
        fallbacks=[CommandHandler('cancel', launcher.cancel)],
    )
    
    app.add_handler(conv_handler)
    app.run_polling()

if __name__ == '__main__':
    main()
```

---

## Testing & Deployment

### Local Testing

```bash
# 1. Create .env file
cp .env.example .env
# Edit .env with your credentials

# 2. Install dependencies
npm install
# or
pip install -r requirements.txt

# 3. Run bot locally
npm start
# or
python bot.py

# 4. Test in Telegram
# Open Telegram and message your bot with /launch
```

### Testing Checklist

- [ ] Bot receives `/launch` command
- [ ] Each step collects input correctly
- [ ] Validation rejects invalid inputs
- [ ] Review displays correct summary
- [ ] Confirmation sends to Bags API
- [ ] Success message shows token address
- [ ] Error handling displays user-friendly messages
- [ ] Rate limit tracking works
- [ ] Multiple users can launch simultaneously

### Production Deployment

**Option 1: Webhook Mode (Recommended)**
```bash
# Use webhook instead of polling for production
bot.setWebhook('https://yourdomain.com/webhook');
```

**Option 2: VPS Deployment**
```bash
# 1. Push code to server
git push origin main

# 2. SSH into VPS
ssh user@your-vps.com

# 3. Install dependencies
npm install --production

# 4. Use process manager (PM2)
npm install -g pm2
pm2 start bot.js
pm2 save
pm2 startup
```

**Option 3: Docker Deployment**
```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --production

COPY . .
CMD ["node", "bot.js"]
```

```bash
docker build -t telegram-bags-bot .
docker run -d \
  -e BOT_TOKEN="your_token" \
  -e BAGS_API_KEY="your_key" \
  telegram-bags-bot
```

### Environment Setup for Production

```bash
# .env.production
BOT_TOKEN=your_production_token
BAGS_API_KEY=your_production_key
BAGS_API_BASE_URL=https://public-api-v2.bags.fm/api/v1
NODE_ENV=production
LOG_LEVEL=warn
WEBHOOK_URL=https://yourdomain.com/webhook
DATABASE_URL=postgresql://...  # For storing launch history
```

---

## Monitoring & Maintenance

### Health Checks

```javascript
// Add periodic health check
setInterval(async () => {
  try {
    const response = await axios.get(
      `${process.env.BAGS_API_BASE_URL}/health`,
      { headers: { 'x-api-key': process.env.BAGS_API_KEY } }
    );
    console.log('✅ Bags API is healthy');
  } catch (error) {
    console.error('❌ Bags API health check failed:', error);
    // Alert team or restart bot
  }
}, 60000); // Every minute
```

### Logging Best Practices

```javascript
// Use structured logging
const logEvent = (level, message, metadata = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata
  };
  console.log(JSON.stringify(logEntry));
};

logEvent('info', 'Token launched', {
  userId: 12345,
  symbol: 'MYT',
  address: 'abc123...'
});
```

### Key Metrics to Monitor

- **API Response Times:** Average response time from Bags API
- **Error Rates:** Percentage of failed launches
- **Rate Limit Usage:** How many requests used per hour
- **User Growth:** New users launching tokens
- **Success Rate:** Successful vs failed launches

---

## Resources

- **Bags API Docs:** https://docs.bags.fm/
- **Telegram Bot API:** https://core.telegram.org/bots/api
- **Node Telegram Bot:** https://github.com/yagop/node-telegram-bot-api
- **Python Telegram Bot:** https://python-telegram-bot.readthedocs.io/
- **Solana Token Documentation:** https://docs.solana.com/
- **Expo Backoff Guide:** https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/

---

## Troubleshooting

### Bot doesn't respond
- Check `BOT_TOKEN` is correct and bot is registered with @BotFather
- Ensure polling is enabled or webhook is properly configured
- Check firewall/network allows Telegram API connections

### API key rejected
- Verify `BAGS_API_KEY` is copied correctly from dev.bags.fm
- Check key hasn't been revoked
- Confirm `x-api-key` header is being sent

### Rate limit exceeded
- Implement caching for repeated requests
- Distribute requests across API keys (up to 10 per account)
- Add exponential backoff retry logic

### Token launch fails
- Validate all parameters meet Bags API requirements
- Check parameter types (numbers vs strings)
- Review error message from API response

---

## Conclusion

This guide provides a complete framework for building a production-ready Telegram bot that integrates with the Bags API for token launches. Remember to:

1. **Keep API keys secure** - Never commit `.env` files
2. **Validate all inputs** - Protect against invalid/malicious data
3. **Handle errors gracefully** - Provide helpful feedback to users
4. **Monitor rate limits** - Stay within 1,000 req/hour per user
5. **Test thoroughly** - Use a test bot before production deployment

For additional support, refer to the [Bags API documentation](https://docs.bags.fm/) or the [Bags Help Center](https://support.bags.fm/).