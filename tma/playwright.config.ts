import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration for ClaudeWheel TMA
 *
 * Run tests:
 *   npm run test:e2e           # Run all tests
 *   npm run test:e2e:ui        # Open UI mode
 *   npm run test:e2e:debug     # Debug mode
 *   npm run test:e2e:headed    # Run in browser window
 */
export default defineConfig({
  testDir: './e2e/flows',

  // Run tests in parallel for speed
  fullyParallel: true,

  // Fail CI if test.only is left in code
  forbidOnly: !!process.env.CI,

  // Retry failed tests on CI
  retries: process.env.CI ? 2 : 0,

  // Limit parallel workers on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    process.env.CI ? ['github'] : ['list'],
  ],

  // Global test settings
  use: {
    // Base URL for TMA dev server
    baseURL: process.env.BASE_URL || 'http://localhost:3002',

    // Collect trace on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Record video on failure
    video: 'retain-on-failure',

    // Timeout for actions
    actionTimeout: 10000,

    // Navigation timeout
    navigationTimeout: 30000,
  },

  // Expect assertion timeout (for toHaveURL, toBeVisible, etc.)
  expect: {
    timeout: 15000, // 15 seconds for assertions
  },

  // Test timeout (increase for first compile)
  timeout: 60000, // 60 seconds per test

  // Projects - Mobile-first (TMA is a mobile app)
  projects: [
    // Primary: Mobile Android (matches Telegram Android)
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        // Dark mode to match Telegram theme
        colorScheme: 'dark',
      },
    },
    // Secondary: Mobile iOS (matches Telegram iOS)
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 13'],
        colorScheme: 'dark',
      },
    },
    // Desktop for debugging (larger viewport)
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'dark',
      },
    },
  ],

  // Auto-start dev server when running tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
    // Pass environment variables to dev server
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: 'http://localhost:3001',
      NEXT_PUBLIC_PRIVY_SIGNER_ID: 'test-signer-id',
      // Note: NEXT_PUBLIC_PRIVY_APP_ID is NOT set to enable mock mode
    },
  },

  // Global setup/teardown (optional)
  // globalSetup: './e2e/global-setup.ts',
  // globalTeardown: './e2e/global-teardown.ts',
});
