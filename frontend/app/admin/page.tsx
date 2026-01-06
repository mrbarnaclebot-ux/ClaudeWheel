'use client'

import dynamic from 'next/dynamic'

// Dynamically import the admin panel content with SSR disabled
// This prevents the wallet hook from being called during static generation
const AdminContent = dynamic(() => import('./AdminContent'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      <div className="card-glow bg-bg-card p-8 max-w-md w-full text-center">
        <div className="animate-pulse text-accent-primary font-mono">Loading Admin Panel...</div>
      </div>
    </div>
  ),
})

export default function AdminPage() {
  return <AdminContent />
}
