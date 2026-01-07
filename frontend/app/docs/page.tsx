'use client'

import Image from 'next/image'
import Link from 'next/link'

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-void">
      {/* Header */}
      <header className="border-b border-border-subtle bg-bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Claude Wheel"
              width={32}
              height={32}
            />
            <span className="font-display text-lg font-semibold text-text-primary">Claude Wheel</span>
          </Link>
          <Link
            href="/"
            className="text-text-muted hover:text-accent-primary font-mono text-sm transition-colors"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="font-display text-4xl font-bold text-text-primary mb-4">
            Documentation
          </h1>
          <p className="text-text-muted font-mono text-lg max-w-2xl mx-auto">
            Learn how Claude Wheel&apos;s autonomous market-making engine works and how to integrate your Bags.fm token.
          </p>
        </div>

        {/* Table of Contents */}
        <nav className="card-glow bg-bg-card p-6 mb-12">
          <h2 className="font-display text-lg font-semibold text-text-primary mb-4">Contents</h2>
          <ul className="space-y-2 font-mono text-sm">
            <li><a href="#how-it-works" className="text-accent-primary hover:underline">1. How It Works</a></li>
            <li><a href="#flywheel" className="text-accent-primary hover:underline">2. The Flywheel Mechanism</a></li>
            <li><a href="#integration" className="text-accent-primary hover:underline">3. Integration Guide</a></li>
            <li><a href="#security" className="text-accent-primary hover:underline">4. Security & Encryption</a></li>
            <li><a href="#fees" className="text-accent-primary hover:underline">5. Fee Structure</a></li>
            <li><a href="#terms" className="text-accent-primary hover:underline">6. Terms of Service</a></li>
            <li><a href="#disclaimer" className="text-accent-primary hover:underline">7. Risk Disclaimer</a></li>
          </ul>
        </nav>

        {/* Sections */}
        <div className="space-y-12">
          {/* How It Works */}
          <section id="how-it-works" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-accent-primary">1.</span> How It Works
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-text-secondary mb-4">
                Claude Wheel is an autonomous market-making platform designed specifically for tokens launched on Bags.fm.
                It automates two critical functions for token creators:
              </p>
              <ul className="list-disc list-inside space-y-2 text-text-secondary mb-4">
                <li><strong className="text-text-primary">Auto Fee Claiming:</strong> Automatically claims accumulated trading fees from Bags.fm and transfers them to your operations wallet.</li>
                <li><strong className="text-text-primary">Market Making:</strong> Executes strategic buy and sell orders to maintain liquidity and support token price stability.</li>
              </ul>
              <p className="text-text-secondary">
                The system runs 24/7 without manual intervention, using configurable parameters to match your token&apos;s specific needs.
              </p>
            </div>
          </section>

          {/* The Flywheel */}
          <section id="flywheel" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-accent-primary">2.</span> The Flywheel Mechanism
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-text-secondary mb-4">
                The flywheel operates in cycles, alternating between accumulation (buy) and distribution (sell) phases:
              </p>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
                  <h3 className="font-semibold text-success mb-2">Buy Phase</h3>
                  <p className="text-text-muted text-sm">
                    Collected fees are used to purchase tokens from the market, creating buy pressure and accumulating inventory.
                  </p>
                </div>
                <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
                  <h3 className="font-semibold text-error mb-2">Sell Phase</h3>
                  <p className="text-text-muted text-sm">
                    A portion of accumulated tokens are sold in small increments to realize profits while maintaining market stability.
                  </p>
                </div>
              </div>
              <p className="text-text-secondary mb-4">
                <strong className="text-text-primary">Algorithm Modes:</strong>
              </p>
              <ul className="list-disc list-inside space-y-2 text-text-secondary">
                <li><strong className="text-text-primary">Simple:</strong> Fixed buy/sell amounts per cycle</li>
                <li><strong className="text-text-primary">Smart:</strong> Dynamic sizing based on market conditions</li>
                <li><strong className="text-text-primary">Rebalance:</strong> Maintains target SOL/Token allocation ratios</li>
              </ul>
            </div>
          </section>

          {/* Integration Guide */}
          <section id="integration" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-accent-primary">3.</span> Integration Guide
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-text-secondary mb-4">
                To connect your Bags.fm token to Claude Wheel:
              </p>
              <ol className="list-decimal list-inside space-y-3 text-text-secondary mb-4">
                <li>Connect your wallet using the &quot;Get Started&quot; button on the homepage</li>
                <li>Enter your token&apos;s mint address (found on Bags.fm)</li>
                <li>Provide your dev wallet&apos;s private key (for signing claim transactions)</li>
                <li>Set your operations wallet address (where claimed fees will be sent)</li>
                <li>Configure your market-making parameters</li>
                <li>Activate the flywheel</li>
              </ol>
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-4">
                <p className="text-warning text-sm font-mono">
                  <strong>Important:</strong> Your private key is encrypted using AES-256-GCM before storage and is only decrypted at runtime for transaction signing.
                </p>
              </div>
            </div>
          </section>

          {/* Security */}
          <section id="security" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-accent-primary">4.</span> Security & Encryption
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-text-secondary mb-4">
                We take security seriously. Here&apos;s how we protect your assets:
              </p>
              <ul className="list-disc list-inside space-y-2 text-text-secondary mb-4">
                <li><strong className="text-text-primary">AES-256-GCM Encryption:</strong> Private keys are encrypted with a 256-bit master key before storage</li>
                <li><strong className="text-text-primary">Unique IVs:</strong> Each encryption uses a unique initialization vector</li>
                <li><strong className="text-text-primary">Wallet Signature Auth:</strong> All sensitive operations require wallet signature verification</li>
                <li><strong className="text-text-primary">Rate Limiting:</strong> API endpoints are protected against abuse</li>
                <li><strong className="text-text-primary">No Key Exposure:</strong> Keys are never logged, displayed, or transmitted unencrypted</li>
              </ul>
              <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
                <p className="text-text-muted text-sm">
                  <strong className="text-text-primary">Open Source:</strong> Our code is publicly available on{' '}
                  <a href="https://github.com/mrbarnaclebot-ux/ClaudeWheel" className="text-accent-primary hover:underline" target="_blank" rel="noopener noreferrer">
                    GitHub
                  </a>
                  {' '}for transparency and community auditing.
                </p>
              </div>
            </div>
          </section>

          {/* Fees */}
          <section id="fees" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-accent-primary">5.</span> Fee Structure
            </h2>
            <div className="prose prose-invert max-w-none">
              <p className="text-text-secondary mb-4">
                Claude Wheel operates on a simple, transparent fee model:
              </p>
              <ul className="list-disc list-inside space-y-2 text-text-secondary mb-4">
                <li><strong className="text-text-primary">Platform Fee:</strong> No platform fees for basic usage</li>
                <li><strong className="text-text-primary">Network Fees:</strong> Standard Solana transaction fees apply (~0.000005 SOL per transaction)</li>
                <li><strong className="text-text-primary">DEX Fees:</strong> Standard Jupiter/Raydium swap fees apply to market-making trades</li>
              </ul>
            </div>
          </section>

          {/* Terms of Service */}
          <section id="terms" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-accent-primary">6.</span> Terms of Service
            </h2>
            <div className="prose prose-invert max-w-none bg-bg-card border border-border-subtle rounded-lg p-6">
              <p className="text-text-secondary mb-4">
                By using Claude Wheel, you agree to the following terms:
              </p>
              <ol className="list-decimal list-inside space-y-3 text-text-muted text-sm">
                <li>You are the rightful owner or authorized operator of the token and wallets you connect.</li>
                <li>You understand that cryptocurrency trading involves significant risks including total loss of funds.</li>
                <li>You are responsible for complying with all applicable laws and regulations in your jurisdiction.</li>
                <li>Claude Wheel provides tools &quot;as-is&quot; without warranties of any kind.</li>
                <li>You will not use this service for illegal activities including market manipulation, fraud, or money laundering.</li>
                <li>We may suspend or terminate access to accounts that violate these terms.</li>
                <li>We are not responsible for losses due to market conditions, bugs, or third-party service failures.</li>
                <li>You consent to the encrypted storage of your private keys for operational purposes.</li>
              </ol>
            </div>
          </section>

          {/* Disclaimer */}
          <section id="disclaimer" className="scroll-mt-24">
            <h2 className="font-display text-2xl font-bold text-text-primary mb-4 flex items-center gap-2">
              <span className="text-accent-primary">7.</span> Risk Disclaimer
            </h2>
            <div className="prose prose-invert max-w-none bg-error/5 border border-error/20 rounded-lg p-6">
              <p className="text-text-secondary mb-4 font-semibold">
                IMPORTANT: Please read this disclaimer carefully before using Claude Wheel.
              </p>
              <ul className="list-disc list-inside space-y-3 text-text-muted text-sm">
                <li>
                  <strong className="text-text-primary">No Financial Advice:</strong> Nothing on this platform constitutes financial, investment, or trading advice. Always do your own research.
                </li>
                <li>
                  <strong className="text-text-primary">High Risk:</strong> Cryptocurrency trading is extremely risky. You could lose all of your invested capital. Only invest what you can afford to lose.
                </li>
                <li>
                  <strong className="text-text-primary">No Guarantees:</strong> Past performance is not indicative of future results. We make no guarantees about profitability or returns.
                </li>
                <li>
                  <strong className="text-text-primary">Smart Contract Risk:</strong> Interactions with blockchain protocols carry inherent risks including smart contract bugs and exploits.
                </li>
                <li>
                  <strong className="text-text-primary">Market Risk:</strong> Token prices can be extremely volatile. Market conditions may result in significant losses.
                </li>
                <li>
                  <strong className="text-text-primary">Regulatory Risk:</strong> Cryptocurrency regulations vary by jurisdiction and may change. You are responsible for understanding your local laws.
                </li>
                <li>
                  <strong className="text-text-primary">Technical Risk:</strong> Software bugs, network issues, or third-party service failures may affect operations.
                </li>
              </ul>
              <p className="text-error text-sm mt-4 font-semibold">
                BY USING THIS PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND ACCEPTED THESE RISKS.
              </p>
            </div>
          </section>
        </div>

        {/* Footer CTA */}
        <div className="mt-16 text-center">
          <p className="text-text-muted font-mono text-sm mb-4">
            Ready to get started?
          </p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 px-6 py-3 bg-accent-primary text-bg-primary font-semibold rounded-lg hover:bg-accent-primary/90 transition-colors"
          >
            Connect Your Token
          </Link>
        </div>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-border-subtle text-center">
          <p className="text-text-muted font-mono text-xs">
            CA: 8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS
          </p>
          <p className="text-text-muted/50 font-mono text-xs mt-2">
            &copy; 2024 Claude Wheel. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  )
}
