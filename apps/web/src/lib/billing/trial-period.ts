export function addOneCalendarMonth(start: Date): Date {
  const year = start.getUTCFullYear()
  const month = start.getUTCMonth()
  const day = start.getUTCDate()
  const nextMonth = new Date(Date.UTC(year, month + 1, 1))
  const lastDay = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate()
  nextMonth.setUTCDate(Math.min(day, lastDay))
  nextMonth.setUTCHours(
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds()
  )
  return nextMonth
}

export function isTrialExpired(trialEnd: string | null | undefined, now = new Date()): boolean {
  if (!trialEnd) return false
  const end = Date.parse(trialEnd)
  return Number.isFinite(end) && end <= now.getTime()
}
