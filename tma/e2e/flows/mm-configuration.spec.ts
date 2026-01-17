import { test, expect, DEFAULT_TOKEN } from '../fixtures/auth.fixture';
import { DashboardPage } from '../pages/dashboard.page';
import { TokenDetailPage } from '../pages/token-detail.page';
import { SettingsPage } from '../pages/settings.page';

/**
 * E2E Tests for MM Configuration & Settings Flow
 *
 * Tests the market-making configuration journey:
 * 1. Navigate from dashboard to token detail
 * 2. Toggle flywheel on/off from detail page
 * 3. Navigate to settings page
 * 4. Change algorithm mode
 * 5. Configure turbo_lite specific settings
 * 6. Save settings and verify persistence
 *
 * Also tests:
 * - Unsaved changes warning
 * - Algorithm mode visibility rules
 * - Performance estimate calculation
 */

test.describe('MM Configuration Navigation', () => {
  test('navigates from dashboard to token detail', async ({ authenticatedPage }) => {
    const dashboard = new DashboardPage(authenticatedPage);

    await dashboard.goto();
    await dashboard.expectLoaded();
    await dashboard.expectTokenVisible(DEFAULT_TOKEN.token_symbol);

    // Click on token
    await dashboard.clickToken(DEFAULT_TOKEN.token_symbol);

    // Should navigate to token detail (allow time for Next.js to compile page)
    await expect(authenticatedPage).toHaveURL(new RegExp(`/token/${DEFAULT_TOKEN.id}`), { timeout: 30000 });

    const tokenDetail = new TokenDetailPage(authenticatedPage);
    await tokenDetail.expectLoaded();
  });

  test('navigates from token detail to settings page', async ({ authenticatedPage }) => {
    const tokenDetail = new TokenDetailPage(authenticatedPage);

    await tokenDetail.goto(DEFAULT_TOKEN.id);
    await tokenDetail.expectLoaded();

    // Navigate to settings
    await tokenDetail.goToSettingsPage();

    // Should be on settings page (allow time for Next.js to compile page)
    await expect(authenticatedPage).toHaveURL(new RegExp(`/token/${DEFAULT_TOKEN.id}/settings`), { timeout: 30000 });

    const settings = new SettingsPage(authenticatedPage);
    await settings.expectLoaded();
  });
});

test.describe('Flywheel Toggle', () => {
  test('toggles flywheel on token detail page - start', async ({ authenticatedPage }) => {
    const tokenDetail = new TokenDetailPage(authenticatedPage);

    await tokenDetail.goto(DEFAULT_TOKEN.id);
    await tokenDetail.expectLoaded();

    // Initially paused (flywheel_active: false in mock)
    await tokenDetail.expectFlywheelPaused();

    // Start flywheel
    await tokenDetail.startFlywheel();

    // Should now show pause button (after API response)
    await tokenDetail.expectFlywheelActive();
  });

  test('toggles flywheel on settings page', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.expectLoaded();

    // Toggle flywheel
    await settings.toggleFlywheel();

    // Should show unsaved changes
    await settings.expectHasChanges();
  });
});

test.describe('Algorithm Mode Selection', () => {
  test('simple algorithm is selected by default', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.expectLoaded();

    // Simple should be selected (from mock default)
    await settings.expectAlgorithmSelected('simple');

    // Turbo settings should be hidden
    await settings.expectTurboSettingsHidden();
  });

  test('changes algorithm from simple to turbo_lite', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.expectLoaded();

    // Select turbo_lite
    await settings.selectAlgorithm('turbo_lite');

    // Turbo settings should now be visible
    await settings.expectTurboSettingsVisible();

    // Should show unsaved changes
    await settings.expectHasChanges();
  });

  test('turbo_lite shows configuration options', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.selectAlgorithm('turbo_lite');

    await settings.expectTurboSettingsVisible();

    // Verify turbo settings are visible
    await expect(authenticatedPage.getByText('Cycle Size')).toBeVisible();
    await expect(authenticatedPage.getByText('Rate Limit')).toBeVisible();
    await expect(authenticatedPage.getByText('Job Interval')).toBeVisible();
  });

  test('advanced settings expandable in turbo mode', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.selectAlgorithm('turbo_lite');

    // Advanced settings should be collapsed initially
    await expect(settings.interTokenDelayInput).not.toBeVisible();

    // Expand advanced settings
    await settings.openAdvancedSettings();

    // Now should be visible
    await expect(authenticatedPage.getByText('Inter-token Delay')).toBeVisible();
    await expect(authenticatedPage.getByText('Confirmation Timeout')).toBeVisible();
    await expect(authenticatedPage.getByText('Batch State Updates')).toBeVisible();
  });

  test('rebalance algorithm is disabled', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.expectLoaded();

    // Rebalance should be disabled
    await settings.expectRebalanceDisabled();
  });

  test('switching back to simple hides turbo settings', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);

    // First select turbo
    await settings.selectAlgorithm('turbo_lite');
    await settings.expectTurboSettingsVisible();

    // Switch back to simple
    await settings.selectAlgorithm('simple');
    await settings.expectTurboSettingsHidden();
  });
});

test.describe('Turbo Mode Configuration', () => {
  test('shows performance estimate for turbo mode', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.selectAlgorithm('turbo_lite');

    // Should show performance estimate
    await expect(authenticatedPage.getByText('Estimated Performance')).toBeVisible();
    await expect(authenticatedPage.getByText(/trades\/min/)).toBeVisible();
  });

  test('updates performance estimate when changing cycle size', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.selectAlgorithm('turbo_lite');

    // Get initial estimate
    const initialEstimate = await settings.getPerformanceEstimate();

    // Change cycle size
    await settings.setTurboCycleSizes(12, 12);

    // Estimate should change
    const newEstimate = await settings.getPerformanceEstimate();
    expect(newEstimate).not.toEqual(initialEstimate);
  });

  test('rate limit slider updates display value', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.selectAlgorithm('turbo_lite');

    // Get rate limit slider
    const slider = settings.rateLimitSlider;
    await expect(slider).toBeVisible();

    // Change value by filling (sliders need special handling)
    await slider.fill('100');

    // Display should update
    await expect(authenticatedPage.getByText('100/min')).toBeVisible();
  });
});

test.describe('Settings Persistence', () => {
  test('saves settings and redirects to token detail', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.expectLoaded();

    // Make a change
    await settings.toggleFlywheel();
    await settings.expectHasChanges();

    // Save
    await settings.saveSettings();

    // Should redirect back to token detail
    await expect(authenticatedPage).toHaveURL(new RegExp(`/token/${DEFAULT_TOKEN.id}$`), { timeout: 30000 });
  });

  test('shows success toast after saving', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.toggleFlywheel();
    await settings.saveSettings();

    // Success toast should appear
    await expect(authenticatedPage.getByText(/saved|updated/i)).toBeVisible({ timeout: 5000 });
  });

  test('no changes disables save button', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.expectLoaded();

    // Without making changes
    await settings.expectNoChanges();
  });
});

test.describe('Unsaved Changes Warning', () => {
  test('warns about unsaved changes when leaving', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.expectLoaded();

    // Make a change
    await settings.toggleFlywheel();
    await settings.expectHasChanges();

    // Try to navigate away
    await settings.goBack();

    // Should show unsaved changes dialog
    await settings.expectUnsavedChangesDialog();
  });

  test('can discard changes and leave', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.toggleFlywheel();
    await settings.goBack();

    // Discard changes
    await settings.discardChanges();

    // Should navigate to token detail
    await expect(authenticatedPage).toHaveURL(new RegExp(`/token/${DEFAULT_TOKEN.id}$`), { timeout: 30000 });
  });

  test('can cancel leaving and stay on page', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.toggleFlywheel();
    await settings.goBack();

    // Cancel
    await settings.cancelLeaving();

    // Should still be on settings page
    await expect(authenticatedPage).toHaveURL(new RegExp(`/token/${DEFAULT_TOKEN.id}/settings`), { timeout: 30000 });
  });
});

test.describe('Auto-claim Toggle', () => {
  test('toggles auto-claim setting', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);
    await settings.expectLoaded();

    // Toggle auto-claim
    await settings.toggleAutoClaim();

    // Should show unsaved changes
    await settings.expectHasChanges();
  });

  test('auto-claim description is visible', async ({ authenticatedPage }) => {
    const settings = new SettingsPage(authenticatedPage);

    await settings.goto(DEFAULT_TOKEN.id);

    await expect(authenticatedPage.getByText(/automatically claim fees/i)).toBeVisible();
  });
});
