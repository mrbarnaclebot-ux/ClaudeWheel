import { PanelSkeleton } from './_components/shared/LoadingSkeleton'

export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <PanelSkeleton />
    </div>
  )
}
