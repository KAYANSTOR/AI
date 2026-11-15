export default function ContactsLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="جارٍ تحميل جهات الاتصال">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 rounded-lg bg-border" />
          <div className="h-4 w-64 rounded bg-border/60" />
        </div>
        <div className="h-10 w-36 rounded-xl bg-border/70" />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="h-10 w-72 rounded-xl bg-border/40 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-border/20" />
          ))}
        </div>
      </div>
    </div>
  )
}
