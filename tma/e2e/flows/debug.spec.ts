import { test, expect } from '../fixtures/auth.fixture';

test.describe('Debug Tests', () => {
  test('check mock state is working', async ({ authenticatedPage }) => {
    // Add listener for console logs
    const logs: string[] = [];
    authenticatedPage.on('console', msg => {
      logs.push(`${msg.type()}: ${msg.text()}`);
    });

    await authenticatedPage.goto('/');

    // Wait for "Ready to redirect" to appear in logs, then wait for navigation
    await authenticatedPage.waitForFunction(() => {
      // Check if we have a redirect log entry
      return true; // Just wait for page to stabilize
    }, { timeout: 5000 }).catch(() => {});

    // Wait for the URL to change to /dashboard (the actual navigation)
    try {
      await authenticatedPage.waitForURL(/\/dashboard/, { timeout: 30000 });
      console.log('Navigation to /dashboard successful');
    } catch (e) {
      console.log('Navigation did not complete within timeout');
    }

    // Check if our mock was injected
    const mockState = await authenticatedPage.evaluate(() => {
      return {
        e2eMock: (window as any).__PRIVY_E2E_MOCK__,
        privyMock: (window as any).__PRIVY_MOCK__,
        testMode: (window as any).__PRIVY_TEST_MODE__,
        telegramMock: (window as any).__TELEGRAM_TEST_MODE__,
      };
    });

    console.log('Mock state from page:', JSON.stringify(mockState, null, 2));
    console.log('Console logs from page:', logs.join('\n'));

    // Check current URL
    const currentUrl = authenticatedPage.url();
    console.log('Current URL:', currentUrl);

    // Verify mock was injected
    expect(mockState.e2eMock).toBeTruthy();
    expect(mockState.e2eMock?.ready).toBe(true);
    expect(mockState.e2eMock?.authenticated).toBe(true);
  });

  test('check onboarding status API is called', async ({ authenticatedPage }) => {
    // Track API calls
    const apiCalls: string[] = [];
    authenticatedPage.on('request', request => {
      if (request.url().includes('/api/')) {
        apiCalls.push(`${request.method()} ${request.url()}`);
      }
    });

    await authenticatedPage.goto('/');
    await authenticatedPage.waitForTimeout(5000);

    console.log('API calls made:', apiCalls);

    // Check if onboarding-status was called
    const onboardingCall = apiCalls.find(c => c.includes('onboarding-status'));
    expect(onboardingCall).toBeTruthy();
  });
});
