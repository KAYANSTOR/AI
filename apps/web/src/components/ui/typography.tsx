import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'

export type HeadingLevel = 1 | 2 | 3

const headingClasses: Record<HeadingLevel, string> = {
  1: 'type-heading-1',
  2: 'type-heading-2',
  3: 'type-heading-3',
}

export function Heading({
  level = 2,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { level?: HeadingLevel; children: ReactNode }) {
  const Component = `h${level}` as 'h1' | 'h2' | 'h3'
  return (
    <Component className={cx(headingClasses[level], 'text-text', className)} {...props}>
      {children}
    </Component>
  )
}

export type TextSize = 'large' | 'medium' | 'small' | 'caption' | 'label' | 'overline'

const textClasses: Record<TextSize, string> = {
  large: 'type-body-large',
  medium: 'type-body-medium',
  small: 'type-body-small',
  caption: 'type-caption',
  label: 'type-label',
  overline: 'type-overline',
}

export function Text({
  size = 'medium',
  muted = false,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & {
  size?: TextSize
  muted?: boolean
  children: ReactNode
}) {
  return (
    <p className={cx(textClasses[size], muted ? 'text-text-muted' : 'text-text', className)} {...props}>
      {children}
    </p>
  )
}
