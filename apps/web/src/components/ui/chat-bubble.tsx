import { Sparkles } from 'lucide-react'
import { cx } from './cx'

export type ChatBubbleType = 'customer' | 'ai' | 'human' | 'note' | 'system'

export type ChatBubbleProps = {
  type?: ChatBubbleType
  text: string
  time?: string
  sender?: string
  className?: string
}

export function ChatBubble({
  type = 'customer',
  text,
  time = '10:24',
  sender,
  className,
}: ChatBubbleProps) {
  if (type === 'system') {
    return (
      <div className={cx('my-2 flex w-full justify-center', className)}>
        <span className="rounded-full bg-surface-muted px-3 py-1 text-[12px] font-medium text-text-muted">
          {text}
        </span>
      </div>
    )
  }

  const isCustomer = type === 'customer'
  const isAi = type === 'ai'
  const isNote = type === 'note'

  // Alignment: customer on the right/start, AI & Human on the left/end (or vice versa in RTL)
  // In typical messaging: outbound (AI / Human) aligns to end/leading, inbound (Customer) to start/trailing
  const alignment = isCustomer ? 'items-start' : 'items-end'

  const bubbleStyles = {
    customer:
      'bg-surface border border-border text-text rounded-2xl rounded-tr-sm rtl:rounded-tr-2xl rtl:rounded-tl-sm',
    ai: 'bg-primary text-primary-foreground rounded-2xl rounded-tl-sm rtl:rounded-tl-2xl rtl:rounded-tr-sm shadow-sm',
    human:
      'bg-accent-light border border-border-strong text-text rounded-2xl rounded-tl-sm rtl:rounded-tl-2xl rtl:rounded-tr-sm',
    note: 'bg-warning-soft border border-dashed border-warning text-text rounded-2xl',
    system: '',
  }[type]

  const defaultSender = {
    customer: 'العميل',
    ai: 'كايان AI',
    human: 'فريق الدعم',
    note: 'ملاحظة داخلية',
    system: '',
  }[type]

  return (
    <div className={cx('flex flex-col gap-1 max-w-[85%] sm:max-w-[75%]', alignment, className)}>
      <div className={cx('px-3.5 py-3 text-[14px] leading-relaxed', bubbleStyles)}>
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>

      <div className="flex items-center gap-1.5 px-1 text-[11px] font-medium text-text-muted">
        {isAi && <Sparkles className="h-3 w-3 text-accent" aria-hidden="true" />}
        <span className={cx(isNote && 'text-warning font-semibold')}>
          {sender || defaultSender}
        </span>
        {time && <span>• {time}</span>}
      </div>
    </div>
  )
}
