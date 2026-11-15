export default function SettingsLoading() {
  return (
    <div className="space-y-6 animate-pulse" role="status" aria-label="جارٍ تحميل الإعدادات">
      <div className="space-y-2">
        <div className="h-8 w-40 rounded-lg bg-border" />
        <div className="h-4 w-60 rounded bg-border/60" />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6 space-y-5">
        <div className="space-y-2">
          <div className="h-4 w-28 rounded bg-border" />
          <div className="h-10 w-full rounded-xl bg-border/40" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-border" />
          <div className="h-10 w-full rounded-xl bg-border/40" />
        </div>
        <div className="h-11 w-36 rounded-xl bg-border/60" />
      </div>
    </div>
  )
}
