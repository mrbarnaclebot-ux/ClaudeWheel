'use client'

import { motion } from 'framer-motion'
import { Rocket, Zap, Coins, ArrowRight } from 'lucide-react'

const steps = [
  {
    number: '01',
    title: 'Deploy or Register',
    description: 'Use the Telegram bot to launch a new token or register an existing Bags.fm token.',
    icon: Rocket,
    color: 'orange',
  },
  {
    number: '02',
    title: 'Fund the Wheel',
    description: 'Let the bot auto-claim Bags fees or self-fund to power the flywheel.',
    icon: Coins,
    color: 'copper',
  },
  {
    number: '03',
    title: 'Kick Start',
    description: 'Activate the wheel and watch automated market making begin.',
    icon: Zap,
    color: 'warm',
  },
]

const colorMap = {
  orange: {
    bg: 'bg-[#e67428]/10',
    border: 'border-[#e67428]/20',
    text: 'text-[#e67428]',
    glow: 'shadow-[0_0_30px_rgba(230,116,40,0.2)]',
    line: 'from-[#e67428]/50',
  },
  copper: {
    bg: 'bg-[#e2aa84]/10',
    border: 'border-[#e2aa84]/20',
    text: 'text-[#e2aa84]',
    glow: 'shadow-[0_0_30px_rgba(226,170,132,0.2)]',
    line: 'from-[#e2aa84]/50',
  },
  warm: {
    bg: 'bg-[#e67428]/10',
    border: 'border-[#e67428]/20',
    text: 'text-[#e67428]',
    glow: 'shadow-[0_0_30px_rgba(230,116,40,0.2)]',
    line: 'from-[#e67428]/50',
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
        <h2 className="text-3xl sm:text-4xl font-semibold text-[#f8f0ec] mb-3">
          How It Works
        </h2>
        <p className="text-[#e2aa84]/60 max-w-lg mx-auto">
          Three steps to automated market making
        </p>
      </motion.div>

      {/* Steps container */}
      <div className="relative">
        {/* Connecting line - desktop */}
        <div className="hidden lg:block absolute top-1/2 left-[16.67%] right-[16.67%] h-px">
          <motion.div
            className="h-full bg-gradient-to-r from-[#e67428]/30 via-[#e2aa84]/30 to-[#e67428]/30"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1, delay: 0.5 }}
          />
        </div>

        {/* Connecting line - mobile */}
        <div className="lg:hidden absolute left-8 top-[15%] bottom-[15%] w-px">
          <motion.div
            className="h-full w-full bg-gradient-to-b from-[#e67428]/30 via-[#e2aa84]/30 to-[#e67428]/30"
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
                  className={`relative p-6 rounded-2xl bg-[#f8f0ec]/[0.02] border border-[#e2aa84]/10 hover:border-[#e2aa84]/20 transition-all duration-300 hover:${colors.glow}`}
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
                  <h3 className="text-lg font-semibold text-[#f8f0ec] mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-[#e2aa84]/60 leading-relaxed">
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
