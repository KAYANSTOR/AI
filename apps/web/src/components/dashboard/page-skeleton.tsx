/**
 * Shared instant-loading skeleton for dashboard route segments.
 *
 * Every dashboard route is rendered on demand (it reads the session and tenant data), so
 * without a `loading.tsx` a click shows the previous screen frozen until the server
 * responds. Rendering this skeleton immediately makes navigation feel instant even when
 * the data is still in flight.
 */
export function DashboardPageSkeleton({
  cards = 3,
  rows = 5,
}: {
  cards?: number
  rows?: number
}) {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 shrink-0 rounded-xl bg-border/60" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-7 w-52 max-w-full rounded-lg bg-border" />
          <div className="h-4 w-80 max-w-full rounded bg-border/50" />
        </div>
      </div>

      {cards > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: cards }).map((_, index) => (
            <div
              key={index}
              className="space-y-3 rounded-2xl border border-border bg-surface p-5"
            >
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 rounded bg-border/60" />
                <div className="h-9 w-9 rounded-xl bg-border/50" />
              </div>
              <div className="h-8 w-20 rounded bg-border" />
              <div className="h-3 w-32 rounded bg-border/40" />
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border p-4">
          <div className="h-5 w-40 rounded bg-border/70" />
        </div>
        <div className="divide-y divide-border/70">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-border/50" />
                <div className="min-w-0 space-y-2">
                  <div className="h-4 w-40 max-w-full rounded bg-border/70" />
                  <div className="h-3 w-24 rounded bg-border/40" />
                </div>
              </div>
              <div className="h-6 w-20 shrink-0 rounded-full bg-border/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
