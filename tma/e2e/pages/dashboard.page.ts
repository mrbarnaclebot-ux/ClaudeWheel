import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Dashboard page
 *
 * Main landing page after onboarding showing:
 * - User greeting
 * - Wallet overview (dev + ops addresses)
 * - Quick actions (Launch, MM Mode, Register)
 * - Stats summary (total, active, paused tokens)
 * - Token list
 */
export class DashboardPage {
  readonly page: Page;

  // Header
  readonly pageTitle: Locator;
  readonly greeting: Locator;
  readonly settingsButton: Locator;

  // Wallets section
  readonly walletsSection: Locator;
  readonly devWalletLabel: Locator;
  readonly opsWalletLabel: Locator;

  // Quick actions
  readonly launchButton: Locator;
  readonly mmModeButton: Locator;
  readonly registerButton: Locator;

  // Stats
  readonly totalTokensCount: Locator;
  readonly activeTokensCount: Locator;
  readonly pausedTokensCount: Locator;

  // Token list
  readonly tokensList: Locator;
  readonly emptyState: Locator;
  readonly loadingSkeleton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.pageTitle = page.getByText('ClaudeWheel').first();
    this.greeting = page.locator('text=Hey,').first();
    this.settingsButton = page.locator('a[href="/settings"]');

    // Wallets section
    this.walletsSection = page.getByText('Your Wallets').locator('..');
    this.devWalletLabel = page.locator('text=Dev Wallet').first();
    this.opsWalletLabel = page.locator('text=Ops Wallet').first();

    // Quick actions
    this.launchButton = page.locator('a[href="/launch"]');
    this.mmModeButton = page.locator('a[href="/mm"]');
    this.registerButton = page.locator('a[href="/register"]');

    // Stats (when tokens exist)
    this.totalTokensCount = page.locator('text=Tokens').locator('..').locator('.font-mono');
    this.activeTokensCount = page.locator('text=Active').locator('..').locator('.font-mono');
    this.pausedTokensCount = page.locator('text=Paused').locator('..').locator('.font-mono');

    // Token list
    this.tokensList = page.locator('text=Your Tokens').locator('..').locator('.space-y-3');
    this.emptyState = page.getByText('No tokens yet');
    this.loadingSkeleton = page.locator('[class*="animate-pulse"]');
  }

  /**
   * Navigate to the dashboard
   */
  async goto() {
    await this.page.goto('/dashboard');
  }

  /**
   * Click on a token card by symbol
   */
  async clickToken(symbol: string) {
    await this.page.getByText(symbol).first().click();
  }

  /**
   * Get the count of visible token cards
   */
  async getTokenCount(): Promise<number> {
    // Look for token card links
    const tokenLinks = this.page.locator('a[href^="/token/"]');
    return await tokenLinks.count();
  }

  /**
   * Verify a token is visible in the list
   */
  async expectTokenVisible(symbol: string) {
    await expect(this.page.getByText(symbol).first()).toBeVisible();
  }

  /**
   * Verify the empty state is shown
   */
  async expectEmptyState() {
    await expect(this.emptyState).toBeVisible();
  }

  /**
   * Verify loading state
   */
  async expectLoading() {
    await expect(this.loadingSkeleton.first()).toBeVisible();
  }

  /**
   * Verify dashboard loaded successfully
   */
  async expectLoaded() {
    await expect(this.pageTitle).toBeVisible();
    // Either tokens list or empty state should be visible
    const hasTokens = await this.page.locator('a[href^="/token/"]').count() > 0;
    if (!hasTokens) {
      await expect(this.emptyState).toBeVisible();
    }
  }

  /**
   * Get stats values
   */
  async getStats(): Promise<{ total: number; active: number; paused: number }> {
    const total = await this.totalTokensCount.textContent();
    const active = await this.activeTokensCount.textContent();
    const paused = await this.pausedTokensCount.textContent();

    return {
      total: parseInt(total || '0', 10),
      active: parseInt(active || '0', 10),
      paused: parseInt(paused || '0', 10),
    };
  }

  /**
   * Navigate to launch page
   */
  async clickLaunch() {
    await this.launchButton.click();
  }

  /**
   * Navigate to MM mode page
   */
  async clickMmMode() {
    await this.mmModeButton.click();
  }

  /**
   * Navigate to register page
   */
  async clickRegister() {
    await this.registerButton.click();
  }

  /**
   * Verify user greeting contains name
   */
  async expectGreeting(name: string) {
    await expect(this.page.getByText(`Hey, ${name}`)).toBeVisible();
  }

  /**
   * Verify wallets section shows addresses
   */
  async expectWalletsVisible() {
    await expect(this.walletsSection).toBeVisible();
    await expect(this.devWalletLabel).toBeVisible();
    await expect(this.opsWalletLabel).toBeVisible();
  }

  /**
   * Check token status badge
   */
  async expectTokenStatus(symbol: string, status: 'Active' | 'Paused') {
    const tokenCard = this.page.locator(`a[href^="/token/"]`).filter({ hasText: symbol });
    await expect(tokenCard.getByText(status)).toBeVisible();
  }
}
