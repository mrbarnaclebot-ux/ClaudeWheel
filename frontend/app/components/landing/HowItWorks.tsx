'use client'

import { motion } from 'framer-motion'
import { Rocket, Zap, Coins, ArrowRight } from 'lucide-react'

const steps = [
  {
    number: '01',
    title: 'Launch Token',
    description: 'Create your token on Bags.fm through our Telegram bot. Set up socials, description, and initial parameters.',
    icon: Rocket,
    color: 'cyan',
  },
  {
    number: '02',
    title: 'Enable Flywheel',
    description: 'Automated market making begins. The flywheel buys and sells to maintain healthy trading activity.',
    icon: Zap,
    color: 'violet',
  },
  {
    number: '03',
    title: 'Collect Fees',
    description: 'Earn trading fees automatically. Claim your earnings anytime, or let them compound.',
    icon: Coins,
    color: 'emerald',
  },
]

const colorMap = {
  cyan: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    text: 'text-cyan-400',
    glow: 'shadow-[0_0_30px_rgba(34,211,238,0.2)]',
    line: 'from-cyan-500/50',
  },
  violet: {
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20',
    text: 'text-violet-400',
    glow: 'shadow-[0_0_30px_rgba(139,92,246,0.2)]',
    line: 'from-violet-500/50',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    glow: 'shadow-[0_0_30px_rgba(52,211,153,0.2)]',
    line: 'from-emerald-500/50',
  },
}

export default function HowItWorks() {
  return (
    <div className="relative">
      {/* Section header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl sm:text-4xl font-semibold text-white mb-3">
          How It Works
        </h2>
        <p className="text-neutral-400 max-w-lg mx-auto">
          Three simple steps to automated market making and passive income
        </p>
      </motion.div>

      {/* Steps container */}
      <div className="relative">
        {/* Connecting line - desktop */}
        <div className="hidden lg:block absolute top-1/2 left-[16.67%] right-[16.67%] h-px">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500/30 via-violet-500/30 to-emerald-500/30"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.5 }}
          />
        </div>

        {/* Connecting line - mobile */}
        <div className="lg:hidden absolute left-8 top-[15%] bottom-[15%] w-px">
          <motion.div
            className="h-full w-full bg-gradient-to-b from-cyan-500/30 via-violet-500/30 to-emerald-500/30"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.5 }}
          />
        </div>

        {/* Steps grid */}
        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {steps.map((step, index) => {
            const colors = colorMap[step.color as keyof typeof colorMap]
            const Icon = step.icon

            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{
                  duration: 0.5,
                  delay: index * 0.15,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="relative"
              >
                {/* Card */}
                <div
                  className={`relative p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all duration-300 hover:${colors.glow}`}
                >
                  {/* Step number */}
                  <div
                    className={`absolute -top-3 left-6 px-3 py-1 rounded-full ${colors.bg} border ${colors.border}`}
                  >
                    <span className={`text-xs font-semibold ${colors.text}`}>
                      Step {step.number}
                    </span>
                  </div>

                  {/* Icon */}
                  <div
                    className={`w-14 h-14 rounded-xl ${colors.bg} border ${colors.border} flex items-center justify-center mb-4 mt-2`}
                  >
                    <Icon className={`w-7 h-7 ${colors.text}`} />
                  </div>

                  {/* Content */}
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-neutral-400 leading-relaxed">
                    {step.description}
                  </p>

                  {/* Arrow indicator for mobile */}
                  {index < steps.length - 1 && (
                    <div className="lg:hidden absolute -bottom-4 left-1/2 -translate-x-1/2 z-10">
                      <motion.div
                        animate={{ y: [0, 4, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className={`w-8 h-8 rounded-full ${colors.bg} border ${colors.border} flex items-center justify-center rotate-90`}
                      >
                        <ArrowRight className={`w-4 h-4 ${colors.text}`} />
                      </motion.div>
                    </div>
                  )}
                </div>

                {/* Arrow between cards - desktop */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:flex absolute top-1/2 -right-4 z-10">
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.3, delay: 0.8 + index * 0.1 }}
                      className={`w-8 h-8 rounded-full ${colors.bg} border ${colors.border} flex items-center justify-center`}
                    >
                      <ArrowRight className={`w-4 h-4 ${colors.text}`} />
                    </motion.div>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
