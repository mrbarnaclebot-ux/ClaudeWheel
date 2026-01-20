'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

export default function LandingHeader() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0e0804]/80 border-b border-[#e2aa84]/10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-9 h-9">
              <Image
                src="/logo.png"
                alt="Claude Wheel"
                fill
                className="object-contain transition-transform duration-300 group-hover:scale-110"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold tracking-tight text-[#f8f0ec]">
                CLAUDE
              </span>
              <span className="text-lg font-semibold tracking-tight text-[#e67428]">
                WHEEL
              </span>
            </div>
          </Link>

          {/* Nav Links */}
          <div className="hidden sm:flex items-center gap-6">
            <nav className="flex items-center gap-1">
              <Link
                href="/docs"
                className="px-3 py-2 text-sm text-[#e2aa84]/70 hover:text-[#f8f0ec] transition-colors rounded-lg hover:bg-[#f8f0ec]/5"
              >
                Docs
              </Link>
              <a
                href="https://t.me/ClaudeWheelBot"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#e2aa84]/70 hover:text-[#f8f0ec] transition-colors rounded-lg hover:bg-[#f8f0ec]/5"
              >
                Bot
                <ExternalLink className="w-3 h-3" />
              </a>
              <Link
                href="/user/dashboard"
                className="ml-2 px-4 py-2 text-sm font-medium text-[#0e0804] bg-[#e67428] hover:bg-[#e2aa84] rounded-lg transition-all duration-200 hover:shadow-[0_0_20px_rgba(230,116,40,0.4)]"
              >
                Launch App
              </Link>
            </nav>
          </div>

          {/* Mobile: Launch App button */}
          <div className="sm:hidden">
            <Link
              href="/user/dashboard"
              className="px-3 py-1.5 text-sm font-medium text-[#0e0804] bg-[#e67428] hover:bg-[#e2aa84] rounded-lg transition-all duration-200"
            >
              Launch App
            </Link>
          </div>
        </div>
      </div>
    </motion.header>
  )
}
