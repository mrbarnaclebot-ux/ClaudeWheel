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
                The flywheel operates in cycles, alternating between accumulation (buy) and distribution (sell) phases.
                Each complete cycle consists of <strong className="text-text-primary">5 buys followed by 5 sells</strong>:
              </p>
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
                  <h3 className="font-semibold text-success mb-2">Buy Phase (5 Trades)</h3>
                  <p className="text-text-muted text-sm mb-2">
                    SOL from your ops wallet is used to purchase tokens, creating buy pressure and accumulating inventory.
                  </p>
                  <p className="text-text-muted text-xs">
                    Buy amounts are randomized within your configured min/max range.
                  </p>
                </div>
                <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
                  <h3 className="font-semibold text-error mb-2">Sell Phase (5 Trades)</h3>
                  <p className="text-text-muted text-sm mb-2">
                    Accumulated tokens are sold in 5 equal portions to realize profits while maintaining market stability.
                  </p>
                  <p className="text-text-muted text-xs">
                    Token balance is snapshot at phase start and divided evenly.
                  </p>
                </div>
              </div>
              <div className="bg-bg-card border border-accent-primary/30 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-accent-primary mb-2">Auto Fee Collection</h3>
                <p className="text-text-muted text-sm">
                  Before each trade cycle, the system automatically collects accumulated trading fees from your dev wallet
                  and transfers them to your ops wallet (with platform fee deducted) to fuel the next round of buys.
                </p>
              </div>
              <p className="text-text-secondary mb-4">
                <strong className="text-text-primary">Algorithm Modes:</strong>
              </p>
              <div className="space-y-4 mb-4">
                <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
                  <h4 className="font-semibold text-text-primary mb-2">Simple Mode</h4>
                  <p className="text-text-muted text-sm">
                    Standard 5 buys → 5 sells cycle with randomized amounts within your configured range.
                    Best for steady, predictable market-making activity.
                  </p>
                </div>
                <div className="bg-bg-card border border-accent-primary/30 rounded-lg p-4">
                  <h4 className="font-semibold text-accent-primary mb-2">Smart Mode</h4>
                  <p className="text-text-muted text-sm mb-2">
                    Signal-based trading using technical analysis for optimal entry and exit points:
                  </p>
                  <ul className="list-disc list-inside text-text-muted text-xs space-y-1">
                    <li><strong className="text-text-primary">RSI Analysis:</strong> Detects oversold (&lt;30) and overbought (&gt;70) conditions</li>
                    <li><strong className="text-text-primary">Bollinger Bands:</strong> Identifies price reversals at band extremes</li>
                    <li><strong className="text-text-primary">EMA Crossover:</strong> Uses EMA-10/EMA-20 for trend direction</li>
                    <li><strong className="text-text-primary">Volatility Detection:</strong> Adjusts position sizing based on market volatility</li>
                    <li><strong className="text-text-primary">Trade Cooldown:</strong> 5-minute minimum between trades to prevent over-trading</li>
                  </ul>
                </div>
                <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
                  <h4 className="font-semibold text-text-primary mb-2">Rebalance Mode</h4>
                  <p className="text-text-muted text-sm">
                    Maintains target SOL/Token allocation ratios automatically. Set your desired portfolio
                    split and the system will buy or sell to maintain it.
                  </p>
                </div>
              </div>
              <div className="bg-success/10 border border-success/30 rounded-lg p-4">
                <p className="text-success text-sm font-mono">
                  <strong>Instant Config Updates:</strong> Algorithm mode changes take effect on the next
                  flywheel cycle (within 1 minute). Mode changes are logged in the backend console.
                </p>
              </div>
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

              {/* Platform Fee Highlight */}
              <div className="bg-accent-primary/10 border border-accent-primary/30 rounded-lg p-5 mb-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-accent-primary/20 flex items-center justify-center">
                    <span className="text-2xl font-bold text-accent-primary">10%</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">Platform Fee</h3>
                    <p className="text-text-muted text-sm">Applied to all claimed trading fees</p>
                  </div>
                </div>
                <p className="text-text-secondary text-sm">
                  When fees are claimed from Bags.fm, <strong className="text-text-primary">10% goes to the WHEEL platform</strong> and{' '}
                  <strong className="text-text-primary">90% goes to your ops wallet</strong>. This fee supports ongoing development
                  and maintenance of the platform.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
                  <h3 className="font-semibold text-text-primary mb-2">Fee Flow Example</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-text-muted">
                      <span>Claimed from Bags.fm:</span>
                      <span className="text-text-primary">1.00 SOL</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Platform fee (10%):</span>
                      <span className="text-error">-0.10 SOL</span>
                    </div>
                    <div className="flex justify-between text-text-muted">
                      <span>Reserve (for claiming):</span>
                      <span className="text-warning">-0.01 SOL</span>
                    </div>
                    <div className="border-t border-border-subtle pt-2 flex justify-between font-semibold">
                      <span className="text-text-primary">You receive:</span>
                      <span className="text-success">0.89 SOL</span>
                    </div>
                  </div>
                </div>
                <div className="bg-bg-card border border-border-subtle rounded-lg p-4">
                  <h3 className="font-semibold text-text-primary mb-2">Other Fees</h3>
                  <ul className="space-y-2 text-sm text-text-muted">
                    <li className="flex justify-between">
                      <span>Solana TX fee:</span>
                      <span>~0.000005 SOL</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Jupiter swap fee:</span>
                      <span>0.1-0.3%</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Bags.fm trading fee:</span>
                      <span>1%</span>
                    </li>
                  </ul>
                </div>
              </div>
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
            &copy; 2026 Claude Wheel. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  )
}
