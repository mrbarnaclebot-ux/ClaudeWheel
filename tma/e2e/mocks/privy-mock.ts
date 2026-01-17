import { Page } from '@playwright/test';

/**
 * Mock Privy authentication for E2E tests
 *
 * Since we can't use real Privy auth in tests (requires Telegram context),
 * we inject mocks via page.addInitScript() before the page loads.
 */

export interface MockWallet {
  address: string;
  delegated: boolean;
  chainType: 'solana';
  walletClientType: 'privy';
}

export interface MockPrivyUser {
  id: string;
  linkedAccounts: Array<{
    type: 'wallet' | 'telegram';
    address?: string;
    delegated?: boolean;
    chainType?: string;
    walletClientType?: string;
  }>;
}

// Default test wallets
export const DEFAULT_DEV_WALLET = 'DevWaL1eTaddressXXXXXXXXXXXXXXXXXXXXXXXXXXX';
export const DEFAULT_OPS_WALLET = 'OpsWaL1eTaddressXXXXXXXXXXXXXXXXXXXXXXXXXXX';

export interface PrivyMockOptions {
  authenticated?: boolean;
  ready?: boolean;
  wallets?: MockWallet[];
  user?: MockPrivyUser;
  accessToken?: string;
}

/**
 * Inject Privy mock into page before loading
 */
export async function mockPrivyAuth(page: Page, options: PrivyMockOptions = {}) {
  const {
    authenticated = true,
    ready = true,
    wallets = [
      { address: DEFAULT_DEV_WALLET, delegated: true, chainType: 'solana', walletClientType: 'privy' },
      { address: DEFAULT_OPS_WALLET, delegated: true, chainType: 'solana', walletClientType: 'privy' },
    ],
    user = {
      id: 'did:privy:test-user-123',
      linkedAccounts: wallets.map(w => ({
        type: 'wallet' as const,
        address: w.address,
        delegated: w.delegated,
        chainType: w.chainType,
        walletClientType: w.walletClientType,
      })),
    },
    accessToken = 'mock-access-token-xyz',
  } = options;

  await page.addInitScript((params) => {
    // Store mock data globally for the PrivyTMAProvider's MockPrivyProvider to read
    // This enables E2E test mode in the TMA
    (window as any).__PRIVY_E2E_MOCK__ = {
      ready: params.ready,
      authenticated: params.authenticated,
      user: params.user,
      wallets: params.wallets,
      accessToken: params.accessToken,
    };

    // Also store for legacy compatibility
    (window as any).__PRIVY_MOCK__ = (window as any).__PRIVY_E2E_MOCK__;
    (window as any).__PRIVY_TEST_MODE__ = true;

    console.log('[E2E] Privy mock injected:', (window as any).__PRIVY_E2E_MOCK__);
  }, { ready, authenticated, user, wallets, accessToken });
}

/**
 * Mock for a new user without wallets (triggers onboarding)
 */
export async function mockPrivyNewUser(page: Page) {
  await mockPrivyAuth(page, {
    authenticated: true,
    ready: true,
    wallets: [],
    user: {
      id: 'did:privy:new-user-456',
      linkedAccounts: [],
    },
  });
}

/**
 * Mock for a user with wallets but not delegated (partial onboarding)
 */
export async function mockPrivyPartialOnboarding(page: Page, devDelegated: boolean, opsDelegated: boolean) {
  const wallets: MockWallet[] = [
    { address: DEFAULT_DEV_WALLET, delegated: devDelegated, chainType: 'solana', walletClientType: 'privy' },
    { address: DEFAULT_OPS_WALLET, delegated: opsDelegated, chainType: 'solana', walletClientType: 'privy' },
  ];

  await mockPrivyAuth(page, {
    authenticated: true,
    ready: true,
    wallets,
    user: {
      id: 'did:privy:partial-user-789',
      linkedAccounts: wallets.map(w => ({
        type: 'wallet' as const,
        address: w.address,
        delegated: w.delegated,
        chainType: w.chainType,
        walletClientType: w.walletClientType,
      })),
    },
  });
}

/**
 * Simulate wallet creation success
 */
export async function mockWalletCreation(page: Page) {
  await page.evaluate(() => {
    const mock = (window as any).__PRIVY_MOCK__;
    if (mock) {
      mock.createWalletResult = {
        wallet: { address: 'NewCreatedWaL1eTXXXXXXXXXXXXXXXXXXXXXXXXXXX' },
      };
    }
  });
}

/**
 * Simulate addSigners (wallet delegation) success
 */
export async function mockAddSignersSuccess(page: Page) {
  await page.evaluate(() => {
    const mock = (window as any).__PRIVY_MOCK__;
    if (mock) {
      mock.addSignersResult = { success: true };
    }
  });
}

/**
 * Get current Privy mock state from page
 */
export async function getPrivyMockState(page: Page): Promise<any> {
  return await page.evaluate(() => {
    return (window as any).__PRIVY_MOCK__;
  });
}
