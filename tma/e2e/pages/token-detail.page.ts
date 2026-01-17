import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Token Detail page
 *
 * Shows detailed information about a specific token:
 * - Token name and symbol
 * - Flywheel status and toggle
 * - Dev/Ops wallet addresses
 * - Balance information
 * - Trade history
 * - Settings access
 */
export class TokenDetailPage {
  readonly page: Page;

  // Header
  readonly backButton: Locator;
  readonly tokenName: Locator;
  readonly settingsButton: Locator;

  // Status section
  readonly flywheelStatus: Locator;
  readonly startButton: Locator;
  readonly pauseButton: Locator;
  readonly activeIndicator: Locator;
  readonly pausedIndicator: Locator;

  // Wallets
  readonly devWalletSection: Locator;
  readonly opsWalletSection: Locator;

  // Balance cards
  readonly devSupplyCard: Locator;
  readonly opsSolCard: Locator;

  // Claim section
  readonly claimableAmount: Locator;
  readonly claimButton: Locator;

  // Trade history
  readonly tradeHistorySection: Locator;
  readonly transactionList: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;

  // Settings panel (expandable)
  readonly settingsPanel: Locator;
  readonly editSettingsLink: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.backButton = page.locator('a[href="/dashboard"]').or(page.locator('button').filter({ hasText: '←' }));
    this.tokenName = page.locator('h1').first();
    this.settingsButton = page.locator('button').filter({ hasText: '⚙️' });

    // Status
    this.flywheelStatus = page.getByText('Flywheel').locator('..');
    this.startButton = page.getByRole('button', { name: 'Start' });
    this.pauseButton = page.getByRole('button', { name: 'Pause' });
    this.activeIndicator = page.locator('.status-dot.active').or(page.getByText('Active'));
    this.pausedIndicator = page.getByText('Paused');

    // Wallets
    this.devWalletSection = page.locator('text=Dev Wallet').locator('..');
    this.opsWalletSection = page.locator('text=Ops Wallet').locator('..');

    // Balances
    this.devSupplyCard = page.locator('text=Dev Supply').locator('..');
    this.opsSolCard = page.locator('text=Ops SOL').locator('..');

    // Claim
    this.claimableAmount = page.locator('text=Claimable').locator('..');
    this.claimButton = page.getByRole('button', { name: /Claim/i });

    // Trade history
    this.tradeHistorySection = page.locator('text=Trade History').locator('..');
    this.transactionList = page.locator('[class*="divide-y"]').filter({ has: page.locator('[class*="flex"]') });
    this.prevPageButton = page.getByRole('button', { name: 'Prev' }).or(page.getByRole('button', { name: 'Previous' }));
    this.nextPageButton = page.getByRole('button', { name: 'Next' });

    // Settings panel
    this.settingsPanel = page.locator('text=Settings').locator('..');
    this.editSettingsLink = page.getByRole('link', { name: /Settings/i }).or(page.locator('a[href*="/settings"]'));
  }

  /**
   * Navigate to a specific token detail page
   */
  async goto(tokenId: string) {
    await this.page.goto(`/token/${tokenId}`);
  }

  /**
   * Toggle the flywheel on/off
   */
  async toggleFlywheel() {
    const startVisible = await this.startButton.isVisible();
    if (startVisible) {
      await this.startButton.click();
    } else {
      await this.pauseButton.click();
    }
  }

  /**
   * Start the flywheel (when paused)
   */
  async startFlywheel() {
    await this.startButton.click();
  }

  /**
   * Pause the flywheel (when active)
   */
  async pauseFlywheel() {
    await this.pauseButton.click();
  }

  /**
   * Open the settings panel
   */
  async openSettings() {
    await this.settingsButton.click();
  }

  /**
   * Navigate to the full settings page
   */
  async goToSettingsPage() {
    // First try direct link if visible
    const directLink = this.page.locator(`a[href*="/settings"]`);
    if (await directLink.isVisible()) {
      await directLink.click();
    } else {
      // Otherwise open settings panel then click edit
      await this.openSettings();
      await this.editSettingsLink.click();
    }
  }

  /**
   * Trigger a manual fee claim
   */
  async triggerClaim() {
    await this.claimButton.click();
  }

  /**
   * Navigate back to dashboard
   */
  async goBack() {
    await this.backButton.click();
  }

  /**
   * Verify the page loaded with token info
   */
  async expectLoaded() {
    await expect(this.tokenName).toBeVisible();
  }

  /**
   * Verify flywheel is active
   */
  async expectFlywheelActive() {
    await expect(this.pauseButton).toBeVisible();
  }

  /**
   * Verify flywheel is paused
   */
  async expectFlywheelPaused() {
    await expect(this.startButton).toBeVisible();
  }

  /**
   * Verify claim button is enabled
   */
  async expectClaimEnabled() {
    await expect(this.claimButton).toBeEnabled();
  }

  /**
   * Verify claim button is disabled
   */
  async expectClaimDisabled() {
    await expect(this.claimButton).toBeDisabled();
  }

  /**
   * Get the displayed token name
   */
  async getTokenName(): Promise<string> {
    return await this.tokenName.textContent() || '';
  }

  /**
   * Navigate to next page of transactions
   */
  async nextTransactionPage() {
    await this.nextPageButton.click();
  }

  /**
   * Navigate to previous page of transactions
   */
  async prevTransactionPage() {
    await this.prevPageButton.click();
  }

  /**
   * Get transaction count on current page
   */
  async getTransactionCount(): Promise<number> {
    // Transaction items have specific structure
    return await this.page.locator('[data-testid="transaction-item"]').count();
  }
}
