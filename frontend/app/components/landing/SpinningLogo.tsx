'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

interface SpinningLogoProps {
  isActive?: boolean
  size?: number
}

export default function SpinningLogo({ isActive = true, size = 280 }: SpinningLogoProps) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Outer glow ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, transparent 40%, rgba(230, 116, 40, 0.15) 70%, transparent 100%)`,
        }}
        animate={{
          opacity: isActive ? [0.5, 1, 0.5] : 0.2,
          scale: isActive ? [1, 1.05, 1] : 1,
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Secondary glow pulse */}
      <motion.div
        className="absolute inset-4 rounded-full"
        style={{
          boxShadow: isActive
            ? '0 0 60px rgba(230, 116, 40, 0.3), inset 0 0 40px rgba(230, 116, 40, 0.1)'
            : '0 0 20px rgba(226, 170, 132, 0.1)',
        }}
        animate={{
          opacity: isActive ? [0.6, 1, 0.6] : 0.3,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.5,
        }}
      />

      {/* Spinning logo */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{
          rotate: isActive ? 360 : 0,
        }}
        transition={{
          duration: 60,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <div
          className="relative rounded-full overflow-hidden"
          style={{
            width: size * 0.75,
            height: size * 0.75,
            filter: isActive
              ? 'drop-shadow(0 0 30px rgba(230, 116, 40, 0.4))'
              : 'drop-shadow(0 0 10px rgba(248, 240, 236, 0.1))',
          }}
        >
          <Image
            src="/logo.png"
            alt="Claude Wheel"
            fill
            className="object-contain"
            priority
          />
        </div>
      </motion.div>

      {/* Orbital particles */}
      {isActive && (
        <>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 rounded-full bg-[#e67428]"
              style={{
                top: '50%',
                left: '50%',
                marginTop: -4,
                marginLeft: -4,
                boxShadow: '0 0 10px rgba(230, 116, 40, 0.8)',
              }}
              animate={{
                x: [
                  Math.cos((i * 2 * Math.PI) / 3) * (size * 0.42),
                  Math.cos((i * 2 * Math.PI) / 3 + 2 * Math.PI) * (size * 0.42),
                ],
                y: [
                  Math.sin((i * 2 * Math.PI) / 3) * (size * 0.42),
                  Math.sin((i * 2 * Math.PI) / 3 + 2 * Math.PI) * (size * 0.42),
                ],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: 'linear',
                delay: i * 0.3,
              }}
            />
          ))}
        </>
      )}

      {/* Center status indicator */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <motion.div
          className={`w-3 h-3 rounded-full ${isActive ? 'bg-[#e67428]' : 'bg-neutral-600'}`}
          style={{
            boxShadow: isActive ? '0 0 20px rgba(230, 116, 40, 0.8)' : 'none',
          }}
          animate={{
            scale: isActive ? [1, 1.3, 1] : 1,
            opacity: isActive ? [1, 0.7, 1] : 0.5,
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>
    </div>
  )
}
