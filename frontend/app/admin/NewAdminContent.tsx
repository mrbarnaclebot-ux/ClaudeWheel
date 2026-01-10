'use client'

import { AdminLayout } from './_components/layout'
import { useAdminUI } from './_stores/adminStore'
import {
  WheelView,
  LogsView,
  SettingsView,
} from './_components/views'
import { TransactionsView } from './_components/views/TransactionsView'

function AdminDashboard() {
  const { activeTab } = useAdminUI()

  const renderView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <WheelView />
      case 'transactions':
        return <TransactionsView />
      case 'logs':
        return <LogsView />
      case 'settings':
        return <SettingsView />
      default:
        return <WheelView />
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
