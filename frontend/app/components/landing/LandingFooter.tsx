'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { Copy, Check, ExternalLink } from 'lucide-react'
import { useState } from 'react'

const CONTRACT_ADDRESS = '8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS'

function CopyAddress() {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(CONTRACT_ADDRESS)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-[#f8f0ec]/5 hover:bg-[#f8f0ec]/10 border border-[#e2aa84]/20 hover:border-[#e2aa84]/40 transition-all"
    >
      <span className="text-sm font-mono text-[#e2aa84]/70 group-hover:text-[#e2aa84]">
        {CONTRACT_ADDRESS.slice(0, 8)}...{CONTRACT_ADDRESS.slice(-8)}
      </span>
      {copied ? (
        <Check className="w-4 h-4 text-[#e67428]" />
      ) : (
        <Copy className="w-4 h-4 text-[#e2aa84]/50 group-hover:text-[#e2aa84]" />
      )}
    </button>
  )
}

export default function LandingFooter() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="relative mt-24 border-t border-[#e2aa84]/10"
    >
      {/* Gradient line at top */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#e67428]/30 to-transparent" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid lg:grid-cols-3 gap-12 lg:gap-8">
          {/* Brand */}
          <div>
            <Link href="/" className="inline-flex items-center gap-3 mb-4">
              <div className="relative w-10 h-10">
                <Image
                  src="/logo.png"
                  alt="Claude Wheel"
                  fill
                  className="object-contain"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-[#f8f0ec]">CLAUDE</span>
                <span className="text-lg font-semibold text-[#e67428]">WHEEL</span>
              </div>
            </Link>
            <p className="text-sm text-[#e2aa84]/60 max-w-xs">
              Autonomous market making engine for Solana tokens. Powered by
              Bags.fm.
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h4 className="text-xs font-semibold text-[#e2aa84]/60 uppercase tracking-wider mb-4">
                Platform
              </h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="https://t.me/ClaudeWheelBot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#e2aa84]/50 hover:text-[#f8f0ec] transition-colors flex items-center gap-1"
                  >
                    Launch Token
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://bags.fm/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#e2aa84]/50 hover:text-[#f8f0ec] transition-colors flex items-center gap-1"
                  >
                    Trade WHEEL
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>
                  <Link
                    href="/docs"
                    className="text-sm text-[#e2aa84]/50 hover:text-[#f8f0ec] transition-colors"
                  >
                    Documentation
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-[#e2aa84]/60 uppercase tracking-wider mb-4">
                Community
              </h4>
              <ul className="space-y-3">
                <li>
                  <a
                    href="https://x.com/i/communities/2008530158354063511"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#e2aa84]/50 hover:text-[#f8f0ec] transition-colors flex items-center gap-1"
                  >
                    X Community
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/mrbarnaclebot-ux/ClaudeWheel"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#e2aa84]/50 hover:text-[#f8f0ec] transition-colors flex items-center gap-1"
                  >
                    GitHub
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-[#e2aa84]/50 hover:text-[#f8f0ec] transition-colors"
                  >
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Contract Address */}
          <div className="lg:text-right">
            <h4 className="text-xs font-semibold text-[#e2aa84]/60 uppercase tracking-wider mb-4">
              Contract Address
            </h4>
            <CopyAddress />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-[#e2aa84]/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[#e2aa84]/40">
            Built with Claude Code
          </p>
          <p className="text-xs text-[#e2aa84]/40">
            &copy; {new Date().getFullYear()} Claude Wheel. All rights reserved.
          </p>
        </div>
      </div>
    </motion.footer>
  )
}
