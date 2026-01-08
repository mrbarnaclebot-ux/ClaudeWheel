'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useAdminUI, useAdminRefresh } from '../../_stores/adminStore'
import type { AdminTab } from '../../_types/admin.types'
import { ConnectionBadge } from '../shared/StatusBadge'

interface NavItem {
  id: AdminTab
  label: string
  icon: string
  description: string
}

const navItems: NavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: '📊',
    description: 'Platform stats & health',
  },
  {
    id: 'tokens',
    label: 'Tokens',
    icon: '🪙',
    description: 'All registered tokens',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    icon: '📱',
    description: 'Bot launches & users',
  },
  {
    id: 'logs',
    label: 'Logs',
    icon: '📜',
    description: 'System & trade logs',
  },
  {
    id: 'wheel',
    label: '$WHEEL',
    icon: '🎡',
    description: 'Platform token',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: '⚙️',
    description: 'Configuration',
  },
]

export function AdminSidebar() {
  const { activeTab, sidebarCollapsed, setActiveTab, toggleSidebar } = useAdminUI()
  const { wsConnected } = useAdminRefresh()

  return (
    <motion.aside
      className="bg-bg-card border-r border-border-subtle flex flex-col h-screen sticky top-0"
      initial={false}
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={{ duration: 0.2 }}
    >
      {/* Logo / Brand */}
      <div className="p-4 border-b border-border-subtle flex items-center justify-between">
        <AnimatePresence mode="wait">
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <span className="text-2xl">🎡</span>
              <span className="font-bold text-text-primary">Admin</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-bg-card-hover rounded-lg transition-colors text-text-muted hover:text-text-primary"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <motion.span
            animate={{ rotate: sidebarCollapsed ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="block"
          >
            ◀
          </motion.span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id

            return (
              <li key={item.id}>
                <button
                  onClick={() => setActiveTab(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                    transition-all duration-200 text-left
                    ${isActive
                      ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                      : 'text-text-muted hover:bg-bg-card-hover hover:text-text-primary border border-transparent'
                    }
                  `}
                  title={sidebarCollapsed ? item.label : undefined}
                >
                  <span className="text-lg shrink-0">{item.icon}</span>

                  <AnimatePresence mode="wait">
                    {!sidebarCollapsed && (
                      <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: 'auto' }}
                        exit={{ opacity: 0, width: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="font-medium text-sm whitespace-nowrap">
                          {item.label}
                        </div>
                        <div className="text-xs opacity-60 whitespace-nowrap">
                          {item.description}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute left-0 w-1 h-8 bg-accent-primary rounded-r"
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer - Connection Status */}
      <div className="p-4 border-t border-border-subtle">
        <AnimatePresence mode="wait">
          {sidebarCollapsed ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center"
            >
              <span
                className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-success' : 'bg-error'}`}
                title={wsConnected ? 'Connected' : 'Disconnected'}
              />
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <ConnectionBadge connected={wsConnected} label={wsConnected ? 'Live' : 'Polling'} />
              <div className="text-xs text-text-muted">
                {wsConnected ? 'Real-time updates active' : 'Using polling fallback'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  )
}
