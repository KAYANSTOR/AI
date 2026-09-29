const DEFAULT_TIME_ZONE = 'UTC'

function date(value: string | number | Date) {
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDate(value: string | number | Date, timeZone = DEFAULT_TIME_ZONE) {
  const parsed = date(value)
  if (!parsed) return '—'
  return new Intl.DateTimeFormat('ar', {
    calendar: 'gregory',
    timeZone,
    dateStyle: 'medium',
  }).format(parsed)
}

export function formatDateTime(value: string | number | Date, timeZone = DEFAULT_TIME_ZONE) {
  const parsed = date(value)
  if (!parsed) return '—'
  return new Intl.DateTimeFormat('ar', {
    calendar: 'gregory',
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed)
}

export function formatTime(value: string | number | Date, timeZone = DEFAULT_TIME_ZONE) {
  const parsed = date(value)
  if (!parsed) return '—'
  return new Intl.DateTimeFormat('ar', {
    calendar: 'gregory',
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

export function formatNumber(value: number | string, options?: Intl.NumberFormatOptions) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('ar', options).format(number)
}
