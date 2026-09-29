export default function ConversationLoading() {
  return (
    <div className="space-y-6" aria-label="جارٍ تحميل المحادثة" role="status">
      <div className="space-y-2">
        <div className="motion-safe:animate-pulse h-4 w-32 rounded bg-border" />
        <div className="motion-safe:animate-pulse h-8 w-56 max-w-full rounded bg-border" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="motion-safe:animate-pulse h-[28rem] rounded-xl border border-border bg-surface" />
        <div className="space-y-6">
          <div className="motion-safe:animate-pulse h-48 rounded-xl border border-border bg-surface" />
          <div className="motion-safe:animate-pulse h-40 rounded-xl border border-border bg-surface" />
        </div>
      </div>
    </div>
  )
}
