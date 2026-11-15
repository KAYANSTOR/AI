import { SkeletonRow } from '@/components/ui/skeleton-row'

export default function ConversationsLoading() {
  return (
    <div className="space-y-4 max-w-2xl mx-auto" role="status" aria-label="جارٍ تحميل المحادثات">
      {/* Search & Filter Skeleton */}
      <div className="h-11 w-full rounded-xl bg-border/50 animate-pulse" />
      <div className="flex gap-2">
        <div className="h-9 w-16 rounded-full bg-border/60 animate-pulse" />
        <div className="h-9 w-20 rounded-full bg-border/40 animate-pulse" />
        <div className="h-9 w-20 rounded-full bg-border/40 animate-pulse" />
      </div>

      <div className="pt-2">
        <div className="h-5 w-24 rounded bg-border/60 mb-3 animate-pulse" />
        <SkeletonRow count={4} />
      </div>
    </div>
  )
}
