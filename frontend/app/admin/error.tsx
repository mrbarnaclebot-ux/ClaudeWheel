'use client'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <div className="bg-bg-card border border-error/30 rounded-xl p-8 max-w-md text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold text-error mb-2">Something went wrong</h1>
        <p className="text-text-muted mb-6">
          {error.message || 'An error occurred loading the admin panel'}
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-accent-primary text-white rounded-lg hover:bg-accent-primary/80"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
