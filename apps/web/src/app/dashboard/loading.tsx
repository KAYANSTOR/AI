export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse" aria-label="جارٍ التحميل" role="status">
      {/* Header Skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-xl bg-border/60" />
        <div className="h-4 w-80 max-w-full rounded-lg bg-border/40" />
      </div>

      {/* Main Content Area Skeleton */}
      <div className="rounded-2xl border border-border/80 bg-surface p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="h-5 w-36 rounded-lg bg-border/50" />
          <div className="h-8 w-24 rounded-xl bg-border/40" />
        </div>
        <div className="space-y-3 pt-2">
          <div className="h-4 w-full rounded-md bg-border/30" />
          <div className="h-4 w-5/6 rounded-md bg-border/30" />
          <div className="h-4 w-3/4 rounded-md bg-border/30" />
        </div>
      </div>

      {/* Secondary Card Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-32 rounded-2xl border border-border/80 bg-surface p-5" />
        <div className="h-32 rounded-2xl border border-border/80 bg-surface p-5" />
      </div>
    </div>
  )
}
