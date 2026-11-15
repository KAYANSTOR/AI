import { cx } from './cx'

export type SkeletonRowProps = {
  count?: number
  className?: string
}

export function SkeletonRow({ count = 1, className }: SkeletonRowProps) {
  const rows = Array.from({ length: count }, (_, i) => i)

  return (
    <div className={cx('flex flex-col gap-3 w-full', className)}>
      {rows.map((index) => (
        <div
          key={index}
          className="flex w-full items-center gap-3 rounded-[16px] border border-border bg-surface p-3.5 animate-pulse"
        >
          {/* Avatar placeholder */}
          <div className="h-11 w-11 shrink-0 rounded-full bg-border" />

          {/* Text lines */}
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-3.5 w-32 rounded-md bg-border" />
            <div className="h-3 w-48 max-w-[80%] rounded-md bg-border/70" />
          </div>
        </div>
      ))}
    </div>
  )
}
