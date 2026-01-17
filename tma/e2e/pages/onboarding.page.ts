import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Onboarding page
 *
 * Handles the 6-step onboarding flow:
 * 1. welcome - Welcome screen with "Get Started" button
 * 2. creating_wallets - Loading state while creating wallets
 * 3. delegate_dev - Authorize dev wallet
 * 4. delegate_ops - Authorize ops wallet
 * 5. registering - Loading state while registering with backend
 * 6. complete - Success screen before redirect to dashboard
 */
export class OnboardingPage {
  readonly page: Page;

  // Welcome step
  readonly welcomeTitle: Locator;
  readonly welcomeEmoji: Locator;
  readonly getStartedButton: Locator;
  readonly whatYouGetList: Locator;

  // Creating wallets step
  readonly creatingWalletsSpinner: Locator;
  readonly creatingWalletsText: Locator;

  // Delegate dev step
  readonly delegateDevTitle: Locator;
  readonly devWalletAddress: Locator;
  readonly delegateDevButton: Locator;

  // Delegate ops step
  readonly delegateOpsTitle: Locator;
  readonly opsWalletAddress: Locator;
  readonly delegateOpsButton: Locator;

  // Registering step
  readonly registeringSpinner: Locator;
  readonly registeringText: Locator;

  // Complete step
  readonly completeCheckmark: Locator;
  readonly completeTitle: Locator;
  readonly completeText: Locator;

  // Error display
  readonly errorMessage: Locator;
  readonly debugInfo: Locator;

  constructor(page: Page) {
    this.page = page;

    // Welcome step locators
    this.welcomeTitle = page.getByText('Welcome to ClaudeWheel');
    this.welcomeEmoji = page.locator('.text-6xl').filter({ hasText: '🎡' });
    this.getStartedButton = page.getByRole('button', { name: 'Get Started' });
    this.whatYouGetList = page.getByText('What you\'ll get:').locator('..');

    // Creating wallets step
    this.creatingWalletsSpinner = page.locator('.animate-spin').first();
    this.creatingWalletsText = page.getByText('Creating Your Wallets');

    // Delegate dev step - use role to distinguish heading from button
    this.delegateDevTitle = page.getByRole('heading', { name: 'Authorize Dev Wallet' });
    this.devWalletAddress = page.locator('text=Dev Wallet').locator('..').locator('.font-mono');
    this.delegateDevButton = page.getByRole('button', { name: 'Authorize Dev Wallet' });

    // Delegate ops step - use role to distinguish heading from button
    this.delegateOpsTitle = page.getByRole('heading', { name: 'Authorize Ops Wallet' });
    this.opsWalletAddress = page.locator('text=Ops Wallet').locator('..').locator('.font-mono');
    this.delegateOpsButton = page.getByRole('button', { name: 'Authorize Ops Wallet' });

    // Registering step
    this.registeringSpinner = page.locator('.animate-spin').first();
    this.registeringText = page.getByText('Completing Setup');

    // Complete step
    this.completeCheckmark = page.locator('.text-6xl').filter({ hasText: '✓' });
    this.completeTitle = page.getByText("You're All Set!");
    this.completeText = page.getByText('Redirecting to dashboard...');

    // Error handling
    this.errorMessage = page.locator('.text-red-400');
    this.debugInfo = page.locator('.text-gray-500.font-mono');
  }

  /**
   * Navigate to the onboarding page
   */
  async goto() {
    await this.page.goto('/onboarding');
  }

  /**
   * Start onboarding by clicking "Get Started"
   */
  async startOnboarding() {
    await this.getStartedButton.click();
  }

  /**
   * Authorize the dev wallet
   */
  async authorizeDev() {
    await this.delegateDevButton.click();
  }

  /**
   * Authorize the ops wallet
   */
  async authorizeOps() {
    await this.delegateOpsButton.click();
  }

  /**
   * Wait for the complete step to appear
   */
  async waitForComplete(timeout = 10000) {
    await expect(this.completeTitle).toBeVisible({ timeout });
  }

  /**
   * Wait for redirect to dashboard
   */
  async waitForDashboardRedirect(timeout = 5000) {
    await expect(this.page).toHaveURL(/\/dashboard/, { timeout });
  }

  /**
   * Verify error message is displayed
   */
  async expectError(messagePattern: string | RegExp) {
    await expect(this.errorMessage).toBeVisible();
    if (typeof messagePattern === 'string') {
      await expect(this.errorMessage).toContainText(messagePattern);
    } else {
      await expect(this.errorMessage).toHaveText(messagePattern);
    }
  }

  /**
   * Check if we're on the welcome step
   */
  async expectWelcomeStep() {
    await expect(this.welcomeTitle).toBeVisible();
    await expect(this.getStartedButton).toBeVisible();
  }

  /**
   * Check if we're on the delegate dev step
   */
  async expectDelegateDevStep() {
    await expect(this.delegateDevTitle).toBeVisible();
    await expect(this.delegateDevButton).toBeVisible();
  }

  /**
   * Check if we're on the delegate ops step
   */
  async expectDelegateOpsStep() {
    await expect(this.delegateOpsTitle).toBeVisible();
    await expect(this.delegateOpsButton).toBeVisible();
  }

  /**
   * Check if we're on the complete step
   */
  async expectCompleteStep() {
    await expect(this.completeTitle).toBeVisible();
    await expect(this.completeCheckmark).toBeVisible();
  }

  /**
   * Get the displayed dev wallet address
   */
  async getDevWalletAddress(): Promise<string> {
    return await this.devWalletAddress.textContent() || '';
  }

  /**
   * Get the displayed ops wallet address
   */
  async getOpsWalletAddress(): Promise<string> {
    return await this.opsWalletAddress.textContent() || '';
  }
}
