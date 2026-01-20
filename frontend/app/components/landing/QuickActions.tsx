'use client'

import { motion } from 'framer-motion'
import { ArrowUpRight, Wallet, Rocket, BarChart3, BookOpen } from 'lucide-react'
import Link from 'next/link'

const actions = [
  {
    title: 'Launch Token',
    description: 'Create a new token',
    href: '/user/launch',
    icon: Rocket,
    color: 'orange',
    external: false,
  },
  {
    title: 'Trade WHEEL',
    description: 'Buy or sell on Bags.fm',
    href: 'https://bags.fm/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS',
    icon: Wallet,
    color: 'copper',
    external: true,
  },
  {
    title: 'View Charts',
    description: 'Real-time on DexScreener',
    href: 'https://dexscreener.com/solana/8JLGQ7RqhsvhsDhvjMuJUeeuaQ53GTJqSHNaBWf4BAGS',
    icon: BarChart3,
    color: 'warm',
    external: true,
  },
  {
    title: 'Read Docs',
    description: 'Learn how it works',
    href: '/docs',
    icon: BookOpen,
    color: 'tan',
    external: false,
  },
]

const colorMap = {
  orange: {
    bg: 'bg-[#e67428]/10',
    border: 'border-[#e67428]/20 hover:border-[#e67428]/40',
    text: 'text-[#e67428]',
    glow: 'hover:shadow-[0_0_40px_rgba(230,116,40,0.15)]',
  },
  copper: {
    bg: 'bg-[#e2aa84]/10',
    border: 'border-[#e2aa84]/20 hover:border-[#e2aa84]/40',
    text: 'text-[#e2aa84]',
    glow: 'hover:shadow-[0_0_40px_rgba(226,170,132,0.15)]',
  },
  warm: {
    bg: 'bg-[#e67428]/10',
    border: 'border-[#e67428]/20 hover:border-[#e67428]/40',
    text: 'text-[#e67428]',
    glow: 'hover:shadow-[0_0_40px_rgba(230,116,40,0.15)]',
  },
  tan: {
    bg: 'bg-[#e2aa84]/10',
    border: 'border-[#e2aa84]/20 hover:border-[#e2aa84]/40',
    text: 'text-[#e2aa84]',
    glow: 'hover:shadow-[0_0_40px_rgba(226,170,132,0.15)]',
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
            className={`group relative p-5 rounded-2xl bg-[#f8f0ec]/[0.02] border ${colors.border} transition-all duration-300 ${colors.glow} cursor-pointer`}
          >
            {/* Gradient overlay on hover */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#f8f0ec]/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

            <div className="relative flex items-start justify-between">
              <div className="flex-1">
                {/* Icon */}
                <div
                  className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}
                >
                  <Icon className={`w-6 h-6 ${colors.text}`} />
                </div>

                {/* Text */}
                <h3 className="text-base font-semibold text-[#f8f0ec] mb-1 group-hover:text-[#f8f0ec]/90">
                  {action.title}
                </h3>
                <p className="text-sm text-[#e2aa84]/50 group-hover:text-[#e2aa84]/70 transition-colors">
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
