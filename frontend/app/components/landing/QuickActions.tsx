'use client'

import { motion } from 'framer-motion'
import { ArrowUpRight, Wallet, Bot, BarChart3, BookOpen } from 'lucide-react'
import Link from 'next/link'

const actions = [
  {
    title: 'Trade WHEEL',
    description: 'Buy or sell on Bags.fm',
    href: 'https://bags.fm/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS',
    icon: Wallet,
    color: 'cyan',
    external: true,
  },
  {
    title: 'Launch Token',
    description: 'Start via Telegram bot',
    href: 'https://t.me/ClaudeWheelBot',
    icon: Bot,
    color: 'violet',
    external: true,
  },
  {
    title: 'View Charts',
    description: 'Real-time on DexScreener',
    href: 'https://dexscreener.com/solana/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS',
    icon: BarChart3,
    color: 'emerald',
    external: true,
  },
  {
    title: 'Read Docs',
    description: 'Learn how it works',
    href: '/docs',
    icon: BookOpen,
    color: 'amber',
    external: false,
  },
]

const colorMap = {
  cyan: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20 hover:border-cyan-500/40',
    text: 'text-cyan-400',
    glow: 'hover:shadow-[0_0_40px_rgba(34,211,238,0.15)]',
  },
  violet: {
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/20 hover:border-violet-500/40',
    text: 'text-violet-400',
    glow: 'hover:shadow-[0_0_40px_rgba(139,92,246,0.15)]',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20 hover:border-emerald-500/40',
    text: 'text-emerald-400',
    glow: 'hover:shadow-[0_0_40px_rgba(52,211,153,0.15)]',
  },
  amber: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20 hover:border-amber-500/40',
    text: 'text-amber-400',
    glow: 'hover:shadow-[0_0_40px_rgba(251,191,36,0.15)]',
  },
}

export default function QuickActions() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {actions.map((action, index) => {
        const colors = colorMap[action.color as keyof typeof colorMap]
        const Icon = action.icon

        const CardContent = (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{
              duration: 0.5,
              delay: index * 0.1,
              ease: [0.22, 1, 0.36, 1],
            }}
            whileHover={{ y: -4 }}
            className={`group relative p-5 rounded-2xl bg-white/[0.02] border ${colors.border} transition-all duration-300 ${colors.glow} cursor-pointer`}
          >
            {/* Gradient overlay on hover */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="relative flex items-start justify-between">
              <div className="flex-1">
                {/* Icon */}
                <div
                  className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                >
                  <Icon className={`w-6 h-6 ${colors.text}`} />
                </div>

                {/* Text */}
                <h3 className="text-base font-semibold text-white mb-1 group-hover:text-white/90">
                  {action.title}
                </h3>
                <p className="text-sm text-neutral-500 group-hover:text-neutral-400 transition-colors">
                  {action.description}
                </p>
              </div>

              {/* Arrow */}
              <div
                className={`mt-1 w-8 h-8 rounded-full ${colors.bg} flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1`}
              >
                <ArrowUpRight className={`w-4 h-4 ${colors.text}`} />
              </div>
            </div>
          </motion.div>
        )

        if (action.external) {
          return (
            <a
              key={action.title}
              href={action.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {CardContent}
            </a>
          )
        }

        return (
          <Link key={action.title} href={action.href}>
            {CardContent}
          </Link>
        )
      })}
    </div>
  )
}
