'use client'

import { useState, useEffect, startTransition } from 'react'
import { PanelSkeleton } from './_components/shared/LoadingSkeleton'

// Loading component for admin page
function AdminLoading() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <PanelSkeleton />
    </div>
  )
}

export default function AdminPage() {
  const [AdminContent, setAdminContent] = useState<React.ComponentType | null>(null)
  const [mounted, setMounted] = useState(false)

  // Only run on client side
  useEffect(() => {
    setMounted(true)

    // Use startTransition to prevent React error #185
    // This allows the lazy load to happen without blocking synchronous updates
    startTransition(() => {
      import('./NewAdminContent').then((mod) => {
        setAdminContent(() => mod.default)
      })
    })
  }, [])

  // Show loading until mounted and component is loaded
  if (!mounted || !AdminContent) {
    return <AdminLoading />
  }

  return <AdminContent />
}
