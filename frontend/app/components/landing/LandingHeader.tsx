'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

interface LandingHeaderProps {
  isFlywheelActive?: boolean
}

export default function LandingHeader({ isFlywheelActive = false }: LandingHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-black/60 border-b border-white/5"
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
              <span className="text-lg font-semibold tracking-tight text-white">
                CLAUDE
              </span>
              <span className="text-lg font-semibold tracking-tight text-cyan-400">
                WHEEL
              </span>
            </div>
          </Link>

          {/* Status Indicator */}
          <div className="hidden sm:flex items-center gap-6">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
              <motion.div
                className={`w-2 h-2 rounded-full ${
                  isFlywheelActive ? 'bg-cyan-400' : 'bg-neutral-500'
                }`}
                animate={{
                  scale: isFlywheelActive ? [1, 1.4, 1] : 1,
                  opacity: isFlywheelActive ? [1, 0.6, 1] : 0.5,
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                style={{
                  boxShadow: isFlywheelActive
                    ? '0 0 8px rgba(34, 211, 238, 0.8)'
                    : 'none',
                }}
              />
              <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                {isFlywheelActive ? 'Active' : 'Paused'}
              </span>
            </div>

            {/* Nav Links */}
            <nav className="flex items-center gap-1">
              <Link
                href="/docs"
                className="px-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                Docs
              </Link>
              <a
                href="https://t.me/ClaudeWheelBot"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                Bot
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://bags.fm/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 px-4 py-2 text-sm font-medium text-black bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-all duration-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]"
              >
                Trade WHEEL
              </a>
            </nav>
          </div>

          {/* Mobile menu button */}
          <div className="sm:hidden flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <motion.div
                className={`w-2 h-2 rounded-full ${
                  isFlywheelActive ? 'bg-cyan-400' : 'bg-neutral-500'
                }`}
                animate={{
                  scale: isFlywheelActive ? [1, 1.4, 1] : 1,
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                }}
              />
              <span className="text-xs text-neutral-400">
                {isFlywheelActive ? 'Active' : 'Paused'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.header>
  )
}
