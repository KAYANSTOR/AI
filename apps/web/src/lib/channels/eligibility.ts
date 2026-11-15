export type EligibilityInput = {
  channel: 'whatsapp' | 'instagram' | 'sms' | 'phone'
  lastInboundAt?: string | null
  optedOut?: boolean
  quietHours?: { startHour: number; endHour: number; timezone?: string }
  now?: Date
}

export type EligibilityResult =
  | { allowed: true; mode: 'freeform' | 'template_only' | 'realtime' }
  | { allowed: false; reason: string }

const WINDOW_MS = 24 * 60 * 60 * 1000

export function checkEligibility(input: EligibilityInput): EligibilityResult {
  if (input.optedOut) {
    return { allowed: false, reason: 'contact_opted_out' }
  }

  const now = input.now ?? new Date()

  if (input.quietHours) {
    const hour = now.getUTCHours()
    const { startHour, endHour } = input.quietHours
    if (hour < startHour || hour >= endHour) {
      return { allowed: false, reason: 'quiet_hours' }
    }
  }

  if (input.channel === 'phone') {
    return { allowed: true, mode: 'realtime' }
  }

  if (input.channel === 'whatsapp') {
    if (!input.lastInboundAt) {
      return { allowed: true, mode: 'template_only' }
    }
    const last = new Date(input.lastInboundAt).getTime()
    if (Number.isNaN(last)) {
      return { allowed: true, mode: 'template_only' }
    }
    if (now.getTime() - last <= WINDOW_MS) {
      return { allowed: true, mode: 'freeform' }
    }
    return { allowed: true, mode: 'template_only' }
  }

  if (input.channel === 'instagram') {
    if (!input.lastInboundAt) {
      return { allowed: false, reason: 'instagram_user_must_start' }
    }
    return { allowed: true, mode: 'freeform' }
  }

  return { allowed: true, mode: 'freeform' }
}
