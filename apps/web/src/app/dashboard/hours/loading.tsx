export default function HoursLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="جارٍ تحميل ساعات العمل">
      <div className="space-y-2">
        <div className="h-8 w-44 rounded-lg bg-border" />
        <div className="h-4 w-72 rounded bg-border/60" />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <div className="h-5 w-24 rounded bg-border" />
            <div className="flex gap-3">
              <div className="h-9 w-28 rounded-lg bg-border/40" />
              <div className="h-9 w-28 rounded-lg bg-border/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
