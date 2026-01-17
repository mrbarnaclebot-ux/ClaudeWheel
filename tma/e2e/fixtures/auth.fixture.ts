import { test as base, Page } from '@playwright/test';
import { mockPrivyAuth, mockPrivyNewUser, MockWallet, DEFAULT_DEV_WALLET, DEFAULT_OPS_WALLET } from '../mocks/privy-mock';
import { mockTelegramWebApp, MockTelegramUser, DEFAULT_TELEGRAM_USER } from '../mocks/telegram-mock';
import { setupApiMocks, MockToken, DEFAULT_TOKEN } from '../mocks/api-handlers';

/**
 * Custom test fixtures for ClaudeWheel TMA E2E tests
 *
 * These fixtures provide pre-configured pages with different auth states,
 * making it easy to test various user scenarios.
 */

// Define our custom fixtures
type TestFixtures = {
  /** Fully authenticated user with completed onboarding */
  authenticatedPage: Page;

  /** New user who needs to complete onboarding */
  newUserPage: Page;

  /** Factory function for custom auth configurations */
  customAuthPage: (options: AuthOptions) => Promise<Page>;
};

export interface AuthOptions {
  authenticated?: boolean;
  wallets?: MockWallet[];
  telegramUser?: MockTelegramUser;
  isOnboarded?: boolean;
  tokens?: MockToken[];
  claimableAmount?: number;
}

/**
 * Extended test with custom fixtures
 */
export const test = base.extend<TestFixtures>({
  /**
   * Authenticated user fixture
   *
   * Use this for tests that require a fully onboarded user.
   * - Has 2 wallets (dev + ops)
   * - Both wallets delegated
   * - Backend shows as onboarded
   * - Has default token
   */
  authenticatedPage: async ({ page }, use) => {
    // Setup mocks before page loads
    await mockTelegramWebApp(page, DEFAULT_TELEGRAM_USER);
    await mockPrivyAuth(page, {
      authenticated: true,
      ready: true,
      wallets: [
        { address: DEFAULT_DEV_WALLET, delegated: true, chainType: 'solana', walletClientType: 'privy' },
        { address: DEFAULT_OPS_WALLET, delegated: true, chainType: 'solana', walletClientType: 'privy' },
      ],
    });
    await setupApiMocks(page, {
      isOnboarded: true,
      tokens: [DEFAULT_TOKEN],
      claimableAmount: 0.5,
    });

    await use(page);
  },

  /**
   * New user fixture
   *
   * Use this for tests that need to go through onboarding.
   * - No wallets
   * - Not onboarded
   */
  newUserPage: async ({ page }, use) => {
    // Setup mocks before page loads
    await mockTelegramWebApp(page, DEFAULT_TELEGRAM_USER);
    await mockPrivyNewUser(page);
    await setupApiMocks(page, {
      isOnboarded: false,
      tokens: [],
    });

    await use(page);
  },

  /**
   * Custom auth page factory
   *
   * Use this when you need specific auth configurations.
   * Returns a function that configures the page with your options.
   *
   * @example
   * ```ts
   * test('partial onboarding', async ({ customAuthPage }) => {
   *   const page = await customAuthPage({
   *     wallets: [
   *       { address: 'xxx', delegated: true, chainType: 'solana', walletClientType: 'privy' },
   *       { address: 'yyy', delegated: false, chainType: 'solana', walletClientType: 'privy' },
   *     ],
   *     isOnboarded: false,
   *   });
   *   // ... test code
   * });
   * ```
   */
  customAuthPage: async ({ page }, use) => {
    const setupPage = async (options: AuthOptions = {}): Promise<Page> => {
      const {
        authenticated = true,
        wallets = [
          { address: DEFAULT_DEV_WALLET, delegated: true, chainType: 'solana', walletClientType: 'privy' },
          { address: DEFAULT_OPS_WALLET, delegated: true, chainType: 'solana', walletClientType: 'privy' },
        ],
        telegramUser = DEFAULT_TELEGRAM_USER,
        isOnboarded = true,
        tokens = [DEFAULT_TOKEN],
        claimableAmount = 0.5,
      } = options;

      await mockTelegramWebApp(page, telegramUser);
      await mockPrivyAuth(page, {
        authenticated,
        ready: true,
        wallets,
      });
      await setupApiMocks(page, {
        isOnboarded,
        tokens,
        claimableAmount,
      });

      return page;
    };

    await use(setupPage);
  },
});

// Re-export expect from Playwright
export { expect } from '@playwright/test';

// Re-export commonly used types and defaults
export { DEFAULT_TOKEN, DEFAULT_DEV_WALLET, DEFAULT_OPS_WALLET, DEFAULT_TELEGRAM_USER };
export type { MockToken, MockWallet, MockTelegramUser };
