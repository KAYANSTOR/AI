export default function ConversationsLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="جارٍ تحميل المحادثات">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-lg bg-border" />
          <div className="h-4 w-60 rounded bg-border/60" />
        </div>
        <div className="h-10 w-36 rounded-xl bg-border/70" />
      </div>

      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="border-b border-border p-4 flex gap-3">
          <div className="h-9 w-64 rounded-lg bg-border/50" />
          <div className="h-9 w-24 rounded-lg bg-border/40" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-10 w-10 shrink-0 rounded-full bg-border" />
                <div className="space-y-2 min-w-0 flex-1">
                  <div className="h-4 w-32 rounded bg-border" />
                  <div className="h-3 w-48 rounded bg-border/60" />
                </div>
              </div>
              <div className="h-4 w-16 rounded bg-border/50 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
