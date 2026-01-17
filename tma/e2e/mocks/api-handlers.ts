import { Page } from '@playwright/test';
import { DEFAULT_DEV_WALLET, DEFAULT_OPS_WALLET } from './privy-mock';

/**
 * Mock Backend API responses using Playwright route interception
 *
 * This allows tests to run without a real backend, providing:
 * - Faster test execution
 * - Deterministic responses
 * - Easy edge case simulation (errors, slow responses)
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface MockToken {
  id: string;
  token_mint: string;
  token_name: string;
  token_symbol: string;
  token_image?: string;
  token_source: 'launched' | 'registered' | 'mm_only';
  config: {
    flywheel_active: boolean;
    auto_claim_enabled: boolean;
    algorithm_mode: 'simple' | 'turbo_lite' | 'rebalance';
    turbo_job_interval_seconds?: number;
    turbo_cycle_size_buys?: number;
    turbo_cycle_size_sells?: number;
    turbo_global_rate_limit?: number;
  };
  balance?: {
    dev_sol: number;
    ops_sol: number;
    token_balance: number;
  };
  state?: {
    cycle_phase: 'buy' | 'sell';
    buy_count: number;
    sell_count: number;
  };
}

// Default mock token
export const DEFAULT_TOKEN: MockToken = {
  id: 'token-uuid-123',
  token_mint: 'TokenMintAddr1234567890123456789012345XXXXX',
  token_name: 'Test Token',
  token_symbol: 'TEST',
  token_image: 'https://example.com/token.png',
  token_source: 'launched',
  config: {
    flywheel_active: false,
    auto_claim_enabled: true,
    algorithm_mode: 'simple',
  },
  balance: {
    dev_sol: 1.5,
    ops_sol: 2.0,
    token_balance: 1000000,
  },
  state: {
    cycle_phase: 'buy',
    buy_count: 2,
    sell_count: 0,
  },
};

export interface ApiMockOptions {
  isOnboarded?: boolean;
  tokens?: MockToken[];
  claimableAmount?: number;
}

/**
 * Setup all API mocks for a page
 */
export async function setupApiMocks(page: Page, options: ApiMockOptions = {}) {
  const {
    isOnboarded = true,
    tokens = [DEFAULT_TOKEN],
    claimableAmount = 0.5,
  } = options;

  // ======================================
  // User & Onboarding Routes
  // ======================================

  // GET /api/users/onboarding-status
  // Note: The hook uses `data.isOnboarded` where `data` is the axios response data
  // So we return the structure the hook expects directly (not wrapped in another 'data' key)
  await page.route(`${API_BASE}/api/users/onboarding-status`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        isOnboarded,
        hasUser: isOnboarded,
        walletsDelegated: isOnboarded,
        walletCount: isOnboarded ? 2 : 0,
      }),
    });
  });

  // POST /api/users/complete-onboarding
  await page.route(`${API_BASE}/api/users/complete-onboarding`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            alreadyOnboarded: false,
            devWalletAddress: DEFAULT_DEV_WALLET,
            opsWalletAddress: DEFAULT_OPS_WALLET,
          },
          message: 'Onboarding completed successfully',
        }),
      });
    }
  });

  // GET /api/users/profile
  await page.route(`${API_BASE}/api/users/profile`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: 'user-123',
          devWalletAddress: DEFAULT_DEV_WALLET,
          opsWalletAddress: DEFAULT_OPS_WALLET,
        },
      }),
    });
  });

  // ======================================
  // Token Routes
  // ======================================

  // GET /api/privy/tokens (list)
  await page.route(`${API_BASE}/api/privy/tokens`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          tokens,
        }),
      });
    } else if (route.request().method() === 'POST') {
      // POST /api/privy/tokens (register token)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { tokenId: 'new-token-id-456' },
        }),
      });
    }
  });

  // GET /api/privy/tokens/:id (detail)
  await page.route(new RegExp(`${API_BASE}/api/privy/tokens/[^/]+$`), async (route) => {
    const url = route.request().url();
    const tokenId = url.split('/').pop();

    if (route.request().method() === 'GET') {
      const token = tokens.find(t => t.id === tokenId) || DEFAULT_TOKEN;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...token,
          dev_wallet: { wallet_address: DEFAULT_DEV_WALLET },
          ops_wallet: { wallet_address: DEFAULT_OPS_WALLET },
        }),
      });
    }
  });

  // PUT /api/privy/tokens/:id/config
  await page.route(new RegExp(`${API_BASE}/api/privy/tokens/[^/]+/config`), async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Config updated' }),
      });
    }
  });

  // GET /api/privy/tokens/:id/transactions
  await page.route(new RegExp(`${API_BASE}/api/privy/tokens/[^/]+/transactions`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          transactions: [
            {
              id: 'tx-1',
              type: 'buy',
              amount: 0.1,
              signature: 'MockTxSig1234567890',
              created_at: new Date(Date.now() - 3600000).toISOString(),
            },
            {
              id: 'tx-2',
              type: 'sell',
              amount: 0.05,
              signature: 'MockTxSig0987654321',
              created_at: new Date(Date.now() - 7200000).toISOString(),
            },
          ],
          total: 2,
          limit: 10,
          offset: 0,
        },
      }),
    });
  });

  // ======================================
  // Claim Routes
  // ======================================

  // GET /api/privy/tokens/:id/claimable
  await page.route(new RegExp(`${API_BASE}/api/privy/tokens/[^/]+/claimable`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { claimableAmount },
      }),
    });
  });

  // POST /api/privy/tokens/:id/claim
  await page.route(new RegExp(`${API_BASE}/api/privy/tokens/[^/]+/claim`), async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            claimedAmount: claimableAmount,
            userReceived: claimableAmount * 0.9, // 90% to user
            platformFee: claimableAmount * 0.1, // 10% platform fee
            signature: 'ClaimTxSignature123456789',
          },
          message: 'Fees claimed successfully',
        }),
      });
    }
  });

  // GET /api/privy/tokens/:id/claims (history)
  await page.route(new RegExp(`${API_BASE}/api/privy/tokens/[^/]+/claims`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          claims: [
            {
              id: 'claim-1',
              amountSol: 0.5,
              userReceived: 0.45,
              platformFee: 0.05,
              claimedAt: new Date(Date.now() - 86400000).toISOString(),
              signature: 'PreviousClaim123',
            },
          ],
          total: 1,
        },
      }),
    });
  });

  // ======================================
  // Dev Buy Balance
  // ======================================

  // GET /api/privy/launches/devbuy-balance/:id
  await page.route(new RegExp(`${API_BASE}/api/privy/launches/devbuy-balance/`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          devTokenBalance: 50000,
          opsSolBalance: 1.5,
          tokenSymbol: 'TEST',
        },
      }),
    });
  });

  // ======================================
  // Bags.fm Proxy Routes
  // ======================================

  // GET /api/bags/token/:mint
  await page.route(new RegExp(`${API_BASE}/api/bags/token/`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          tokenName: 'Bags Test Token',
          tokenSymbol: 'BTT',
          decimals: 9,
          creatorAddress: DEFAULT_DEV_WALLET,
        },
      }),
    });
  });

  // ======================================
  // MM Routes
  // ======================================

  // POST /api/privy/mm/start
  await page.route(`${API_BASE}/api/privy/mm/start`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'mm-pending-123',
            depositAddress: DEFAULT_OPS_WALLET,
            minDepositSol: 1.0,
            status: 'awaiting_deposit',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        }),
      });
    }
  });

  // GET /api/privy/mm/pending
  await page.route(`${API_BASE}/api/privy/mm/pending`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: null, // No pending MM by default
      }),
    });
  });

  // POST /api/privy/mm/:id/withdraw
  await page.route(new RegExp(`${API_BASE}/api/privy/mm/[^/]+/withdraw`), async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Withdrawal initiated',
        }),
      });
    }
  });

  // ======================================
  // Launch Routes
  // ======================================

  // POST /api/privy/launches
  await page.route(`${API_BASE}/api/privy/launches`, async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 'launch-123',
            status: 'awaiting_deposit',
            depositAddress: DEFAULT_DEV_WALLET,
            requiredAmount: 0.5,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        }),
      });
    }
  });

  // GET /api/privy/launches/pending
  await page.route(`${API_BASE}/api/privy/launches/pending`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: null, // No pending launches by default
      }),
    });
  });
}

/**
 * Override a specific route to return an error
 */
export async function mockApiError(page: Page, routePattern: RegExp | string, statusCode: number, errorMessage: string) {
  await page.route(routePattern, async (route) => {
    await route.fulfill({
      status: statusCode,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: errorMessage,
      }),
    });
  });
}

/**
 * Override a specific route with a custom response
 */
export async function mockApiResponse(page: Page, routePattern: RegExp | string, response: any) {
  await page.route(routePattern, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}
