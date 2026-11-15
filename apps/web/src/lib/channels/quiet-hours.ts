/**
 * Quiet hours: hours when proactive/marketing traffic must not send.
 * `allowedStartHour`/`allowedEndHour` define the inclusive-exclusive send window in the given timezone.
 * Example: 9–21 means send only between 09:00 and 20:59 local.
 */
export type QuietHoursPolicy = {
  allowedStartHour: number
  allowedEndHour: number
  timezone?: string
}

export const DEFAULT_SEND_WINDOW: QuietHoursPolicy = {
  allowedStartHour: 9,
  allowedEndHour: 21,
  timezone: 'UTC',
}

function localHour(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: timezone,
    }).formatToParts(now)
    const hour = parts.find((p) => p.type === 'hour')?.value
    return Number(hour ?? now.getUTCHours())
  } catch {
    return now.getUTCHours()
  }
}

/** True when proactive send is blocked by quiet hours. */
export function isInQuietHours(
  policy: QuietHoursPolicy = DEFAULT_SEND_WINDOW,
  now: Date = new Date()
): boolean {
  const hour = localHour(now, policy.timezone ?? 'UTC')
  const start = policy.allowedStartHour
  const end = policy.allowedEndHour

  if (start === end) return false

  // Window does not wrap midnight
  if (start < end) {
    return hour < start || hour >= end
  }

  // Window wraps midnight (e.g. 22–6 means allowed 22–23 and 0–5)
  return hour < start && hour >= end
}

/** Next local time when the send window opens (approx). */
export function nextSendWindowOpen(
  policy: QuietHoursPolicy = DEFAULT_SEND_WINDOW,
  now: Date = new Date()
): Date {
  if (!isInQuietHours(policy, now)) return now

  const candidate = new Date(now.getTime())
  // Walk forward hour-by-hour up to 48h to find first non-quiet slot.
  for (let i = 0; i < 48; i++) {
    candidate.setTime(candidate.getTime() + 60 * 60 * 1000)
    if (!isInQuietHours(policy, candidate)) {
      // Align to start of that hour
      candidate.setUTCMinutes(0, 0, 0)
      return candidate
    }
  }
  return new Date(now.getTime() + 12 * 60 * 60 * 1000)
}
