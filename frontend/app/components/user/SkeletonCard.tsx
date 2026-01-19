'use client';

interface SkeletonCardProps {
  count?: number;
  className?: string;
}

export function SkeletonCard({ count = 3, className = '' }: SkeletonCardProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-bg-card border border-border-subtle rounded-xl p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            {/* Avatar skeleton */}
            <div className="w-10 h-10 bg-bg-secondary rounded-full skeleton" />

            {/* Content skeleton */}
            <div className="flex-1">
              <div className="h-4 bg-bg-secondary rounded w-24 mb-2 skeleton" />
              <div className="h-3 bg-bg-secondary rounded w-16 skeleton" />
            </div>

            {/* Balance skeleton */}
            <div className="text-right">
              <div className="h-3 bg-bg-secondary rounded w-12 mb-1 skeleton" />
              <div className="h-4 bg-bg-secondary rounded w-20 skeleton" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
