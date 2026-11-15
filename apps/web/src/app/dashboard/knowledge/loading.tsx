export default function KnowledgeLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="جارٍ تحميل قاعدة المعرفة">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-lg bg-border" />
          <div className="h-4 w-64 rounded bg-border/60" />
        </div>
        <div className="h-10 w-36 rounded-xl bg-border/70" />
      </div>

      <div className="h-10 w-full max-w-md rounded-xl bg-border/40" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-5 space-y-3">
            <div className="h-5 w-40 rounded bg-border" />
            <div className="space-y-2">
              <div className="h-3.5 w-full rounded bg-border/40" />
              <div className="h-3.5 w-3/4 rounded bg-border/40" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
