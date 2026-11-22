export function getLocalDateLabel(timezone?: string): string {
  try {
    return new Intl.DateTimeFormat('ar', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: timezone || undefined,
    }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(new Date())
  }
}

export function getHoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

export function getDaysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}
