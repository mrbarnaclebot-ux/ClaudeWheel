import { Page } from '@playwright/test';

/**
 * Mock Telegram WebApp SDK for E2E tests
 *
 * TMAs run inside Telegram's iframe and use the Telegram WebApp API.
 * We mock this API to simulate the Telegram environment in tests.
 */

export interface MockTelegramUser {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

// Default test user
export const DEFAULT_TELEGRAM_USER: MockTelegramUser = {
  id: 123456789,
  firstName: 'Test',
  lastName: 'User',
  username: 'testuser',
};

/**
 * Inject Telegram WebApp mock into page
 */
export async function mockTelegramWebApp(page: Page, user: MockTelegramUser = DEFAULT_TELEGRAM_USER) {
  await page.addInitScript((telegramUser) => {
    // Mock window.Telegram.WebApp (official Telegram WebApp API)
    (window as any).Telegram = {
      WebApp: {
        // Initialization
        ready: () => console.log('[Mock] Telegram WebApp ready'),
        expand: () => console.log('[Mock] Telegram WebApp expanded'),
        close: () => console.log('[Mock] Telegram WebApp closed'),

        // User data
        initDataUnsafe: {
          user: {
            id: telegramUser.id,
            first_name: telegramUser.firstName,
            last_name: telegramUser.lastName,
            username: telegramUser.username,
            photo_url: telegramUser.photoUrl,
          },
        },

        // Platform info
        platform: 'android',
        version: '7.0',
        colorScheme: 'dark',

        // Theme
        themeParams: {
          bg_color: '#1a1a1a',
          text_color: '#ffffff',
          hint_color: '#999999',
          link_color: '#00d26a',
          button_color: '#00d26a',
          button_text_color: '#000000',
          secondary_bg_color: '#2a2a2a',
        },

        // Haptic Feedback (no-op in tests)
        HapticFeedback: {
          impactOccurred: (type: string) => console.log(`[Mock] Haptic: ${type}`),
          notificationOccurred: (type: string) => console.log(`[Mock] Notification: ${type}`),
          selectionChanged: () => console.log('[Mock] Selection changed'),
        },

        // Other APIs (stubs)
        MainButton: {
          show: () => {},
          hide: () => {},
          setText: () => {},
          onClick: () => {},
          offClick: () => {},
          enable: () => {},
          disable: () => {},
        },
        BackButton: {
          show: () => {},
          hide: () => {},
          onClick: () => {},
          offClick: () => {},
        },

        // Event handlers
        onEvent: (eventType: string, callback: () => void) => {},
        offEvent: (eventType: string, callback: () => void) => {},

        // Data
        initData: `user=${encodeURIComponent(JSON.stringify(telegramUser))}`,
        sendData: (data: string) => console.log(`[Mock] sendData: ${data}`),

        // Viewport
        viewportHeight: 800,
        viewportStableHeight: 800,
        isExpanded: true,
      },
    };

    // Mock @telegram-apps/bridge retrieveLaunchParams
    // This is used by @telegram-apps/sdk-react
    (window as any).__TELEGRAM_LAUNCH_PARAMS__ = {
      tgWebAppData: {
        user: {
          id: telegramUser.id,
          firstName: telegramUser.firstName,
          lastName: telegramUser.lastName,
          username: telegramUser.username,
          photoUrl: telegramUser.photoUrl,
        },
      },
      tgWebAppPlatform: 'android',
      tgWebAppVersion: '7.0',
      tgWebAppThemeParams: {
        bg_color: '#1a1a1a',
        text_color: '#ffffff',
        hint_color: '#999999',
        link_color: '#00d26a',
        button_color: '#00d26a',
        button_text_color: '#000000',
      },
    };

    // Set flag for TelegramProvider to detect mock mode
    (window as any).__TELEGRAM_TEST_MODE__ = true;
    (window as any).__TELEGRAM_MOCK_USER__ = telegramUser;
  }, user);
}

/**
 * Trigger haptic feedback (for verifying it was called)
 */
export async function getHapticLogs(page: Page): Promise<string[]> {
  return await page.evaluate(() => {
    return (window as any).__HAPTIC_LOGS__ || [];
  });
}
