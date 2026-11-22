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
