import { CheckCheck, Sparkles } from 'lucide-react'
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
        <span className="rounded-full border border-border/70 bg-surface/80 px-3 py-1 text-[11px] font-medium text-text-muted">
          {text}
        </span>
      </div>
    )
  }

  const isCustomer = type === 'customer'
  const isAi = type === 'ai'
  const isNote = type === 'note'
  const alignment = isCustomer ? 'items-start' : 'items-end'

  const bubbleStyles = {
    customer: 'border border-border/70 bg-surface-muted text-text rounded-[22px] rounded-tr-md',
    ai: 'border border-secondary/10 bg-primary-light text-secondary rounded-[22px] rounded-tl-md shadow-sm',
    human: 'border border-secondary/15 bg-surface text-text rounded-[22px] rounded-tl-md shadow-sm',
    note: 'border border-dashed border-warning/50 bg-warning/10 text-text rounded-2xl',
    system: '',
  }[type]

  const defaultSender = {
    customer: 'العميل',
    ai: 'المساعد الذكي',
    human: 'فريق العمل',
    note: 'ملاحظة داخلية',
    system: '',
  }[type]

  return (
    <article className={cx('flex max-w-[88%] flex-col gap-1 sm:max-w-[76%]', alignment, className)}>
      {!isCustomer && (
        <div className={cx('flex items-center gap-1.5 px-1 text-[11px] font-semibold', isNote ? 'text-warning' : 'text-text-muted')}>
          {isAi && <Sparkles className="h-3 w-3 text-secondary" aria-hidden="true" />}
          <span>{sender || defaultSender}</span>
        </div>
      )}
      <div className={cx('px-4 py-3 text-[14px] leading-7 sm:text-[15px]', bubbleStyles)}>
        <p className="whitespace-pre-wrap break-words">{text}</p>
      </div>
      <div className={cx('flex items-center gap-1.5 px-1 text-[10px] text-text-muted', isCustomer ? 'justify-start' : 'justify-end')}>
        {!isCustomer && <CheckCheck className="h-3.5 w-3.5 text-secondary" aria-label="تم الإرسال" />}
        {time && <time>{time}</time>}
      </div>
    </article>
  )
}
