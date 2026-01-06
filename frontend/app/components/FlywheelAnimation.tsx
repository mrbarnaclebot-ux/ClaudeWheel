'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { formatSOL, formatNumber } from '@/lib/utils'

interface FlywheelProps {
  devBalance: number
  opsBalance: number
  tokenBalance: number
  tokenSymbol?: string
  isActive?: boolean
}

export default function FlywheelAnimation({
  devBalance,
  opsBalance,
  tokenBalance,
  tokenSymbol = 'TOKEN',
  isActive = true,
}: FlywheelProps) {
  const [particles, setParticles] = useState<number[]>([0, 1, 2, 3, 4, 5])

  // Node positions (triangle layout)
  const nodes = [
    { id: 'dev', label: 'DEV WALLET', value: devBalance, unit: 'SOL', x: 50, y: 15 },
    { id: 'ops', label: 'OPS WALLET', value: opsBalance, unit: 'SOL', x: 20, y: 75 },
    { id: 'token', label: 'TOKEN', value: tokenBalance, unit: tokenSymbol, x: 80, y: 75 },
  ]

  return (
    <div className="flywheel-container relative w-full h-[400px] md:h-[450px]">
      {/* Central status text */}
      <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="text-xs font-mono text-text-muted uppercase tracking-widest mb-1">
            Status
          </div>
          <div className="flex items-center gap-2 justify-center">
            <div className={`status-dot ${isActive ? 'active' : ''}`} />
            <span className="font-display text-lg font-bold text-glow">
              {isActive ? 'FLYWHEEL ACTIVE' : 'PAUSED'}
            </span>
          </div>
        </motion.div>
      </div>

      {/* SVG for orbital paths */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {/* Orbital rings */}
        <ellipse
          cx="50"
          cy="55"
          rx="35"
          ry="25"
          fill="none"
          stroke="rgba(232, 149, 106, 0.15)"
          strokeWidth="0.3"
          strokeDasharray="2 2"
        />
        <ellipse
          cx="50"
          cy="55"
          rx="30"
          ry="20"
          fill="none"
          stroke="rgba(232, 149, 106, 0.1)"
          strokeWidth="0.2"
          strokeDasharray="1 1"
        />

        {/* Connection lines */}
        <line x1="50" y1="25" x2="25" y2="70" stroke="rgba(232, 149, 106, 0.2)" strokeWidth="0.3" />
        <line x1="50" y1="25" x2="75" y2="70" stroke="rgba(232, 149, 106, 0.2)" strokeWidth="0.3" />
        <line x1="25" y1="70" x2="75" y2="70" stroke="rgba(232, 149, 106, 0.2)" strokeWidth="0.3" />
      </svg>

      {/* Animated particles */}
      {isActive && particles.map((_, index) => (
        <motion.div
          key={index}
          className="absolute w-3 h-3 rounded-full z-30"
          style={{
            background: 'radial-gradient(circle, #e8956a 0%, transparent 70%)',
            boxShadow: '0 0 10px rgba(232, 149, 106, 0.8), 0 0 20px rgba(232, 149, 106, 0.4)',
            left: '50%',
            top: '50%',
          }}
          animate={{
            x: [
              0,
              -100 + (index * 20),
              -150 + (index * 10),
              0,
              100 - (index * 20),
              150 - (index * 10),
              0,
            ],
            y: [
              -80,
              0,
              80,
              100,
              80,
              0,
              -80,
            ],
            scale: [0.8, 1.2, 1, 0.9, 1, 1.2, 0.8],
            opacity: [0.6, 1, 0.8, 0.6, 0.8, 1, 0.6],
          }}
          transition={{
            duration: 8 + index * 0.5,
            repeat: Infinity,
            ease: 'linear',
            delay: index * 1.3,
          }}
        />
      ))}

      {/* Wallet nodes */}
      {nodes.map((node, index) => (
        <motion.div
          key={node.id}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.2, duration: 0.5 }}
          className="absolute transform -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
        >
          <motion.div
            className={`
              flywheel-node
              w-[120px] h-[120px] md:w-[140px] md:h-[140px]
              rounded-full
              bg-bg-card
              border-2 border-border-accent
              flex flex-col items-center justify-center
              cursor-pointer
              ${isActive ? 'active' : ''}
            `}
            whileHover={{ scale: 1.05 }}
            animate={isActive ? {
              boxShadow: [
                '0 0 20px rgba(232, 149, 106, 0.3)',
                '0 0 40px rgba(232, 149, 106, 0.5)',
                '0 0 20px rgba(232, 149, 106, 0.3)',
              ],
            } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {/* Node icon */}
            <div className="text-accent-primary text-xl mb-1">
              {node.id === 'dev' && '◇'}
              {node.id === 'ops' && '◈'}
              {node.id === 'token' && '◎'}
            </div>

            {/* Node label */}
            <div className="text-[10px] md:text-xs font-mono text-text-muted uppercase tracking-wider mb-1">
              {node.label}
            </div>

            {/* Node value */}
            <div className="text-base md:text-lg font-mono font-bold text-text-primary">
              {node.unit === 'SOL'
                ? formatSOL(node.value)
                : formatNumber(node.value)
              }
            </div>

            {/* Unit */}
            <div className="text-[10px] font-mono text-accent-primary">
              {node.unit}
            </div>
          </motion.div>
        </motion.div>
      ))}

      {/* Animated arrows between nodes */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-15" viewBox="0 0 100 100">
        {/* Dev → Ops arrow */}
        <motion.path
          d="M 42 28 Q 30 45 28 60"
          fill="none"
          stroke="url(#arrowGradient)"
          strokeWidth="0.8"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.8 }}
          transition={{ duration: 1.5, delay: 0.5 }}
        />

        {/* Ops → Token arrow */}
        <motion.path
          d="M 35 75 L 65 75"
          fill="none"
          stroke="url(#arrowGradient)"
          strokeWidth="0.8"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.8 }}
          transition={{ duration: 1.5, delay: 1 }}
        />

        {/* Token → Dev arrow */}
        <motion.path
          d="M 72 60 Q 70 45 58 28"
          fill="none"
          stroke="url(#arrowGradient)"
          strokeWidth="0.8"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.8 }}
          transition={{ duration: 1.5, delay: 1.5 }}
        />

        <defs>
          <linearGradient id="arrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e8956a" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#e8956a" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#4ecdc4" stopOpacity="0.4" />
          </linearGradient>
        </defs>
      </svg>

      {/* Flow direction indicators */}
      <div className="absolute left-1/2 top-[45%] transform -translate-x-1/2 -translate-y-1/2 z-5">
        <motion.div
          className="text-accent-primary text-2xl opacity-30"
          animate={{ rotate: 360 }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        >
          ⟳
        </motion.div>
      </div>
    </div>
  )
}
