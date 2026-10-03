export default function ChannelsLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="جارٍ تحميل قنوات التواصل">
      <div className="space-y-2">
        <div className="h-8 w-44 rounded-lg bg-border" />
        <div className="h-4 w-72 rounded bg-border/60" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-border" />
              <div className="space-y-1.5 flex-1">
                <div className="h-5 w-32 rounded bg-border" />
                <div className="h-3.5 w-48 rounded bg-border/50" />
              </div>
            </div>
            <div className="h-9 w-28 rounded-lg bg-border/40" />
          </div>
        ))}
      </div>
    </div>
  )
}
