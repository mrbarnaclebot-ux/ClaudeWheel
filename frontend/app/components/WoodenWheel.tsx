'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

export default function WoodenWheel() {
  const spokes = 12

  return (
    <div className="flex flex-col items-center justify-center">
      {/* Hero Title with Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        {/* Logo and Title */}
        <div className="flex items-center justify-center gap-4 mb-2">
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl overflow-hidden shadow-lg">
            <Image
              src="/logo.png"
              alt="Claude Wheel"
              width={64}
              height={64}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="text-left">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-text-primary tracking-tight">
              CLAUDE <span className="text-accent-primary">WHEEL</span>
            </h1>
            <p className="text-sm md:text-base font-mono text-text-muted">
              Autonomous Market Making Engine
            </p>
          </div>
        </div>
      </motion.div>

      {/* Classic Wooden Wagon Wheel */}
      <div className="relative mt-2">
        {/* The Wheel - Always Rotating at constant speed */}
        <motion.div
          className="relative w-[340px] h-[340px] md:w-[440px] md:h-[440px]"
          animate={{ rotate: 360 }}
          transition={{
            duration: 60,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          <svg viewBox="0 0 400 400" className="w-full h-full" style={{ filter: 'drop-shadow(4px 6px 12px rgba(0,0,0,0.4))' }}>
            <defs>
              {/* Main wood color - natural tan/brown */}
              <linearGradient id="woodMain" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#B8956A"/>
                <stop offset="25%" stopColor="#A68558"/>
                <stop offset="50%" stopColor="#8B7248"/>
                <stop offset="75%" stopColor="#A68558"/>
                <stop offset="100%" stopColor="#7A6340"/>
              </linearGradient>

              {/* Rim wood gradient - natural brown */}
              <linearGradient id="rimWood" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6B5842"/>
                <stop offset="20%" stopColor="#8B7248"/>
                <stop offset="50%" stopColor="#A68558"/>
                <stop offset="80%" stopColor="#8B7248"/>
                <stop offset="100%" stopColor="#6B5842"/>
              </linearGradient>

              {/* Hub wood gradient - natural tones */}
              <radialGradient id="hubWood" cx="40%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#C4A87A"/>
                <stop offset="50%" stopColor="#A68558"/>
                <stop offset="100%" stopColor="#7A6340"/>
              </radialGradient>

              {/* Spoke wood gradient - natural tan */}
              <linearGradient id="spokeWood" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#7A6340"/>
                <stop offset="30%" stopColor="#A68558"/>
                <stop offset="50%" stopColor="#B8956A"/>
                <stop offset="70%" stopColor="#A68558"/>
                <stop offset="100%" stopColor="#7A6340"/>
              </linearGradient>

              {/* Dark wood for edges/shadows */}
              <linearGradient id="woodDark" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4A3D2E"/>
                <stop offset="50%" stopColor="#5A4D3A"/>
                <stop offset="100%" stopColor="#4A3D2E"/>
              </linearGradient>

              {/* Wood grain pattern - natural */}
              <pattern id="grainPattern" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <rect fill="transparent" width="40" height="40"/>
                <path d="M0 8 Q 10 6, 20 8 T 40 8" stroke="#6B5842" strokeWidth="0.8" fill="none" opacity="0.4"/>
                <path d="M0 16 Q 12 14, 24 16 T 40 16" stroke="#5A4D3A" strokeWidth="0.6" fill="none" opacity="0.3"/>
                <path d="M0 24 Q 8 22, 16 24 T 40 24" stroke="#6B5842" strokeWidth="0.7" fill="none" opacity="0.35"/>
                <path d="M0 32 Q 14 30, 28 32 T 40 32" stroke="#5A4D3A" strokeWidth="0.5" fill="none" opacity="0.25"/>
              </pattern>

              {/* Inner shadow filter */}
              <filter id="innerShadow" x="-50%" y="-50%" width="200%" height="200%">
                <feComponentTransfer in="SourceAlpha">
                  <feFuncA type="table" tableValues="1 0"/>
                </feComponentTransfer>
                <feGaussianBlur stdDeviation="3"/>
                <feOffset dx="2" dy="3" result="offsetblur"/>
                <feFlood floodColor="#3A2E20" floodOpacity="0.5"/>
                <feComposite in2="offsetblur" operator="in"/>
                <feMerge>
                  <feMergeNode/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Outer wooden rim - thick band */}
            <circle
              cx="200"
              cy="200"
              r="185"
              fill="none"
              stroke="url(#rimWood)"
              strokeWidth="28"
            />

            {/* Rim outer edge shadow */}
            <circle
              cx="200"
              cy="200"
              r="198"
              fill="none"
              stroke="#4A3D2E"
              strokeWidth="3"
              opacity="0.6"
            />

            {/* Rim inner edge */}
            <circle
              cx="200"
              cy="200"
              r="172"
              fill="none"
              stroke="#5A4D3A"
              strokeWidth="2"
              opacity="0.5"
            />

            {/* Wood grain on rim */}
            <circle
              cx="200"
              cy="200"
              r="185"
              fill="none"
              stroke="url(#grainPattern)"
              strokeWidth="26"
              opacity="0.5"
            />

            {/* Wooden spokes - tapered from hub to rim */}
            {Array.from({ length: spokes }).map((_, i) => {
              const angle = (i * 360 / spokes - 90) * (Math.PI / 180)
              const hubR = 42
              const rimR = 172

              // Hub connection point
              const x1 = 200 + hubR * Math.cos(angle)
              const y1 = 200 + hubR * Math.sin(angle)

              // Rim connection point
              const x2 = 200 + rimR * Math.cos(angle)
              const y2 = 200 + rimR * Math.sin(angle)

              // Calculate perpendicular for spoke width
              const perpAngle = angle + Math.PI / 2

              // Spoke is wider at hub (12px), narrower at rim (8px)
              const hubWidth = 14
              const rimWidth = 9

              // Create tapered spoke path
              const hx1 = x1 + (hubWidth/2) * Math.cos(perpAngle)
              const hy1 = y1 + (hubWidth/2) * Math.sin(perpAngle)
              const hx2 = x1 - (hubWidth/2) * Math.cos(perpAngle)
              const hy2 = y1 - (hubWidth/2) * Math.sin(perpAngle)

              const rx1 = x2 + (rimWidth/2) * Math.cos(perpAngle)
              const ry1 = y2 + (rimWidth/2) * Math.sin(perpAngle)
              const rx2 = x2 - (rimWidth/2) * Math.cos(perpAngle)
              const ry2 = y2 - (rimWidth/2) * Math.sin(perpAngle)

              return (
                <g key={`spoke-${i}`}>
                  {/* Spoke shadow */}
                  <polygon
                    points={`${hx1+2},${hy1+3} ${rx1+2},${ry1+3} ${rx2+2},${ry2+3} ${hx2+2},${hy2+3}`}
                    fill="rgba(60,40,30,0.4)"
                  />
                  {/* Spoke dark edge */}
                  <polygon
                    points={`${hx1},${hy1} ${rx1},${ry1} ${rx2},${ry2} ${hx2},${hy2}`}
                    fill="url(#woodDark)"
                  />
                  {/* Spoke main body */}
                  <polygon
                    points={`${hx1-1},${hy1-1} ${rx1-0.5},${ry1-0.5} ${rx2+0.5},${ry2+0.5} ${hx2+1},${hy2+1}`}
                    fill="url(#spokeWood)"
                  />
                  {/* Spoke highlight edge */}
                  <line
                    x1={hx1 - 2}
                    y1={hy1 - 2}
                    x2={rx1 - 1}
                    y2={ry1 - 1}
                    stroke="rgba(196, 168, 122, 0.4)"
                    strokeWidth="1.5"
                  />
                  {/* Wood grain line on spoke */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="rgba(74, 61, 46, 0.3)"
                    strokeWidth="1"
                  />
                </g>
              )
            })}

            {/* Hub - central wooden disc */}
            <circle
              cx="200"
              cy="200"
              r="44"
              fill="url(#hubWood)"
            />

            {/* Hub outer edge shadow */}
            <circle
              cx="200"
              cy="200"
              r="44"
              fill="none"
              stroke="#4A3D2E"
              strokeWidth="3"
              opacity="0.6"
            />

            {/* Hub wood grain rings */}
            <circle cx="200" cy="200" r="38" fill="none" stroke="rgba(74, 61, 46, 0.3)" strokeWidth="0.8"/>
            <circle cx="200" cy="200" r="32" fill="none" stroke="rgba(74, 61, 46, 0.25)" strokeWidth="0.8"/>
            <circle cx="200" cy="200" r="26" fill="none" stroke="rgba(74, 61, 46, 0.2)" strokeWidth="0.8"/>
            <circle cx="200" cy="200" r="20" fill="none" stroke="rgba(74, 61, 46, 0.15)" strokeWidth="0.8"/>
            <circle cx="200" cy="200" r="14" fill="none" stroke="rgba(74, 61, 46, 0.1)" strokeWidth="0.8"/>

            {/* Center axle hole */}
            <circle
              cx="200"
              cy="200"
              r="8"
              fill="#3A2E20"
            />

            {/* Axle hole inner shadow */}
            <circle
              cx="200"
              cy="200"
              r="6"
              fill="#2A2018"
            />

            {/* Hub highlight */}
            <ellipse
              cx="190"
              cy="190"
              rx="12"
              ry="8"
              fill="rgba(196, 168, 122, 0.2)"
              transform="rotate(-30 190 190)"
            />
          </svg>
        </motion.div>
      </div>
    </div>
  )
}
