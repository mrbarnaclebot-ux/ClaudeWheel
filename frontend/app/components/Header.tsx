'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

interface HeaderProps {
  isActive?: boolean
}

export default function Header({ isActive = true }: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full border-b border-border-subtle bg-bg-primary/80 backdrop-blur-sm sticky top-0 z-40"
    >
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          {/* Logo icon */}
          <div className="relative">
            <div className="w-10 h-10 rounded-lg overflow-hidden">
              <Image
                src="/logo.png"
                alt="Claude Wheel"
                width={40}
                height={40}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="absolute -top-1 -right-1">
              <div className={`w-3 h-3 rounded-full ${isActive ? 'bg-success' : 'bg-text-muted'}`}>
                {isActive && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-success"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </div>
            </div>
          </div>

          <div>
            <h1 className="font-display text-xl font-bold text-text-primary">
              CLAUDE <span className="text-accent-primary">WHEEL</span>
            </h1>
            <p className="text-xs font-mono text-text-muted">
              Autonomous Market Making
            </p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className={`badge ${isActive ? 'badge-success' : 'badge-accent'}`}>
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-success' : 'bg-accent-primary'}`} />
              {isActive ? 'ACTIVE' : 'PAUSED'}
            </span>
          </div>

          {/* Network badge */}
          <div className="badge badge-cyan">
            MAINNET
          </div>

          {/* Connection dots */}
          <div className="hidden md:flex items-center gap-1.5 ml-2">
            <motion.div
              className="w-2 h-2 rounded-full bg-accent-primary"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
            />
            <motion.div
              className="w-2 h-2 rounded-full bg-accent-secondary"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
            />
            <motion.div
              className="w-2 h-2 rounded-full bg-accent-cyan"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }}
            />
          </div>
        </div>
      </div>
    </motion.header>
  )
}
