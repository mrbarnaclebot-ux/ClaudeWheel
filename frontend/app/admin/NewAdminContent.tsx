'use client'

import { AdminLayout } from './_components/layout'
import { useAdminUI } from './_stores/adminStore'
import {
  OverviewView,
  TokensView,
  TelegramView,
  LogsView,
  WheelView,
  SettingsView,
} from './_components/views'
import type { AdminTab } from './_types/admin.types'

function AdminDashboard() {
  const { activeTab } = useAdminUI()

  const renderView = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewView />
      case 'tokens':
        return <TokensView />
      case 'telegram':
        return <TelegramView />
      case 'logs':
        return <LogsView />
      case 'wheel':
        return <WheelView />
      case 'settings':
        return <SettingsView />
      default:
        return <OverviewView />
    }
  }

  return renderView()
}

export default function NewAdminContent() {
  return (
    <AdminLayout>
      <AdminDashboard />
    </AdminLayout>
  )
}
