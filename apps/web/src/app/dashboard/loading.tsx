export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-label="جارٍ تحميل لوحة التحكم" role="status">
      <div className="space-y-2">
        <div className="motion-safe:animate-pulse h-8 w-40 rounded bg-border" />
        <div className="motion-safe:animate-pulse h-4 w-64 max-w-full rounded bg-border" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-xl border border-border bg-surface p-5">
            <div className="motion-safe:animate-pulse h-4 w-24 rounded bg-background" />
            <div className="motion-safe:animate-pulse mt-5 h-8 w-16 rounded bg-background" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="motion-safe:animate-pulse h-56 rounded-xl border border-border bg-surface lg:col-span-2" />
        <div className="motion-safe:animate-pulse h-56 rounded-xl border border-border bg-surface" />
      </div>
    </div>
  )
}
