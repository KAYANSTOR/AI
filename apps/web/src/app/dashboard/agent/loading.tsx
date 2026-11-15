export default function AgentLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="جارٍ تحميل إعدادات الوكيل">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-lg bg-border" />
          <div className="h-4 w-72 rounded bg-border/60" />
        </div>
        <div className="h-10 w-32 rounded-xl bg-border/70" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Console */}
        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
            <div className="h-6 w-36 rounded bg-border" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-border/50" />
              <div className="h-4 w-4/5 rounded bg-border/50" />
            </div>
            <div className="h-28 rounded-xl bg-border/30" />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
            <div className="h-6 w-40 rounded bg-border" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-border/30" />
              ))}
            </div>
          </div>
        </div>

        {/* Right Preview */}
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
          <div className="h-6 w-28 rounded bg-border" />
          <div className="h-80 rounded-xl bg-border/20" />
          <div className="h-11 rounded-xl bg-border/40" />
        </div>
      </div>
    </div>
  )
}
