import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Token Settings page
 *
 * Allows configuration of:
 * - Flywheel toggle (enable/disable trading)
 * - Auto-claim toggle (automatic fee claiming)
 * - Algorithm mode (simple, turbo_lite, rebalance)
 * - Turbo mode specific settings (when turbo_lite selected)
 */
export class SettingsPage {
  readonly page: Page;

  // Header
  readonly backButton: Locator;
  readonly pageTitle: Locator;

  // Basic settings
  readonly basicSettingsSection: Locator;
  readonly flywheelToggle: Locator;
  readonly flywheelLabel: Locator;
  readonly autoClaimToggle: Locator;
  readonly autoClaimLabel: Locator;

  // Algorithm mode
  readonly algorithmSection: Locator;
  readonly simpleAlgorithmButton: Locator;
  readonly turboLiteAlgorithmButton: Locator;
  readonly rebalanceAlgorithmButton: Locator;

  // Turbo mode settings (visible when turbo_lite selected)
  readonly turboSettingsSection: Locator;
  readonly buysCycleInput: Locator;
  readonly sellsCycleInput: Locator;
  readonly rateLimitSlider: Locator;
  readonly rateLimitValue: Locator;
  readonly jobIntervalSlider: Locator;
  readonly jobIntervalValue: Locator;

  // Advanced settings (collapsible)
  readonly advancedSettingsToggle: Locator;
  readonly interTokenDelayInput: Locator;
  readonly confirmationTimeoutInput: Locator;
  readonly batchUpdatesToggle: Locator;

  // Performance estimate (turbo mode)
  readonly performanceEstimate: Locator;

  // Save button
  readonly saveButton: Locator;

  // Unsaved changes dialog
  readonly unsavedChangesDialog: Locator;
  readonly discardButton: Locator;
  readonly saveAndLeaveButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.backButton = page.locator('button').filter({ hasText: '←' }).first();
    this.pageTitle = page.locator('h1').first();

    // Basic settings
    this.basicSettingsSection = page.getByText('Basic Settings').locator('..');
    this.flywheelLabel = page.locator('text=Flywheel').first();
    this.flywheelToggle = page.locator('text=Flywheel').locator('..').locator('button');
    this.autoClaimLabel = page.locator('text=Auto-claim').first();
    this.autoClaimToggle = page.locator('text=Auto-claim').locator('..').locator('button');

    // Algorithm mode
    this.algorithmSection = page.getByText('Algorithm Mode').locator('..');
    this.simpleAlgorithmButton = page.locator('button').filter({ hasText: '🐢 Simple' });
    this.turboLiteAlgorithmButton = page.locator('button').filter({ hasText: '🚀 Turbo Lite' });
    this.rebalanceAlgorithmButton = page.locator('button').filter({ hasText: '⚖️ Rebalance' });

    // Turbo settings
    this.turboSettingsSection = page.getByText('Turbo Mode Settings').locator('..');
    this.buysCycleInput = page.locator('text=Buys per cycle').locator('..').locator('input');
    this.sellsCycleInput = page.locator('text=Sells per cycle').locator('..').locator('input');
    this.rateLimitSlider = page.locator('text=Rate Limit').locator('..').locator('input[type="range"]');
    this.rateLimitValue = page.locator('text=/\\d+\\/min/').filter({ hasText: '/min' });
    this.jobIntervalSlider = page.locator('text=Job Interval').locator('..').locator('input[type="range"]');
    this.jobIntervalValue = page.locator('text=/\\d+s/').filter({ hasText: 's' });

    // Advanced settings
    this.advancedSettingsToggle = page.getByText('Advanced Settings');
    this.interTokenDelayInput = page.locator('text=Inter-token Delay').locator('..').locator('input');
    this.confirmationTimeoutInput = page.locator('text=Confirmation Timeout').locator('..').locator('input');
    this.batchUpdatesToggle = page.locator('text=Batch State Updates').locator('..').locator('button');

    // Performance estimate
    this.performanceEstimate = page.getByText('Estimated Performance').locator('..');

    // Save button
    this.saveButton = page.getByRole('button', { name: /Save Changes|No Changes/i });

    // Unsaved changes dialog
    this.unsavedChangesDialog = page.getByText(/unsaved changes/i).locator('..');
    this.discardButton = page.getByRole('button', { name: /Discard/i });
    this.saveAndLeaveButton = page.getByRole('button', { name: /Save/i }).filter({ hasText: /Save/ });
    this.cancelButton = page.getByRole('button', { name: /Cancel/i });
  }

  /**
   * Navigate to settings page for a token
   */
  async goto(tokenId: string) {
    await this.page.goto(`/token/${tokenId}/settings`);
  }

  /**
   * Select an algorithm mode
   */
  async selectAlgorithm(mode: 'simple' | 'turbo_lite' | 'rebalance') {
    const buttons = {
      simple: this.simpleAlgorithmButton,
      turbo_lite: this.turboLiteAlgorithmButton,
      rebalance: this.rebalanceAlgorithmButton,
    };
    await buttons[mode].click();
  }

  /**
   * Toggle the flywheel
   */
  async toggleFlywheel() {
    await this.flywheelToggle.click();
  }

  /**
   * Toggle auto-claim
   */
  async toggleAutoClaim() {
    await this.autoClaimToggle.click();
  }

  /**
   * Save the settings
   */
  async saveSettings() {
    await this.saveButton.click();
  }

  /**
   * Go back (may trigger unsaved changes dialog)
   */
  async goBack() {
    await this.backButton.click();
  }

  /**
   * Open advanced settings section
   */
  async openAdvancedSettings() {
    await this.advancedSettingsToggle.click();
  }

  /**
   * Set turbo cycle sizes
   */
  async setTurboCycleSizes(buys: number, sells: number) {
    await this.buysCycleInput.fill(buys.toString());
    await this.sellsCycleInput.fill(sells.toString());
  }

  /**
   * Verify turbo settings are visible
   */
  async expectTurboSettingsVisible() {
    await expect(this.turboSettingsSection).toBeVisible();
  }

  /**
   * Verify turbo settings are hidden
   */
  async expectTurboSettingsHidden() {
    await expect(this.turboSettingsSection).not.toBeVisible();
  }

  /**
   * Verify save button shows changes
   */
  async expectHasChanges() {
    await expect(this.saveButton).toHaveText(/Save Changes/i);
    await expect(this.saveButton).toBeEnabled();
  }

  /**
   * Verify save button shows no changes
   */
  async expectNoChanges() {
    await expect(this.saveButton).toHaveText(/No Changes/i);
    await expect(this.saveButton).toBeDisabled();
  }

  /**
   * Verify algorithm is selected
   */
  async expectAlgorithmSelected(mode: 'simple' | 'turbo_lite' | 'rebalance') {
    const buttons = {
      simple: this.simpleAlgorithmButton,
      turbo_lite: this.turboLiteAlgorithmButton,
      rebalance: this.rebalanceAlgorithmButton,
    };
    // Selected algorithm should have green border
    await expect(buttons[mode]).toHaveClass(/border-green/);
  }

  /**
   * Verify rebalance is disabled
   */
  async expectRebalanceDisabled() {
    await expect(this.rebalanceAlgorithmButton).toBeDisabled();
  }

  /**
   * Verify unsaved changes dialog is visible
   */
  async expectUnsavedChangesDialog() {
    await expect(this.page.getByText(/unsaved changes/i)).toBeVisible();
  }

  /**
   * Discard changes in the dialog
   */
  async discardChanges() {
    await this.discardButton.click();
  }

  /**
   * Save and leave in the dialog
   */
  async saveAndLeave() {
    await this.saveAndLeaveButton.click();
  }

  /**
   * Cancel leaving in the dialog
   */
  async cancelLeaving() {
    await this.cancelButton.click();
  }

  /**
   * Get current performance estimate text
   */
  async getPerformanceEstimate(): Promise<string> {
    return await this.performanceEstimate.textContent() || '';
  }

  /**
   * Verify page loaded
   */
  async expectLoaded() {
    await expect(this.pageTitle).toBeVisible();
    await expect(this.basicSettingsSection).toBeVisible();
  }
}
