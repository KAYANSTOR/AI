export default function AppointmentsLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="جارٍ تحميل المواعيد">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-36 rounded-lg bg-border" />
          <div className="h-4 w-56 rounded bg-border/60" />
        </div>
        <div className="h-10 w-32 rounded-xl bg-border/70" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-5 space-y-3">
            <div className="flex justify-between items-center">
              <div className="h-4 w-28 rounded bg-border" />
              <div className="h-5 w-16 rounded bg-border/40" />
            </div>
            <div className="h-5 w-40 rounded bg-border/70" />
            <div className="h-3 w-32 rounded bg-border/50" />
          </div>
        ))}
      </div>
    </div>
  )
}
