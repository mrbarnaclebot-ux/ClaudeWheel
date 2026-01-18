'use client'

import Image from 'next/image'
import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0e0804]">
      {/* Header */}
      <header className="border-b border-[#e2aa84]/10 bg-[#0e0804]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Claude Wheel"
              width={32}
              height={32}
            />
            <span className="text-lg font-semibold text-[#f8f0ec]">Claude Wheel</span>
          </Link>
          <Link
            href="/"
            className="text-[#e2aa84]/70 hover:text-[#e67428] text-sm transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-[#f8f0ec] mb-4">
            Privacy Policy
          </h1>
          <p className="text-[#e2aa84]/60 text-sm">
            Last Updated: January 2025
          </p>
        </div>

        {/* Table of Contents */}
        <nav className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-xl p-6 mb-12">
          <h2 className="text-lg font-semibold text-[#f8f0ec] mb-4">Contents</h2>
          <ul className="space-y-2 text-sm">
            <li><a href="#data-collection" className="text-[#e67428] hover:underline">1. Data We Collect</a></li>
            <li><a href="#data-usage" className="text-[#e67428] hover:underline">2. How We Use Your Data</a></li>
            <li><a href="#data-security" className="text-[#e67428] hover:underline">3. Data Security</a></li>
            <li><a href="#data-retention" className="text-[#e67428] hover:underline">4. Data Retention</a></li>
            <li><a href="#third-parties" className="text-[#e67428] hover:underline">5. Third-Party Services</a></li>
            <li><a href="#telegram" className="text-[#e67428] hover:underline">6. Telegram Bot Data</a></li>
            <li><a href="#your-rights" className="text-[#e67428] hover:underline">7. Your Rights</a></li>
            <li><a href="#contact" className="text-[#e67428] hover:underline">8. Contact Information</a></li>
          </ul>
        </nav>

        {/* Sections */}
        <div className="space-y-12">
          {/* Data Collection */}
          <section id="data-collection" className="scroll-mt-24">
            <h2 className="text-2xl font-bold text-[#f8f0ec] mb-4 flex items-center gap-2">
              <span className="text-[#e67428]">1.</span> Data We Collect
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-[#e2aa84]/80 mb-4">
                Claude Wheel collects the following information to provide our services:
              </p>
              <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-[#f8f0ec] mb-3">Wallet Information</h3>
                <ul className="list-disc list-inside space-y-2 text-[#e2aa84]/70 text-sm">
                  <li>Wallet public addresses (dev wallet, ops wallet)</li>
                  <li>Encrypted private keys (for transaction signing)</li>
                  <li>Token mint addresses</li>
                  <li>Transaction history related to your tokens</li>
                </ul>
              </div>
              <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-[#f8f0ec] mb-3">Token Information</h3>
                <ul className="list-disc list-inside space-y-2 text-[#e2aa84]/70 text-sm">
                  <li>Token name and symbol</li>
                  <li>Token description and image URL</li>
                  <li>Flywheel configuration settings</li>
                  <li>Trading activity and fee claim history</li>
                </ul>
              </div>
              <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                <h3 className="font-semibold text-[#f8f0ec] mb-3">Telegram Data (if using bot)</h3>
                <ul className="list-disc list-inside space-y-2 text-[#e2aa84]/70 text-sm">
                  <li>Telegram user ID</li>
                  <li>Telegram username (optional)</li>
                  <li>Bot conversation history for token launches</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Data Usage */}
          <section id="data-usage" className="scroll-mt-24">
            <h2 className="text-2xl font-bold text-[#f8f0ec] mb-4 flex items-center gap-2">
              <span className="text-[#e67428]">2.</span> How We Use Your Data
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-[#e2aa84]/80 mb-4">
                We use your data exclusively to provide and improve our services:
              </p>
              <ul className="list-disc list-inside space-y-3 text-[#e2aa84]/80">
                <li><strong className="text-[#f8f0ec]">Token Launches:</strong> Process token launches on Bags.fm using provided wallet credentials</li>
                <li><strong className="text-[#f8f0ec]">Automated Trading:</strong> Execute flywheel buy/sell operations on your behalf</li>
                <li><strong className="text-[#f8f0ec]">Fee Claiming:</strong> Automatically claim and distribute trading fees</li>
                <li><strong className="text-[#f8f0ec]">Notifications:</strong> Send status updates via Telegram about your tokens</li>
                <li><strong className="text-[#f8f0ec]">Dashboard Display:</strong> Show your token status, balances, and history</li>
                <li><strong className="text-[#f8f0ec]">Audit Logging:</strong> Track critical operations for transparency and debugging</li>
              </ul>
              <div className="bg-[#e67428]/10 border border-[#e67428]/30 rounded-lg p-4 mt-4">
                <p className="text-[#e67428] text-sm">
                  We do NOT sell, share, or monetize your data with third parties for advertising or marketing purposes.
                </p>
              </div>
            </div>
          </section>

          {/* Data Security */}
          <section id="data-security" className="scroll-mt-24">
            <h2 className="text-2xl font-bold text-[#f8f0ec] mb-4 flex items-center gap-2">
              <span className="text-[#e67428]">3.</span> Data Security
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-[#e2aa84]/80 mb-4">
                We implement industry-standard security measures to protect your data:
              </p>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="bg-[#e67428]/10 border border-[#e67428]/30 rounded-lg p-4">
                  <h3 className="font-semibold text-[#e67428] mb-2">Encryption</h3>
                  <ul className="list-disc list-inside space-y-1 text-[#e2aa84]/70 text-sm">
                    <li>AES-256-GCM encryption for private keys</li>
                    <li>Unique initialization vectors (IVs)</li>
                    <li>Authentication tags for integrity</li>
                    <li>Keys stored encrypted, never in plaintext</li>
                  </ul>
                </div>
                <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                  <h3 className="font-semibold text-[#f8f0ec] mb-2">Access Control</h3>
                  <ul className="list-disc list-inside space-y-1 text-[#e2aa84]/70 text-sm">
                    <li>Wallet signature verification</li>
                    <li>Rate limiting on all endpoints</li>
                    <li>Private keys only decrypted at runtime</li>
                    <li>No human access to decrypted keys</li>
                  </ul>
                </div>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-yellow-400 text-sm">
                  <strong>Important:</strong> While we implement strong security measures, no system is 100% secure.
                  You are responsible for safeguarding your own credentials and maintaining secure practices.
                </p>
              </div>
            </div>
          </section>

          {/* Data Retention */}
          <section id="data-retention" className="scroll-mt-24">
            <h2 className="text-2xl font-bold text-[#f8f0ec] mb-4 flex items-center gap-2">
              <span className="text-[#e67428]">4.</span> Data Retention
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-[#e2aa84]/80 mb-4">
                We retain your data for the following periods:
              </p>
              <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                <ul className="space-y-3 text-[#e2aa84]/70 text-sm">
                  <li className="flex justify-between items-center">
                    <span>Active token data</span>
                    <span className="text-[#f8f0ec]">While account is active</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span>Transaction history</span>
                    <span className="text-[#f8f0ec]">Indefinitely (blockchain is permanent)</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span>Audit logs</span>
                    <span className="text-[#f8f0ec]">90 days</span>
                  </li>
                  <li className="flex justify-between items-center">
                    <span>Pending launch data (unused)</span>
                    <span className="text-[#f8f0ec]">24 hours then deleted</span>
                  </li>
                </ul>
              </div>
              <p className="text-[#e2aa84]/80 mt-4">
                You may request deletion of your account data at any time by contacting us.
                Note that blockchain transactions are permanent and cannot be deleted.
              </p>
            </div>
          </section>

          {/* Third Parties */}
          <section id="third-parties" className="scroll-mt-24">
            <h2 className="text-2xl font-bold text-[#f8f0ec] mb-4 flex items-center gap-2">
              <span className="text-[#e67428]">5.</span> Third-Party Services
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-[#e2aa84]/80 mb-4">
                Claude Wheel integrates with the following third-party services:
              </p>
              <div className="space-y-4">
                <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                  <h3 className="font-semibold text-[#f8f0ec] mb-2">Solana Blockchain</h3>
                  <p className="text-[#e2aa84]/70 text-sm">
                    All transactions are recorded on the public Solana blockchain. Transaction data including
                    wallet addresses and amounts are publicly visible.
                  </p>
                </div>
                <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                  <h3 className="font-semibold text-[#f8f0ec] mb-2">Bags.fm</h3>
                  <p className="text-[#e2aa84]/70 text-sm">
                    We use the Bags.fm API for token launches and fee claiming. Your token metadata is
                    shared with Bags.fm during launch.
                  </p>
                </div>
                <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                  <h3 className="font-semibold text-[#f8f0ec] mb-2">Jupiter Aggregator</h3>
                  <p className="text-[#e2aa84]/70 text-sm">
                    Token swaps are executed through Jupiter. Trade data is processed by their service.
                  </p>
                </div>
                <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                  <h3 className="font-semibold text-[#f8f0ec] mb-2">Telegram</h3>
                  <p className="text-[#e2aa84]/70 text-sm">
                    If you use our Telegram bot, your Telegram user ID and messages are processed
                    through Telegram&apos;s platform.
                  </p>
                </div>
                <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                  <h3 className="font-semibold text-[#f8f0ec] mb-2">Supabase</h3>
                  <p className="text-[#e2aa84]/70 text-sm">
                    We use Supabase for database hosting. Your data is stored on their secure infrastructure.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Telegram Bot */}
          <section id="telegram" className="scroll-mt-24">
            <h2 className="text-2xl font-bold text-[#f8f0ec] mb-4 flex items-center gap-2">
              <span className="text-[#e67428]">6.</span> Telegram Bot Data
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-[#e2aa84]/80 mb-4">
                When using our Telegram bot (@ClaudeWheelBot), we collect and process:
              </p>
              <ul className="list-disc list-inside space-y-2 text-[#e2aa84]/80 mb-4">
                <li>Your Telegram user ID (numeric identifier)</li>
                <li>Your Telegram username (if set)</li>
                <li>Messages you send to the bot during token launches</li>
                <li>Token launch requests and configurations</li>
              </ul>
              <div className="bg-[#e67428]/10 border border-[#e67428]/30 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-[#e67428] mb-2">Bot Privacy Settings</h3>
                <p className="text-[#e2aa84]/70 text-sm">
                  Our bot is configured with privacy mode enabled. It can only receive:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[#e2aa84]/70 text-sm mt-2">
                  <li>Direct messages sent to the bot</li>
                  <li>Commands specifically addressed to the bot</li>
                </ul>
                <p className="text-[#e2aa84]/70 text-sm mt-2">
                  The bot cannot read group messages or access your contacts.
                </p>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-yellow-400 text-sm">
                  <strong>Security Reminder:</strong> When providing private keys via Telegram,
                  delete your messages immediately after the bot confirms receipt.
                  We attempt to auto-delete key messages, but this may not always succeed.
                </p>
              </div>
            </div>
          </section>

          {/* Your Rights */}
          <section id="your-rights" className="scroll-mt-24">
            <h2 className="text-2xl font-bold text-[#f8f0ec] mb-4 flex items-center gap-2">
              <span className="text-[#e67428]">7.</span> Your Rights
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-[#e2aa84]/80 mb-4">
                You have the following rights regarding your data:
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                  <h3 className="font-semibold text-[#f8f0ec] mb-2">Access</h3>
                  <p className="text-[#e2aa84]/70 text-sm">
                    Request a copy of all data we hold about you.
                  </p>
                </div>
                <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                  <h3 className="font-semibold text-[#f8f0ec] mb-2">Correction</h3>
                  <p className="text-[#e2aa84]/70 text-sm">
                    Request correction of inaccurate data.
                  </p>
                </div>
                <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                  <h3 className="font-semibold text-[#f8f0ec] mb-2">Deletion</h3>
                  <p className="text-[#e2aa84]/70 text-sm">
                    Request deletion of your account and associated data.
                  </p>
                </div>
                <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-4">
                  <h3 className="font-semibold text-[#f8f0ec] mb-2">Export</h3>
                  <p className="text-[#e2aa84]/70 text-sm">
                    Request your data in a portable format.
                  </p>
                </div>
              </div>
              <p className="text-[#e2aa84]/80 mt-4">
                To exercise any of these rights, please contact us using the information below.
              </p>
            </div>
          </section>

          {/* Contact */}
          <section id="contact" className="scroll-mt-24">
            <h2 className="text-2xl font-bold text-[#f8f0ec] mb-4 flex items-center gap-2">
              <span className="text-[#e67428]">8.</span> Contact Information
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-[#e2aa84]/80 mb-4">
                For privacy-related inquiries or to exercise your data rights:
              </p>
              <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[#e2aa84]/60">Telegram:</span>
                    <a href="https://t.me/ClaudeWheelBot" className="text-[#e67428] hover:underline">@ClaudeWheelBot</a>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#e2aa84]/60">GitHub:</span>
                    <a href="https://github.com/mrbarnaclebot-ux/ClaudeWheel" className="text-[#e67428] hover:underline" target="_blank" rel="noopener noreferrer">
                      mrbarnaclebot-ux/ClaudeWheel
                    </a>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#e2aa84]/60">Website:</span>
                    <a href="https://claudewheel.com" className="text-[#e67428] hover:underline">claudewheel.com</a>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Policy Changes */}
          <section className="scroll-mt-24">
            <div className="bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 rounded-lg p-6">
              <h3 className="font-semibold text-[#f8f0ec] mb-2">Changes to This Policy</h3>
              <p className="text-[#e2aa84]/70 text-sm">
                We may update this Privacy Policy from time to time. We will notify you of any significant
                changes by posting a notice on our website or through the Telegram bot. Your continued use
                of our services after such modifications constitutes acceptance of the updated policy.
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-[#e2aa84]/10 text-center">
          <div className="flex justify-center gap-6 mb-4">
            <Link href="/docs" className="text-[#e2aa84]/60 hover:text-[#e67428] text-sm transition-colors">
              Documentation
            </Link>
            <Link href="/" className="text-[#e2aa84]/60 hover:text-[#e67428] text-sm transition-colors">
              Home
            </Link>
          </div>
          <p className="text-[#e2aa84]/50 text-xs">
            CA: 8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS
          </p>
          <p className="text-[#e2aa84]/30 text-xs mt-2">
            &copy; 2025 Claude Wheel. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  )
}
