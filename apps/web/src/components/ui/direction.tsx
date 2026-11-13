import type { HTMLAttributes, ReactNode } from 'react'
import { textDirections, type SupportedLocale } from '@/lib/design-system/tokens'
import { cx } from './cx'

export function Direction({
  locale,
  children,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'dir' | 'lang'> & {
  locale: SupportedLocale
  children: ReactNode
}) {
  return (
    <div lang={locale} dir={textDirections[locale]} className={cx('contents', className)} {...props}>
      {children}
    </div>
  )
}
