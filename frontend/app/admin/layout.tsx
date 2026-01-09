'use client'

import { Suspense } from 'react'
import { PanelSkeleton } from './_components/shared/LoadingSkeleton'

// Admin layout loading component
function AdminLayoutLoading() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <PanelSkeleton />
    </div>
  )
}

/**
 * Admin-specific layout
 * Provides additional Suspense boundary to handle React error #185
 * which occurs when components suspend during synchronous wallet operations
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<AdminLayoutLoading />}>
      {children}
    </Suspense>
  )
}
