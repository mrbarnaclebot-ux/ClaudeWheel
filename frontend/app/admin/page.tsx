'use client'

import dynamic from 'next/dynamic'
import { PanelSkeleton } from './_components/shared/LoadingSkeleton'

// Dynamically import the admin panel content with SSR disabled
// This prevents the wallet hook from being called during static generation
const NewAdminContent = dynamic(() => import('./NewAdminContent'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <PanelSkeleton />
    </div>
  ),
})

export default function AdminPage() {
  return <NewAdminContent />
}
